import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  closeClinicalEvolutionDraft,
  createClinicalEvolutionDraft,
  finishAttention,
  getAppointmentById,
  getClinicalEvolutionByAppointment,
  getClinicalEvolutionsByPatient,
  startAttention,
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
// Types / constants
// ---------------------------------------------------------------------------

function hasClinicalContent(fields: ClinicalEvolutionDraftUpdate): boolean {
  return Object.values(fields).some((v) => (v ?? "").trim() !== "");
}

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
  const navigate = useNavigate();
  const { activeClinicId, loading: clinicLoading, activeMembership, activeRole } = useActiveClinic();
  const canWrite = canWriteClinicalRecords(activeRole);

  const [appointment, setAppointment] = useState<AppointmentWithRelations | null>(null);
  const [currentEvolution, setCurrentEvolution] = useState<ClinicalEvolutionWithProfessional | null>(null);
  const [evolutionError, setEvolutionError] = useState("");
  const [history, setHistory] = useState<ClinicalEvolutionWithProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [fields, setFields] = useState<ClinicalEvolutionDraftUpdate>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Attention state
  const [startingAttention, setStartingAttention] = useState(false);
  const [startAttentionError, setStartAttentionError] = useState("");
  const [finishingAttention, setFinishingAttention] = useState(false);
  const [finishAttentionError, setFinishAttentionError] = useState("");
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [closeEvolutionOnFinish, setCloseEvolutionOnFinish] = useState(true);

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

  // ---------------------------------------------------------------------------
  // Attention handlers
  // ---------------------------------------------------------------------------

  async function handleStartAttention() {
    if (!activeClinicId || !appointment) return;
    setStartingAttention(true);
    setStartAttentionError("");
    setSuccessMsg("");
    try {
      const result = await startAttention(appointment.id, activeClinicId);
      setAppointment((prev) => prev ? { ...prev, ...result } : prev);
      setSuccessMsg("Atención iniciada.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pudimos iniciar la atención.";
      // If already started by another session, refresh appointment to sync
      if (msg.includes("ya fue iniciada") || msg.includes("ALREADY_STARTED")) {
        try {
          const refreshed = await getAppointmentById(appointment.id, activeClinicId);
          setAppointment(refreshed);
        } catch { /* ignore refresh errors */ }
      }
      setStartAttentionError(msg);
    } finally {
      setStartingAttention(false);
    }
  }

  async function handleFinishAttention() {
    if (!activeClinicId || !appointmentId || !appointment) return;
    setFinishingAttention(true);
    setFinishAttentionError("");

    try {
      // Step 1: Handle evolution based on checkbox
      if (closeEvolutionOnFinish && !evolutionIsClosed && !evolutionBlocked && canWrite) {
        if (!hasClinicalContent(fields) && currentEvolution) {
          // Evolution exists but all content was cleared — refuse to close, don't finish
          setFinishAttentionError("Para cerrar la evolución, completá al menos un campo clínico.");
          return;
        }

        if (!hasClinicalContent(fields) && !currentEvolution) {
          // No content and no evolution — skip close step, fall through to finishAttention
        } else {
        // Close evolution (create if needed, then close)
        let idToClose: string;

        if (!currentEvolution) {
          let latest: ClinicalEvolutionWithProfessional | null = null;
          try {
            latest = await getClinicalEvolutionByAppointment(appointmentId, activeClinicId);
          } catch { /* duplicate check error — proceed with create */ }

          if (latest) {
            setCurrentEvolution(latest);
            setFields({
              reason: latest.reason ?? "",
              current_condition: latest.current_condition ?? "",
              physical_exam: latest.physical_exam ?? "",
              diagnosis: latest.diagnosis ?? "",
              plan: latest.plan ?? "",
              observations: latest.observations ?? "",
            });
            idToClose = latest.id;
          } else {
            const professionalId =
              appointment.professional_id ?? activeMembership?.professional_id ?? null;
            const created = await createClinicalEvolutionDraft({
              clinic_id: activeClinicId,
              patient_id: appointment.patient_id,
              appointment_id: appointmentId,
              professional_id: professionalId,
              ...fields,
            });
            setCurrentEvolution(created);
            idToClose = created.id;
          }
        } else {
          idToClose = currentEvolution.id;
        }

        const closed = await closeClinicalEvolutionDraft(
          idToClose,
          activeClinicId,
          appointment.patient_id,
          fields
        );
        setCurrentEvolution(closed);
        } // end else (has content)

      } else if (!closeEvolutionOnFinish && !evolutionIsClosed && !evolutionBlocked && canWrite) {
        // Save draft with latest changes
        const hasContent = Object.values(fields).some((v) => (v ?? "").trim() !== "");
        if (currentEvolution) {
          const updated = await updateClinicalEvolutionDraft(
            currentEvolution.id,
            activeClinicId,
            appointment.patient_id,
            fields
          );
          setCurrentEvolution(updated);
        } else if (hasContent) {
          const professionalId =
            appointment.professional_id ?? activeMembership?.professional_id ?? null;
          const created = await createClinicalEvolutionDraft({
            clinic_id: activeClinicId,
            patient_id: appointment.patient_id,
            appointment_id: appointmentId,
            professional_id: professionalId,
            ...fields,
          });
          setCurrentEvolution(created);
        }
      }

      // Step 2: Finish attention
      const result = await finishAttention(appointment.id, activeClinicId);
      setAppointment((prev) => prev ? { ...prev, ...result } : prev);
      setShowFinishConfirm(false);
      setSuccessMsg("Atención finalizada.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pudimos finalizar la atención.";
      // If already finished by another session, refresh appointment to sync
      if (msg.includes("ya fue finalizada") || msg.includes("ALREADY_FINISHED")) {
        try {
          const refreshed = await getAppointmentById(appointment.id, activeClinicId);
          setAppointment(refreshed);
        } catch { /* ignore refresh errors */ }
      }
      setFinishAttentionError(msg);
    } finally {
      setFinishingAttention(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Evolution handlers
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!activeClinicId || !appointmentId || !appointment) return;
    setSaving(true);
    setSaveError("");
    setSuccessMsg("");

    try {
      if (currentEvolution) {
        const updated = await updateClinicalEvolutionDraft(
          currentEvolution.id,
          activeClinicId,
          appointment.patient_id,
          fields
        );
        setCurrentEvolution(updated);
        setSuccessMsg("Borrador actualizado.");
      } else {
        let latestEvolution: ClinicalEvolutionWithProfessional | null;
        try {
          latestEvolution = await getClinicalEvolutionByAppointment(appointmentId, activeClinicId);
        } catch (checkErr: unknown) {
          const msg = checkErr instanceof Error ? checkErr.message : "No pudimos verificar las evoluciones de este turno.";
          setEvolutionError(msg);
          setSaveError(msg);
          return;
        }

        if (latestEvolution) {
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

  async function handleCloseEvolution() {
    if (!activeClinicId || !appointmentId || !appointment) return;
    setClosing(true);
    setCloseError("");

    try {
      let idToClose: string;

      if (!currentEvolution) {
        let latest: ClinicalEvolutionWithProfessional | null;
        try {
          latest = await getClinicalEvolutionByAppointment(appointmentId, activeClinicId);
        } catch (checkErr: unknown) {
          const msg = checkErr instanceof Error ? checkErr.message : "No pudimos verificar las evoluciones de este turno.";
          setEvolutionError(msg);
          setCloseError(msg);
          return;
        }

        if (latest) {
          setCurrentEvolution(latest);
          setFields({
            reason: latest.reason ?? "",
            current_condition: latest.current_condition ?? "",
            physical_exam: latest.physical_exam ?? "",
            diagnosis: latest.diagnosis ?? "",
            plan: latest.plan ?? "",
            observations: latest.observations ?? "",
          });
          setCloseError("Ya existe un borrador para este turno (creado por otra sesión). Revisá los campos y volvé a intentar cerrar.");
          return;
        }

        const professionalId =
          appointment.professional_id ??
          activeMembership?.professional_id ??
          null;

        const created = await createClinicalEvolutionDraft({
          clinic_id: activeClinicId,
          patient_id: appointment.patient_id,
          appointment_id: appointmentId,
          professional_id: professionalId,
          ...fields,
        });
        idToClose = created.id;
        setCurrentEvolution(created);
      } else {
        idToClose = currentEvolution.id;
      }

      const closed = await closeClinicalEvolutionDraft(
        idToClose,
        activeClinicId,
        appointment.patient_id,
        fields
      );
      setCurrentEvolution(closed);
      setShowCloseConfirm(false);
      setSuccessMsg("Evolución cerrada.");
    } catch (err: unknown) {
      setCloseError(err instanceof Error ? err.message : "No pudimos cerrar la evolución.");
    } finally {
      setClosing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const evolutionIsClosed = currentEvolution?.status === "closed";
  const evolutionBlocked = Boolean(evolutionError);
  const formReadOnly = !canWrite || evolutionIsClosed || evolutionBlocked;

  const attentionStartedAt = appointment?.attention_started_at ?? null;
  const attentionFinishedAt = appointment?.attention_finished_at ?? null;
  const attentionNotStarted = !loading && !!appointment && !attentionStartedAt;
  const attentionInProgress = !loading && !!appointment && !!attentionStartedAt && !attentionFinishedAt;
  const attentionFinished = !loading && !!appointment && !!attentionFinishedAt;

  const isProfessional = activeRole === "professional" || activeRole === "doctor";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AdminLayout onCreateAppointment={() => undefined} onRefresh={() => undefined}>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Back link */}
        <Link
          to="/admin/agenda"
          className="flex w-fit items-center gap-1.5 text-sm text-clinic-muted transition-colors hover:text-clinic-brand"
        >
          <ArrowLeft size={15} />
          {isProfessional ? "Volver a Mi agenda" : "Volver a Agenda"}
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

        {/* Attention status block */}
        {!loading && appointment && (
          <SectionCard className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="flex flex-1 flex-col gap-1 min-w-0">
                {attentionNotStarted && (
                  <>
                    <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                      Atención no iniciada
                    </span>
                    <p className="text-sm text-clinic-muted">
                      Iniciá la atención para registrar el tiempo real de consulta.
                    </p>
                  </>
                )}
                {attentionInProgress && attentionStartedAt && (
                  <>
                    <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Atención en curso
                    </span>
                    <p className="text-sm text-clinic-muted">
                      Iniciada a las {formatTime(attentionStartedAt)}
                    </p>
                  </>
                )}
                {attentionFinished && attentionStartedAt && attentionFinishedAt && (
                  <>
                    <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                      Atención finalizada
                    </span>
                    <p className="text-sm text-clinic-muted">
                      {formatAttentionSummary(attentionStartedAt, attentionFinishedAt)}
                    </p>
                  </>
                )}
              </div>

              {attentionNotStarted && (
                <button
                  onClick={handleStartAttention}
                  disabled={startingAttention}
                  className="shrink-0 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {startingAttention ? "Iniciando…" : "Iniciar atención"}
                </button>
              )}

              {attentionInProgress && (
                <button
                  onClick={() => { setFinishAttentionError(""); setShowFinishConfirm(true); }}
                  disabled={finishingAttention}
                  className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Finalizar atención
                </button>
              )}
            </div>

            {startAttentionError && (
              <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {startAttentionError}
              </div>
            )}
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
                          : attentionNotStarted
                            ? "Podés redactar el borrador antes de iniciar la atención."
                            : currentEvolution
                              ? "Borrador guardado. Podés seguir editando esta evolución hasta cerrarla."
                              : "Se guardará como borrador. Podés seguir editando antes de cerrar la evolución."}
                  </p>
                </div>
                {currentEvolution && (
                  <EvolutionStatusChip status={currentEvolution.status} />
                )}
              </div>

              {/* Blocking error */}
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

              {/* Close error (when modal is not open) */}
              {closeError && !showCloseConfirm && (
                <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {closeError}
                </div>
              )}

              {/* Closed state — next actions */}
              {evolutionIsClosed && !evolutionBlocked && (
                <div className="flex flex-wrap items-center gap-3 border-t border-clinic-line bg-[#f6faf9] px-5 py-4">
                  <p className="w-full text-sm text-clinic-muted">
                    Esta evolución quedó registrada en el Registro clínico del paciente y no puede modificarse.
                  </p>
                  <button
                    onClick={() => navigate(`/admin/registro-clinico/${appointment.patient_id}`)}
                    className="rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    Ver registro clínico
                  </button>
                  <Link
                    to="/admin/agenda"
                    className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
                  >
                    {isProfessional ? "Volver a Mi agenda" : "Volver a Agenda"}
                  </Link>
                </div>
              )}

              {/* Actions — show when evolution is editable */}
              {!formReadOnly && (
                <div className="flex flex-wrap items-center gap-3 border-t border-clinic-line px-5 py-4">
                  <button
                    onClick={handleSave}
                    disabled={saving || closing || finishingAttention}
                    className="flex items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Guardando…" : "Guardar borrador"}
                  </button>
                  <button
                    onClick={() => { setCloseError(""); setShowCloseConfirm(true); }}
                    disabled={saving || closing || finishingAttention}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {currentEvolution ? "Cerrar evolución" : "Guardar y cerrar evolución"}
                  </button>
                  <Link
                    to="/admin/agenda"
                    className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
                  >
                    {isProfessional ? "Volver a Mi agenda" : "Volver a Agenda"}
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

      {/* Close evolution confirmation modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="font-semibold text-clinic-ink">¿Cerrar esta evolución?</p>
            <p className="mt-2 text-sm text-clinic-muted">
              Al cerrar esta evolución, quedará registrada como cerrada y no podrá modificarse. Esta acción no puede deshacerse.
            </p>
            {closeError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {closeError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { setShowCloseConfirm(false); setCloseError(""); }}
                disabled={closing}
                className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseEvolution}
                disabled={closing}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {closing ? "Cerrando…" : "Cerrar evolución"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish attention confirmation modal */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="font-semibold text-clinic-ink">Finalizar atención</p>
            <p className="mt-2 text-sm text-clinic-muted">
              Se registrará la hora de cierre de esta atención.
            </p>

            {/* Checkbox: close evolution too */}
            {!evolutionBlocked && canWrite && !evolutionIsClosed && (() => {
              const noContent = !hasClinicalContent(fields) && !currentEvolution;
              const checkboxDisabled = noContent || finishingAttention;
              return (
                <div className="mt-4">
                  <label className={`flex items-start gap-3 ${checkboxDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={noContent ? false : closeEvolutionOnFinish}
                      onChange={(e) => { if (!checkboxDisabled) setCloseEvolutionOnFinish(e.target.checked); }}
                      disabled={checkboxDisabled}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-clinic-brand disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-clinic-ink">
                      Cerrar también la evolución clínica
                    </span>
                  </label>
                  {noContent && (
                    <p className="mt-1.5 pl-7 text-xs text-clinic-muted">
                      Completá al menos un campo clínico para cerrar la evolución.
                    </p>
                  )}
                </div>
              );
            })()}

            {finishAttentionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {finishAttentionError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { setShowFinishConfirm(false); setFinishAttentionError(""); }}
                disabled={finishingAttention}
                className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={handleFinishAttention}
                disabled={finishingAttention}
                className="rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {finishingAttention ? "Finalizando…" : "Finalizar atención"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    hourCycle: "h23"
  }).format(new Date(iso));
}

function formatAttentionSummary(startIso: string, endIso: string): string {
  const start = formatTime(startIso);
  const end = formatTime(endIso);
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return `Atención finalizada · ${start}–${end} · ${mins} min`;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
