import { useMemo, useState } from "react";
import { ReactNode } from "react";
import { CalendarDays, Clock3, MessageCircle, UserCheck, UserX } from "lucide-react";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { professionals, services } from "../../../data/clinicMockData";
import { AppointmentStatus } from "../../../types/database";
import { AdminPageShell } from "./AdminPageShell";

type MockAppointment = {
  id: string;
  time: string;
  patient: string;
  professionalId: string;
  serviceId: string;
  status: AppointmentStatus;
  source: "Manual" | "Online" | "WhatsApp";
};

const appointments: MockAppointment[] = [
  {
    id: "apt-001",
    time: "09:00",
    patient: "Juan Gomez",
    professionalId: "dr-laura-perez",
    serviceId: "consulta-clinica",
    status: "confirmed",
    source: "WhatsApp"
  },
  {
    id: "apt-002",
    time: "10:30",
    patient: "Carla Fernandez",
    professionalId: "dra-martina-rios",
    serviceId: "limpieza-dental",
    status: "pending",
    source: "Online"
  },
  {
    id: "apt-003",
    time: "15:00",
    patient: "Miguel Sosa",
    professionalId: "dr-laura-perez",
    serviceId: "consulta-clinica",
    status: "no_show",
    source: "Manual"
  }
];

export function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [professionalId, setProfessionalId] = useState("all");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");

  const filtered = useMemo(
    () =>
      appointments.filter((appointment) => {
        const byProfessional =
          professionalId === "all" || appointment.professionalId === professionalId;
        const byStatus = status === "all" || appointment.status === status;
        return byProfessional && byStatus;
      }),
    [professionalId, status]
  );

  return (
    <AdminPageShell
      actionLabel="Crear turno manual"
      description="Vista operativa para recepcion: confirma, cancela, reprograma y detecta huecos libres."
      eyebrow="Agenda clinica"
      title="Agenda"
    >
      <section className="grid gap-4 md:grid-cols-4">
        <QuickAction icon={<Clock3 size={18} />} label="3 turnos sin confirmar" />
        <QuickAction icon={<UserX size={18} />} label="1 paciente no asistio" />
        <QuickAction icon={<MessageCircle size={18} />} label="4 recordatorios pendientes" />
        <QuickAction icon={<UserCheck size={18} />} label="2 huecos disponibles" />
      </section>

      <SectionCard className="p-5">
        <div className="grid gap-4 lg:grid-cols-[180px_1fr_180px_180px]">
          <label>
            <span className="text-sm font-medium text-clinic-ink">Fecha</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Profesional</span>
            <select
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            >
              <option value="all">Todos</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  Dr/a. {professional.name} {professional.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Especialidad</span>
            <select className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100">
              <option>Todas</option>
              <option>Clinica medica</option>
              <option>Odontologia</option>
              <option>Dermatologia</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | AppointmentStatus)}
              className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmado</option>
              <option value="cancelled">Cancelado</option>
              <option value="rescheduled">Reprogramado</option>
              <option value="completed">Atendido</option>
              <option value="no_show">No asistio</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Turnos del dia</h2>
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">
            No hay turnos para los filtros seleccionados.
          </div>
        ) : (
          <div className="divide-y divide-clinic-line">
            {filtered.map((appointment) => {
              const professional = professionals.find((item) => item.id === appointment.professionalId);
              const service = services.find((item) => item.id === appointment.serviceId);
              return (
                <article
                  key={appointment.id}
                  className="grid gap-4 px-5 py-4 lg:grid-cols-[90px_1fr_1fr_160px_260px] lg:items-center"
                >
                  <div className="font-semibold text-clinic-brand">{appointment.time}</div>
                  <div>
                    <p className="font-semibold text-clinic-ink">{appointment.patient}</p>
                    <p className="text-sm text-clinic-muted">Origen: {appointment.source}</p>
                  </div>
                  <div>
                    <p className="font-medium text-clinic-ink">
                      Dr/a. {professional?.name} {professional?.lastName}
                    </p>
                    <p className="text-sm text-clinic-muted">{service?.name}</p>
                  </div>
                  <AppointmentStatusBadge status={appointment.status} />
                  <div className="flex flex-wrap gap-2">
                    <Button>Confirmar</Button>
                    <Button>Reprogramar</Button>
                    <Button>WhatsApp</Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

function QuickAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
        {icon}
      </div>
      <p className="text-sm font-semibold text-clinic-ink">{label}</p>
    </div>
  );
}
