export type DateRangePreset =
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days"
  | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  dateFrom: string;
  dateTo: string;
  label: string;
};

export const DATE_RANGE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "tomorrow", label: "Mañana" },
  { value: "this_week", label: "Esta semana" },
  { value: "next_week", label: "Próxima semana" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "last_7_days", label: "Últimos 7 días" },
  { value: "last_30_days", label: "Últimos 30 días" },
  { value: "custom", label: "Personalizado" }
];

export function resolveDateRange(
  preset: DateRangePreset,
  timezone = "America/Argentina/Mendoza",
  customFrom?: string | null,
  customTo?: string | null
): DateRangeValue {
  const today = getDateInTimeZone(new Date(), timezone);
  let dateFrom = today;
  let dateTo = today;

  if (preset === "tomorrow") dateFrom = dateTo = addDays(today, 1);
  if (preset === "this_week") {
    dateFrom = startOfWeek(today);
    dateTo = addDays(dateFrom, 6);
  }
  if (preset === "next_week") {
    dateFrom = addDays(startOfWeek(today), 7);
    dateTo = addDays(dateFrom, 6);
  }
  if (preset === "this_month") {
    dateFrom = `${today.slice(0, 7)}-01`;
    dateTo = endOfMonth(dateFrom);
  }
  if (preset === "last_month") {
    const firstThisMonth = `${today.slice(0, 7)}-01`;
    dateTo = addDays(firstThisMonth, -1);
    dateFrom = `${dateTo.slice(0, 7)}-01`;
  }
  if (preset === "last_7_days") dateFrom = addDays(today, -6);
  if (preset === "last_30_days") dateFrom = addDays(today, -29);
  if (preset === "custom") {
    dateFrom = customFrom || today;
    dateTo = customTo || dateFrom;
    if (dateTo < dateFrom) [dateFrom, dateTo] = [dateTo, dateFrom];
  }

  return { preset, dateFrom, dateTo, label: preset === "custom" ? formatRange(dateFrom, dateTo) : presetLabel(preset) };
}

export function isDateInRange(value: string | null | undefined, range: Pick<DateRangeValue, "dateFrom" | "dateTo">, timezone = "America/Argentina/Mendoza") {
  if (!value) return false;
  const localDate = getDateInTimeZone(new Date(value), timezone);
  return localDate >= range.dateFrom && localDate <= range.dateTo;
}

export function getDateInTimeZone(date: Date, timezone = "America/Argentina/Mendoza") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const weekDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(value, weekDay === 0 ? -6 : 1 - weekDay);
}

function endOfMonth(firstDay: string) {
  const [year, month] = firstDay.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function presetLabel(preset: DateRangePreset) {
  return DATE_RANGE_PRESETS.find((item) => item.value === preset)?.label ?? "Período";
}

function formatRange(dateFrom: string, dateTo: string) {
  const formatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const from = formatter.format(new Date(`${dateFrom}T12:00:00Z`));
  const to = formatter.format(new Date(`${dateTo}T12:00:00Z`));
  return dateFrom === dateTo ? from : `${from} al ${to}`;
}
