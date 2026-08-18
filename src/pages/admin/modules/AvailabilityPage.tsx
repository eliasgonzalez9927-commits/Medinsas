import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronRight, Clock, Plus, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  deleteAvailabilityBlock,
  deleteAvailabilityRule,
  getAvailabilityBlocks,
  getAvailabilityRules,
  getClinicHours,
  getDefaultClinic,
  getLocations,
  getProfessionals,
  updateAvailabilityRule
} from "../../../lib/clinic-data";
import {
  AvailabilityBlock,
  AvailabilityRuleWithRelations,
  Clinic,
  ClinicHours,
  Location,
  ProfessionalWithRelations
} from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

// Orden de visualización: lun-dom (1,2,3,4,5,6,0)
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function toMin(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function fromMin(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateSlots(start: string, end: string, duration: number): string[] {
  const slots: string[] = [];
  for (let t = toMin(start); t + duration <= toMin(end); t += duration) {
    slots.push(fromMin(t));
  }
  return slots;
}

type ValidationResult = { valid: boolean; error?: string; suggestion?: { start: string; end: string } };

function validateAgainstClinic(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  clinicHours: ClinicHours[]
): ValidationResult {
  if (toMin(startTime) >= toMin(endTime)) {
    return { valid: false, error: '"Desde" debe ser menor que "Hasta".' };
  }
  const ch = clinicHours.find((h) => h.day_of_week === dayOfWeek);
  if (ch && !ch.is_open) {
    return { valid: false, error: "La clínica no atiende este día. No podés cargar disponibilidad en un día cerrado." };
  }
  if (ch?.opens_at) {
    const opensAt = ch.opens_at.slice(0, 5);
    if (toMin(startTime) < toMin(opensAt)) {
      return {
        valid: false,
        error: `Este horario empieza antes de la apertura de la clínica (${opensAt}).`,
        suggestion: { start: opensAt, end: endTime }
      };
    }
  }
  if (ch?.closes_at) {
    const closesAt = ch.closes_at.slice(0, 5);
    if (toMin(endTime) > toMin(closesAt)) {
      return {
        valid: false,
        error: `Este horario termina después del cierre de la clínica (${closesAt}).`,
        suggestion: { start: startTime, end: closesAt }
      };
    }
  }
  return { valid: true };
}

type RuleForm = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  location_id: string;
};

type BlockForm = {
  date: string;
  all_day: boolean;
  start_time: string;
  end_time: string;
  reason: string;
};

const emptyRuleForm: RuleForm = { day_of_week: 1, start_time: "09:00", end_time: "13:00", slot_duration_minutes: 30, location_id: "" };
const emptyBlockForm: BlockForm = { date: new Date().toISOString().slice(0, 10), all_day: true, start_time: "10:00", end_time: "11:00", reason: "" };

export function AvailabilityPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [clinicHours, setClinicHours] = useState<ClinicHours[]>([]);
  const [rules, setRules] = useState<AvailabilityRuleWithRelations[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [activeTab, setActiveTab] = useState<"weekly" | "blocks">("weekly");
  const [previewDay, setPreviewDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal de horario
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [ruleValidation, setRuleValidation] = useState<ValidationResult | null>(null);

  // Modal de bloqueo
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState<BlockForm>(emptyBlockForm);

  const profRules = useMemo(
    () => rules.filter((r) => !professionalId || r.professional_id === professionalId),
    [rules, professionalId]
  );

  const activeDays = useMemo(() => new Set(profRules.map((r) => r.day_of_week)).size, [profRules]);

  const totalSlots = useMemo(
    () => profRules.reduce((sum, r) => sum + generateSlots(r.start_time, r.end_time, r.slot_duration_minutes).length, 0),
    [profRules]
  );

  const avgDuration = useMemo(() => {
    if (!profRules.length) return 0;
    return Math.round(profRules.reduce((sum, r) => sum + r.slot_duration_minutes, 0) / profRules.length);
  }, [profRules]);

  const nextDay = useMemo(() => {
    const today = new Date().getDay();
    const activeDaysSet = new Set(profRules.map((r) => r.day_of_week));
    for (let i = 0; i < 7; i++) {
      const d = (today + i) % 7;
      if (activeDaysSet.has(d)) return DAY_LABELS[d];
    }
    return null;
  }, [profRules]);

  const upcomingBlocks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return blocks
      .filter((b) => b.date >= today && (!professionalId || !b.professional_id || b.professional_id === professionalId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [blocks, professionalId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) {
        setError("No encontramos la clínica configurada.");
        return;
      }
      const [profResult, loadedLocations, rulesResult, loadedBlocks, loadedHours] = await Promise.all([
        getProfessionals(loadedClinic.id),
        getLocations(loadedClinic.id),
        getAvailabilityRules(loadedClinic.id),
        getAvailabilityBlocks(loadedClinic.id),
        getClinicHours(loadedClinic.id)
      ]);
      setProfessionals(profResult.data);
      setLocations(loadedLocations);
      setRules(rulesResult.data);
      setBlocks(loadedBlocks);
      setClinicHours(loadedHours);
      setProfessionalId((cur) => cur || profResult.data[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la disponibilidad.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Actualiza el día de preview al primer día activo cuando cambia el profesional
  useEffect(() => {
    const firstActiveDay = DISPLAY_DAYS.find((d) => profRules.some((r) => r.day_of_week === d));
    setPreviewDay(firstActiveDay ?? DISPLAY_DAYS[0]);
  }, [professionalId, rules]);

  function openCreate(dayOfWeek?: number) {
    setEditingRuleId(null);
    setRuleForm({ ...emptyRuleForm, day_of_week: dayOfWeek ?? 1 });
    setRuleValidation(null);
    setRuleModalOpen(true);
    setError("");
    setNotice("");
  }

  function openEdit(rule: AvailabilityRuleWithRelations) {
    setEditingRuleId(rule.id);
    setRuleForm({
      day_of_week: rule.day_of_week,
      start_time: rule.start_time.slice(0, 5),
      end_time: rule.end_time.slice(0, 5),
      slot_duration_minutes: rule.slot_duration_minutes,
      location_id: rule.location_id ?? ""
    });
    setRuleValidation(null);
    setRuleModalOpen(true);
    setError("");
    setNotice("");
  }

  function updateRuleField<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    const updated = { ...ruleForm, [key]: value };
    setRuleForm(updated);
    const v = validateAgainstClinic(updated.day_of_week, updated.start_time, updated.end_time, clinicHours);
    setRuleValidation(v.valid ? null : v);
  }

  async function handleSaveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic || !professionalId) return;
    const v = validateAgainstClinic(ruleForm.day_of_week, ruleForm.start_time, ruleForm.end_time, clinicHours);
    if (!v.valid) {
      setRuleValidation(v);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        location_id: ruleForm.location_id || null,
        day_of_week: ruleForm.day_of_week,
        start_time: ruleForm.start_time,
        end_time: ruleForm.end_time,
        slot_duration_minutes: ruleForm.slot_duration_minutes
      };
      if (editingRuleId) {
        await updateAvailabilityRule(editingRuleId, payload);
        setNotice("Horario actualizado correctamente.");
      } else {
        await createAvailabilityRule({ clinic_id: clinic.id, professional_id: professionalId, active: true, ...payload });
        setNotice("Horario creado correctamente.");
      }
      setRuleModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el horario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRule(rule: AvailabilityRuleWithRelations) {
    try {
      await deleteAvailabilityRule(rule.id);
      setNotice("Horario eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos eliminar el horario.");
    }
  }

  async function handleSaveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic) return;
    setSaving(true);
    setError("");
    try {
      await createAvailabilityBlock({
        clinic_id: clinic.id,
        professional_id: professionalId || null,
        date: blockForm.date,
        start_time: blockForm.all_day ? "00:00" : blockForm.start_time,
        end_time: blockForm.all_day ? "23:59" : blockForm.end_time,
        reason: blockForm.reason || null
      });
      setNotice("Bloqueo creado correctamente.");
      setBlockModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el bloqueo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBlock(block: AvailabilityBlock) {
    try {
      await deleteAvailabilityBlock(block.id);
      setNotice("Bloqueo eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos eliminar el bloqueo.");
    }
  }

  const selectedProfessional = professionals.find((p) => p.id === professionalId);

  const previewSlots = useMemo(() => {
    if (previewDay === null) return [];
    const dayRules = profRules.filter((r) => r.day_of_week === previewDay);
    return dayRules.flatMap((r) => generateSlots(r.start_time, r.end_time, r.slot_duration_minutes));
  }, [profRules, previewDay]);

  return (
    <AdminPageShell
      description="Definí cuándo atiende cada profesional y qué horarios puede reservar un paciente."
      eyebrow="Configuración operativa"
      title="Disponibilidad"
    >
      {notice && <Msg tone="success">{notice}</Msg>}
      {error && <Msg tone="error">{error}</Msg>}

      {/* Stepper visual */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { n: 1, label: "Elegir profesional" },
          { n: 2, label: "Definir semana de atención" },
          { n: 3, label: "Bloqueos y excepciones" }
        ].map((step, i) => (
          <div key={step.n} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={14} className="text-clinic-muted" />}
            <span className={`flex items-center gap-1.5 ${activeTab === "blocks" && step.n === 3 ? "text-clinic-brand font-semibold" : activeTab === "weekly" && step.n <= 2 ? "text-clinic-brand font-semibold" : "text-clinic-muted"}`}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#e6f4f1] text-[10px] font-bold text-clinic-brand">
                {step.n}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Profesional + Horario clínica */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <SectionCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinic-muted">Profesional</p>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="mt-2 h-11 w-full rounded-lg border border-clinic-line px-3 text-sm font-medium text-clinic-ink outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
          >
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                Dr/a. {p.name} {p.last_name}
              </option>
            ))}
          </select>
          {selectedProfessional && (
            <p className="mt-2 text-xs text-clinic-muted">
              {activeDays} día{activeDays !== 1 ? "s" : ""} activo{activeDays !== 1 ? "s" : ""} · {totalSlots} turno{totalSlots !== 1 ? "s" : ""}/semana · turnos de {avgDuration} min promedio
            </p>
          )}
        </SectionCard>

        <SectionCard className="p-5 min-w-[240px]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-clinic-muted">Horario de la clínica</p>
            <Link to="/admin/configuracion" className="text-xs font-semibold text-clinic-brand hover:underline">
              Editar →
            </Link>
          </div>
          <div className="mt-2 space-y-1">
            {clinicHours.length === 0 ? (
              <p className="text-xs text-clinic-muted">Sin horarios configurados</p>
            ) : (
              DISPLAY_DAYS.map((day) => {
                const ch = clinicHours.find((h) => h.day_of_week === day);
                if (!ch) return null;
                return (
                  <div key={day} className="flex items-center justify-between gap-4 text-xs">
                    <span className="w-14 font-medium text-clinic-ink">{DAY_LABELS[day].slice(0, 3)}</span>
                    {ch.is_open ? (
                      <span className="text-clinic-muted">{ch.opens_at?.slice(0, 5)} – {ch.closes_at?.slice(0, 5)}</span>
                    ) : (
                      <span className="text-slate-400">Cerrado</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <p className="mt-3 text-[10px] text-clinic-muted">
            La disponibilidad del profesional debe estar dentro de estos horarios.
          </p>
        </SectionCard>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Días activos", value: String(activeDays), icon: <CalendarClock size={18} /> },
          { label: "Turnos / semana", value: String(totalSlots), icon: <Clock size={18} /> },
          { label: "Intervalo promedio", value: `${avgDuration} min`, icon: <Clock size={18} /> },
          { label: "Próximo disponible", value: nextDay ?? "—", icon: <Check size={18} /> }
        ].map((kpi) => (
          <SectionCard key={kpi.label} className="p-4">
            <span className="text-clinic-brand">{kpi.icon}</span>
            <p className="mt-3 text-xs text-clinic-muted">{kpi.label}</p>
            <p className="mt-1 text-lg font-bold text-clinic-ink">{kpi.value}</p>
          </SectionCard>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-clinic-line bg-clinic-surface p-1">
        {(["weekly", "blocks"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab ? "bg-white text-clinic-ink shadow-sm" : "text-clinic-muted hover:text-clinic-ink"
            }`}
          >
            {tab === "weekly" ? "Horarios semanales" : "Bloqueos y excepciones"}
          </button>
        ))}
      </div>

      {/* Tab 1: Horarios semanales */}
      {activeTab === "weekly" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
          {/* Grilla semanal */}
          <SectionCard className="overflow-hidden">
            <div className="border-b border-clinic-line px-5 py-4">
              <h2 className="font-semibold text-clinic-ink">Semana de atención</h2>
              <p className="mt-0.5 text-sm text-clinic-muted">Los horarios configurados determinan cuándo puede reservar un paciente.</p>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-clinic-muted">Cargando horarios...</div>
            ) : (
              <div className="divide-y divide-clinic-line">
                {DISPLAY_DAYS.map((day) => {
                  const dayRules = profRules.filter((r) => r.day_of_week === day);
                  const clinicDay = clinicHours.find((h) => h.day_of_week === day);
                  const isClosed = clinicDay && !clinicDay.is_open;
                  const isPreview = previewDay === day;

                  return (
                    <div
                      key={day}
                      className={`px-5 py-4 transition ${isPreview && dayRules.length > 0 ? "bg-[#f6faf9]" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setPreviewDay(day)}
                          className={`mt-0.5 w-20 shrink-0 text-left text-sm font-semibold ${
                            isPreview ? "text-clinic-brand" : "text-clinic-ink"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>

                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          {isClosed ? (
                            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                              Clínica cerrada
                            </span>
                          ) : dayRules.length === 0 ? (
                            <span className="text-sm text-clinic-muted">Sin atención</span>
                          ) : (
                            dayRules.map((rule) => (
                              <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-[#8fd2c6] bg-[#e6f4f1] px-3 py-1.5">
                                <span className="text-xs font-semibold text-clinic-brand">
                                  {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                                </span>
                                <span className="text-xs text-clinic-muted">· c/{rule.slot_duration_minutes} min</span>
                                {rule.location_id && locations.find((l) => l.id === rule.location_id) && (
                                  <span className="text-xs text-clinic-muted">· {locations.find((l) => l.id === rule.location_id)?.name}</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openEdit(rule)}
                                  className="ml-1 text-xs font-semibold text-clinic-brand underline-offset-2 hover:underline"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRule(rule)}
                                  className="text-clinic-muted hover:text-red-500"
                                  aria-label="Eliminar horario"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {!isClosed && (
                          <button
                            type="button"
                            onClick={() => openCreate(day)}
                            className="shrink-0 text-xs font-semibold text-clinic-brand hover:underline"
                          >
                            + Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-clinic-line px-5 py-4">
              <Button icon={<Plus size={15} />} onClick={() => openCreate()} variant="primary">
                Agregar horario
              </Button>
            </div>
          </SectionCard>

          {/* Vista previa */}
          <div className="flex flex-col gap-4">
            <SectionCard className="overflow-hidden">
              <div className="border-b border-clinic-line px-5 py-4">
                <h2 className="font-semibold text-clinic-ink">Vista previa</h2>
                <p className="mt-0.5 text-xs text-clinic-muted">Así se verá en la agenda</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {DISPLAY_DAYS.map((day) => {
                    const hasRules = profRules.some((r) => r.day_of_week === day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setPreviewDay(day)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          previewDay === day
                            ? "bg-clinic-brand text-white"
                            : hasRules
                            ? "border border-clinic-line bg-white text-clinic-ink hover:bg-[#e6f4f1]"
                            : "border border-clinic-line bg-white text-clinic-muted"
                        }`}
                      >
                        {DAY_LABELS[day].slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-5 py-4">
                {previewSlots.length === 0 ? (
                  <p className="text-center text-sm text-clinic-muted py-4">
                    Sin turnos disponibles {previewDay !== null ? `los ${DAY_LABELS[previewDay].toLowerCase()}` : ""}.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {previewSlots.map((slot) => (
                      <div
                        key={slot}
                        className="rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2 text-center text-sm font-medium text-clinic-ink"
                      >
                        {slot}
                      </div>
                    ))}
                  </div>
                )}
                {previewSlots.length > 0 && (
                  <p className="mt-3 text-center text-xs text-clinic-muted">
                    {previewSlots.length} inicio{previewSlots.length !== 1 ? "s" : ""} posible{previewSlots.length !== 1 ? "s" : ""}
                    {profRules.find((r) => r.day_of_week === previewDay) && ` · cada ${profRules.find((r) => r.day_of_week === previewDay)!.slot_duration_minutes} min`}
                  </p>
                )}
              </div>
            </SectionCard>

            {/* Próximos bloqueos (resumen) */}
            <SectionCard className="overflow-hidden">
              <div className="border-b border-clinic-line px-5 py-4">
                <h2 className="font-semibold text-clinic-ink">Bloqueos próximos</h2>
              </div>
              {upcomingBlocks.length === 0 ? (
                <div className="px-5 py-5 text-center">
                  <CalendarClock size={24} className="mx-auto text-clinic-muted/40" />
                  <p className="mt-2 text-xs text-clinic-muted">Sin bloqueos cargados</p>
                </div>
              ) : (
                <div className="divide-y divide-clinic-line">
                  {upcomingBlocks.map((block) => (
                    <div key={block.id} className="px-5 py-3">
                      <p className="text-sm font-semibold text-clinic-ink">
                        {new Date(block.date + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                      </p>
                      <p className="text-xs text-clinic-muted">
                        {block.start_time.slice(0, 5) === "00:00" && block.end_time.slice(0, 5) === "23:59"
                          ? "Día completo"
                          : `${block.start_time.slice(0, 5)} – ${block.end_time.slice(0, 5)}`}
                        {block.reason ? ` · ${block.reason}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* Tab 2: Bloqueos y excepciones */}
      {activeTab === "blocks" && (
        <SectionCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
            <div>
              <h2 className="font-semibold text-clinic-ink">Bloqueos y excepciones</h2>
              <p className="mt-0.5 text-sm text-clinic-muted">Cerrá horarios puntuales por feriados, ausencias o cambios temporales.</p>
            </div>
            <Button icon={<Plus size={15} />} onClick={() => { setBlockForm(emptyBlockForm); setBlockModalOpen(true); }} variant="primary">
              Crear bloqueo
            </Button>
          </div>
          {blocks.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CalendarClock size={32} className="mx-auto text-clinic-muted/40" />
              <p className="mt-3 text-sm font-semibold text-clinic-ink">No hay bloqueos cargados</p>
              <p className="mt-1 text-sm text-clinic-muted">Cuando un profesional no atienda por una fecha puntual, agregalo acá.</p>
            </div>
          ) : (
            <div className="divide-y divide-clinic-line">
              {[...blocks]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((block) => {
                  const professional = professionals.find((p) => p.id === block.professional_id);
                  const isAllDay = block.start_time.slice(0, 5) === "00:00" && block.end_time.slice(0, 5) === "23:59";
                  return (
                    <article key={block.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-semibold text-clinic-ink">
                          {new Date(block.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        <p className="mt-0.5 text-sm text-clinic-muted">
                          {isAllDay ? "Día completo" : `${block.start_time.slice(0, 5)} – ${block.end_time.slice(0, 5)}`}
                          {block.reason ? ` · ${block.reason}` : ""}
                          {professional ? ` · Dr/a. ${professional.name} ${professional.last_name}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(block)}
                        className="rounded-lg p-2 text-clinic-muted hover:bg-red-50 hover:text-red-600"
                        aria-label="Eliminar bloqueo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </article>
                  );
                })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Modal de horario */}
      {ruleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRuleModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-clinic-line bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-clinic-ink">{editingRuleId ? "Editar horario" : "Agregar horario de atención"}</h2>
              <button type="button" onClick={() => setRuleModalOpen(false)} className="rounded-lg p-1 text-clinic-muted hover:bg-[#e6f4f1]">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveRule} className="mt-5 grid gap-4">
              <label>
                <span className="text-sm font-medium text-clinic-ink">Día</span>
                <select
                  value={ruleForm.day_of_week}
                  onChange={(e) => updateRuleField("day_of_week", Number(e.target.value))}
                  className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  {DISPLAY_DAYS.map((d) => (
                    <option key={d} value={d}>{DAY_LABELS[d]}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <TimeInput label="Desde" value={ruleForm.start_time} onChange={(v) => updateRuleField("start_time", v)} />
                <TimeInput label="Hasta" value={ruleForm.end_time} onChange={(v) => updateRuleField("end_time", v)} />
              </div>
              <label>
                <span className="text-sm font-medium text-clinic-ink">Intervalo de inicio</span>
                <select
                  value={ruleForm.slot_duration_minutes}
                  onChange={(e) => updateRuleField("slot_duration_minutes", Number(e.target.value))}
                  className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  {[10, 15, 20, 30, 45, 60, 90, 120].map((d) => (
                    <option key={d} value={d}>{d} minutos</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-clinic-muted">
                  Define cada cuánto puede empezar un turno. La duración real se toma del servicio asignado al profesional.
                </p>
              </label>
              <label>
                <span className="text-sm font-medium text-clinic-ink">Sede</span>
                <select
                  value={ruleForm.location_id}
                  onChange={(e) => updateRuleField("location_id", e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">Todas las sedes</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>

              {ruleValidation && !ruleValidation.valid && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="flex gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <p>{ruleValidation.error}</p>
                      {ruleValidation.suggestion && (
                        <button
                          type="button"
                          onClick={() => {
                            if (ruleValidation.suggestion) {
                              const updated = { ...ruleForm, start_time: ruleValidation.suggestion.start, end_time: ruleValidation.suggestion.end };
                              setRuleForm(updated);
                              setRuleValidation(null);
                            }
                          }}
                          className="mt-1 font-semibold underline underline-offset-2"
                        >
                          Ajustar a {ruleValidation.suggestion.start} – {ruleValidation.suggestion.end}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Slots preview dentro del modal */}
              {!ruleValidation && ruleForm.start_time && ruleForm.end_time && (
                <div className="rounded-lg bg-clinic-surface px-3 py-2 text-xs text-clinic-muted">
                  {generateSlots(ruleForm.start_time, ruleForm.end_time, ruleForm.slot_duration_minutes).length} turnos disponibles
                </div>
              )}

              <p className="text-xs text-clinic-muted">Los pacientes solo podrán reservar turnos dentro de estos horarios.</p>
              <div className="flex gap-2">
                <Button disabled={saving || (ruleValidation !== null && !ruleValidation.valid)} type="submit" variant="primary">
                  {saving ? "Guardando..." : "Guardar horario"}
                </Button>
                <Button onClick={() => setRuleModalOpen(false)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de bloqueo */}
      {blockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBlockModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-clinic-line bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-clinic-ink">Crear bloqueo</h2>
              <button type="button" onClick={() => setBlockModalOpen(false)} className="rounded-lg p-1 text-clinic-muted hover:bg-[#e6f4f1]">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveBlock} className="mt-5 grid gap-4">
              <DateInput label="Fecha" value={blockForm.date} onChange={(v) => setBlockForm({ ...blockForm, date: v })} />
              <label className="flex items-center gap-3 rounded-lg border border-clinic-line p-3 text-sm font-medium text-clinic-ink">
                <input
                  type="checkbox"
                  checked={blockForm.all_day}
                  onChange={(e) => setBlockForm({ ...blockForm, all_day: e.target.checked })}
                />
                Todo el día
              </label>
              {!blockForm.all_day && (
                <div className="grid grid-cols-2 gap-3">
                  <TimeInput label="Desde" value={blockForm.start_time} onChange={(v) => setBlockForm({ ...blockForm, start_time: v })} />
                  <TimeInput label="Hasta" value={blockForm.end_time} onChange={(v) => setBlockForm({ ...blockForm, end_time: v })} />
                </div>
              )}
              <label>
                <span className="text-sm font-medium text-clinic-ink">Motivo</span>
                <select
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">Sin motivo</option>
                  <option value="Feriado">Feriado</option>
                  <option value="Vacaciones">Vacaciones</option>
                  <option value="Reunión">Reunión</option>
                  <option value="Ausencia">Ausencia</option>
                  <option value="Almuerzo">Almuerzo</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
              <div className="flex gap-2">
                <Button disabled={saving} type="submit" variant="primary">
                  {saving ? "Guardando..." : "Guardar bloqueo"}
                </Button>
                <Button onClick={() => setBlockModalOpen(false)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}

function Msg({ children, tone }: { children: string; tone: "success" | "warning" | "error" }) {
  const cls = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-700"
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
