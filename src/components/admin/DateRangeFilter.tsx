import { CalendarRange } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { DATE_RANGE_PRESETS, DateRangePreset, DateRangeValue, resolveDateRange } from "../../lib/date-range";

export function DateRangeFilter({
  timezone = "America/Argentina/Mendoza",
  defaultPreset,
  onChange
}: {
  timezone?: string;
  defaultPreset: DateRangePreset;
  onChange?: (value: DateRangeValue) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const rawPreset = searchParams.get("preset");
  const preset = DATE_RANGE_PRESETS.some((item) => item.value === rawPreset) ? rawPreset as DateRangePreset : defaultPreset;
  const value = useMemo(
    () => resolveDateRange(preset, timezone, searchParams.get("from"), searchParams.get("to")),
    [preset, searchParams, timezone]
  );

  useEffect(() => { onChangeRef.current?.(value); }, [value]);

  function update(nextPreset: DateRangePreset, from?: string, to?: string) {
    const next = new URLSearchParams(searchParams);
    next.set("preset", nextPreset);
    if (nextPreset === "custom") {
      next.set("from", from ?? value.dateFrom);
      next.set("to", to ?? value.dateTo);
    } else {
      next.delete("from");
      next.delete("to");
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <section className="rounded-xl border border-clinic-line bg-white px-4 py-3 shadow-[0_8px_24px_rgba(13,54,66,0.035)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-clinic-ink"><CalendarRange size={17} className="text-clinic-brand" /> Período</p>
          <p className="mt-0.5 text-sm text-clinic-muted">{value.label}</p>
        </div>
        <label className="min-w-52 text-sm font-medium text-clinic-ink">
          <span className="sr-only">Seleccionar período</span>
          <select value={preset} onChange={(event) => update(event.target.value as DateRangePreset)} className="h-10 w-full rounded-xl border border-clinic-line bg-[#fbfdfc] px-3 text-sm outline-none transition focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100">
            {DATE_RANGE_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {preset === "custom" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-clinic-ink">Desde<input type="date" value={value.dateFrom} onChange={(event) => update("custom", event.target.value, value.dateTo)} className="mt-2 h-10 w-full rounded-xl border border-clinic-line bg-[#fbfdfc] px-3 text-sm outline-none transition focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100" /></label>
          <label className="text-sm font-medium text-clinic-ink">Hasta<input type="date" value={value.dateTo} min={value.dateFrom} onChange={(event) => update("custom", value.dateFrom, event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-clinic-line bg-[#fbfdfc] px-3 text-sm outline-none transition focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100" /></label>
        </div>
      )}
    </section>
  );
}
