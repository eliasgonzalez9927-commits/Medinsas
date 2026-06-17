import {
  Banknote,
  CalendarDays,
  ClipboardList,
  LogOut,
  Menu,
  Search,
  Settings,
  Stethoscope,
  UserRound,
  UsersRound
} from "lucide-react";
import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/Button";

const navItems = [
  { label: "Dashboard", icon: ClipboardList, to: "/admin", active: true },
  { label: "Agenda", icon: CalendarDays, to: "/admin", active: false },
  { label: "Pacientes", icon: UsersRound, to: "/admin", active: false },
  { label: "Profesionales", icon: Stethoscope, to: "/admin", active: false },
  { label: "Financiacion", icon: Banknote, to: "/admin", active: false },
  { label: "Configuracion", icon: Settings, to: "/admin", active: false }
];

export function AdminLayout({
  children,
  onRefresh,
  onCreateAppointment
}: {
  children: ReactNode;
  onRefresh: () => void;
  onCreateAppointment: () => void;
}) {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-clinic-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-clinic-line bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-clinic-line px-6 py-5">
            <Link to="/admin" className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-clinic-brand text-white shadow-sm">
                <ClipboardList size={21} />
              </span>
              <div>
                <p className="text-lg font-semibold text-clinic-ink">ClinicOS</p>
                <p className="text-xs font-medium text-clinic-muted">Gestion clinica</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 px-4 py-5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    item.active
                      ? "bg-teal-50 text-clinic-brand"
                      : "text-clinic-muted hover:bg-clinic-surface hover:text-clinic-ink"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                  {!item.active && (
                    <span className="ml-auto rounded-lg bg-clinic-surface px-2 py-0.5 text-[11px] text-clinic-muted">
                      pronto
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="border-t border-clinic-line p-4">
            <div className="flex items-center gap-3 rounded-lg bg-clinic-surface p-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-clinic-muted">
                <UserRound size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-clinic-ink">
                  {profile?.full_name ?? "Equipo clinico"}
                </p>
                <p className="text-xs text-clinic-muted">Administrador</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="grid h-9 w-9 place-items-center rounded-lg text-clinic-muted hover:bg-white hover:text-clinic-ink"
                aria-label="Cerrar sesion"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-clinic-line bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-lg border border-clinic-line text-clinic-muted lg:hidden"
              aria-label="Abrir navegacion"
            >
              <Menu size={20} />
            </button>
            <Link to="/admin" className="flex items-center gap-2 font-semibold text-clinic-ink lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-clinic-brand text-white">
                <ClipboardList size={19} />
              </span>
              ClinicOS
            </Link>

            <div className="relative ml-auto hidden w-full max-w-xl md:block lg:ml-0">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted"
              />
              <input
                placeholder="Buscar paciente, turno o profesional..."
                className="h-10 w-full rounded-lg border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button className="hidden sm:inline-flex" onClick={onRefresh} variant="secondary">
                Actualizar
              </Button>
              <Button onClick={onCreateAppointment} variant="primary">
                Nuevo turno
              </Button>
            </div>
          </div>

          <div className="border-t border-clinic-line px-4 py-3 md:hidden">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted"
              />
              <input
                placeholder="Buscar paciente, turno o profesional..."
                className="h-10 w-full rounded-lg border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100"
              />
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
