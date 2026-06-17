import { CalendarPlus, Filter, Video } from "lucide-react";
import { ReactNode } from "react";
import { AdminAppointmentRow, AppointmentStatus } from "../../types/database";
import { Button } from "../ui/Button";
import { SectionCard } from "./SectionCard";
import {
  AppointmentStatusBadge,
  appointmentStatusLabels
} from "./AppointmentStatusBadge";
import { AppointmentEmptyState, AppointmentLoadError } from "./AppointmentEmptyState";

export type AppointmentFilter = "all" | "pending" | "confirmed" | "cancelled" | "urgency";

const filters: Array<{ label: string; value: AppointmentFilter }> = [
  { label: "Todos", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Confirmados", value: "confirmed" },
  { label: "Cancelados", value: "cancelled" },
  { label: "Urgencias", value: "urgency" }
];

const statusOptions: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "attended",
  "rescheduled",
  "cancelled",
  "no_show"
];

export function AppointmentTable({
  appointments,
  loading,
  hasError,
  activeFilter,
  professionalFilter,
  onFilterChange,
  onProfessionalChange,
  onCreate,
  onRetry,
  onStatusChange
}: {
  appointments: AdminAppointmentRow[];
  loading: boolean;
  hasError: boolean;
  activeFilter: AppointmentFilter;
  professionalFilter: string;
  onFilterChange: (filter: AppointmentFilter) => void;
  onProfessionalChange: (professional: string) => void;
  onCreate: () => void;
  onRetry: () => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-clinic-line px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-clinic-ink">Agenda de hoy</h2>
          <p className="mt-1 text-sm text-clinic-muted">
            Priorizacion operativa de pacientes, estados y proximos pasos.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative">
            <Filter
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted"
            />
            <select
              value={professionalFilter}
              onChange={(event) => onProfessionalChange(event.target.value)}
              className="h-10 rounded-lg border border-clinic-line bg-white pl-9 pr-8 text-sm font-medium text-clinic-ink outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            >
              <option value="all">Todos los profesionales</option>
              <option value="dra-martinez">Dra. Martinez</option>
              <option value="dr-perez">Dr. Perez</option>
              <option value="telemedicina">Equipo telemedicina</option>
            </select>
          </label>
          <Button icon={<CalendarPlus size={17} />} onClick={onCreate} variant="primary">
            Nuevo turno
          </Button>
        </div>
      </div>

      <div className="border-b border-clinic-line px-5 py-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onFilterChange(filter.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeFilter === filter.value
                  ? "bg-clinic-brand text-white"
                  : "bg-clinic-surface text-clinic-muted hover:bg-teal-50 hover:text-clinic-brand"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-12 text-center text-sm text-clinic-muted">Cargando agenda...</div>
      ) : hasError ? (
        <AppointmentLoadError onRetry={onRetry} />
      ) : appointments.length === 0 ? (
        <AppointmentEmptyState onCreate={onCreate} />
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-clinic-line">
              <thead className="bg-clinic-surface">
                <tr>
                  <Th>Hora</Th>
                  <Th>Paciente</Th>
                  <Th>Profesional</Th>
                  <Th>Servicio / Especialidad</Th>
                  <Th>Estado</Th>
                  <Th>Accion</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line bg-white">
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="align-middle hover:bg-clinic-surface/70">
                    <Td>
                      <span className="font-semibold text-clinic-ink">
                        {formatAppointmentTime(appointment.starts_at)}
                      </span>
                    </Td>
                    <Td>
                      <p className="font-medium text-clinic-ink">
                        {appointment.profiles?.full_name ?? "Paciente sin nombre"}
                      </p>
                      <p className="mt-1 text-xs text-clinic-muted">
                        {appointment.profiles?.phone ?? "Sin telefono cargado"}
                      </p>
                    </Td>
                    <Td>{resolveProfessional(appointment)}</Td>
                    <Td>
                      <div className="max-w-sm">
                        <p className="font-medium text-clinic-ink">
                          {appointment.specialty ?? appointment.reason}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-clinic-muted">
                          {appointment.appointment_type === "telemedicine" && <Video size={13} />}
                          {appointment.appointment_type === "telemedicine"
                            ? "Telemedicina"
                            : "Presencial"}
                          {appointment.triage_results?.urgency_level === "high" && (
                            <span className="ml-2 rounded-lg bg-red-50 px-2 py-0.5 font-semibold text-red-700">
                              Urgencia
                            </span>
                          )}
                        </p>
                      </div>
                    </Td>
                    <Td>
                      <AppointmentStatusBadge status={appointment.status} />
                    </Td>
                    <Td>
                      <select
                        value={appointment.status}
                        onChange={(event) =>
                          onStatusChange(appointment.id, event.target.value as AppointmentStatus)
                        }
                        className="h-10 rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {appointmentStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-clinic-line lg:hidden">
            {appointments.map((appointment) => (
              <article key={appointment.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-clinic-brand">
                      {formatAppointmentTime(appointment.starts_at)}
                    </p>
                    <h3 className="mt-1 font-semibold text-clinic-ink">
                      {appointment.profiles?.full_name ?? "Paciente sin nombre"}
                    </h3>
                    <p className="mt-1 text-sm text-clinic-muted">
                      {appointment.specialty ?? appointment.reason}
                    </p>
                  </div>
                  <AppointmentStatusBadge status={appointment.status} />
                </div>
                <div className="mt-4 grid gap-2 text-sm text-clinic-muted">
                  <p>Profesional: {resolveProfessional(appointment)}</p>
                  <p>
                    Modalidad:{" "}
                    {appointment.appointment_type === "telemedicine" ? "Telemedicina" : "Presencial"}
                  </p>
                </div>
                <select
                  value={appointment.status}
                  onChange={(event) =>
                    onStatusChange(appointment.id, event.target.value as AppointmentStatus)
                  }
                  className="mt-4 h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {appointmentStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </article>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function formatAppointmentTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function resolveProfessional(appointment: AdminAppointmentRow) {
  if (appointment.appointment_type === "telemedicine") return "Equipo telemedicina";
  return "Profesional asignado";
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-clinic-muted">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-5 py-4 text-sm text-clinic-ink">{children}</td>;
}
