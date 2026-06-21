import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Building2, CheckCircle2, ClipboardList, Settings, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { ALL_MODULES, ClinicFormPayload, SuperadminClinic, createClinic, getClinicDetail, getOnboardingProgress, getSuperadminOverview, setClinicModule, updateClinic } from "../../lib/superadmin-data";

const defaultForm: ClinicFormPayload = {
  name: "",
  legal_name: "",
  cuit: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  slug: "",
  timezone: "America/Argentina/Mendoza",
  status: "trial",
  plan: "pro",
  active: true,
  modules: ["agenda", "pacientes", "profesionales", "servicios", "disponibilidad", "reservas_online", "pagos"]
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
    <SuperadminShell title="Superadmin" description="Vista global SaaS de clínicas, actividad y módulos.">
      {error && <Message>{error}</Message>}
      <div className="mb-5 flex flex-wrap gap-2"><Link to="/superadmin/planes" className="rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink">Planes</Link><Link to="/superadmin/suscripciones" className="rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink">Suscripciones</Link></div>
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
  const [formOpen, setFormOpen] = useState(false);
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
        {["all", "active", "trial", "suspended", "cancelled"].map((item) => (
          <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === item ? "bg-clinic-brand text-white" : "border border-clinic-line bg-white text-clinic-muted"}`}>
            {item === "all" ? "Todas" : item}
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
  const [error, setError] = useState("");

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
    <SuperadminShell title={clinic.name} description="Detalle SaaS, módulos, actividad y onboarding asistido.">
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
              <Info label="Plan" value={clinic.plan ?? clinic.clinic_subscriptions?.[0]?.subscription_plans?.name ?? "Sin plan"} />
              <Info label="Email" value={clinic.email ?? "Sin email"} />
              <Info label="Teléfono" value={clinic.phone ?? "Sin teléfono"} />
              <Info label="Timezone" value={clinic.timezone ?? "America/Argentina/Mendoza"} />
              <Button onClick={() => setEditing(true)}>Editar clínica</Button>
            </div>
          )}
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
          <Link className="mt-4 inline-flex text-sm font-semibold text-clinic-brand" to="/admin/onboarding">Ver onboarding</Link>
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
    plan: clinic.plan ?? "pro",
    active: clinic.active ?? true,
    modules: (clinic.clinic_modules ?? []).filter((item) => item.enabled).map((item) => item.module_key)
  } : defaultForm);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        <Input label="Nombre comercial" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Input label="Razón social" value={form.legal_name ?? ""} onChange={(value) => setForm({ ...form, legal_name: value })} />
        <Input label="CUIT" value={form.cuit ?? ""} onChange={(value) => setForm({ ...form, cuit: value })} />
        <Input label="Slug" value={form.slug} onChange={(value) => setForm({ ...form, slug: value })} required disabled={Boolean(clinic)} />
        <Input label="Email" value={form.email ?? ""} onChange={(value) => setForm({ ...form, email: value })} />
        <Input label="Teléfono" value={form.phone ?? ""} onChange={(value) => setForm({ ...form, phone: value })} />
        <Input label="WhatsApp" value={form.whatsapp ?? ""} onChange={(value) => setForm({ ...form, whatsapp: value })} />
        <Input label="Dirección" value={form.address ?? ""} onChange={(value) => setForm({ ...form, address: value })} />
        <Input label="Timezone" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} />
        <Select label="Estado" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={["trial", "active", "suspended", "cancelled"]} />
      </div>
      {!clinic && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_MODULES.map((moduleKey) => (
            <label key={moduleKey} className="flex items-center gap-2 text-sm">
              <input checked={form.modules.includes(moduleKey)} onChange={(event) => setForm({ ...form, modules: event.target.checked ? [...form.modules, moduleKey] : form.modules.filter((item) => item !== moduleKey) })} type="checkbox" />
              {moduleLabel(moduleKey)}
            </label>
          ))}
        </div>
      )}
      <div className="mt-4"><Button type="submit" variant="primary">Guardar</Button></div>
    </form>
  );
}

function ClinicTable({ clinics }: { clinics: SuperadminClinic[] }) {
  return (
    <Card title="Clínicas">
      {clinics.length === 0 ? <p className="text-sm text-clinic-muted">Sin clínicas para mostrar.</p> : (
        <div className="divide-y divide-clinic-line">
          {clinics.map((clinic) => (
            <article key={clinic.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_130px_120px_90px_90px_90px] lg:items-center">
              <div>
                <p className="font-semibold text-clinic-ink">{clinic.name}</p>
                <p className="text-sm text-clinic-muted">{clinic.slug} · {clinic.email ?? "sin email"}</p>
              </div>
              <span className="text-sm">{clinic.status ?? "active"}</span>
              <span className="text-sm">{clinic.clinic_subscriptions?.[0]?.subscription_plans?.name ?? clinic.plan ?? "Sin plan"}</span>
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

function Input({ label, value, onChange, required, disabled }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean }) {
  return <label><span className="text-sm font-medium">{label}</span><input required={required} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label><span className="text-sm font-medium">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Message({ children }: { children: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>;
}

function moduleLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value || 0));
}
