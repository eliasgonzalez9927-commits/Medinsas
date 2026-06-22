import { AppointmentStatus } from "../../types/database";

const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  pending: {
    label: "Pendiente",
    className: "bg-amber-50 text-amber-700 ring-amber-200"
  },
  confirmed: {
    label: "Confirmado",
    className: "bg-[#e6f4f1] text-clinic-brand ring-[#b9e3dc]"
  },
  attended: {
    label: "Atendido",
    className: "bg-[#eef7f5] text-clinic-brand ring-[#cfe9e4]"
  },
  completed: {
    label: "Atendido",
    className: "bg-[#eef7f5] text-clinic-brand ring-[#cfe9e4]"
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-red-50 text-red-700 ring-red-200"
  },
  rescheduled: {
    label: "Reprogramado",
    className: "bg-blue-50 text-blue-700 ring-blue-200"
  },
  no_show: {
    label: "No asistió",
    className: "bg-red-50 text-red-700 ring-red-200"
  },
  urgent: {
    label: "Urgente",
    className: "bg-orange-50 text-orange-700 ring-orange-200"
  }
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const config = statusConfig[status] ?? statusConfig.pending;

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${config.className}`}>
      {config.label}
    </span>
  );
}

export const appointmentStatusLabels = Object.fromEntries(
  Object.entries(statusConfig).map(([key, value]) => [key, value.label])
) as Record<AppointmentStatus, string>;
