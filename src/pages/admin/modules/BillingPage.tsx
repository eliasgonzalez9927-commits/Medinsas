import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeAlert, Building2, FileText, ReceiptText, Settings, WalletCards } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { AdminPageShell } from "./AdminPageShell";

const documentTypes = [
  "Comprobantes internos",
  "Facturas",
  "Recibos",
  "Notas de credito"
];

const pendingChecks = [
  "Datos fiscales de la clinica",
  "CUIT y condicion fiscal",
  "Puntos de venta",
  "Tipos de comprobante",
  "Proveedor ARCA / WSAA / WSFE"
];

export function BillingPage() {
  return (
    <AdminPageShell
      description="Comprobantes internos, pagos y preparacion fiscal sin emitir facturas reales todavia."
      eyebrow="Administracion financiera"
      title="Facturacion"
    >
      <ArcaNotice />

      <section className="grid gap-4 lg:grid-cols-3">
        <PreparedCard icon={<Building2 size={20} />} title="Datos fiscales" text="Razon social, CUIT, condicion fiscal y domicilio." to="/admin/facturacion/configuracion" />
        <PreparedCard icon={<ReceiptText size={20} />} title="Comprobantes" text="Borradores internos, facturas, recibos y notas de credito." to="/admin/facturacion/comprobantes" />
        <PreparedCard icon={<WalletCards size={20} />} title="Pagos" text="Relacion con paciente, turno y comprobante." to="/admin/financiacion" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Estructura preparada</h2>
          </div>
          <div className="divide-y divide-clinic-line">
            {documentTypes.map((type) => (
              <article key={type} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_160px_160px] md:items-center">
                <div>
                  <p className="font-semibold text-clinic-ink">{type}</p>
                  <p className="mt-1 text-sm text-clinic-muted">Paciente, turno, pago, PDF y estado del comprobante.</p>
                </div>
                <span className="rounded-lg bg-clinic-surface px-3 py-2 text-center text-xs font-semibold text-clinic-muted">
                  Borrador interno
                </span>
                <Button>Preparar</Button>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Pendiente de configuracion</h2>
          <div className="mt-4 grid gap-3">
            {pendingChecks.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-clinic-line px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <BadgeAlert size={15} />
                </span>
                <span className="text-sm font-medium text-clinic-ink">{item}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </AdminPageShell>
  );
}

export function BillingDocumentsPage() {
  return (
    <AdminPageShell
      description="Listado preparado para comprobantes internos, facturas, recibos y notas de credito."
      eyebrow="Facturacion"
      title="Comprobantes"
    >
      <ArcaNotice />
      <SectionCard className="p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
          <FileText size={22} />
        </div>
        <h2 className="mt-4 font-semibold text-clinic-ink">Todavia no hay comprobantes cargados.</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-clinic-muted">
          Este modulo queda preparado para crear comprobantes internos y, cuando exista integracion fiscal, sincronizar facturas reales.
        </p>
      </SectionCard>
    </AdminPageShell>
  );
}

export function BillingSettingsPage() {
  return (
    <AdminPageShell
      description="Datos fiscales y preparacion de integracion ARCA."
      eyebrow="Facturacion"
      title="Configuracion fiscal"
    >
      <ArcaNotice />
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Datos fiscales de la clinica</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {["Razon social", "CUIT", "Condicion fiscal", "Domicilio fiscal", "Puntos de venta", "Tipos de comprobante"].map((label) => (
            <label key={label}>
              <span className="text-sm font-medium text-clinic-ink">{label}</span>
              <input
                disabled
                placeholder="Pendiente de configuracion"
                className="mt-2 h-10 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 text-sm text-clinic-muted"
              />
            </label>
          ))}
        </div>
        <Button className="mt-5" icon={<Settings size={16} />}>Guardar borrador</Button>
      </SectionCard>
    </AdminPageShell>
  );
}

function ArcaNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Integracion ARCA pendiente de configuracion. Medin no emite facturas reales hasta conectar WSAA/WSFE o un proveedor fiscal habilitado.
    </div>
  );
}

function PreparedCard({ icon, title, text, to }: { icon: ReactNode; title: string; text: string; to: string }) {
  return (
    <Link to={to} className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm hover:bg-clinic-surface">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">{icon}</div>
      <h2 className="mt-4 font-semibold text-clinic-ink">{title}</h2>
      <p className="mt-2 text-sm text-clinic-muted">{text}</p>
    </Link>
  );
}
