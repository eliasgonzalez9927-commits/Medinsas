import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  ArrowRight,
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
  FamilyMemberMock,
  PatientAppointment,
  PatientAppointmentStatus,
  familyMembersMock,
  patientAppointmentsMock,
  patientProfileMock,
  patientSpecialtiesMock
} from "../../data/patientPortalMock";

export function PatientDashboardPage() {
  const { profile } = useAuth();
  const nextAppointment = patientAppointmentsMock
    .filter((appointment) => ["confirmed", "pending"].includes(appointment.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  const pendingPayments = patientAppointmentsMock.filter((appointment) => appointment.paymentStatus === "pending").length;

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <section className="grid gap-4 rounded-2xl border border-clinic-line bg-white p-5 shadow-soft sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#54AAA0]">Mi Medin</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-clinic-ink">
              Hola, {firstName(profile?.full_name) ?? patientProfileMock.firstName}
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

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <PortalCard>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-clinic-muted">Próximo turno</p>
                <h2 className="mt-1 text-xl font-semibold text-clinic-ink">
                  {nextAppointment ? nextAppointment.specialty : "Sin turnos próximos"}
                </h2>
              </div>
              {nextAppointment && <StatusBadge status={nextAppointment.status} />}
            </div>

            {nextAppointment ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <AppointmentDetail icon={CalendarClock} label="Fecha y hora" value={formatDateTime(nextAppointment.startsAt)} />
                <AppointmentDetail icon={UserRound} label="Profesional" value={nextAppointment.professional} />
                <AppointmentDetail icon={HeartPulse} label="Paciente" value={`${nextAppointment.patientName} · ${nextAppointment.patientRelation}`} />
                <AppointmentDetail icon={FileText} label="Servicio" value={nextAppointment.service} />
                <div className="sm:col-span-2 rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3 text-sm text-clinic-muted">
                  {nextAppointment.notes ?? "La clínica puede actualizar indicaciones operativas antes del turno."}
                </div>
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
              description={pendingPayments > 0 ? `${pendingPayments} pendiente preparado` : "Sin pagos pendientes"}
            />
          </div>
        </section>
      </div>
    </PatientPortalLayout>
  );
}

export function PatientAppointmentsPage() {
  const [notice, setNotice] = useState("");
  const upcoming = patientAppointmentsMock.filter((appointment) => ["confirmed", "pending"].includes(appointment.status));
  const past = patientAppointmentsMock.filter((appointment) => ["completed", "cancelled"].includes(appointment.status));

  function mockAction(action: string, appointment: PatientAppointment) {
    setNotice(`${action} preparada para ${appointment.specialty}. La clínica deberá confirmar el cambio.`);
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

        <AppointmentSection title="Próximos turnos" appointments={upcoming} onAction={mockAction} />
        <AppointmentSection title="Turnos anteriores" appointments={past} onAction={mockAction} compact />
      </div>
    </PatientPortalLayout>
  );
}

export function PatientNewAppointmentPage() {
  const [specialtyId, setSpecialtyId] = useState(patientSpecialtiesMock[0]?.id ?? "");
  const selectedSpecialty = patientSpecialtiesMock.find((specialty) => specialty.id === specialtyId) ?? patientSpecialtiesMock[0];
  const [professionalId, setProfessionalId] = useState(selectedSpecialty?.professionals[0]?.id ?? "");
  const selectedProfessional =
    selectedSpecialty?.professionals.find((professional) => professional.id === professionalId) ??
    selectedSpecialty?.professionals[0];
  const [date, setDate] = useState("2026-07-10");
  const [time, setTime] = useState(selectedProfessional?.slots[0] ?? "");
  const [patientId, setPatientId] = useState("self");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const patientOptions = useMemo(
    () => [
      { id: "self", label: `${patientProfileMock.firstName} ${patientProfileMock.lastName} · Titular` },
      ...familyMembersMock.map((member) => ({
        id: member.id,
        label: `${member.firstName} ${member.lastName} · ${member.relationship}`
      }))
    ],
    []
  );

  function handleSpecialtyChange(nextSpecialtyId: string) {
    const nextSpecialty = patientSpecialtiesMock.find((specialty) => specialty.id === nextSpecialtyId);
    const nextProfessional = nextSpecialty?.professionals[0];
    setSpecialtyId(nextSpecialtyId);
    setProfessionalId(nextProfessional?.id ?? "");
    setTime(nextProfessional?.slots[0] ?? "");
    setConfirmed(false);
  }

  function handleProfessionalChange(nextProfessionalId: string) {
    const nextProfessional = selectedSpecialty?.professionals.find((professional) => professional.id === nextProfessionalId);
    setProfessionalId(nextProfessionalId);
    setTime(nextProfessional?.slots[0] ?? "");
    setConfirmed(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO: reemplazar este mock por una insercion segura en appointments con source = "patient_portal" cuando RLS paciente este validada.
    setConfirmed(true);
  }

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Nueva reserva"
          title="Reservar turno"
          description="Elegí especialidad, profesional y horario. Esta versión deja la creación preparada en modo mock."
        />

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <PortalCard className="grid gap-5">
            <FormSelect
              label="Especialidad"
              value={specialtyId}
              onChange={handleSpecialtyChange}
              options={patientSpecialtiesMock.map((specialty) => ({ value: specialty.id, label: specialty.name }))}
            />
            <FormSelect
              label="Profesional"
              value={professionalId}
              onChange={handleProfessionalChange}
              options={(selectedSpecialty?.professionals ?? []).map((professional) => ({
                value: professional.id,
                label: professional.name
              }))}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormInput label="Fecha" type="date" value={date} onChange={setDate} required />
              <FormSelect
                label="Horario disponible"
                value={time}
                onChange={setTime}
                options={(selectedProfessional?.slots ?? []).map((slot) => ({ value: slot, label: slot }))}
              />
            </div>
            <FormSelect label="Paciente" value={patientId} onChange={setPatientId} options={patientOptions.map((item) => ({ value: item.id, label: item.label }))} />
            <label className="block">
              <span className="text-sm font-semibold text-clinic-ink">Comentario para la clínica</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-clinic-line px-4 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="Motivo operativo del turno, preferencia o aclaración."
              />
            </label>
          </PortalCard>

          <PortalCard>
            <p className="text-sm font-semibold text-clinic-muted">Resumen</p>
            <div className="mt-4 grid gap-3 text-sm">
              <SummaryRow label="Especialidad" value={selectedSpecialty?.name ?? "A elegir"} />
              <SummaryRow label="Profesional" value={selectedProfessional?.name ?? "A confirmar"} />
              <SummaryRow label="Fecha" value={date ? formatDateOnly(date) : "A elegir"} />
              <SummaryRow label="Horario" value={time || "A elegir"} />
              <SummaryRow label="Paciente" value={patientOptions.find((item) => item.id === patientId)?.label ?? "Titular"} />
            </div>
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              La confirmación real dependerá de disponibilidad segura y reglas de la clínica. No se crea un turno real en esta versión.
            </div>
            <button
              type="submit"
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Confirmar solicitud
              <ArrowRight size={17} />
            </button>

            {confirmed && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Solicitud preparada. La clínica deberá confirmar disponibilidad antes de crear el turno real.
              </div>
            )}
          </PortalCard>
        </form>
      </div>
    </PatientPortalLayout>
  );
}

export function PatientProfilePage() {
  const [form, setForm] = useState(patientProfileMock);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Perfil"
          title="Mi perfil"
          description="Datos de contacto y cobertura preparados para admisión y reserva de turnos."
        />

        <form onSubmit={handleSubmit}>
          <PortalCard className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormInput label="Nombre" value={form.firstName} onChange={(value) => update("firstName", value)} required />
              <FormInput label="Apellido" value={form.lastName} onChange={(value) => update("lastName", value)} required />
              <FormInput label="DNI" value={form.documentNumber} onChange={(value) => update("documentNumber", value)} required />
              <FormInput label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={(value) => update("birthDate", value)} />
              <FormInput label="Teléfono" value={form.phone} onChange={(value) => update("phone", value)} />
              <FormInput label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
              <FormInput label="Obra social" value={form.insurance} onChange={(value) => update("insurance", value)} />
              <FormInput label="Plan" value={form.plan} onChange={(value) => update("plan", value)} />
              <FormInput label="Número de afiliado" value={form.memberNumber} onChange={(value) => update("memberNumber", value)} />
              <FormInput label="Contacto de emergencia" value={form.emergencyContact} onChange={(value) => update("emergencyContact", value)} />
            </div>

            <div className="rounded-lg border border-teal-200 bg-[#E6F4F1] px-4 py-3 text-sm leading-6 text-teal-900">
              Guardado mock: queda preparado para conectar a pacientes/perfiles cuando RLS permita edición por titular.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <CheckCircle2 size={17} />
                Guardar cambios
              </button>
              {saved && <span className="text-sm font-medium text-emerald-700">Cambios guardados en modo mock.</span>}
            </div>
          </PortalCard>
        </form>
      </div>
    </PatientPortalLayout>
  );
}

