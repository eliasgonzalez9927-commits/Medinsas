import { ReactNode } from "react";

type MetricTone = "default" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<MetricTone, string> = {
  default: "bg-slate-50 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700"
};

export function MetricCard({
  title,
  value,
  helper,
  badge,
  icon,
  tone = "default"
}: {
  title: string;
  value: string | number;
  helper: string;
  badge?: string;
  icon: ReactNode;
  tone?: MetricTone;
}) {
  return (
    <article className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClasses[tone]}`}>
          {icon}
        </div>
        {badge && (
          <span className="rounded-lg bg-clinic-surface px-2 py-1 text-xs font-semibold text-clinic-muted">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-medium text-clinic-muted">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-clinic-ink">{value}</p>
      <p className="mt-2 text-sm text-clinic-muted">{helper}</p>
    </article>
  );
}
