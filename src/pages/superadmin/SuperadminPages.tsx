import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Building2, CheckCircle2, Copy, ExternalLink, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import {
  ALL_MODULES,
  ClinicFormPayload,
  PILOT_ACTIVE_MODULES,
  SubscriptionPlan,
  SuperadminClinic,
  addClinicAdmin,
  createClinic,
  getClinicDetail,
  getOnboardingProgress,
  getSubscriptionPlans,
  getSuperadminOverview,
  normalizeSlug,
  setClinicModule,
  updateClinic
} from "../../lib/superadmin-data";
import { getPublicAppUrl } from "../../lib/public-url";

const defaultForm: ClinicFormPayload = {
  name: "",
  legal_name: "",
  cuit: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  province: "",
  slug: "",
  timezone: "America/Argentina/Mendoza",
  status: "trial",
  plan: "pro",
  plan_id: null,
  active: true,
  modules: PILOT_ACTIVE_MODULES
};

export function SuperadminDashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData(await getSuperadminOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar superadmin.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <SuperadminShell
      title="Superadmin"
      description="Vista global SaaS de clínicas, actividad y módulos."
      action={<LinkButton to="/superadmin/clinicas?new=1" variant="primary">Nueva clínica</LinkButton>}
    >
      {error && <Message>{error}</Message>}
      <div className="mb-5 flex flex-wrap gap-2">
        <LinkButton to="/superadmin/clinicas">Clínicas</LinkButton>
        <LinkButton to="/superadmin/planes">Planes</LinkButton>
        <LinkButton to="/superadmin/suscripciones">Suscripciones</LinkButton>
      </div>
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Clínicas activas" value={String(data?.cards.active ?? 0)} />
        <Metric label="Clínicas en trial" value={String(data?.cards.trial ?? 0)} />
        <Metric label="Turnos del mes" value={String(data?.cards.appointmentsThisMonth ?? 0)} />
        <Metric label="Pagos procesados" value={formatMoney(data?.cards.processedPayments ?? 0)} />
        <Metric label="Usuarios activos" value={String(data?.cards.activeUsers ?? 0)} />
        <Metric label="Módulos más usados" value={data?.cards.moduleUsage?.[0]?.key ?? "Sin datos"} />
      </section>
      <ClinicTable clinics={data?.clinics ?? []} />
    </SuperadminShell>
  );
}