export function PatientFamilyPage() {
  const [members, setMembers] = useState<FamilyMemberMock[]>(familyMembersMock);
  const [form, setForm] = useState({ firstName: "", lastName: "", documentNumber: "", relationship: "", birthDate: "" });
  const [saved, setSaved] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMember = { ...form, id: `fam-${Date.now()}` };
    setMembers((current) => [nextMember, ...current]);
    setForm({ firstName: "", lastName: "", documentNumber: "", relationship: "", birthDate: "" });
    setSaved("Familiar agregado en modo mock. Ya queda disponible para el flujo de reserva.");
  }

  return (
    <PatientPortalLayout>
      <div className="grid gap-6">
        <PageHeader
          eyebrow="Grupo familiar"
          title="Personas asociadas"
          description="Preparado para reservar turnos para otra persona del grupo familiar sin mezclar datos clínicos."
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <PortalCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-clinic-ink">Familiares</h2>
              <span className="rounded-full bg-[#E6F4F1] px-3 py-1 text-xs font-semibold text-clinic-brand">
                {members.length} asociados
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {members.map((member) => (
                <article key={member.id} className="rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-clinic-ink">{member.firstName} {member.lastName}</p>
                      <p className="mt-1 text-sm text-clinic-muted">
                        {member.relationship} · DNI {member.documentNumber} · {formatDateOnly(member.birthDate)}
                      </p>
                    </div>
                    <Link to="/paciente/turnos/nuevo" className="text-sm font-semibold text-clinic-brand">
                      Reservar turno
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </PortalCard>

          <form onSubmit={handleSubmit}>
            <PortalCard className="grid gap-4">
              <h2 className="text-lg font-semibold text-clinic-ink">Agregar familiar</h2>
              <FormInput label="Nombre" value={form.firstName} onChange={(value) => update("firstName", value)} required />
              <FormInput label="Apellido" value={form.lastName} onChange={(value) => update("lastName", value)} required />
              <FormInput label="DNI" value={form.documentNumber} onChange={(value) => update("documentNumber", value)} required />
              <FormInput label="Vínculo" value={form.relationship} onChange={(value) => update("relationship", value)} placeholder="Hijo, madre, pareja..." required />
              <FormInput label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={(value) => update("birthDate", value)} required />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <Plus size={17} />
                Agregar
              </button>
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
  onAction,
  compact = false
}: {
  title: string;
  appointments: PatientAppointment[];
  onAction: (action: string, appointment: PatientAppointment) => void;
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
                    <h3 className="font-semibold text-clinic-ink">{appointment.specialty}</h3>
                    <StatusBadge status={appointment.status} />
                  </div>
                  <p className="mt-1 text-sm text-clinic-muted">
                    {formatDateTime(appointment.startsAt)} · {appointment.professional}
                  </p>
                  <p className="mt-1 text-sm text-clinic-muted">
                    {appointment.patientName} · {appointment.clinicName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onAction("Detalle de turno", appointment)} className="rounded-lg border border-clinic-line px-3 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface">
                    Ver detalle
                  </button>
                  {!compact && (
                    <>
                      <button type="button" onClick={() => onAction("Reprogramación", appointment)} className="rounded-lg border border-clinic-line px-3 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface">
                        Reprogramar
                      </button>
                      <button type="button" onClick={() => onAction("Cancelación", appointment)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
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

function StatusBadge({ status }: { status: PatientAppointmentStatus }) {
  const config: Record<PatientAppointmentStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    confirmed: { label: "Confirmado", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    pending: { label: "Pendiente", className: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 },
    cancelled: { label: "Cancelado", className: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    completed: { label: "Realizado", className: "bg-slate-100 text-slate-600 border-slate-200", icon: ShieldCheck }
  };
  const item = config[status];
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

function FormSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-clinic-ink">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-lg border border-clinic-line bg-white px-4 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-clinic-line pb-3 last:border-0 last:pb-0">
      <span className="text-clinic-muted">{label}</span>
      <span className="text-right font-semibold text-clinic-ink">{value}</span>
    </div>
  );
}

function formatDateTime(iso: string) {
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

function firstName(fullName?: string | null) {
  return fullName?.trim().split(/\s+/)[0] || null;
}
