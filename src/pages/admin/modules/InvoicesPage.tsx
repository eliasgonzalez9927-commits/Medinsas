import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FileCheck2, RefreshCw } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { Button } from "../../../components/ui/Button";
import { getDefaultClinic, getInvoiceById, getInvoices, issueInvoice } from "../../../lib/clinic-data";
import { DateRangeValue, resolveDateRange } from "../../../lib/date-range";
import { Clinic, Invoice, InvoiceItem } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  factura_b: "Factura B",
  factura_c: "Factura C"
};

export function InvoicesListPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("this_month", "America/Argentina/Mendoza"));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) return;
      const loaded = await getInvoices(loadedClinic.id, {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        timezone: loadedClinic.timezone ?? undefined
      });
      setInvoices(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los comprobantes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <AdminPageShell
      description="Comprobantes emitidos desde pagos acreditados, con su estado real ante ARCA."
      eyebrow="Facturacion"
      onRefresh={load}
      title="Comprobantes"
    >
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="this_month" onChange={setRange} />

      <SectionCard className="overflow-hidden">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Comprobantes</h2>
          <p className="mt-1 text-sm text-clinic-muted">{range.label}</p>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-clinic-muted">Cargando comprobantes...</p>
        ) : invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-clinic-muted">
            Todavia no se emitio ningun comprobante. Facturalo desde el detalle de un pago acreditado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-line text-left text-clinic-muted">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Punto de venta</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-clinic-surface/60">
                    <td className="whitespace-nowrap px-4 py-3 text-clinic-muted">{formatDate(invoice.created_at)}</td>
                    <td className="px-4 py-3 text-clinic-ink">{DOCUMENT_TYPE_LABELS[invoice.document_type] ?? invoice.document_type}</td>
                    <td className="px-4 py-3 text-clinic-muted">{invoice.sale_point ?? "—"}{invoice.document_number ? ` / ${invoice.document_number}` : ""}</td>
                    <td className="px-4 py-3"><InvoiceStatusBadge arcaStatus={invoice.arca_status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-clinic-ink">{formatMoney(invoice.total)}</td>
                    <td className="px-4 py-3">
                      <Link className="text-sm font-semibold text-clinic-brand" to={`/admin/facturacion/comprobantes/${invoice.id}`}>Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const [invoice, setInvoice] = useState<(Invoice & { invoice_items: InvoiceItem[] }) | null>(null);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const autoIssued = useRef(false);

  async function load() {
    try {
      const loaded = await getInvoiceById(id);
      setInvoice(loaded);
      return loaded;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el comprobante.");
      return null;
    }
  }

  async function attemptIssue() {
    setIssuing(true);
    setError("");
    try {
      await issueInvoice(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos emitir el comprobante.");
    } finally {
      setIssuing(false);
      await load();
    }
  }

  useEffect(() => {
    (async () => {
      const loaded = await load();
      // Auto-intenta emitir una sola vez al entrar si todavia no se pidio
      // CAE - asi "Facturar" desde el pago se siente como una sola accion,
      // sin un segundo click extra en esta pantalla.
      if (loaded?.arca_status === "pending_configuration" && !autoIssued.current) {
        autoIssued.current = true;
        await attemptIssue();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <AdminPageShell description="Estado del comprobante ante ARCA." eyebrow="Facturacion" onRefresh={load} title="Comprobante">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!invoice ? (
        <SectionCard className="p-8 text-center text-clinic-muted">Cargando comprobante...</SectionCard>
      ) : (
        <SectionCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
                <FileCheck2 size={20} />
              </span>
              <div>
                <h2 className="font-semibold text-clinic-ink">
                  {DOCUMENT_TYPE_LABELS[invoice.document_type] ?? invoice.document_type}
                </h2>
                <p className="mt-1 text-sm text-clinic-muted">
                  Punto de venta {invoice.sale_point ?? "—"}{invoice.document_number ? ` · N° ${invoice.document_number}` : ""}
                </p>
              </div>
            </div>
            <InvoiceStatusBadge arcaStatus={invoice.arca_status} />
          </div>

          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <Info label="Total" value={formatMoney(invoice.total)} />
            <Info label="CAE" value={invoice.arca_external_id ?? "Sin emitir"} />
            <Info label="Vencimiento CAE" value={invoice.arca_cae_expires_at ? formatDate(invoice.arca_cae_expires_at) : "—"} />
            <Info label="Emitido" value={invoice.issued_at ? formatDate(invoice.issued_at) : "Todavia no"} />
          </dl>

          {issuing && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Emitiendo con ARCA...</p>}
          {invoice.arca_status === "failed" && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">ARCA rechazo el comprobante.</p>
              <p className="mt-1">{extractRejectionReason(invoice.arca_response)}</p>
              <Button className="mt-3" icon={<RefreshCw size={14} />} onClick={attemptIssue} disabled={issuing}>
                Reintentar
              </Button>
            </div>
          )}

          <div className="mt-5 divide-y divide-clinic-line border-y border-clinic-line">
            {invoice.invoice_items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-clinic-ink">{item.description}</p>
                  <p className="text-clinic-muted">{item.quantity} x {formatMoney(item.unit_price)}{item.tax_rate ? ` + IVA ${item.tax_rate}%` : ""}</p>
                </div>
                <p className="font-semibold text-clinic-ink">{formatMoney(item.total)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </AdminPageShell>
  );
}

function extractRejectionReason(arcaResponse: Record<string, unknown> | null) {
  if (!arcaResponse) return "Sin detalle disponible.";
  const message = (arcaResponse as { message?: string }).message;
  if (message) return message;
  return "Sin detalle disponible - revisar con soporte.";
}

function InvoiceStatusBadge({ arcaStatus }: { arcaStatus: string }) {
  const labels: Record<string, string> = {
    pending_configuration: "Sin emitir",
    pending: "Emitiendo...",
    synced: "CAE obtenido",
    failed: "Rechazado"
  };
  const tone = arcaStatus === "synced" ? "bg-emerald-50 text-emerald-700" : arcaStatus === "pending" ? "bg-amber-50 text-amber-700" : arcaStatus === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${tone}`}>{labels[arcaStatus] ?? arcaStatus}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinic-line px-3 py-2">
      <dt className="text-clinic-muted">{label}</dt>
      <dd className="mt-1 font-medium text-clinic-ink">{value}</dd>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value || 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
