import { Navigate, Outlet, useLocation } from "react-router-dom";
import { UserRole } from "../types/database";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { role, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface">
        <div className="rounded-lg border border-clinic-line bg-white px-6 py-4 shadow-soft">
          Cargando sesion...
        </div>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && (!role || !roles.includes(role))) {
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
