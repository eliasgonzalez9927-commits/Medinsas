import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { enablePatientPreview, patientPreviewEnabled } from "../../lib/patient-preview";

const previewTargets = new Set([
  "/paciente",
  "/paciente/turnos",
  "/paciente/turnos/nuevo",
  "/paciente/perfil",
  "/paciente/grupo-familiar",
]);

export function PatientPreviewPage() {
  const enabled = patientPreviewEnabled;
  const [searchParams] = useSearchParams();
  const requestedTarget = searchParams.get("next");
  const previewTarget = requestedTarget && previewTargets.has(requestedTarget) ? requestedTarget : "/paciente";

  if (enabled) {
    enablePatientPreview();
    return <Navigate to={previewTarget} replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-clinic-surface px-4">
      <section className="w-full max-w-md rounded-lg border border-clinic-line bg-white p-6 text-center shadow-soft">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#E6F4F1] text-clinic-brand">
          <ShieldCheck size={22} />
        </span>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-clinic-muted">Mi Medin</p>
        <h1 className="mt-2 text-2xl font-semibold text-clinic-ink">Preview no disponible</h1>
        <p className="mt-2 text-sm leading-6 text-clinic-muted">
          El acceso preview del Portal del Paciente solo esta habilitado en desarrollo local.
        </p>
        <Link
          to="/paciente/login"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Volver al login paciente
        </Link>
      </section>
    </main>
  );
}
