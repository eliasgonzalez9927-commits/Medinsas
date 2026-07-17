import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { UserRole } from "../types/database";
import { useAuth } from "../contexts/AuthContext";
import { getPostLoginPath } from "../lib/auth-roles";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { role, user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
    const homePath = getPostLoginPath(role);
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface px-4">
        <section className="w-full max-w-md rounded-lg border border-clinic-line bg-white p-6 text-center shadow-soft">
          <h1 className="text-2xl font-semibold text-clinic-ink">Sin permisos</h1>
          <p className="mt-2 text-sm text-clinic-muted">
            Tu usuario no tiene permisos para acceder a esta seccion.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {homePath && (
              <button
                type="button"
                onClick={() => navigate(homePath, { replace: true })}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-clinic-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(13,118,110,0.18)] transition hover:bg-[#0b655e]"
              >
                Volver a mi panel
              </button>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink shadow-[0_2px_8px_rgba(13,54,66,0.025)] transition hover:bg-[#e6f4f1]"
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
