import { AppointmentStatus } from "../../types/database";

const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  pending: {
    label: "Pendiente",
    className: "bg-amber-50 text-amber-700 ring-amber-200"
  },
  confirmed: {
    label: "Confirmado",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  },
  attended: {
    label: "Atendido",
    className: "bg-slate-100 text-slate-700 ring-slate-200"
  },
  completed: {
    label: "Atendido",
    className: "bg-slate-100 text-slate-700 ring-slate-200"
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
    label: "No asistio",
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
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${config.className}`}>
      {config.label}
    </span>
  );
}

export const appointmentStatusLabels = Object.fromEntries(
  Object.entries(statusConfig).map(([key, value]) => [key, value.label])
) as Record<AppointmentStatus, string>;
