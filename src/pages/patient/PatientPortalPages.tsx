import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  HeartPulse,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
  XCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { PatientPortalLayout } from "../../components/patient/PatientPortalLayout";
import { useAuth } from "../../contexts/AuthContext";
import {
  addFamilyMember,
  createPatientAppointmentRequest,
  getMyAppointments,
  getMyPatientLinks,
  MyAppointment,
  MyPatientLink,
  syncPatientUserLinks,
  updateMyPatientProfile
} from "../../lib/patient-portal-data";
import { isPatientPreviewActive } from "../../lib/patient-preview";
import { patientProfileMock } from "../../data/patientPortalMock";

const ACTIVE_STATUSES = ["pending", "confirmed", "rescheduled", "urgent"];
const PAST_STATUSES = ["completed", "cancelled", "no_show"];

function usePatientLinks() {
  const [links, setLinks] = useState<MyPatientLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        await syncPatientUserLinks();
        const result = await getMyPatientLinks();
        if (!cancelled) setLinks(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No pudimos cargar tus datos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { links, loading, error, refetch: () => setReloadToken((token) => token + 1) };
}

function useMyAppointments(patientIds: string[]) {
  const [appointments, setAppointments] = useState<MyAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const key = patientIds.join(",");

  useEffect(() => {
    if (!patientIds.length) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyAppointments(patientIds)
      .then((result) => {
        if (!cancelled) setAppointments(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { appointments, loading, refetch: () => getMyAppointments(patientIds).then(setAppointments).catch(() => undefined) };
}

export function PatientDashboardPage() {
  const { profile } = useAuth();
  const previewActive = isPatientPreviewActive();
  const displayName = previewActive ? patientProfileMock.firstName : firstName(profile?.full_name) ?? "Paciente";
  const { links, loading: linksLoading } = usePatientLinks();
  const patientIds = useMemo(() => links.map((link) => link.patient_id), [links]);
  const { appointments, loading: appointmentsLoading } = useMyAppointments(patientIds);

  const loading = linksLoading || appointmentsLoading;
  const nextAppointment = appointments
    .filter((appointment) => ACTIVE_STATUSES.includes(appointment.status) && appointment.starts_at && new Date(appointment.starts_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime())[0];
  const pendingPayments = appointments.filter(
    (appointment) => appointment.payment_required && appointment.payment_status !== "approved" && ACTIVE_STATUSES.includes(appointment.status)
  ).length;
  const patientLabel = (patientId: string) => labelForPatient(links, patientId);

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <section className="grid gap-4 rounded-2xl border border-clinic-line bg-white p-5 shadow-soft sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#54AAA0]">Mi Medin</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-clinic-ink">
              Hola, {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-clinic-muted">
              Revisá tus próximos turnos, reservá una nueva atención y mantené actualizados tus datos de contacto.
            </p>
          </div>
          <Link
            to="/paciente/turnos/nuevo"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-800"
          >
            <CalendarPlus size={18} />
            Reservar turno
          </Link>
        </section>

        {!loading && !links.length ? (
          <PortalCard>
            <EmptyState
              title="Todavía no encontramos tu ficha de paciente"
              description="Si ya fuiste atendido en una clínica que usa Medin, asegurate de haber usado el mismo email al registrarte. Si es tu primera vez, reservá un turno para crear tu ficha."
            />
          </PortalCard>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <PortalCard>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-clinic-muted">Próximo turno</p>
                  <h2 className="mt-1 text-xl font-semibold text-clinic-ink">
                    {loading ? "Cargando..." : nextAppointment ? nextAppointment.services?.name ?? nextAppointment.reason ?? "Consulta" : "Sin turnos próximos"}
                  </h2>
                </div>
                {nextAppointment && <StatusBadge status={nextAppointment.status} />}
              </div>

              {loading ? null : nextAppointment ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <AppointmentDetail icon={CalendarClock} label="Fecha y hora" value={formatDateTime(nextAppointment.starts_at)} />
                  <AppointmentDetail
                    icon={UserRound}
                    label="Profesional"
                    value={[nextAppointment.professionals?.name, nextAppointment.professionals?.last_name].filter(Boolean).join(" ") || "A confirmar"}
                  />
                  <AppointmentDetail icon={HeartPulse} label="Paciente" value={patientLabel(nextAppointment.patient_id)} />
                  <AppointmentDetail icon={FileText} label="Clínica" value={nextAppointment.clinics?.name ?? "Medin"} />
                </div>
              ) : (
                <EmptyState
                  title="Todavía no tenés turnos próximos"
                  description="Cuando reserves o la clínica confirme una atención, la vas a ver acá."
                  actionLabel="Reservar ahora"
                  actionTo="/paciente/turnos/nuevo"
                />
              )}
            </PortalCard>

            <div className="grid gap-4">
              <QuickAction to="/paciente/turnos" icon={CalendarCheck} label="Mis turnos" description="Próximos y anteriores" />
              <QuickAction to="/paciente/perfil" icon={Pencil} label="Mi perfil" description="Datos personales y cobertura" />
              <QuickAction to="/paciente/grupo-familiar" icon={UsersRound} label="Grupo familiar" description="Reservar para otra persona" />
              <QuickAction
                to="/paciente/turnos"
                icon={CreditCard}
                label="Pagos pendientes"
                description={pendingPayments > 0 ? `${pendingPayments} pendiente${pendingPayments > 1 ? "s" : ""}` : "Sin pagos pendientes"}
              />
            </div>
          </section>
        )}
      </div>
    </PatientPortalLayout>
  );
}

export function PatientAppointmentsPage() {
  const [notice, setNotice] = useState("");
  const { links } = usePatientLinks();
  const patientIds = useMemo(() => links.map((link) => link.patient_id), [links]);
  const { appointments, loading, refetch } = useMyAppointments(patientIds);

  const upcoming = appointments.filter((appointment) => ACTIVE_STATUSES.includes(appointment.status));
  const past = appointments.filter((appointment) => PAST_STATUSES.includes(appointment.status));

  async function requestChange(type: "cancellation" | "reschedule", appointment: MyAppointment) {
    const label = type === "cancellation" ? "cancelación" : "reprogramación";
    if (!window.confirm(`¿Pedir ${label} de este turno? La clínica tiene que aprobar el cambio.`)) return;
    try {
      await createPatientAppointmentRequest(appointment.id, type);
      setNotice(`Solicitud de ${label} enviada. La clínica debe aprobar el cambio antes de modificar el turno.`);
      await refetch();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : `No pudimos enviar la solicitud de ${label}.`);
    }
  }

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Turnos"
          title="Mis turnos"
          description="Consultá tus reservas y solicitá cambios sin exponer datos clínicos sensibles."
          action={<PrimaryLink to="/paciente/turnos/nuevo" label="Reservar turno" icon={CalendarPlus} />}
        />

        {notice && (
          <div className="rounded-lg border border-teal-200 bg-[#E6F4F1] px-4 py-3 text-sm font-medium text-teal-900">
            {notice}
          </div>
        )}

        {loading ? (
          <PortalCard>
            <p className="text-sm text-clinic-muted">Cargando turnos...</p>
          </PortalCard>
        ) : (
          <>
            <AppointmentSection title="Próximos turnos" appointments={upcoming} links={links} onAction={requestChange} />
            <AppointmentSection title="Turnos anteriores" appointments={past} links={links} onAction={requestChange} compact />
          </>
        )}
      </div>
    </PatientPortalLayout>
  );
}

export function PatientNewAppointmentPage() {
  const { links, loading } = usePatientLinks();
  const clinics = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; slug: string }>();
    links.forEach((link) => {
      if (link.clinics && !seen.has(link.clinics.id)) {
        seen.set(link.clinics.id, { id: link.clinics.id, name: link.clinics.name, slug: link.clinics.slug });
      }
    });
    return [...seen.values()];
  }, [links]);

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Nueva reserva"
          title="Reservar turno"
          description="Elegí la clínica para ver especialidades, profesionales y horarios disponibles."
        />

        <PortalCard>
          {loading ? (
            <p className="text-sm text-clinic-muted">Cargando...</p>
          ) : clinics.length ? (
            <div className="grid gap-3">
              {clinics.map((clinic) => (
                <a
                  key={clinic.id}
                  href={`/reservar/${clinic.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-clinic-line bg-clinic-surface px-4 py-4 transition hover:border-teal-200"
                >
                  <span className="font-semibold text-clinic-ink">{clinic.name}</span>
                  <span className="text-sm font-semibold text-clinic-brand">Reservar →</span>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Todavía no encontramos tu ficha de paciente"
              description="Necesitamos que ya hayas sido atendido en una clínica que usa Medin, con el mismo email de esta cuenta, para poder mostrarte dónde reservar."
            />
          )}
        </PortalCard>
      </div>
    </PatientPortalLayout>
  );
}

export function PatientProfilePage() {
  const { links, loading } = usePatientLinks();
  const selfLink = links.find((link) => link.relationship === "self") ?? links[0] ?? null;
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    document_number: "",
    birth_date: "",
    phone: "",
    email: "",
    insurance: ""
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selfLink?.patients) return;
    const patient = selfLink.patients;
    setForm({
      first_name: patient.first_name ?? "",
      last_name: patient.last_name ?? "",
      document_number: patient.document_number ?? "",
      birth_date: patient.birth_date ?? "",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      insurance: patient.insurance ?? ""
    });
  }, [selfLink?.patients]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selfLink) return;
    setSaving(true);
    setError("");
    try {
      await updateMyPatientProfile(selfLink.patient_id, {
        first_name: form.first_name,
        last_name: form.last_name,
        document_number: form.document_number || null,
        birth_date: form.birth_date || null,
        phone: form.phone,
        email: form.email || null,
        insurance: form.insurance || null
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Perfil"
          title="Mi perfil"
          description="Datos de contacto y cobertura preparados para admisión y reserva de turnos."
        />

        {loading ? (
          <PortalCard>
            <p className="text-sm text-clinic-muted">Cargando...</p>
          </PortalCard>
        ) : !selfLink ? (
          <PortalCard>
            <EmptyState
              title="Todavía no encontramos tu ficha de paciente"
              description="Cuando la clínica te registre con el mismo email de esta cuenta, tus datos van a aparecer acá."
            />
          </PortalCard>
        ) : (
          <form onSubmit={handleSubmit}>
            <PortalCard className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormInput label="Nombre" value={form.first_name} onChange={(value) => update("first_name", value)} required />
                <FormInput label="Apellido" value={form.last_name} onChange={(value) => update("last_name", value)} required />
                <FormInput label="DNI" value={form.document_number} onChange={(value) => update("document_number", value)} />
                <FormInput label="Fecha de nacimiento" type="date" value={form.birth_date} onChange={(value) => update("birth_date", value)} />
                <FormInput label="Teléfono" value={form.phone} onChange={(value) => update("phone", value)} required />
                <FormInput label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
                <FormInput label="Obra social" value={form.insurance} onChange={(value) => update("insurance", value)} />
              </div>

              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  <CheckCircle2 size={17} />
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
                {saved && <span className="text-sm font-medium text-emerald-700">Cambios guardados.</span>}
              </div>
            </PortalCard>
          </form>
        )}
      </div>
    </PatientPortalLayout>
  );
}

export function PatientFamilyPage() {
  const { links, loading, refetch } = usePatientLinks();
  const [form, setForm] = useState({ firstName: "", lastName: "", documentNumber: "", relationship: "", birthDate: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  const familyMembers = links.filter((link) => link.relationship === "family_member" && link.patients);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await addFamilyMember(form);
      setForm({ firstName: "", lastName: "", documentNumber: "", relationship: "", birthDate: "" });
      setSaved("Familiar agregado. Ya queda disponible para reservar un turno.");
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos agregar el familiar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Grupo familiar"
          title="Personas asociadas"
          description="Reservá turnos para otra persona del grupo familiar sin mezclar datos clínicos."
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <PortalCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-clinic-ink">Familiares</h2>
              <span className="rounded-full bg-[#E6F4F1] px-3 py-1 text-xs font-semibold text-clinic-brand">
                {familyMembers.length} asociados
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {loading ? (
                <p className="text-sm text-clinic-muted">Cargando...</p>
              ) : familyMembers.length === 0 ? (
                <p className="text-sm text-clinic-muted">Todavía no agregaste familiares.</p>
              ) : (
                familyMembers.map((link) => (
                  <article key={link.id} className="rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-clinic-ink">
                          {link.patients?.first_name} {link.patients?.last_name}
                        </p>
                        <p className="mt-1 text-sm text-clinic-muted">
                          DNI {link.patients?.document_number ?? "Sin cargar"}
                          {link.patients?.birth_date ? ` · ${formatDateOnly(link.patients.birth_date)}` : ""}
                        </p>
                      </div>
                      <Link to="/paciente/turnos/nuevo" className="text-sm font-semibold text-clinic-brand">
                        Reservar turno
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </PortalCard>

          <form onSubmit={handleSubmit}>
            <PortalCard className="grid gap-4">
              <h2 className="text-lg font-semibold text-clinic-ink">Agregar familiar</h2>
              <FormInput label="Nombre" value={form.firstName} onChange={(value) => update("firstName", value)} required />
              <FormInput label="Apellido" value={form.lastName} onChange={(value) => update("lastName", value)} required />
              <FormInput label="DNI" value={form.documentNumber} onChange={(value) => update("documentNumber", value)} />
              <FormInput label="Vínculo" value={form.relationship} onChange={(value) => update("relationship", value)} placeholder="Hijo, madre, pareja..." required />
              <FormInput label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={(value) => update("birthDate", value)} required />
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                <Plus size={17} />
                {saving ? "Agregando..." : "Agregar"}
              </button>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {saved && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saved}</div>}
            </PortalCard>
          </form>
        </div>
      </div>
    </PatientPortalLayout>
  );
}

function AppointmentSection({
  title,
  appointments,
  links,
  onAction,
  compact = false
}: {
  title: string;
  appointments: MyAppointment[];
  links: MyPatientLink[];
  onAction: (type: "cancellation" | "reschedule", appointment: MyAppointment) => void;
  compact?: boolean;
}) {
  return (
    <PortalCard>
      <h2 className="text-lg font-semibold text-clinic-ink">{title}</h2>
      {appointments.length === 0 ? (
        <EmptyState title="No hay turnos para mostrar" description="Cuando exista actividad, se va a listar en esta sección." />
      ) : (
        <div className="mt-4 grid gap-3">
          {appointments.map((appointment) => (
            <article key={appointment.id} className="rounded-lg border border-clinic-line bg-white px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-clinic-ink">{appointment.services?.name ?? appointment.reason ?? "Consulta"}</h3>
                    <StatusBadge status={appointment.status} />
                  </div>
                  <p className="mt-1 text-sm text-clinic-muted">
                    {formatDateTime(appointment.starts_at)} ·{" "}
                    {[appointment.professionals?.name, appointment.professionals?.last_name].filter(Boolean).join(" ") || "A confirmar"}
                  </p>
                  <p className="mt-1 text-sm text-clinic-muted">
                    {labelForPatient(links, appointment.patient_id)} · {appointment.clinics?.name ?? "Medin"}
                  </p>
                </div>
                {!compact && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onAction("reschedule", appointment)}
                      className="rounded-lg border border-clinic-line px-3 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface"
                    >
                      Reprogramar
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction("cancellation", appointment)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </PortalCard>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#54AAA0]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-clinic-ink">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-clinic-muted">{description}</p>
      </div>
      {action}
    </section>
  );
}

function PortalCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-clinic-line bg-white p-5 shadow-soft sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  description
}: {
  to: string;
  icon: typeof CalendarCheck;
  label: string;
  description: string;
}) {
  return (
    <Link to={to} className="rounded-2xl border border-clinic-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-teal-200">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#E6F4F1] text-clinic-brand">
          <Icon size={19} />
        </span>
        <span>
          <span className="block font-semibold text-clinic-ink">{label}</span>
          <span className="mt-1 block text-sm text-clinic-muted">{description}</span>
        </span>
      </div>
    </Link>
  );
}

function AppointmentDetail({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-clinic-brand" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-clinic-muted">{label}</p>
        <p className="mt-1 text-sm font-semibold text-clinic-ink">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  actionTo
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-clinic-line bg-clinic-surface px-4 py-8 text-center">
      <Clock3 size={26} className="mx-auto text-clinic-brand" />
      <p className="mt-3 font-semibold text-clinic-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-clinic-muted">{description}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    confirmed: { label: "Confirmado", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    pending: { label: "Pendiente", className: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 },
    urgent: { label: "Urgente", className: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 },
    rescheduled: { label: "Reprogramado", className: "bg-amber-50 text-amber-700 border-amber-200", icon: RefreshCw },
    cancelled: { label: "Cancelado", className: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    no_show: { label: "No asistió", className: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    completed: { label: "Realizado", className: "bg-slate-100 text-slate-600 border-slate-200", icon: ShieldCheck }
  };
  const item = config[status] ?? { label: status, className: "bg-slate-100 text-slate-600 border-slate-200", icon: Clock3 };
  const Icon = item.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${item.className}`}>
      <Icon size={13} />
      {item.label}
    </span>
  );
}

function PrimaryLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof CalendarPlus }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-teal-800">
      <Icon size={17} />
      {label}
    </Link>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-clinic-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-2 h-12 w-full rounded-lg border border-clinic-line bg-white px-4 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return "A confirmar";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date(iso));
}

function formatDateOnly(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date(`${date}T00:00:00-03:00`));
}

function labelForPatient(links: MyPatientLink[], patientId: string) {
  const link = links.find((item) => item.patient_id === patientId);
  if (!link?.patients) return "Paciente";
  const name = `${link.patients.first_name} ${link.patients.last_name}`;
  return link.relationship === "self" ? `${name} · Titular` : `${name} · Familiar`;
}

function firstName(fullName?: string | null) {
  return fullName?.trim().split(/\s+/)[0] || null;
}
