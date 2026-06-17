import { Navigate, Outlet } from "react-router-dom";
import { UserRole } from "../types/database";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { profile, user, loading } = useAuth();

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface">
        <div className="rounded-lg border border-clinic-line bg-white px-6 py-4 shadow-soft">
          Cargando sesion...
        </div>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
