import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banknote,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FilePenLine,
  Link2,
  MessageCircle,
  Percent,
  PlugZap,
  ReceiptText,
  RefreshCw,
  UserX,
  UsersRound,
  WalletCards
} from "lucide-react";
import { AppointmentStatusBadge } from "../../components/admin/AppointmentStatusBadge";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Button } from "../../components/ui/Button";
import {
  getAppointments,
  getDefaultClinic,
  getPatients,
  getProfessionals,
  getServices
} from "../../lib/clinic-data";
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
  const today = new Date().toISOString().slice(0, 10);

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
        getAppointments(loadedClinic.id, { date: today }),
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
  }, []);

  const summary = useMemo(() => {
    const pending = appointments.filter((item) => item.status === "pending").length;
    const confirmed = appointments.filter((item) => item.status === "confirmed").length;
    const cancelled = appointments.filter((item) => ["cancelled", "no_show"].includes(item.status)).length;
    const nextAppointment = appointments
      .filter((item) => new Date(item.starts_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
    return {
      total: appointments.length,
      pending,
      confirmed,
      cancelled,
      nextAppointment,
      occupancy: Math.min(100, Math.round((appointments.length / DAILY_CAPACITY) * 100))
    };
  }, [appointments]);

  const monthNoShow = appointments.filter((item) => item.status === "no_show").length;
  const onlineRequests = appointments.filter((item) => item.source === "online" && item.status === "pending").length;
  const professionalsWithoutSchedule = professionals.filter((professional) => professional.active && !professional.availability_rules?.length).length;
  const topService = mostRequestedService(appointments);

  return (
    <AdminLayout onCreateAppointment={() => navigate("/admin/agenda")} onRefresh={loadDashboard}>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-semibold text-clinic-brand">Panel operativo</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-clinic-ink">Resumen de hoy</h1>
            <p className="mt-2 max-w-2xl text-clinic-muted">
              Agenda, confirmaciones y tareas de recepcion para {clinic?.name ?? "Medin"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<RefreshCw size={16} />} onClick={loadDashboard}>Actualizar</Button>
            <Button icon={<CalendarClock size={16} />} onClick={() => navigate("/admin/agenda")} variant="primary">
              Nuevo turno
            </Button>
          </div>
        </section>

        {error && <Message>{error}</Message>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric title="Turnos hoy" value={String(summary.total)} helper="Actividad programada" icon={<Clock3 size={19} />} />
          <Metric title="Pendientes" value={String(summary.pending)} helper="Para confirmar" icon={<CalendarDays size={19} />} tone="warning" />
          <Metric title="Proximo turno" value={summary.nextAppointment ? formatTime(summary.nextAppointment.starts_at) : "--"} helper={summary.nextAppointment?.patient ? `${summary.nextAppointment.patient.first_name} ${summary.nextAppointment.patient.last_name}` : "Sin proximos turnos"} icon={<CalendarCheck2 size={19} />} />
          <Metric title="Confirmados" value={String(summary.confirmed)} helper="Pacientes listos" icon={<CheckCircle2 size={19} />} tone="success" />
          <Metric title="Cancelados / ausentes" value={String(summary.cancelled)} helper="Revisar seguimiento" icon={<UserX size={19} />} tone="danger" />
          <Metric title="Ocupacion" value={`${summary.occupancy}%`} helper="Capacidad estimada" icon={<Percent size={19} />} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Panel title="Agenda de hoy" action={<LinkButton to="/admin/agenda">Ver agenda completa</LinkButton>}>
            {loading ? (
              <EmptyLine>Cargando agenda...</EmptyLine>
            ) : appointments.length === 0 ? (
              <EmptyLine>No hay turnos cargados para hoy.</EmptyLine>
            ) : (
              <div className="divide-y divide-clinic-line">
                {appointments.slice(0, 6).map((appointment) => (
                  <article key={appointment.id} className="grid gap-3 py-4 md:grid-cols-[80px_1fr_1fr_130px] md:items-center">
                    <p className="font-semibold text-clinic-brand">{formatTime(appointment.starts_at)}</p>
                    <div>
                      <p className="font-semibold text-clinic-ink">
                        {appointment.patient ? `${appointment.patient.first_name} ${appointment.patient.last_name}` : "Paciente sin vincular"}
                      </p>
                      <p className="text-sm text-clinic-muted">{sourceLabel(appointment.source)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-clinic-ink">
                        Dr/a. {appointment.professional?.name ?? ""} {appointment.professional?.last_name ?? ""}
                      </p>
                      <p className="text-sm text-clinic-muted">{appointment.service?.name ?? appointment.reason}</p>
                    </div>
                    <AppointmentStatusBadge status={appointment.status} />
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Proximas acciones">
            <ActionItem count={summary.pending} label="Confirmar turnos pendientes" to="/admin/agenda" />
            <ActionItem count={onlineRequests} label="Revisar solicitudes online" to="/admin/agenda" />
            <ActionItem count={professionalsWithoutSchedule} label="Completar disponibilidad" to="/admin/disponibilidad" />
            <ActionItem count={1} label="Compartir link de reservas" to="/admin/booking" />
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="Indicadores simples">
            <div className="grid gap-3 sm:grid-cols-2">
              <SmallMetric label="Ausentismo del mes" value={appointments.length ? String(monthNoShow) : "Sin datos"} />
              <SmallMetric label="Pacientes nuevos" value={String(patients.length)} />
              <SmallMetric label="Servicio mas solicitado" value={topService ?? "Sin datos"} />
              <SmallMetric label="Turnos por fuente" value={sourceBreakdown(appointments)} />
            </div>
            {appointments.length < 3 && (
              <p className="mt-4 rounded-lg bg-clinic-surface px-3 py-2 text-sm text-clinic-muted">
                Los indicadores se completaran cuando tengas mas turnos cargados.
              </p>
            )}
          </Panel>

          <Panel title="Accesos rapidos">
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickLink icon={<UsersRound size={18} />} label="Profesionales" to="/admin/profesionales" />
              <QuickLink icon={<WalletCards size={18} />} label="Servicios" to="/admin/servicios" />
              <QuickLink icon={<CalendarDays size={18} />} label="Disponibilidad" to="/admin/disponibilidad" />
              <QuickLink icon={<MessageCircle size={18} />} label="WhatsApp" to="/admin/whatsapp" />
              <QuickLink icon={<MessageCircle size={18} />} label="Mensajes" to="/admin/mensajes" />
              <QuickLink icon={<ReceiptText size={18} />} label="Facturacion" to="/admin/facturacion" />
              <QuickLink icon={<FilePenLine size={18} />} label="Recetarios" to="/admin/recetarios" />
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Financiacion disponible">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700">
                <Banknote size={21} />
              </div>
              <div>
                <p className="font-semibold text-clinic-ink">Simula planes de pago para tratamientos.</p>
                <p className="mt-1 text-sm text-clinic-muted">El simulador completo vive en el modulo financiero.</p>
                <LinkButton className="mt-4" to="/admin/financiacion">Abrir simulador</LinkButton>
              </div>
            </div>
          </Panel>

          <Panel title="Integraciones preparadas">
            <p className="mb-4 text-sm text-clinic-muted">
              Conecta canales y automatizaciones cuando el flujo operativo este listo.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Integration icon={<MessageCircle size={18} />} name="WhatsApp" status="Preparado" />
              <Integration icon={<Banknote size={18} />} name="Pagos" status="Proximamente" />
              <Integration icon={<CalendarDays size={18} />} name="Google Calendar" status="Proximamente" />
              <Integration icon={<PlugZap size={18} />} name="Scoring" status="En evaluacion" />
            </div>
          </Panel>
        </section>
      </main>
    </AdminLayout>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
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
    <article className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}>{icon}</div>
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
    <Link to={to} className="flex items-center justify-between gap-3 rounded-lg border border-clinic-line px-4 py-3 hover:bg-clinic-surface">
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-clinic-brand">{count}</span>
    </Link>
  );
}

function QuickLink({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-clinic-line px-4 py-3 font-semibold text-clinic-ink hover:bg-clinic-surface">
      <span className="text-clinic-brand">{icon}</span>
      {label}
    </Link>
  );
}

function Integration({ icon, name, status }: { icon: React.ReactNode; name: string; status: string }) {
  return (
    <div className="rounded-lg border border-clinic-line p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-clinic-brand">{icon}</span>
        <span className="rounded-lg bg-clinic-surface px-2 py-1 text-xs font-semibold text-clinic-muted">{status}</span>
      </div>
      <p className="mt-3 font-semibold text-clinic-ink">{name}</p>
    </div>
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

function mostRequestedService(appointments: AppointmentWithRelations[]) {
  const counts = new Map<string, number>();
  appointments.forEach((appointment) => {
    const name = appointment.service?.name ?? appointment.reason;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
