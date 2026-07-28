import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";
import { requestCae } from "../_lib/afipSdk.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET  -> estado actual del comprobante (para polling despues de emitir)
// POST -> emitir/reintentar CAE, idempotente
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET", "POST"])) return;

  const { client, error: dbError, missing } = makeSupabase();
  if (dbError) return res.status(500).json({ error: dbError, missing });

  const invoiceId = String(req.query?.id ?? "");
  if (!UUID_RE.test(invoiceId)) {
    return res.status(400).json({ error: "INVALID_INVOICE_ID" });
  }

  try {
    const auth = await authenticate(client, req);
    if (!auth) return res.status(401).json({ error: "UNAUTHORIZED" });
    // Emitir una factura es una accion operativa de mostrador, igual que
    // registrar un pago manual (que receptionist ya puede hacer) - no es
    // configuracion fiscal, que sigue restringida a CONFIG_ROLES en el
    // frontend (ver /admin/facturacion/configuracion).
    if (!["platform_admin", "clinic_admin", "admin", "receptionist"].includes(auth.role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (req.method === "GET") {
      const invoice = await loadInvoice(client, invoiceId, auth.clinicId);
      if (!invoice) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
      return res.status(200).json(invoice);
    }

    if (process.env.ARCA_INVOICE_ISSUE_ENABLED !== "true") {
      return res.status(503).json({ error: "ARCA_FLOW_DISABLED", message: "La emision fiscal todavia no esta habilitada." });
    }
    return await handleIssue(client, res, invoiceId, auth);
  } catch (err) {
    return handleError(res, err);
  }
}

async function authenticate(client, req) {
  const header = req.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member, error: memberError } = await client
    .from("clinic_members")
    .select("clinic_id, role")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  return { clinicId: member?.clinic_id ?? null, role: member?.role ?? null };
}

async function loadInvoice(client, invoiceId, clinicId) {
  const { data, error } = await client
    .from("invoices")
    // patients(document_number) solo para el umbral de identificacion de
    // consumidor final (RG vigente: $10.000.000 por comprobante) - un
    // turno medico nunca lo cruza, pero si algun dia pasa, requestCae
    // necesita el DNI del paciente en vez de consumidor final anonimo.
    .select("*, patients(document_number)")
    .eq("id", invoiceId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadFiscalSettings(client, clinicId) {
  const { data, error } = await client
    .from("fiscal_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function handleIssue(client, res, invoiceId, auth) {
  const invoice = await loadInvoice(client, invoiceId, auth.clinicId);
  if (!invoice) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });

  // Ya tiene CAE: no-op idempotente, nunca se vuelve a pedir.
  if (invoice.arca_status === "synced" && invoice.arca_external_id) {
    return res.status(200).json(invoice);
  }

  const fiscalSettings = await loadFiscalSettings(client, auth.clinicId);
  if (!fiscalSettings || fiscalSettings.arca_integration_status !== "configured" || !fiscalSettings.cuit) {
    return res.status(503).json({ error: "FISCAL_SETTINGS_NOT_CONFIGURED" });
  }
  // Self-heal: comprobantes creados antes de que createDraftInvoice
  // empezara a guardar sale_point (o cualquier otro caso borde) toman el
  // punto de venta configurado en fiscal_settings en vez de fallar.
  if (!invoice.sale_point) {
    const fallbackSalePoint = fiscalSettings.sale_points?.[0];
    if (!fallbackSalePoint) {
      return res.status(400).json({ error: "INVOICE_MISSING_SALE_POINT" });
    }
    invoice.sale_point = fallbackSalePoint;
    const { error: salePointError } = await client
      .from("invoices")
      .update({ sale_point: fallbackSalePoint })
      .eq("id", invoice.id);
    if (salePointError) throw salePointError;
  }

  // Transicion condicional draft/pending_configuration/failed -> pending.
  // Si dos requests casi simultaneos llegan aca, Postgres serializa el
  // UPDATE por row-lock: el segundo, al ejecutar despues de que el
  // primero ya commiteo "pending", no matchea el WHERE (no incluye
  // "pending" como estado de origen) y devuelve 0 filas - nunca se pide
  // un segundo CAE para el mismo comprobante.
  const { data: locked, error: lockError } = await client
    .from("invoices")
    .update({ arca_status: "pending", arca_requested_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("clinic_id", auth.clinicId)
    .in("arca_status", ["pending_configuration", "failed"])
    .select("*")
    .maybeSingle();
  if (lockError) throw lockError;
  if (!locked) {
    const current = await loadInvoice(client, invoiceId, auth.clinicId);
    return res.status(409).json({ error: "INVOICE_ALREADY_PROCESSING", invoice: current });
  }

  try {
    const caeResult = await requestCae({ client, fiscalSettings, invoice: locked, patientDocNumber: invoice.patients?.document_number });
    const { data: updated, error: updateError } = await client
      .from("invoices")
      .update({
        status: "issued",
        arca_status: "synced",
        arca_external_id: caeResult.cae,
        arca_cae_expires_at: caeResult.caeFchVto,
        document_number: String(caeResult.cbteDesde ?? locked.document_number ?? ""),
        issued_at: new Date().toISOString(),
        arca_response: caeResult.raw
      })
      .eq("id", invoiceId)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return res.status(200).json(updated);
  } catch (arcaError) {
    await client
      .from("invoices")
      .update({
        arca_status: "failed",
        arca_response: arcaError.arcaResponse ?? { message: arcaError.message }
      })
      .eq("id", invoiceId);
    return res.status(arcaError.statusCode ?? 502).json({
      error: arcaError.code === "ARCA_NOT_CONFIGURED" ? "ARCA_NOT_CONFIGURED" : "ARCA_REJECTED",
      message: arcaError.friendlyMessage ?? "ARCA rechazo el comprobante.",
      detail: arcaError.arcaResponse ?? null
    });
  }
}
