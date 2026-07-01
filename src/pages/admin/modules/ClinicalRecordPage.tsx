import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Pencil, Plus, X } from "lucide-react";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  createClinicalEvolutionDraft,
  getClinicalEvolutionsByPatient,
  getPatientById,
  updateClinicalEvolutionDraft
} from "../../../lib/clinic-data";
import { canWriteClinicalRecords } from "../../../lib/permissions";
import { ClinicalEvolutionWithProfessional, ClinicalEvolutionDraftUpdate, PatientWithAppointments } from "../../../types/clinic";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SectionCard } from "../../../components/admin/SectionCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMode = { kind: "create" } | { kind: "edit"; evolution: ClinicalEvolutionWithProfessional };

const EMPTY_FIELDS: ClinicalEvolutionDraftUpdate = {
  reason: "",
  current_condition: "",
  physical_exam: "",
  diagnosis: "",
  plan: "",
  observations: ""
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ClinicalRecordPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { activeClinicId, loading: clinicLoading, activeMembership, activeRole } = useActiveClinic();
  const canWrite = canWriteClinicalRecords(activeRole);

  const [patient, setPatient] = useState<PatientWithAppointments | null>(null);
  const [evolutions, setEvolutions] = useState<ClinicalEvolutionWithProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [fields, setFields] = useState<ClinicalEvolutionDraftUpdate>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clinicLoading || !activeClinicId || !patientId) return;
    let cancelled = false;
    setLoading(true);
    setPageError("");

    Promise.all([
      getPatientById(patientId, activeClinicId),
      getClinicalEvolutionsByPatient(activeClinicId, patientId)
    ])
      .then(([p, evs]) => {
        if (cancelled) return;
        setPatient(p);
        setEvolutions(evs);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPageError(err.message ?? "No pudimos cargar el registro clínico.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeClinicId, clinicLoading, patientId]);

  // Scroll to form when it opens
  useEffect(() => {
    if (formMode) {
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [formMode]);

  function openCreate() {
    setFields(EMPTY_FIELDS);
    setSaveError("");
    setSuccessMsg("");
    setFormMode({ kind: "create" });
  }

  function openEdit(ev: ClinicalEvolutionWithProfessional) {
    setFields({
      reason: ev.reason ?? "",
      current_condition: ev.current_condition ?? "",
      physical_exam: ev.physical_exam ?? "",
      diagnosis: ev.diagnosis ?? "",
      plan: ev.plan ?? "",
      observations: ev.observations ?? ""
    });
    setSaveError("");
    setSuccessMsg("");
    setFormMode({ kind: "edit", evolution: ev });
  }

  function cancelForm() {
    setFormMode(null);
    setSaveError("");
    setFields(EMPTY_FIELDS);
  }

  async function handleSave() {
    if (!activeClinicId || !patientId) return;
    setSaving(true);
    setSaveError("");
    setSuccessMsg("");

    try {
      if (formMode?.kind === "create") {
        const created = await createClinicalEvolutionDraft({
          clinic_id: activeClinicId,
          patient_id: patientId,
          professional_id: activeMembership?.professional_id ?? null,
          ...fields
        });
        setEvolutions((prev) => [created, ...prev]);
        setSuccessMsg("Borrador guardado.");
      } else if (formMode?.kind === "edit") {
        const updated = await updateClinicalEvolutionDraft(
          formMode.evolution.id,
          activeClinicId,
          patientId,
          fields
        );
        setEvolutions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        setSuccessMsg("Borrador actualizado.");
      }
      setFormMode(null);
      setFields(EMPTY_FIELDS);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "No pudimos guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  const isEditing = formMode?.kind === "edit";
  const readOnly = !canWrite;

  return (
    <AdminLayout onCreateAppointment={() => undefined} onRefresh={() => undefined}>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Back link */}
        <Link
          to="/admin/pacientes"
          className="flex w-fit items-center gap-1.5 text-sm text-clinic-muted transition-colors hover:text-clinic-brand"
        >
          <ArrowLeft size={15} />
          Volver a pacientes
        </Link>

        {/* Header */}
        <section className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-clinic-brand">Registro clínico</p>
          <h1 className="text-3xl font-semibold tracking-normal text-clinic-ink">
            {loading || !patient
              ? "Cargando..."
              : `${patient.first_name} ${patient.last_name}`}
          </h1>
          {patient && (
            <p className="mt-1 text-sm text-clinic-muted">
              {[
                patient.document_number ? `DNI ${patient.document_number}` : null,
                patientAge(patient.birth_date),
                patient.phone,
                patient.email
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </section>

        {/* Page-level error */}
        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {/* Success toast */}
        {successMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {successMsg}
          </div>
        )}

        {/* Actions bar */}
        {!loading && !pageError && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-clinic-muted">
              {evolutions.length === 0
                ? "Sin evoluciones registradas"
                : `${evolutions.length} evolución${evolutions.length !== 1 ? "es" : ""}`}
            </p>
            {!formMode && (
              readOnly ? (
                <span className="flex items-center gap-1.5 rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2 text-xs font-medium text-clinic-muted">
                  Solo lectura
                </span>
              ) : (
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 rounded-lg border border-clinic-brand bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <Plus size={15} />
                  Nueva evolución
                </button>
              )
            )}
          </div>
        )}

        {/* Evolution form (create or edit) — only reachable when canWrite */}
        {formMode && canWrite && (
          <div ref={formRef}>
            <SectionCard className="flex flex-col gap-0 overflow-hidden">
              {/* Form header */}
              <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
                <div>
                  <p className="font-semibold text-clinic-ink">
                    {isEditing ? "Editar borrador" : "Nueva evolución"}
                  </p>
                  <p className="mt-0.5 text-xs text-clinic-muted">
                    Los cambios se guardan como borrador hasta que la evolución sea cerrada.
                  </p>
                </div>
                <button
                  onClick={cancelForm}
                  className="rounded-md p-1.5 text-clinic-muted transition-colors hover:bg-clinic-surface hover:text-clinic-ink"
                  title="Cancelar"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Fields */}
              <div className="flex flex-col gap-5 px-5 py-5">
                <EvolutionField
                  label="Motivo de consulta"
                  value={fields.reason}
                  onChange={(v) => setFields((f) => ({ ...f, reason: v }))}
                  rows={2}
                />
                <EvolutionField
                  label="Enfermedad actual / anamnesis"
                  value={fields.current_condition}
                  onChange={(v) => setFields((f) => ({ ...f, current_condition: v }))}
                  rows={3}
                />
                <EvolutionField
                  label="Examen físico"
                  value={fields.physical_exam}
                  onChange={(v) => setFields((f) => ({ ...f, physical_exam: v }))}
                  rows={3}
                />
                <EvolutionField
                  label="Diagnóstico"
                  value={fields.diagnosis}
                  onChange={(v) => setFields((f) => ({ ...f, diagnosis: v }))}
                  rows={2}
                />
                <EvolutionField
                  label="Plan / indicaciones"
                  value={fields.plan}
                  onChange={(v) => setFields((f) => ({ ...f, plan: v }))}
                  rows={3}
                />
                <EvolutionField
                  label="Observaciones internas"
                  value={fields.observations}
                  onChange={(v) => setFields((f) => ({ ...f, observations: v }))}
                  rows={2}
                />
              </div>

              {/* Save error */}
              {saveError && (
                <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}

              {/* Form actions */}
              <div className="flex items-center gap-3 border-t border-clinic-line px-5 py-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Guardar borrador"}
                </button>
                <button
                  onClick={cancelForm}
                  disabled={saving}
                  className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </SectionCard>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <SectionCard>
            <div className="divide-y divide-clinic-line">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse px-5 py-5">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-24 rounded bg-clinic-line" />
                    <div className="h-5 w-16 rounded-full bg-clinic-line" />
                  </div>
                  <div className="mt-3 h-3 w-48 rounded bg-clinic-line" />
                  <div className="mt-2 h-3 w-64 rounded bg-clinic-line" />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Empty state */}
        {!loading && !pageError && evolutions.length === 0 && !formMode && (
          <SectionCard className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e6f4f1] text-clinic-brand">
              <ClipboardList size={26} />
            </span>
            <div>
              <p className="font-semibold text-clinic-ink">Sin evoluciones todavía</p>
              <p className="mt-1 text-sm text-clinic-muted">
                Todavía no hay evoluciones registradas para este paciente.
              </p>
            </div>
          </SectionCard>
        )}

        {/* Evolution list */}
        {!loading && !pageError && evolutions.length > 0 && (
          <SectionCard className="overflow-hidden">
            <div className="divide-y divide-clinic-line">
              {evolutions.map((ev) => (
                <EvolutionRow
                  key={ev.id}
                  evolution={ev}
                  onEdit={canWrite && ev.status === "draft" && !formMode ? openEdit : undefined}
                />
              ))}
            </div>
          </SectionCard>
        )}
      </main>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------------------
// EvolutionRow
// ---------------------------------------------------------------------------

function EvolutionRow({
  evolution: ev,
  onEdit
}: {
  evolution: ClinicalEvolutionWithProfessional;
  onEdit?: (ev: ClinicalEvolutionWithProfessional) => void;
}) {
  const professionalName = ev.professional
    ? `${ev.professional.name} ${ev.professional.last_name}`
    : null;

  return (
    <article className="grid gap-3 px-5 py-5 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-clinic-ink">
            {formatEvolutionDate(ev.created_at)}
          </span>
          <EvolutionStatusChip status={ev.status} />
        </div>

        {professionalName ? (
          <p className="text-sm text-clinic-muted">{professionalName}</p>
        ) : (
          <p className="text-sm italic text-clinic-muted">Profesional no asignado</p>
        )}

        {ev.reason && (
          <p className="text-sm text-clinic-ink">
            <span className="text-clinic-muted">Motivo: </span>
            {truncate(ev.reason, 120)}
          </p>
        )}
        {ev.diagnosis && (
          <p className="text-sm text-clinic-ink">
            <span className="text-clinic-muted">Diagnóstico: </span>
            {truncate(ev.diagnosis, 120)}
          </p>
        )}

        <p className="text-xs text-clinic-muted">
          Actualizado {formatRelative(ev.updated_at)}
        </p>
      </div>

      <div className="flex items-start gap-2 md:justify-end">
        {onEdit ? (
          <button
            onClick={() => onEdit(ev)}
            className="flex items-center gap-1.5 rounded-lg border border-clinic-line px-3 py-1.5 text-xs font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
          >
            <Pencil size={12} />
            Editar borrador
          </button>
        ) : ev.status === "closed" ? (
          <span className="rounded-lg border border-clinic-line px-3 py-1.5 text-xs font-medium text-clinic-muted">
            Ver disponible en próxima fase
          </span>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// EvolutionStatusChip
// ---------------------------------------------------------------------------

function EvolutionStatusChip({ status }: { status: "draft" | "closed" }) {
  if (status === "closed") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Cerrada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      Borrador
    </span>
  );
}

// ---------------------------------------------------------------------------
// EvolutionField
// ---------------------------------------------------------------------------

function EvolutionField({
  label,
  value,
  onChange,
  rows = 3
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-clinic-ink">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-lg border border-clinic-line bg-white px-3 py-2.5 text-sm text-clinic-ink placeholder-clinic-muted shadow-sm transition-colors focus:border-clinic-brand focus:outline-none focus:ring-1 focus:ring-clinic-brand"
        placeholder={`${label}…`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patientAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return `${age} años`;
}

function formatEvolutionDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date(iso));
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return formatEvolutionDate(iso);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
