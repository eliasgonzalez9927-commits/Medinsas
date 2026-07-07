import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isPatientPreviewActive } from "../../lib/patient-preview";

export function PatientPortalRoute() {
  const { role, user, loading } = useAuth();
  const location = useLocation();
  const previewActive = isPatientPreviewActive();

  if (previewActive) return <Outlet />;

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface">
        <div className="rounded-lg border border-clinic-line bg-white px-6 py-4 shadow-soft">
          Cargando Mi Medin...
        </div>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/paciente/login" replace state={{ from: location }} />;
  }

  if (role !== "patient") {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface px-4">
        <section className="w-full max-w-md rounded-lg border border-clinic-line bg-white p-6 text-center shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-wide text-clinic-muted">Mi Medin</p>
          <h1 className="mt-2 text-2xl font-semibold text-clinic-ink">Acceso paciente no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-clinic-muted">
            Este usuario no esta configurado como paciente. Si sos parte del equipo de una clinica, usa el acceso administrativo.
          </p>
          <a
            href="/login"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Ir al acceso del equipo
          </a>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