export function SuperadminClinicsPage() {
  const [clinics, setClinics] = useState<SuperadminClinic[]>([]);
  const [formOpen, setFormOpen] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  async function load() {
    try {
      const overview = await getSuperadminOverview();
      setClinics(overview.clinics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar clínicas.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = clinics.filter((clinic) => {
    if (filter === "all") return true;
    if (filter === "active") return clinic.active && clinic.status === "active";
    if (filter === "inactive") return clinic.active === false || clinic.status === "inactive";
    return clinic.status === filter || clinic.clinic_subscriptions?.[0]?.status === filter;
  });

  return (
    <SuperadminShell
      title="Clínicas"
      description="Alta, edición, estado SaaS, módulos y métricas operativas."
      action={<Button onClick={() => setFormOpen((value) => !value)} variant="primary">Nueva clínica</Button>}
    >
      {error && <Message>{error}</Message>}
      <div className="flex flex-wrap gap-2">
        {["all", "active", "trial", "inactive", "suspended", "cancelled"].map((item) => (
          <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === item ? "bg-clinic-brand text-white" : "border border-clinic-line bg-white text-clinic-muted"}`}>
            {filterLabel(item)}
          </button>
        ))}
      </div>
      {formOpen && <ClinicForm onSaved={() => { setFormOpen(false); load(); }} />}
      <ClinicTable clinics={filtered} />
    </SuperadminShell>
  );
}

export function SuperadminClinicDetailPage() {
  const { id = "" } = useParams();
  const [clinic, setClinic] = useState<SuperadminClinic | null>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [error, setError] = useState("");
  const publicBookingUrl = clinic ? `${getPublicAppUrl()}/reservar/${clinic.slug}` : "";

  async function load() {
    try {
      setClinic(await getClinicDetail(id));
      setOnboarding(await getOnboardingProgress(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la clínica.");
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!clinic) {
    return <SuperadminShell title="Clínica" description="Cargando datos...">{error && <Message>{error}</Message>}</SuperadminShell>;
  }

  return (
    <SuperadminShell title={clinic.name} description="Detalle SaaS, módulos, usuarios y onboarding asistido.">
      {error && <Message>{error}</Message>}
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Usuarios" value={String(clinic.counts?.users ?? 0)} />
        <Metric label="Profesionales" value={String(clinic.counts?.professionals ?? 0)} />
        <Metric label="Pacientes" value={String(clinic.counts?.patients ?? 0)} />
        <Metric label="Turnos" value={String(clinic.counts?.appointments ?? 0)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card title="Datos de clínica">
          {editing ? (
            <ClinicForm clinic={clinic} onSaved={() => { setEditing(false); load(); }} />
          ) : (
            <div className="grid gap-2 text-sm">
              <Info label="Slug" value={clinic.slug} />
              <Info label="Estado" value={clinic.status ?? "active"} />
              <Info label="Plan" value={currentPlanName(clinic)} />
              <Info label="Email" value={clinic.email ?? "Sin email"} />
              <Info label="Teléfono / WhatsApp" value={clinic.whatsapp ?? clinic.phone ?? "Sin teléfono"} />
              <Info label="Dirección" value={clinic.address ?? "Sin dirección"} />
              <Info label="Timezone" value={clinic.timezone ?? "America/Argentina/Mendoza"} />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => setEditing(true)}>Editar clínica</Button>
                <Button onClick={() => navigator.clipboard.writeText(publicBookingUrl)} icon={<Copy size={16} />}>Copiar link público</Button>
                <LinkButton to="/admin">Ir al admin</LinkButton>
              </div>
            </div>
          )}
        </Card>

        <Card title="Reserva pública">
          <p className="text-sm text-clinic-muted">URL preparada para pacientes:</p>
          <a href={publicBookingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex break-all text-sm font-semibold text-clinic-brand">
            {publicBookingUrl} <ExternalLink className="ml-2 shrink-0" size={15} />
          </a>
          <p className="mt-4 rounded-lg bg-clinic-surface px-3 py-2 text-sm text-clinic-muted">
            La ruta pública usa el slug de la clínica. Si no hay profesionales, servicios y disponibilidad, el flujo mostrará estados vacíos.
          </p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card title="Usuarios de la clínica">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setAdminOpen((value) => !value)} icon={<UserPlus size={16} />} variant="primary">Agregar admin</Button>
          </div>
          {adminOpen && <AddAdminForm clinicId={clinic.id} onSaved={() => { setAdminOpen(false); load(); }} />}
          <div className="divide-y divide-clinic-line">
            {(clinic.clinic_members ?? []).length === 0 ? <p className="text-sm text-clinic-muted">Todavía no hay usuarios asociados.</p> : clinic.clinic_members?.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-clinic-ink">{member.profiles?.full_name ?? member.user_id}</p>
                  <p className="text-clinic-muted">{member.role}</p>
                </div>
                <span className={member.active ? "text-emerald-700" : "text-slate-500"}>{member.active ? "Activo" : "Inactivo"}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Onboarding">
          <p className="text-2xl font-semibold text-clinic-ink">{onboarding?.percent ?? 0}%</p>
          <div className="mt-4 grid gap-2">
            {(onboarding?.steps ?? []).map((step: any) => (
              <div key={step.stepKey} className="flex items-center justify-between rounded-lg border border-clinic-line px-3 py-2 text-sm">
                <span>{step.label}</span>
                <span className={step.status === "completed" ? "text-emerald-700" : "text-amber-700"}>{step.summary}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card title="Módulos habilitados">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_MODULES.map((moduleKey) => {
            const enabled = clinic.clinic_modules?.find((item) => item.module_key === moduleKey)?.enabled ?? false;
            return (
              <label key={moduleKey} className="flex items-center justify-between rounded-lg border border-clinic-line px-3 py-2 text-sm">
                <span>{moduleLabel(moduleKey)}</span>
                <input type="checkbox" checked={enabled} onChange={async (event) => { await setClinicModule(clinic.id, moduleKey, event.target.checked); load(); }} />
              </label>
            );
          })}
        </div>
      </Card>
    </SuperadminShell>
  );
}

function ClinicForm({ clinic, onSaved }: { clinic?: SuperadminClinic; onSaved: () => void }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [form, setForm] = useState<ClinicFormPayload>(() => clinic ? {
    ...defaultForm,
    name: clinic.name,
    legal_name: clinic.legal_name ?? "",
    cuit: clinic.cuit ?? "",
    email: clinic.email ?? "",
    phone: clinic.phone ?? "",
    whatsapp: clinic.whatsapp ?? "",
    address: clinic.address ?? "",
    slug: clinic.slug,
    timezone: clinic.timezone ?? "America/Argentina/Mendoza",
    status: clinic.status ?? "active",
    plan: clinic.clinic_subscriptions?.[0]?.subscription_plans?.name ?? clinic.plan ?? "pro",
    plan_id: clinic.clinic_subscriptions?.[0]?.plan_id ?? null,
    active: clinic.active ?? true,
    modules: (clinic.clinic_modules ?? []).filter((item) => item.enabled).map((item) => item.module_key)
  } : defaultForm);
  const [slugEdited, setSlugEdited] = useState(Boolean(clinic));
  const [error, setError] = useState("");

  useEffect(() => {
    getSubscriptionPlans().then((items) => {
      setPlans(items);
      if (!form.plan_id && items[0]) {
        const preferred = items.find((item) => item.name.toLowerCase() === "pro") ?? items[0];
        setForm((current) => ({ ...current, plan_id: preferred.id, plan: preferred.name }));
      }
    }).catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar planes."));
  }, []);

  function updateName(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugEdited ? current.slug : normalizeSlug(value)
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (clinic) await updateClinic(clinic.id, form);
      else await createClinic(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la clínica.");
    }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-clinic-line bg-white p-4">
      {error && <Message>{error}</Message>}
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Nombre comercial" value={form.name} onChange={updateName} required />
        <Input label="Slug público" value={form.slug} onChange={(value) => { setSlugEdited(true); setForm({ ...form, slug: normalizeSlug(value) }); }} required disabled={Boolean(clinic)} />
        <Input label="Email administrativo" value={form.email ?? ""} onChange={(value) => setForm({ ...form, email: value })} type="email" />
        <Input label="Teléfono / WhatsApp" value={form.whatsapp ?? ""} onChange={(value) => setForm({ ...form, whatsapp: value, phone: value })} />
        <Input label="Dirección" value={form.address ?? ""} onChange={(value) => setForm({ ...form, address: value })} />
        <Input label="Ciudad" value={form.city ?? ""} onChange={(value) => setForm({ ...form, city: value })} />
        <Input label="Provincia" value={form.province ?? ""} onChange={(value) => setForm({ ...form, province: value })} />
        <Select label="Estado" value={form.status} onChange={(value) => setForm({ ...form, status: value, active: value !== "inactive" && value !== "cancelled" })} options={["trial", "active", "inactive", "suspended", "cancelled"]} />
        <label>
          <span className="text-sm font-medium">Plan inicial</span>
          <select value={form.plan_id ?? ""} onChange={(event) => { const plan = plans.find((item) => item.id === event.target.value); setForm({ ...form, plan_id: event.target.value, plan: plan?.name ?? form.plan }); }} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" required>
            <option value="">Seleccionar plan</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
        </label>
        <Input label="Timezone" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} />
      </div>
      {!clinic && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-clinic-ink">Módulos iniciales</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_MODULES.map((moduleKey) => (
              <label key={moduleKey} className="flex items-center gap-2 text-sm">
                <input checked={form.modules.includes(moduleKey)} onChange={(event) => setForm({ ...form, modules: event.target.checked ? [...form.modules, moduleKey] : form.modules.filter((item) => item !== moduleKey) })} type="checkbox" />
                {moduleLabel(moduleKey)}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4"><Button type="submit" variant="primary">{clinic ? "Guardar cambios" : "Crear clínica"}</Button></div>
    </form>
  );
}

function AddAdminForm({ clinicId, onSaved }: { clinicId: string; onSaved: () => void }) {
  const [form, setForm] = useState({ email: "", fullName: "", phone: "", password: "", role: "clinic_admin" as "clinic_admin" | "receptionist" | "professional" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await addClinicAdmin({ clinicId, ...form, password: form.password || undefined });
      setNotice(result.user.temporaryPassword ? `Usuario creado. Contraseña temporal: ${result.user.temporaryPassword}` : "Usuario asociado a la clínica.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos agregar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mb-4 grid gap-3 rounded-lg border border-clinic-line bg-clinic-surface p-3">
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <Message>{error}</Message>}
      <Input label="Nombre completo" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} required />
      <Input label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" required />
      <Input label="Teléfono" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
      <Input label="Contraseña temporal opcional" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
      <Select label="Rol" value={form.role} onChange={(value) => setForm({ ...form, role: value as typeof form.role })} options={["clinic_admin", "receptionist", "professional"]} />
      <Button disabled={saving} type="submit" variant="primary">{saving ? "Creando..." : "Agregar usuario"}</Button>
    </form>
  );
}

function ClinicTable({ clinics }: { clinics: SuperadminClinic[] }) {
  return (
    <Card title="Clínicas">
      {clinics.length === 0 ? <p className="text-sm text-clinic-muted">Sin clínicas para mostrar.</p> : (
        <div className="divide-y divide-clinic-line">
          {clinics.map((clinic) => (
            <article key={clinic.id} className="grid gap-3 py-4 lg:grid-cols-[1.2fr_120px_140px_90px_90px_90px] lg:items-center">
              <div>
                <p className="font-semibold text-clinic-ink">{clinic.name}</p>
                <p className="text-sm text-clinic-muted">{clinic.slug} · {clinic.email ?? "sin email"}</p>
              </div>
              <span className="text-sm">{filterLabel(clinic.status ?? "active")}</span>
              <span className="text-sm">{currentPlanName(clinic)}</span>
              <span className="text-sm">{clinic.counts?.users ?? 0} usuarios</span>
              <span className="text-sm">{clinic.counts?.appointments ?? 0} turnos</span>
              <Link className="text-sm font-semibold text-clinic-brand" to={`/superadmin/clinicas/${clinic.id}`}>Ver</Link>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function SuperadminShell({ title, description, action, children }: { title: string; description: string; action?: JSX.Element; children: React.ReactNode }) {
  const { role } = useAuth();
  const navigate = useNavigate();
  if (role !== "platform_admin") return <Navigate to="/admin" replace />;
  return (
    <main className="min-h-screen bg-clinic-surface px-4 py-6">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 rounded-lg border border-clinic-line bg-white p-5 shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-clinic-brand">Medin SaaS</p>
            <h1 className="mt-1 text-2xl font-semibold text-clinic-ink">{title}</h1>
            <p className="mt-1 text-sm text-clinic-muted">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/admin")}>Ir al admin</Button>
            <Button onClick={() => navigate("/superadmin/clinicas")} variant="primary">Clínicas</Button>
            {action}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm"><h2 className="font-semibold text-clinic-ink">{title}</h2><div className="mt-4">{children}</div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm"><p className="text-sm text-clinic-muted">{label}</p><p className="mt-1 text-xl font-semibold text-clinic-ink">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-clinic-surface px-3 py-2"><p className="text-xs text-clinic-muted">{label}</p><p className="font-medium text-clinic-ink">{value}</p></div>;
}

function Input({ label, value, onChange, required, disabled, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean; type?: string }) {
  return <label><span className="text-sm font-medium">{label}</span><input type={type} required={required} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label><span className="text-sm font-medium">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm">{options.map((option) => <option key={option} value={option}>{filterLabel(option)}</option>)}</select></label>;
}

function LinkButton({ to, children, variant = "secondary" }: { to: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return <Link to={to} className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${variant === "primary" ? "bg-clinic-brand text-white hover:bg-[#0b655e]" : "border border-clinic-line bg-white text-clinic-ink hover:bg-[#e6f4f1]"}`}>{children}</Link>;
}

function Message({ children }: { children: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>;
}

function moduleLabel(value: string) {
  return value.replace(/_/g, " ");
}

function currentPlanName(clinic: SuperadminClinic) {
  const name = clinic.clinic_subscriptions?.[0]?.subscription_plans?.name ?? clinic.plan ?? "Sin plan";
  return name === "basico" ? "Start" : name;
}

function filterLabel(value: string) {
  const labels: Record<string, string> = {
    all: "Todas",
    active: "Activa",
    trial: "Trial",
    inactive: "Inactiva",
    suspended: "Suspendida",
    cancelled: "Cancelada",
    clinic_admin: "Admin clínica",
    receptionist: "Recepción",
    professional: "Profesional"
  };
  return labels[value] ?? value;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value || 0));
}
