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
