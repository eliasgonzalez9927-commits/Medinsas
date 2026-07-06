import { CalendarDays, HeartPulse, Home, LogOut, Menu, UserRound, UsersRound } from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const patientNav = [
  { to: "/paciente", label: "Inicio", icon: Home },
  { to: "/paciente/turnos", label: "Mis turnos", icon: CalendarDays },
  { to: "/paciente/perfil", label: "Mi perfil", icon: UserRound },
  { to: "/paciente/grupo-familiar", label: "Grupo familiar", icon: UsersRound }
];

export function PatientPortalLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F6FAF9] text-clinic-ink">
      <header className="sticky top-0 z-30 border-b border-clinic-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/paciente" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-clinic-brand text-white">
              <HeartPulse size={21} />
            </span>
            <span>
              <span className="block text-lg font-semibold leading-none text-clinic-ink">Mi Medin</span>
              <span className="mt-1 block text-xs font-medium text-clinic-muted">Portal del Paciente</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {patientNav.map((item) => (
              <PatientNavLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <div className="rounded-full border border-clinic-line px-3 py-2 text-sm text-clinic-muted">
              {profile?.full_name ?? "Paciente"}
            </div>
            <button
              type="button"
              onClick={signOut}
              className="grid h-10 w-10 place-items-center rounded-lg border border-clinic-line text-clinic-muted transition hover:bg-clinic-surface hover:text-clinic-ink"
              aria-label="Cerrar sesion"
            >
              <LogOut size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-clinic-line text-clinic-ink lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-clinic-line bg-white px-4 py-3 lg:hidden">
            <nav className="grid gap-1">
              {patientNav.map((item) => (
                <PatientNavLink key={item.to} {...item} onClick={() => setMenuOpen(false)} />
              ))}
              <button
                type="button"
                onClick={signOut}
                className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-clinic-muted hover:bg-clinic-surface"
              >
                <LogOut size={17} />
                Cerrar sesion
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}

function PatientNavLink({
  to,
  label,
  icon: Icon,
  onClick
}: {
  to: string;
  label: string;
  icon: typeof Home;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/paciente"}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? "bg-[#E6F4F1] text-clinic-brand"
            : "text-clinic-muted hover:bg-clinic-surface hover:text-clinic-ink"
        }`
      }
    >
      <Icon size={17} />
      {label}
    </NavLink>
  );
}
