import { CalendarDays, ClipboardList, LogOut, UserRound } from "lucide-react";
import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isStaffRole } from "../lib/auth-roles";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const isStaff = isStaffRole(role);

  return (
    <div className="min-h-screen bg-clinic-surface">
      <header className="border-b border-clinic-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 font-semibold text-clinic-ink">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-clinic-brand text-white">
              <ClipboardList size={20} />
            </span>
            ClinicOS
          </Link>
          <nav className="flex items-center gap-2">
            <NavLink
              to={isStaff ? "/admin" : "/patient/book"}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-clinic-muted hover:bg-clinic-surface"
            >
              <CalendarDays size={18} />
              {isStaff ? "Administracion" : "Reservar"}
            </NavLink>
            <Link
              to={isStaff ? "/admin" : "/patient/book"}
              className="hidden items-center gap-2 rounded-lg border border-clinic-line px-3 py-2 text-sm text-clinic-muted hover:bg-clinic-surface sm:flex"
            >
              <UserRound size={18} />
              {profile?.full_name}
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="grid h-10 w-10 place-items-center rounded-lg border border-clinic-line text-clinic-muted hover:bg-clinic-surface"
              aria-label="Cerrar sesion"
            >
              <LogOut size={18} />
            </button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
