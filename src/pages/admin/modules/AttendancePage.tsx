import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  createClinicalEvolutionDraft,
  getAppointmentById,
  getClinicalEvolutionByAppointment,
  getClinicalEvolutionsByPatient,
  updateClinicalEvolutionDraft
} from "../../../lib/clinic-data";
import { canWriteClinicalRecords } from "../../../lib/permissions";
import { ClinicalEvolutionField } from "../../../components/admin/ClinicalEvolutionField";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SectionCard } from "../../../components/admin/SectionCard";
import {
  AppointmentWithRelations,
  ClinicalEvolutionDraftUpdate,
  ClinicalEvolutionWithProfessional
} from "../../../types/clinic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export function AttendancePage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { activeClinicId, loading: clinicLoading, activeMembership, activeRole } = useActiveClinic();
  const canWrite = canWriteClinicalRecords(activeRole);

  const [appointment, setAppointment] = useState<AppointmentWithRelations | null>(null);
  const [currentEvolution, setCurrentEvolution] = useState<ClinicalEvolutionWithProfessional | null>(null);
  const [evolutionError, setEvolutionError] = useState("");  // blocks the evolution form when set
  const [history, setHistory] = useState<ClinicalEvolutionWithProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [fields, setFields] = useState<ClinicalEvolutionDraftUpdate>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clinicLoading || !activeClinicId || !appointmentId) return;
    let cancelled = false;
    setLoading(true);
    setPageError("");

    getAppointmentById(appointmentId, activeClinicId)
      .then(async (appt) => {
        if (cancelled) return;
        setAppointment(appt);

        // getClinicalEvolutionByAppointment throws if duplicates detected — catch it
        // separately so a duplicate error blocks only the evolution form, not the full page.
        const [evolutionResult, allEvolutions] = await Promise.allSettled([
          getClinicalEvolutionByAppointment(appointmentId, activeClinicId),
          getClinicalEvolutionsByPatient(activeClinicId, appt.patient_id)
        ]);

        if (cancelled) return;

        if (evolutionResult.status === "rejected") {
          setEvolutionError(
            evolutionResult.reason instanceof Error
              ? evolutionResult.reason.message
              : "No pudimos verificar las evoluciones de este turno."
          );
        } else {
          const evolution = evolutionResult.value;
          setCurrentEvolution(evolution);
          if (evolution) {
            setFields({
              reason: evolution.reason ?? "",
              current_condition: evolution.current_condition ?? "",
              physical_exam: evolution.physical_exam ?? "",
              diagnosis: evolution.diagnosis ?? "",
              plan: evolution.plan ?? "",
              observations: evolution.observations ?? ""
            });
          }
        }

        if (allEvolutions.status === "fulfilled") {
          setHistory(allEvolutions.value.filter((ev) => ev.appointment_id !== appointmentId));
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPageError(err.message ?? "No pudimos cargar el panel de atención.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeClinicId, clinicLoading, appointmentId]);

  async function handleSave() {
    if (!activeClinicId || !appointmentId || !appointment) return;
    setSaving(true);
    setSaveError("");
    setSuccessMsg("");

    try {
      if (currentEvolution) {
        // Evolution already exists for this appointment — update it
        const updated = await updateClinicalEvolutionDraft(
          currentEvolution.id,
          activeClinicId,
          appointment.patient_id,
          fields
        );
        setCurrentEvolution(updated);
        setSuccessMsg("Borrador actualizado.");
      } else {
        // No local evolution — re-check DB before creating to guard against race conditions
        // (e.g. two tabs or two users opening the same appointment simultaneously).
        let latestEvolution: ClinicalEvolutionWithProfessional | null;
        try {
          latestEvolution = await getClinicalEvolutionByAppointment(appointmentId, activeClinicId);
        } catch (checkErr: unknown) {
          // Duplicate detected or DB error — block creation
          const msg = checkErr instanceof Error ? checkErr.message : "No pudimos verificar las evoluciones de este turno.";
          setEvolutionError(msg);
          setSaveError(msg);
          return;
        }

        if (latestEvolution) {
          // A concurrent session already created one — adopt it and update instead
          setCurrentEvolution(latestEvolution);
          setFields({
            reason: latestEvolution.reason ?? "",
            current_condition: latestEvolution.current_condition ?? "",
            physical_exam: latestEvolution.physical_exam ?? "",
            diagnosis: latestEvolution.diagnosis ?? "",
            plan: latestEvolution.plan ?? "",
            observations: latestEvolution.observations ?? ""
          });
          setSaveError("Ya existe un borrador para este turno (creado por otra sesión). Revisá los campos y guardá de nuevo.");
          return;
        }

        // Confirmed: no evolution exists — safe to create
        const professionalId =
          appointment.professional_id ??
          activeMembership?.professional_id ??
          null;

        const created = await createClinicalEvolutionDraft({
          clinic_id: activeClinicId,
          patient_id: appointment.patient_id,
          appointment_id: appointmentId,
          professional_id: professionalId,
          ...fields
        });
        setCurrentEvolution(created);
        setSuccessMsg("Borrador guardado.");
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "No pudimos guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  const evolutionIsClosed = currentEvolution?.status === "closed";
  const evolutionBlocked = Boolean(evolutionError);
  const formReadOnly = !canWrite || evolutionIsClosed || evolutionBlocked;

  return (
    <AdminLayout onCreateAppointment={() => undefined} onRefresh={() => undefined}>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Back link */}
        <Link
          to="/admin/agenda"
          className="flex w-fit items-center gap-1.5 text-sm text-clinic-muted transition-colors hover:text-clinic-brand"
        >
          <ArrowLeft size={15} />
          {(activeRole === "professional" || activeRole === "doctor") ? "Volver a Mi agenda" : "Volver a Agenda"}
        </Link>

        {/* Page header */}
        <section className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-normal text-clinic-ink">Atender paciente</h1>
          <p className="mt-0.5 text-sm text-clinic-muted">
            Completá la evolución clínica de esta atención. El registro previo del paciente queda disponible como contexto.
          </p>
        </section>

        {/* Page-level error */}
        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {/* Appointment header card */}
        {!loading && appointment && (
          <SectionCard className="overflow-hidden">
            {appointment.patient && (
              <div className="border-b border-clinic-line px-5 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-clinic-muted">Paciente</p>
                <p className="mt-0.5 text-sm font-semibold text-clinic-ink">
                  {appointment.patient.first_name} {appointment.patient.last_name}
                </p>
                {(() => {
                  const meta = [
                    appointment.patient.document_number ? `DNI ${appointment.patient.document_number}` : null,
                    patientAge(appointment.patient.birth_date),
                    appointment.patient.insurance ? `Cobertura: ${appointment.patient.insurance}` : null,
                    appointment.patient.phone,
                  ].filter(Boolean);
                  return meta.length > 0
                    ? <p className="mt-0.5 text-xs text-clinic-muted">{meta.join(" · ")}</p>
                    : null;
                })()}
              </div>
            )}
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <AppointmentMeta label="Fecha y hora" value={formatAppointmentDate(appointment.starts_at)} />
              <AppointmentMeta label="Profesional" value={appointment.professional ? `${appointment.professional.name} ${appointment.professional.last_name}` : "—"} />
              <AppointmentMeta label="Servicio" value={appointment.service?.name ?? appointment.reason ?? "—"} />
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-clinic-muted">Estado</p>
                <AppointmentStatusBadge status={appointment.status} />
              </div>
            </div>
          </SectionCard>
        )}

        {/* Success toast */}
        {successMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {successMsg}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <SectionCard>
            <div className="animate-pulse space-y-4 px-5 py-5">
              <div className="h-3 w-32 rounded bg-clinic-line" />
              <div className="h-20 rounded bg-clinic-line" />
              <div className="h-20 rounded bg-clinic-line" />
              <div className="h-3 w-48 rounded bg-clinic-line" />
            </div>
          </SectionCard>
        )}

        {/* Evolution editor */}
        {!loading && !pageError && appointment && (
          <div ref={formRef}>
            <SectionCard className="overflow-hidden">
              {/* Section header */}
              <div className="flex items-start justify-between border-b border-clinic-line px-5 py-4">
                <div>
                  <p className="font-semibold text-clinic-ink">
                    {evolutionIsClosed
                      ? "Evolución de esta atención"
                      : currentEvolution
                        ? "Borrador de esta atención"
                        : "Nueva evolución de esta atención"}
                  </p>
                  <p className="mt-0.5 text-xs text-clinic-muted">
                    {evolutionBlocked
                      ? "No se puede editar la evolución de este turno."
                      : evolutionIsClosed
                        ? "Esta evolución está cerrada y no puede modificarse."
                        : !canWrite
                          ? "Solo lectura — no tenés permisos para modificar registros clínicos."
                          : currentEvolution
                            ? "Borrador guardado. Podés seguir editando esta evolución hasta cerrarla."
                            : "Se guardará como borrador. Podés seguir editando antes de cerrar la evolución."}
                  </p>
                </div>
                {currentEvolution && (
                  <EvolutionStatusChip status={currentEvolution.status} />
                )}
              </div>

              {/* Blocking error — duplicate evolution detected */}
              {evolutionBlocked && (
                <div className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {evolutionError}
                  {" "}Accedé al{" "}
                  <a href={`/admin/registro-clinico/${appointment.patient_id}`} className="font-medium underline">
                    registro clínico del paciente
                  </a>{" "}
                  para revisar las evoluciones manualmente.
                </div>
              )}

              {/* Fields */}
              <div className="flex flex-col gap-5 px-5 py-5">
                <ClinicalEvolutionField label="Motivo de consulta" value={fields.reason} onChange={(v) => setFields((f) => ({ ...f, reason: v }))} rows={2} readOnly={formReadOnly} />
                <ClinicalEvolutionField label="Enfermedad actual / anamnesis" value={fields.current_condition} onChange={(v) => setFields((f) => ({ ...f, current_condition: v }))} rows={3} readOnly={formReadOnly} />
                <ClinicalEvolutionField label="Examen físico" value={fields.physical_exam} onChange={(v) => setFields((f) => ({ ...f, physical_exam: v }))} rows={3} readOnly={formReadOnly} />
                <ClinicalEvolutionField label="Diagnóstico" value={fields.diagnosis} onChange={(v) => setFields((f) => ({ ...f, diagnosis: v }))} rows={2} readOnly={formReadOnly} />
                <ClinicalEvolutionField label="Plan / indicaciones" value={fields.plan} onChange={(v) => setFields((f) => ({ ...f, plan: v }))} rows={3} readOnly={formReadOnly} />
                <ClinicalEvolutionField label="Observaciones internas" value={fields.observations} onChange={(v) => setFields((f) => ({ ...f, observations: v }))} rows={2} readOnly={formReadOnly} />
              </div>

              {/* Save error */}
              {saveError && (
                <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}

              {/* Actions */}
              {!formReadOnly && (
                <div className="flex items-center gap-3 border-t border-clinic-line px-5 py-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Guardando…" : "Guardar borrador"}
                  </button>
                  <Link
                    to="/admin/agenda"
                    className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
                  >
                    {(activeRole === "professional" || activeRole === "doctor") ? "Volver a Mi agenda" : "Volver a Agenda"}
                  </Link>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* Patient history */}
        {!loading && !pageError && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className="text-sm font-semibold text-clinic-ink">
                Registro clínico previo
                {history.length > 0 && (
                  <span className="ml-2 font-normal text-clinic-muted">
                    ({history.length} evolución{history.length !== 1 ? "es" : ""})
                  </span>
                )}
              </p>
              <p className="text-xs text-clinic-muted">Solo lectura — contexto de atenciones anteriores.</p>
            </div>

            {history.length === 0 ? (
              <SectionCard className="flex items-center gap-3 px-5 py-8 text-sm text-clinic-muted">
                <ClipboardList size={18} className="shrink-0 text-clinic-brand" />
                Sin evoluciones previas para este paciente.
              </SectionCard>
            ) : (
              <SectionCard className="overflow-hidden">
                <div className="divide-y divide-clinic-line">
                  {history.map((ev) => (
                    <HistoryRow key={ev.id} evolution={ev} />
                  ))}
                </div>
              </SectionCard>
            )}
          </section>
        )}
      </main>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AppointmentMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-clinic-muted">{label}</p>
      <p className="text-sm font-medium text-clinic-ink">{value}</p>
    </div>
  );
}

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

function HistoryRow({ evolution: ev }: { evolution: ClinicalEvolutionWithProfessional }) {
  const professionalName = ev.professional
    ? `${ev.professional.name} ${ev.professional.last_name}`
    : "Profesional no asignado";

  return (
    <article className="flex flex-col gap-1.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-clinic-ink">{formatEvolutionDate(ev.created_at)}</span>
        <EvolutionStatusChip status={ev.status} />
        <span className="text-sm text-clinic-muted">{professionalName}</span>
      </div>
      {ev.reason && (
        <p className="text-sm text-clinic-ink">
          <span className="text-clinic-muted">Motivo: </span>
          {truncate(ev.reason, 140)}
        </p>
      )}
      {ev.diagnosis && (
        <p className="text-sm text-clinic-ink">
          <span className="text-clinic-muted">Diagnóstico: </span>
          {truncate(ev.diagnosis, 140)}
        </p>
      )}
    </article>
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

function formatAppointmentDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date(iso));
}

function formatEvolutionDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date(iso));
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
