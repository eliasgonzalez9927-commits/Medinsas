import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Percent,
  Settings2,
  SlidersHorizontal,
  Stethoscope,
  UsersRound,
  WalletCards
} from "lucide-react";
import { AppointmentStatusBadge } from "../../components/admin/AppointmentStatusBadge";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DateRangeFilter } from "../../components/admin/DateRangeFilter";
import { NoActiveClinicState } from "../../components/admin/NoActiveClinicState";
import { Button } from "../../components/ui/Button";
import { useActiveClinic } from "../../contexts/ActiveClinicContext";
import {
  getAppointments,
  getPatients,
  getProfessionals,
  getServices
} from "../../lib/clinic-data";
import { DateRangeValue, isDateInRange, resolveDateRange } from "../../lib/date-range";
import {
  AppointmentWithRelations,
  Clinic,
  PatientWithAppointments,
  ProfessionalWithRelations,
  ServiceWithRelations
} from "../../types/clinic";

const DAILY_CAPACITY = 24;

export function AdminDashboard() {
  const navigate = useNavigate();
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("today"));

  async function loadDashboard() {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      const [loadedAppointments, loadedPatients, professionalResult, serviceResult] = await Promise.all([
        getAppointments(clinic.id, { dateFrom: range.dateFrom, dateTo: range.dateTo, timezone: clinic.timezone ?? undefined }),
        getPatients(clinic.id),
        getProfessionals(clinic.id),
        getServices(clinic.id)
      ]);
      setAppointments(loadedAppointments);
      setPatients(loadedPatients);
      setProfessionals(professionalResult.data);
      setServices(serviceResult.data);
    } catch (err) {
      console.error("Failed to load dashboard", err);
      setError(err instanceof Error ? err.message : "No pudimos cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (clinic) loadDashboard();
  }, [clinic?.id, range.dateFrom, range.dateTo]);

  const timezone = clinic?.timezone ?? "America/Argentina/Mendoza";
  const isToday = range.preset === "today";

  const summary = useMemo(() => {
    const pending = appointments.filter((item) => item.status === "pending").length;
    const nextAppointment = appointments
      .filter((item) => new Date(item.starts_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
    return {
      total: appointments.length,
      pending,
      nextAppointment,
      occupancy: Math.min(100, Math.round((appointments.length / DAILY_CAPACITY) * 100))
    };
  }, [appointments]);

  const periodNoShow = appointments.filter((item) => item.status === "no_show").length;
  const overbookings = appointments.filter((item) => item.is_overbooking).length;
  const newPatients = patients.filter((patient) => isDateInRange(patient.created_at, range, timezone)).length;
  const onlineRequests = appointments.filter((item) => item.source === "online" && item.status === "pending").length;
  const professionalsWithoutSchedule = professionals.filter((professional) => professional.active && !professional.availability_rules?.length).length;
  const activePublicLinks = services.some((service) => service.public_booking_enabled) ? 1 : 0;
  const agendaLink = `/admin/agenda?preset=${range.preset}${range.preset === "custom" ? `&from=${range.dateFrom}&to=${range.dateTo}` : ""}`;

  const nextAppointmentHelper = summary.nextAppointment
    ? getNextAppointmentHelper(summary.nextAppointment.starts_at, timezone)
    : "Sin próximos turnos";

  return (
    <AdminLayout onCreateAppointment={() => navigate("/admin/agenda")} onRefresh={loadDashboard}>
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5E9F98]">Panel operativo</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#0D3642] sm:text-4xl">Resumen de hoy</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-clinic-muted">
              Agenda, confirmaciones y tareas de recepción para {clinic?.name ?? "Medin"}.
            </p>
          </div>
          <DateRangeFilter
            timezone={timezone}
            defaultPreset="today"
            onChange={setRange}
            variant="segmented"
            presets={["today", "this_week", "this_month", "custom"]}
          />
        </section>

        {error && <Message>{error}</Message>}
        {!clinic && !clinicLoading && <NoActiveClinicState />}

        {clinic && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            title={isToday ? "Turnos hoy" : "Turnos del período"}
            value={String(summary.total)}
            helper={overbookings ? `Actividad programada · ${overbookings} sobreturno${overbookings === 1 ? "" : "s"}` : "Actividad programada"}
            icon={<Clock3 size={20} />}
          />
          <Metric title="Pendientes" value={String(summary.pending)} helper="Para confirmar" icon={<ClipboardCheck size={20} />} />
          <Metric
            title="Próximo turno"
            value={summary.nextAppointment ? formatTime(summary.nextAppointment.starts_at, timezone) : "--"}
            helper={nextAppointmentHelper}
            icon={<CalendarCheck2 size={20} />}
          />
          <Metric title="Ocupación" value={`${summary.occupancy}%`} helper="Capacidad estimada" icon={<Percent size={20} />} progress={summary.occupancy} />
        </section>}

        {clinic && <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
          <Panel title="Agenda de hoy" action={<LinkButton to={agendaLink}>Ver agenda completa <ChevronRight size={16} /></LinkButton>}>
            {loading ? (
              <EmptyLine>Cargando agenda...</EmptyLine>
            ) : appointments.length === 0 ? (
              <AgendaEmptyState onCreate={() => navigate("/admin/agenda")} onAvailability={() => navigate("/admin/disponibilidad")} />
            ) : (
              <div className="divide-y divide-clinic-line">
                {appointments.slice(0, 7).map((appointment) => (
                  <article key={appointment.id} className="grid gap-3 py-4 first:pt-0 md:grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <p className="whitespace-nowrap text-lg font-semibold tabular-nums text-[#0D766E]">{formatTime(appointment.starts_at, timezone)}</p>
                      <p className="text-xs text-clinic-muted">{durationLabel(appointment)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-clinic-ink">{appointment.patient ? `${appointment.patient.first_name} ${appointment.patient.last_name}` : "Paciente sin vincular"}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {appointment.public_code && <SoftBadge>{appointment.public_code}</SoftBadge>}
                        {appointment.is_overbooking && <SoftBadge tone="warning">Sobreturno</SoftBadge>}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-clinic-ink">{appointment.service?.name ?? appointment.reason}</p>
                      <p className="mt-0.5 truncate text-sm text-clinic-muted">Dr/a. {appointment.professional?.name ?? ""} {appointment.professional?.last_name ?? ""}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-self-start md:justify-self-end">
                      {appointment.payment_status && <SoftBadge>{paymentStatusLabel(appointment.payment_status)}</SoftBadge>}
                      <AppointmentStatusBadge status={appointment.status} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Próximas acciones">
            <div className="space-y-3">
              <ActionItem icon={<SlidersHorizontal size={18} />} count={professionalsWithoutSchedule} label="Completar disponibilidad médica" description="Definí días y horarios disponibles por profesional." to="/admin/disponibilidad" />
              <ActionItem icon={<ClipboardCheck size={18} />} count={onlineRequests} label="Revisar solicitudes online" description="Gestioná las solicitudes recibidas desde reservas online." to="/admin/solicitudes" />
              <ActionItem icon={<CalendarDays size={18} />} count={summary.pending} label="Confirmar turnos pendientes" description="Validá los turnos que requieren confirmación." to="/admin/agenda" />
              <ActionItem icon={<ExternalLink size={18} />} count={activePublicLinks} label="Compartir link de reservas" description="Activá la agenda online con pacientes." to="/admin/booking" />
            </div>
          </Panel>
        </section>}

        {clinic && <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Indicadores simples">
            <div className="grid gap-3 sm:grid-cols-3">
              <SmallMetric icon={<UsersRound size={18} />} label="Pacientes nuevos del período" value={String(newPatients)} />
              <SmallMetric icon={<CalendarDays size={18} />} label="Turnos por fuente" value={sourceBreakdown(appointments)} />
              <SmallMetric icon={<Clock3 size={18} />} label="Ausentismo del período" value={appointments.length ? `${Math.round((periodNoShow / appointments.length) * 100)}%` : "Sin datos"} />
            </div>
            <p className="mt-4 rounded-2xl border border-[#cfe9e4] bg-[#f6faf9] px-4 py-3 text-sm text-clinic-muted">
              Los indicadores se completarán cuando tengas más turnos cargados.
            </p>
          </Panel>

          <Panel title="Accesos rápidos">
            <div className="grid gap-3 sm:grid-cols-3">
              <QuickLink icon={<Stethoscope size={20} />} label="Profesionales" description="Gestioná tu equipo médico" to="/admin/profesionales" />
              <QuickLink icon={<WalletCards size={20} />} label="Servicios" description="Administrá el catálogo de servicios" to="/admin/servicios" />
              <QuickLink icon={<Settings2 size={20} />} label="Disponibilidad" description="Definí horarios y días hábiles" to="/admin/disponibilidad" />
            </div>
          </Panel>
        </section>}
      </main>
    </AdminLayout>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border border-clinic-line bg-white p-5 shadow-[0_12px_32px_rgba(13,54,66,0.04)] sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#0D3642]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ title, value, helper, icon, progress }: { title: string; value: string; helper: string; icon: React.ReactNode; progress?: number }) {
  return (
    <article className="rounded-[18px] border border-clinic-line bg-white p-5 shadow-[0_12px_32px_rgba(13,54,66,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-clinic-muted">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[#0D3642]">{value}</p>
          <p className="mt-1 text-sm text-clinic-muted">{helper}</p>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#E6F4F1] text-[#0D766E]">{icon}</div>
      </div>
      {typeof progress === "number" && (
        <div className="mt-4 h-2 rounded-full bg-[#edf5f3]">
          <div className="h-full rounded-full bg-[#8FD2C6]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </article>
  );
}

function AgendaEmptyState({ onCreate, onAvailability }: { onCreate: () => void; onAvailability: () => void }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#cfe1de] bg-[#fbfdfc] px-6 py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#E6F4F1] text-[#0D766E]"><CalendarDays size={22} /></div>
      <h3 className="mt-4 text-lg font-semibold text-[#0D3642]">Aún no tienes turnos programados para hoy.</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-clinic-muted">Crea un turno o completa la disponibilidad para comenzar.</p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Button onClick={onCreate} variant="primary">Crear turno</Button>
        <Button onClick={onAvailability}>Completar disponibilidad</Button>
      </div>
    </div>
  );
}

function SmallMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-[#fbfdfc] p-4">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-[#E6F4F1] text-[#0D766E]">{icon}</div>
      <p className="mt-3 text-sm text-clinic-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#0D3642]">{value}</p>
    </div>
  );
}

function ActionItem({ icon, count, label, description, to }: { icon: React.ReactNode; count: number; label: string; description: string; to: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-2xl border border-clinic-line bg-[#fbfdfc] px-4 py-3.5 transition hover:border-[#8FD2C6] hover:bg-[#F6FAF9]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E6F4F1] text-[#0D766E]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#0D3642]">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-clinic-muted">{description}</span>
      </span>
      <span className="rounded-full bg-[#E6F4F1] px-2.5 py-1 text-xs font-semibold text-[#0D766E]">{count}</span>
      <ChevronRight size={17} className="text-clinic-muted transition group-hover:translate-x-0.5 group-hover:text-[#0D766E]" />
    </Link>
  );
}

function QuickLink({ icon, label, description, to }: { icon: React.ReactNode; label: string; description: string; to: string }) {
  return (
    <Link to={to} className="group flex min-h-32 flex-col justify-between rounded-2xl border border-clinic-line bg-[#fbfdfc] p-4 text-left transition hover:border-[#8FD2C6] hover:bg-[#F6FAF9]">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#E6F4F1] text-[#0D766E]">{icon}</span>
      <span>
        <span className="block font-semibold text-[#0D3642]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-clinic-muted">{description}</span>
      </span>
    </Link>
  );
}

function LinkButton({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink transition hover:bg-[#e6f4f1]">{children}</Link>;
}

function EmptyLine({ children }: { children: string }) {
  return <div className="rounded-xl border border-dashed border-clinic-line bg-[#fbfdfc] px-5 py-10 text-center text-sm leading-6 text-clinic-muted">{children}</div>;
}

function Message({ children }: { children: string }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>;
}

function SoftBadge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warning" }) {
  const classes = tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-[#E6F4F1] text-[#0D766E]";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

function formatTime(value: string, timezone = "America/Argentina/Mendoza") {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function durationLabel(appointment: AppointmentWithRelations) {
  if (!appointment.end_time) return "Turno";
  const minutes = Math.max(0, Math.round((new Date(appointment.end_time).getTime() - new Date(appointment.starts_at).getTime()) / 60000));
  return minutes ? `${minutes} min` : "Turno";
}

function getNextAppointmentHelper(value: string, timezone = "America/Argentina/Mendoza") {
  const diffMinutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (diffMinutes >= 0 && diffMinutes < 60) return `En ${diffMinutes} min`;
  if (diffMinutes >= 60 && diffMinutes < 1440) return `En ${Math.round(diffMinutes / 60)} h`;
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function sourceBreakdown(appointments: AppointmentWithRelations[]) {
  if (!appointments.length) return "Sin datos";
  const manual = appointments.filter((item) => item.source === "manual").length;
  const online = appointments.filter((item) => item.source === "online").length;
  const whatsapp = appointments.filter((item) => item.source === "whatsapp").length;
  return `${manual} manual / ${online} online / ${whatsapp} WhatsApp`;
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    unpaid: "Sin pago",
    not_required: "Sin pago online",
    deposit_pending: "Seña pendiente",
    deposit_paid: "Seña pagada",
    paid: "Pagado",
    rejected: "Rechazado",
    refunded: "Reembolsado"
  };
  return labels[status] ?? status;
}
