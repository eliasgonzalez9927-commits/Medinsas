import { FinancingSimulator } from "../../../components/fintech/FinancingSimulator";
import { GrowthDashboard } from "../../../components/growth/GrowthDashboard";
import { AdminPageShell } from "./AdminPageShell";

export function FinancingPage() {
  return (
    <AdminPageShell
      description="Planes de pago, anticipo estimado y preparacion para scoring crediticio."
      eyebrow="Modulo financiero"
      title="Financiacion"
    >
      <FinancingSimulator />
    </AdminPageShell>
  );
}

export function ReportsPage() {
  return (
    <AdminPageShell
      description="Ausentismo, ocupacion, pacientes nuevos, fuentes de turnos y servicios mas solicitados."
      eyebrow="Gestion"
      title="Reportes"
    >
      <GrowthDashboard />
    </AdminPageShell>
  );
}

export function SettingsPage() {
  return (
    <AdminPageShell
      description="Datos de la clinica, sedes, permisos, integraciones y preferencias operativas."
      eyebrow="Administracion"
      title="Configuracion"
    >
      <div className="rounded-lg border border-clinic-line bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-clinic-ink">Configuracion preparada</h2>
        <p className="mt-2 text-sm text-clinic-muted">
          Proximo paso: conectar datos de clinica, sedes, usuarios, roles e integraciones externas.
        </p>
      </div>
    </AdminPageShell>
  );
}
