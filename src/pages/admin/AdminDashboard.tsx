import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarCheck2,
  CalendarDays,
  Clock3,
  Percent,
  RefreshCw,
  UsersRound,
  WalletCards
} from "lucide-react";
import { AppointmentStatusBadge } from "../../components/admin/AppointmentStatusBadge";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DateRangeFilter } from "../../components/admin/DateRangeFilter";
import { Button } from "../../components/ui/Button";
import {
  getAppointments,
  getDefaultClinic,
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
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("today"));

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) {
        setError("No encontramos la clinica configurada.");
        return;
      }
      const [loadedAppointments, loadedPatients, professionalResult, serviceResult] = await Promise.all([
        getAppointments(loadedClinic.id, { dateFrom: range.dateFrom, dateTo: range.dateTo, timezone: loadedClinic.timezone ?? undefined }),
        getPatients(loadedClinic.id),
        getProfessionals(loadedClinic.id),
        getServices(loadedClinic.id)
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
    loadDashboard();
  }, [range.dateFrom, range.dateTo]);

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
  const newPatients = patients.filter((patient) => isDateInRange(patient.created_at, range, clinic?.timezone ?? undefined)).length;
  const onlineRequests = appointments.filter((item) => item.source === "online" && item.status === "pending").length;
  const professionalsWithoutSchedule = professionals.filter((professional) => professional.active && !professional.availability_rules?.length).length;
  const appointmentsByDate = appointments.reduce<Record<string, AppointmentWithRelations[]>>((groups, appointment) => {
    const date = appointment.starts_at ? getDateInTimeZone(new Date(appointment.starts_at), clinic?.timezone ?? undefined) : "sin-fecha";
    (groups[date] ??= []).push(appointment);
    return groups;
  }, {});
  const isToday = range.preset === "today";

  return (
    <AdminLayout onCreateAppointment={() => navigate("/admin/agenda")} onRefresh={loadDashboard}>
      <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-clinic-ink">{isToday ? "Resumen de hoy" : "Resumen del período"}</h1>
            <p className="mt-2 max-w-2xl text-clinic-muted">
              Agenda, confirmaciones y tareas de recepción para {clinic?.name ?? "Medin"} · {range.label}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<RefreshCw size={16} />} onClick={loadDashboard} variant="secondary">Actualizar</Button>
          </div>
        </section>

        {error && <Message>{error}</Message>}

        <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="today" onChange={setRange} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title={isToday ? "Turnos hoy" : "Turnos del período"} value={String(summary.total)} helper={overbookings ? `Incluye ${overbookings} sobreturno${overbookings === 1 ? "" : "s"}` : "Actividad programada"} icon={<Clock3 size={19} />} />
          <Metric title="Pendientes" value={String(summary.pending)} helper="Para confirmar" icon={<CalendarDays size={19} />} tone="warning" />
          <Metric title="Próximo turno" value={summary.nextAppointment ? formatTime(summary.nextAppointment.starts_at, clinic?.timezone ?? undefined) : "--"} helper={summary.nextAppointment?.patient ? `${summary.nextAppointment.patient.first_name} ${summary.nextAppointment.patient.last_name}` : "Sin próximos turnos"} icon={<CalendarCheck2 size={19} />} />
          <Metric title="Ocupación" value={`${summary.occupancy}%`} helper="Capacidad estimada" icon={<Percent size={19} />} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <Panel title={isToday ? "Agenda de hoy" : "Agenda del período"} action={<LinkButton to={`/admin/agenda?preset=${range.preset}${range.preset === "custom" ? `&from=${range.dateFrom}&to=${range.dateTo}` : ""}`}>Ver agenda completa</LinkButton>}>
            {loading ? (
              <EmptyLine>Cargando agenda...</EmptyLine>
            ) : appointments.length === 0 ? (
              <EmptyLine>No hay turnos programados para este período. Cuando se carguen reservas, vas a verlas acá.</EmptyLine>
            ) : (
              <div className="divide-y divide-clinic-line">
                {Object.entries(appointmentsByDate).slice(0, 7).map(([date, dailyAppointments]) => (
                  <div key={date} className="py-3 first:pt-0">
                    {!isToday && <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-clinic-muted">{formatDayHeading(date, clinic?.timezone ?? undefined)}</p>}
                    {dailyAppointments.slice(0, 6).map((appointment) => (
                      <article key={appointment.id} className="grid gap-3 border-t border-clinic-line py-3 first:border-t-0 md:grid-cols-[80px_1fr_1fr_130px] md:items-center">
                        <p className="font-semibold text-clinic-brand">{formatTime(appointment.starts_at, clinic?.timezone ?? undefined)}</p>
                        <div><p className="font-semibold text-clinic-ink">{appointment.patient ? `${appointment.patient.first_name} ${appointment.patient.last_name}` : "Paciente sin vincular"}</p><p className="text-sm text-clinic-muted">{sourceLabel(appointment.source)}</p></div>
                        <div><p className="text-sm font-medium text-clinic-ink">Dr/a. {appointment.professional?.name ?? ""} {appointment.professional?.last_name ?? ""}</p><p className="text-sm text-clinic-muted">{appointment.service?.name ?? appointment.reason}</p></div>
                        <AppointmentStatusBadge status={appointment.status} />
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Próximas acciones">
            <ActionItem count={summary.pending} label="Confirmar turnos pendientes" to="/admin/agenda" />
            <ActionItem count={onlineRequests} label="Revisar solicitudes online" to="/admin/agenda" />
            <ActionItem count={professionalsWithoutSchedule} label="Completar disponibilidad" to="/admin/disponibilidad" />
            <ActionItem count={1} label="Compartir link de reservas" to="/admin/booking" />
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Indicadores simples">
            <div className="grid gap-3 sm:grid-cols-3">
              <SmallMetric label="Pacientes nuevos del período" value={String(newPatients)} />
              <SmallMetric label="Turnos por fuente" value={sourceBreakdown(appointments)} />
              <SmallMetric label="Ausentismo del período" value={appointments.length ? String(periodNoShow) : "Sin datos"} />
            </div>
            {appointments.length < 3 && (
              <p className="mt-4 rounded-lg bg-clinic-surface px-3 py-2 text-sm text-clinic-muted">
                Los indicadores se completaran cuando tengas mas turnos cargados.
              </p>
            )}
          </Panel>

          <Panel title="Accesos rapidos">
            <div className="grid gap-3 sm:grid-cols-3">
              <QuickLink icon={<UsersRound size={18} />} label="Profesionales" to="/admin/profesionales" />
              <QuickLink icon={<WalletCards size={18} />} label="Servicios" to="/admin/servicios" />
              <QuickLink icon={<CalendarDays size={18} />} label="Disponibilidad" to="/admin/disponibilidad" />
            </div>
          </Panel>
        </section>
      </main>
    </AdminLayout>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-[0_8px_24px_rgba(13,54,66,0.035)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-clinic-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ title, value, helper, icon, tone = "default" }: { title: string; value: string; helper: string; icon: React.ReactNode; tone?: "default" | "success" | "warning" | "danger" }) {
  const colors = {
    default: "bg-teal-50 text-clinic-brand",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700"
  };
  return (
    <article className="rounded-lg border border-clinic-line bg-white p-5 shadow-[0_8px_24px_rgba(13,54,66,0.035)]">
      <div className={`grid h-10 w-10 place-items-center rounded-full ${colors[tone]}`}>{icon}</div>
      <p className="mt-3 text-sm text-clinic-muted">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-clinic-ink">{value}</p>
      <p className="mt-1 text-xs text-clinic-muted">{helper}</p>
    </article>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinic-line p-4">
      <p className="text-sm text-clinic-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-clinic-ink">{value}</p>
    </div>
  );
}

function ActionItem({ count, label, to }: { count: number; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-lg border border-clinic-line px-4 py-3 transition hover:bg-[#e6f4f1]">
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-clinic-brand">{count}</span>
    </Link>
  );
}

function QuickLink({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Link to={to} className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-lg border border-clinic-line px-3 py-4 text-center text-sm font-semibold text-clinic-ink transition hover:bg-[#e6f4f1]">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e6f4f1] text-clinic-brand">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function LinkButton({ to, children, className = "" }: { to: string; children: React.ReactNode; className?: string }) {
  return <Link to={to} className={`inline-flex min-h-10 items-center rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface ${className}`}>{children}</Link>;
}

function EmptyLine({ children }: { children: string }) {
  return <div className="rounded-lg bg-clinic-surface px-4 py-8 text-center text-sm text-clinic-muted">{children}</div>;
}

function Message({ children }: { children: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>;
}

function formatTime(value: string, timezone = "America/Argentina/Mendoza") {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function formatDayHeading(value: string, timezone = "America/Argentina/Mendoza") {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short", timeZone: timezone }).format(new Date(`${value}T12:00:00Z`));
}

function getDateInTimeZone(date: Date, timezone = "America/Argentina/Mendoza") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function sourceLabel(value: string) {
  const labels: Record<string, string> = { manual: "Manual", online: "Online", whatsapp: "WhatsApp", imported: "Importado" };
  return labels[value] ?? value;
}

function sourceBreakdown(appointments: AppointmentWithRelations[]) {
  if (!appointments.length) return "Sin datos";
  const manual = appointments.filter((item) => item.source === "manual").length;
  const online = appointments.filter((item) => item.source === "online").length;
  const whatsapp = appointments.filter((item) => item.source === "whatsapp").length;
  return `${manual} manual / ${online} online / ${whatsapp} WhatsApp`;
}
