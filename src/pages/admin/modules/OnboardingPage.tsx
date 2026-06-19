import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { getDefaultClinic } from "../../../lib/clinic-data";
import { getOnboardingProgress } from "../../../lib/superadmin-data";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const clinic = await getDefaultClinic();
      if (!clinic) return;
      setProgress(await getOnboardingProgress(clinic.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar onboarding.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminPageShell
      description="Checklist asistido para dejar la clínica lista para operar."
      eyebrow="Onboarding"
      onRefresh={load}
      onCreateAppointment={() => navigate("/admin/agenda")}
      title="Puesta en marcha"
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-clinic-ink">Progreso de onboarding</h2>
            <p className="mt-1 text-sm text-clinic-muted">Basado en datos reales cargados en Medin.</p>
          </div>
          <p className="text-3xl font-semibold text-clinic-brand">{progress?.percent ?? 0}%</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-clinic-surface">
          <div className="h-full rounded-full bg-clinic-brand" style={{ width: `${progress?.percent ?? 0}%` }} />
        </div>
      </section>
      <section className="grid gap-3">
        {(progress?.steps ?? []).map((step: any, index: number) => {
          const done = step.status === "completed";
          const Icon = done ? CheckCircle2 : CircleDashed;
          return (
            <article key={step.stepKey} className="flex flex-col gap-3 rounded-lg border border-clinic-line bg-white p-4 shadow-sm md:flex-row md:items-center">
              <div className={`grid h-10 w-10 place-items-center rounded-lg ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-clinic-ink">{index + 1}. {step.label}</p>
                <p className="mt-1 text-sm text-clinic-muted">{step.summary}</p>
              </div>
              <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {done ? "Completo" : "Pendiente"}
              </span>
              <Link className="text-sm font-semibold text-clinic-brand" to={step.to}>Configurar</Link>
            </article>
          );
        })}
      </section>
    </AdminPageShell>
  );
}
