import { Building2, ChevronDown, CirclePlus, LogOut, Menu, Search, UserRound, X } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useActiveClinic } from "../../contexts/ActiveClinicContext";
import { useAuth } from "../../contexts/AuthContext";
import { ADMIN_MODULES, ADMIN_NAVIGATION_GROUPS, AdminModuleDefinition } from "../../lib/admin-navigation";
import { roleLabels } from "../../lib/auth-roles";
import { BASE_MODULES } from "../../lib/modules";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";

export function AdminLayout({
  children,
  onRefresh,
  onCreateAppointment,
  lastRefreshedAt,
  isOnline,
  isRefreshing
}: {
  children: ReactNode;
  onRefresh: () => void;
  onCreateAppointment: () => void;
  lastRefreshedAt?: Date;
  isOnline?: boolean;
  isRefreshing?: boolean;
}) {
  const { profile, role, signOut, user } = useAuth();
  const {
    activeClinic: clinic,
    activeRole,
    availableClinics,
    error: clinicError,
    loading: clinicLoading,
    setActiveClinicId
  } = useActiveClinic();
  const navigate = useNavigate();
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(() => new Date());
  // Ticker forces label re-render every 30s without touching data.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const displayName = profile?.full_name ?? user?.email ?? "Equipo clínico";
  const displayRole = activeRole ? roleLabels[activeRole] : role ? roleLabels[role] : "Usuario";
  const canSwitchClinic = availableClinics.length > 1 || role === "platform_admin";

  const visibleModules = useMemo(() => {
    return ADMIN_MODULES.filter((item) => {
      if (item.status === "hidden") return false;
      if (item.allowedRoles && (!activeRole || !item.allowedRoles.includes(activeRole))) return false;
      if (activeRole === "professional" || activeRole === "doctor") return item.key === "agenda";
      if (!item.moduleFlag) return true;
      const moduleFlags = Array.isArray(item.moduleFlag) ? item.moduleFlag : [item.moduleFlag];
      if (moduleFlags.some((flag) => BASE_MODULES.includes(flag))) return true;
      return moduleFlags.some((flag) => modules[flag] ?? false);
    });
  }, [activeRole, modules]);

  useEffect(() => {
    async function loadWorkspace() {
      if (!clinic) {
        setModules({});
        return;
      }
      const { data } = await supabase
        .from("clinic_modules")
        .select("module_key, enabled")
        .eq("clinic_id", clinic.id);
      setModules(Object.fromEntries((data ?? []).map((item: { module_key: string; enabled: boolean }) => [item.module_key, item.enabled])));
    }
    loadWorkspace();
  }, [clinic?.id]);

  function runGlobalSearch() {
    const query = globalSearch.trim();
    if (!query) return;
    setMobileNavOpen(false);
    navigate(`/admin/agenda?search=${encodeURIComponent(query)}`);
  }

  const effectiveLastRefreshedAt = lastRefreshedAt ?? lastRefreshAt;
  const effectiveIsOnline = isOnline ?? true;
  const effectiveIsRefreshing = isRefreshing ?? false;

  function handleRefresh() {
    setLastRefreshAt(new Date());
    onRefresh();
  }

  function modulePath(item: AdminModuleDefinition) {
    return (activeRole === "professional" || activeRole === "doctor") && item.key === "agenda" ? "/admin/mi-agenda" : item.path;
  }

  function navigationSection(groupKey: typeof ADMIN_NAVIGATION_GROUPS[number]["key"], compact = false) {
    const items = visibleModules.filter((item) => item.group === groupKey);
    if (!items.length) return null;
    const label = ADMIN_NAVIGATION_GROUPS.find((group) => group.key === groupKey)?.label ?? groupKey;

    return (
      <section key={groupKey} className={compact ? "" : "mb-5"}>
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const badge = item.status === "beta" ? "Beta" : item.status === "coming_soon" ? "Próximamente" : null;
            if (item.status === "coming_soon") {
              return (
                <div
                  key={item.key}
                  title={item.description ?? "Este módulo está en preparación."}
                  className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400"
                  aria-disabled="true"
                >
                  <Icon size={18} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{badge}</span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.key}
                to={modulePath(item)}
                end={item.path === "/admin"}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) => {
                  if (item.group === "platform") {
                    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive ? "bg-[#dff2ee] text-[#0D3642] shadow-[inset_3px_0_0_#8fd2c6]" : "bg-[#f6faf9] text-clinic-ink hover:bg-[#e6f4f1]"
                    }`;
                  }
                  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-[#e6f4f1] text-clinic-brand shadow-[inset_3px_0_0_#8fd2c6]"
                      : "text-clinic-muted hover:bg-clinic-surface hover:text-clinic-ink"
                  }`;
                }}
              >
                <Icon size={18} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {badge && <span className="rounded-full bg-[#e6f4f1] px-2 py-0.5 text-[10px] font-semibold text-clinic-brand">{badge}</span>}
              </NavLink>
            );
          })}
        </div>
      </section>
    );
  }

  const platformNavigation = navigationSection("platform", true);
  const clinicalNavigation = ADMIN_NAVIGATION_GROUPS
    .filter((group) => group.key !== "platform")
    .map((group) => navigationSection(group.key));

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-clinic-line px-5 py-5">
        <Link to="/admin" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[#8fd2c6] bg-[#e6f4f1] text-clinic-brand">
            <CirclePlus size={23} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-lg font-semibold text-clinic-ink">Medin</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5e9f98]">Gestión clínica</p>
          </div>
        </Link>
      </div>

      <div className="border-b border-clinic-line px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Clínica activa</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e6f4f1] text-clinic-brand"><Building2 size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-clinic-ink">{clinicLoading ? "Cargando clínica..." : clinic?.name ?? "Sin clínica asignada"}</p>
            <p className="text-xs text-clinic-muted">{displayRole} · {clinicStatusLabel(clinic?.status)}</p>
          </div>
        </div>
        {canSwitchClinic ? (
          <label className="mt-3 block">
            <span className="sr-only">Cambiar clínica</span>
            <span className="relative block">
              <select
                value={clinic?.id ?? ""}
                onChange={(event) => {
                  if (event.target.value) setActiveClinicId(event.target.value);
                }}
                className="h-9 w-full appearance-none rounded-lg border border-clinic-line bg-clinic-surface px-3 pr-8 text-xs font-semibold text-clinic-ink outline-none transition focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              >
                {availableClinics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.slug}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-clinic-muted" size={14} />
            </span>
          </label>
        ) : (
          <p className="mt-3 text-xs font-semibold text-clinic-muted">{clinicError || "Clínica asignada"}</p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">{clinicalNavigation}</nav>

      {platformNavigation && <div className="border-t border-clinic-line px-3 py-4">{platformNavigation}</div>}

      <div className="border-t border-clinic-line p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-clinic-line bg-clinic-surface p-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-clinic-muted"><UserRound size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-clinic-ink">{displayName}</p>
            <p className="truncate text-xs text-clinic-muted">{displayRole}</p>
          </div>
          <button type="button" onClick={signOut} className="grid h-9 w-9 place-items-center rounded-xl text-clinic-muted transition hover:bg-white hover:text-clinic-ink" aria-label="Cerrar sesión">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-clinic-surface text-clinic-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-clinic-line lg:block">{sidebarContent}</aside>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navegación">
          <button type="button" className="absolute inset-0 bg-slate-950/30" aria-label="Cerrar navegación" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative h-full w-80 max-w-[86vw] shadow-xl">
            <button type="button" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-surface" aria-label="Cerrar navegación" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-clinic-line bg-white/90 shadow-[0_1px_0_rgba(13,54,66,0.02)] backdrop-blur">
          <div className="flex min-h-[72px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-clinic-line text-clinic-muted lg:hidden" aria-label="Abrir navegación" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <Link to="/admin" className="flex items-center gap-2 font-semibold text-clinic-ink lg:hidden"><span className="grid h-9 w-9 place-items-center rounded-full border border-[#8fd2c6] bg-[#e6f4f1] text-clinic-brand"><CirclePlus size={19} /></span>Medin</Link>

            <form className="relative ml-auto hidden w-full max-w-xl md:block lg:ml-0" onSubmit={(event) => { event.preventDefault(); runGlobalSearch(); }}>
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" />
              <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Buscar paciente, turno o profesional..." className="h-10 w-full rounded-xl border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100" />
            </form>

            <div className="ml-auto flex items-center gap-2">
              <p className={`hidden whitespace-nowrap text-xs xl:block ${!effectiveIsOnline ? "text-amber-600" : effectiveIsRefreshing ? "text-clinic-brand" : "text-clinic-muted"}`}>
                {formatRefreshStatus(effectiveLastRefreshedAt, effectiveIsOnline, effectiveIsRefreshing)}
              </p>
              <div className="hidden min-w-0 text-right xl:block"><p className="truncate text-sm font-semibold text-clinic-ink">{clinic?.name ?? "Medin"}</p><p className="text-xs text-clinic-muted">{displayRole}</p></div>
              <Button className="hidden sm:inline-flex" onClick={handleRefresh} variant="secondary">Actualizar</Button>
              <Button onClick={onCreateAppointment} variant="primary">Nuevo turno</Button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((current) => !current)}
                  className="flex h-11 items-center gap-2 rounded-2xl border border-clinic-line bg-white px-2.5 text-left transition hover:bg-[#f6faf9]"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e6f4f1] text-clinic-brand"><UserRound size={17} /></span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-32 truncate text-sm font-semibold text-clinic-ink">{displayName}</span>
                    <span className="block text-xs text-clinic-muted">{displayRole}</span>
                  </span>
                  <ChevronDown size={15} className="text-clinic-muted" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-2xl border border-clinic-line bg-white p-2 shadow-[0_18px_42px_rgba(13,54,66,0.12)]" role="menu">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold text-clinic-ink">{displayName}</p>
                      <p className="truncate text-xs text-clinic-muted">{user?.email}</p>
                    </div>
                    <button type="button" onClick={signOut} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-clinic-muted transition hover:bg-[#e6f4f1] hover:text-clinic-ink" role="menuitem">
                      <LogOut size={16} /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <form className="border-t border-clinic-line px-4 py-3 md:hidden" onSubmit={(event) => { event.preventDefault(); runGlobalSearch(); }}>
            <div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" /><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Buscar en agenda..." className="h-10 w-full rounded-xl border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100" /></div>
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}

function clinicStatusLabel(status?: string | null) {
  const labels: Record<string, string> = { active: "Activa", trial: "Prueba", suspended: "Suspendida" };
  return labels[status ?? ""] ?? "Activa";
}

function formatRefreshStatus(date: Date, isOnline: boolean, isRefreshing: boolean) {
  if (isRefreshing) return "Actualizando...";
  if (!isOnline) {
    const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    return minutes >= 2 ? `Sin conexión · datos de hace ${minutes} min` : "Sin conexión";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Actualizado recién";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 10) return `Actualizado hace ${minutes} min`;
  return "Datos desactualizados · actualizá manualmente";
}
