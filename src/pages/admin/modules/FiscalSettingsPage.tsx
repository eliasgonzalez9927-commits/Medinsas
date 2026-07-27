import { FormEvent, useEffect, useState } from "react";
import { Building2, FileCheck2, ShieldCheck } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { getDefaultClinic, getFiscalSettings, updateFiscalSettings } from "../../../lib/clinic-data";
import { FiscalSettings } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";
import { SettingsTabsNav } from "./SettingsPage";

type EnvHealth = {
  arcaSdkAccessToken: boolean;
  arcaInvoiceIssueEnabled: boolean;
};

const FISCAL_CONDITION_OPTIONS = [
  { value: "monotributo", label: "Monotributo" },
  { value: "responsable_inscripto", label: "Responsable Inscripto" }
];

// MVP cubre solo Factura C (Monotributo) y Factura B (Responsable
// Inscripto) a consumidor final - ver plan de facturacion ARCA.
const RECEIPT_TYPES_BY_CONDITION: Record<string, string[]> = {
  monotributo: ["factura_c"],
  responsable_inscripto: ["factura_b"]
};

export function FiscalSettingsPage() {
  const { role } = useAuth();
  const canEdit = role === "platform_admin" || role === "clinic_admin" || role === "admin";
  const [settings, setSettings] = useState<FiscalSettings | null>(null);
  const [form, setForm] = useState({
    legal_name: "",
    trade_name: "",
    cuit: "",
    fiscal_condition: "monotributo",
    fiscal_address: "",
    sale_point: "",
    arca_environment: "sandbox"
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [envHealth, setEnvHealth] = useState<EnvHealth | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  async function load() {
    try {
      const clinic = await getDefaultClinic();
      if (!clinic) return;
      const loaded = await getFiscalSettings(clinic.id);
      setSettings(loaded);
      if (role === "platform_admin") {
        const healthResponse = await fetch("/api/health/env");
        if (healthResponse.ok) setEnvHealth(await healthResponse.json());
      }
      if (loaded) {
        setForm({
          legal_name: loaded.legal_name ?? "",
          trade_name: loaded.trade_name ?? "",
          cuit: loaded.cuit ?? "",
          fiscal_condition: loaded.fiscal_condition ?? "monotributo",
          fiscal_address: loaded.fiscal_address ?? "",
          sale_point: (loaded.sale_points?.[0] as string | undefined) ?? "",
          arca_environment: loaded.arca_environment ?? "sandbox"
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la configuracion fiscal.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !canEdit) return;
    setError("");
    try {
      const updated = await updateFiscalSettings(settings.id, {
        legal_name: form.legal_name || null,
        trade_name: form.trade_name || null,
        cuit: form.cuit || null,
        fiscal_condition: form.fiscal_condition,
        fiscal_address: form.fiscal_address || null,
        sale_points: form.sale_point ? [form.sale_point] : [],
        receipt_types: RECEIPT_TYPES_BY_CONDITION[form.fiscal_condition] ?? [],
        arca_environment: form.arca_environment
      });
      setSettings(updated);
      setNotice("Configuracion fiscal actualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la configuracion fiscal.");
    }
  }

  const canMarkConfigured = Boolean(form.cuit && form.sale_point && form.fiscal_condition);

  async function toggleIntegrationStatus() {
    if (!settings || !canEdit) return;
    setSavingStatus(true);
    setError("");
    try {
      const nextStatus = settings.arca_integration_status === "configured" ? "disabled" : "configured";
      const updated = await updateFiscalSettings(settings.id, {
        arca_provider: "afip_sdk",
        arca_integration_status: nextStatus
      });
      setSettings(updated);
      setNotice(
        nextStatus === "configured"
          ? "Facturacion electronica marcada como configurada."
          : "Facturacion electronica desactivada."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar el estado de la integracion.");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <AdminPageShell
      description="CUIT, condicion fiscal y punto de venta para emitir comprobantes reales con ARCA."
      eyebrow="Facturacion"
      onRefresh={load}
      title="Configuracion fiscal"
    >
      <SettingsTabsNav activeTab="fiscal" />
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}

      <SectionCard className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
              <FileCheck2 size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-clinic-ink">Delegacion en ARCA</h2>
              <p className="mt-1 text-sm text-clinic-muted">
                {settings?.arca_integration_status === "configured"
                  ? "Facturacion electronica configurada. Los comprobantes se emiten con CAE real."
                  : "Falta delegar el servicio \"Facturacion Electronica\" a Afip SDK desde ARCA (Administrador de Relaciones de Clave Fiscal) y crear un punto de venta tipo Web Services, ademas de completar CUIT y punto de venta acá abajo."}
              </p>
            </div>
          </div>
          {canEdit && (
            <Button
              disabled={savingStatus || (settings?.arca_integration_status !== "configured" && !canMarkConfigured)}
              onClick={toggleIntegrationStatus}
              variant="primary"
            >
              {settings?.arca_integration_status === "configured" ? "Desactivar" : "Marcar como configurado"}
            </Button>
          )}
        </div>
      </SectionCard>

      <section className={`grid gap-6 ${role === "platform_admin" ? "xl:grid-cols-[1fr_0.8fr]" : ""}`}>
        <SectionCard className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
              <Building2 size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-clinic-ink">Datos fiscales de la clinica</h2>
              <p className="mt-1 text-sm text-clinic-muted">Usados para armar cada comprobante enviado a ARCA.</p>
            </div>
          </div>
          {!canEdit && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Tu rol no permite editar la configuracion fiscal.
            </div>
          )}
          <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Razon social" value={form.legal_name} onChange={(value) => setForm({ ...form, legal_name: value })} disabled={!canEdit} />
            <Input label="Nombre de fantasia" value={form.trade_name} onChange={(value) => setForm({ ...form, trade_name: value })} disabled={!canEdit} />
            <Input label="CUIT" value={form.cuit} onChange={(value) => setForm({ ...form, cuit: value })} disabled={!canEdit} />
            <Select
              label="Condicion fiscal"
              value={form.fiscal_condition}
              onChange={(value) => setForm({ ...form, fiscal_condition: value })}
              options={FISCAL_CONDITION_OPTIONS}
              disabled={!canEdit}
            />
            <label className="md:col-span-2">
              <span className="text-sm font-medium text-clinic-ink">Domicilio fiscal</span>
              <input
                value={form.fiscal_address}
                onChange={(event) => setForm({ ...form, fiscal_address: event.target.value })}
                disabled={!canEdit}
                className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100 disabled:bg-clinic-surface disabled:text-clinic-muted"
              />
            </label>
            <Input label="Punto de venta (Web Services, ej: 00003)" value={form.sale_point} onChange={(value) => setForm({ ...form, sale_point: value })} disabled={!canEdit} />
            <Select
              label="Ambiente ARCA"
              value={form.arca_environment}
              onChange={(value) => setForm({ ...form, arca_environment: value })}
              options={[
                { value: "sandbox", label: "Sandbox / homologacion" },
                { value: "production", label: "Produccion" }
              ]}
              disabled={!canEdit}
            />
            {canEdit && (
              <div className="md:col-span-2"><Button type="submit" variant="primary">Guardar configuracion</Button></div>
            )}
          </form>
        </SectionCard>

        {role === "platform_admin" && (
          <SectionCard className="p-5">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700"><ShieldCheck size={20} /></div>
            <h2 className="mt-4 font-semibold text-clinic-ink">Configuracion de la plataforma</h2>
            <p className="mt-2 text-sm text-clinic-muted">
              Solo vos ves esto (platform admin). Una sola cuenta de Afip SDK sirve para todas las clinicas delegadas.
            </p>
            <div className="mt-4 grid gap-2">
              <EnvRow label="Afip SDK access token" ready={envHealth?.arcaSdkAccessToken} />
              <EnvRow label="Emision de facturas habilitada" ready={envHealth?.arcaInvoiceIssueEnabled} />
            </div>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Variables requeridas en Vercel: AFIPSDK_ACCESS_TOKEN y ARCA_INVOICE_ISSUE_ENABLED.
            </div>
          </SectionCard>
        )}
      </section>
    </AdminPageShell>
  );
}

function EnvRow({ label, ready }: { label: string; ready?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-clinic-line px-3 py-2 text-sm">
      <span className="font-medium text-clinic-ink">{label}</span>
      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        {ready ? "Configurado" : "Falta variable"}
      </span>
    </div>
  );
}

function Input({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100 disabled:bg-clinic-surface disabled:text-clinic-muted"
      />
    </label>
  );
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100 disabled:bg-clinic-surface disabled:text-clinic-muted"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
