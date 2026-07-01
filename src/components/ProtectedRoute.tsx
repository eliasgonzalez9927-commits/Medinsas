import { Navigate, Outlet, useLocation } from "react-router-dom";
import { UserRole } from "../types/database";
import { useAuth } from "../contexts/AuthContext";
import { useActiveClinic } from "../contexts/ActiveClinicContext";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { role, user, loading } = useAuth();
  const { activeRole, loading: clinicLoading } = useActiveClinic();
  const location = useLocation();
  const effectiveRole = activeRole ?? role;

  // 1. Auth todavía no resolvió (primer arranque antes de getSession).
  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface">
        <div className="rounded-lg border border-clinic-line bg-white px-6 py-4 shadow-soft">
          Cargando sesion...
        </div>
      </main>
    );
  }

  // 2. Sin sesión → login.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // 3. Primera carga real: usuario conocido pero el contexto de clínica aún
  //    no resolvió ni una vez (effectiveRole todavía null + clinicLoading).
  //    No bloquear en refrescos de fondo donde effectiveRole ya está disponible.
  if (!effectiveRole && clinicLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface">
        <div className="rounded-lg border border-clinic-line bg-white px-6 py-4 shadow-soft">
          Cargando sesion...
        </div>
      </main>
    );
  }

  // 4. Verificar permisos de ruta cuando ya hay suficiente contexto.
  if (roles && (!effectiveRole || !roles.includes(effectiveRole))) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface px-4">
        <section className="w-full max-w-md rounded-lg border border-clinic-line bg-white p-6 text-center shadow-soft">
          <h1 className="text-2xl font-semibold text-clinic-ink">Sin permisos</h1>
          <p className="mt-2 text-sm text-clinic-muted">
            Tu usuario no tiene permisos para acceder a esta seccion.
          </p>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
