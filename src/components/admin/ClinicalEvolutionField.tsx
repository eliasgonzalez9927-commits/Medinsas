export function ClinicalEvolutionField({
  label,
  value,
  onChange,
  rows = 3,
  readOnly = false
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  rows?: number;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-clinic-ink">{label}</p>
        {value ? (
          <p className="whitespace-pre-wrap text-sm text-clinic-ink">{value}</p>
        ) : (
          <p className="text-sm italic text-clinic-muted">—</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-clinic-ink">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-lg border border-clinic-line bg-white px-3 py-2.5 text-sm text-clinic-ink placeholder-clinic-muted shadow-sm transition-colors focus:border-clinic-brand focus:outline-none focus:ring-1 focus:ring-clinic-brand"
        placeholder={`${label}…`}
      />
    </div>
  );
}
