import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { AdminPageShell } from "./AdminPageShell";
import { useAuth } from "../../../contexts/AuthContext";
import {
  finalizeMedicalAttention,
  getAppointmentForProfessionalAttention,
  getDefaultClinic,
  getMedicalRecordByAppointment,
  saveMedicalRecordDraft
} from "../../../lib/clinic-data";
import { AppointmentWithRelations } from "../../../types/clinic";

export function MedicalAttentionPage() {
  const { appointmentId = "" } = useParams();
  const { clinicMembership } = useAuth();
  const myProfessionalId = clinicMembership?.professional_id ?? null;
  const navigate = useNavigate();

  const [clinicId, setClinicId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<AppointmentWithRelations | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftError, setDraftError] = useState("");

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const [finalized, setFinalized] = useState(false);

  const startedAtRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!myProfessionalId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const clinic = await getDefaultClinic();
        if (!clinic) throw new Error("No se encontró la clínica.");
        if (cancelled) return;
        setClinicId(clinic.id);
        const foundAppointment = await getAppointmentForProfessionalAttention(
          clinic.id,
          appointmentId,
          myProfessionalId as string
        );
        if (cancelled) return;
        if (!foundAppointment) {
          setNotFound(true);
          return;
        }
        setAppointment(foundAppointment);
        setFinalized(foundAppointment.status === "completed");
        const record = await getMedicalRecordByAppointment(clinic.id, appointmentId, myProfessionalId as string);
        if (cancelled) return;
        setNotes(record?.notes ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No pudimos cargar la atención.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, myProfessionalId]);

  useEffect(() => {
    if (finalized) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finalized]);

  async function handleSaveDraft() {
    if (!clinicId || !appointment || !myProfessionalId) return;
    setSavingDraft(true);
    setDraftError("");
    try {
      await saveMedicalRecordDraft({
        clinicId,
        patientId: appointment.patient_id,
        professionalId: myProfessionalId,
        appointmentId,
        notes
      });
      setDraftSavedAt(new Date());
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "No pudimos guardar la nota.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleFinalize() {
    if (!clinicId || !appointment || !myProfessionalId) return;
    setFinalizing(true);
    setFinalizeError("");
    try {
      await finalizeMedicalAttention({
        clinicId,
        patientId: appointment.patient_id,
        professionalId: myProfessionalId,
        appointmentId,
        notes
      });
      setFinalized(true);
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "No pudimos finalizar la atención.");
    } finally {
      setFinalizing(false);
    }
  }

  if (!myProfessionalId) {
    return (
      <AdminPageShell description="" eyebrow="Atención médica" title="Atención médica">
        <Message>
          Tu usuario no está vinculado a un profesional en esta clínica. Contactá al administrador para que te
          asocie a tu perfil profesional.
        </Message>
      </AdminPageShell>
    );
  }

  if (loading) {
    return (
      <AdminPageShell description="" eyebrow="Atención médica" title="Cargando...">
        <p className="p-6 text-sm text-clinic-muted">Cargando atención...</p>
      </AdminPageShell>
    );
  }

  if (error) {
    return (
      <AdminPageShell description="" eyebrow="Atención médica" title="Error">
        <p className="p-6 text-sm text-red-600">{error}</p>
      </AdminPageShell>
    );
  }

  if (notFound || !appointment) {
    return (
      <AdminPageShell description="" eyebrow="Atención médica" title="Atención médica">
        <Message>No tenés acceso a esta atención.</Message>
      </AdminPageShell>
    );
  }

  const patientName = appointment.patient ? `${appointment.patient.first_name} ${appointment.patient.last_name}` : "Paciente sin vincular";

  return (
    <AdminPageShell title="Atención médica" description="Registro de atención para este turno.">
      <Link
        to="/admin/mi-agenda"
        className="mb-2 inline-flex items-center gap-1 text-sm text-clinic-muted hover:text-clinic-ink"
      >
        <ArrowLeft size={14} />
        Volver a mi agenda
      </Link>

      <SectionCard className="mb-6">
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Paciente" value={patientName} />
          <Field label="Turno" value={formatDateTime(appointment.starts_at)} />
          <Field label="Servicio" value={appointment.service?.name ?? appointment.reason ?? "—"} />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wider text-clinic-muted">Estado</p>
            <AppointmentStatusBadge status={appointment.status} />
          </div>
        </div>
      </SectionCard>

      {!finalized && (
        <SectionCard className="mb-6">
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-clinic-muted">Tiempo de atención</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-clinic-ink">{formatElapsed(elapsedSeconds)}</p>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Evolución</h2>
          <p className="mt-1 text-sm text-clinic-muted">
            Notas de esta atención. Solo vos podés verlas.
          </p>
        </div>
        <div className="p-5">
          {finalized ? (
            <p className="whitespace-pre-wrap text-sm text-clinic-ink">{notes || "Sin notas cargadas."}</p>
          ) : (
            <>
              {draftError && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{draftError}</p>}
              {finalizeError && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{finalizeError}</p>}
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Motivo de consulta, evolución, indicaciones..."
                rows={8}
                className="w-full rounded-lg border border-clinic-line px-3 py-2 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
              {draftSavedAt && (
                <p className="mt-2 text-xs text-clinic-muted">Borrador guardado a las {formatTime(draftSavedAt)}.</p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button onClick={handleSaveDraft} disabled={savingDraft || finalizing}>
                  {savingDraft ? "Guardando..." : "Guardar borrador"}
                </Button>
                <Button onClick={handleFinalize} disabled={savingDraft || finalizing} variant="primary">
                  {finalizing ? "Finalizando..." : "Finalizar atención"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {finalized && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-800">Atención finalizada.</p>
          <Button onClick={() => navigate("/admin/mi-agenda")} variant="primary">
            Volver a mi agenda
          </Button>
        </div>
      )}
    </AdminPageShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wider text-clinic-muted">{label}</p>
      <p className="text-sm font-medium text-clinic-ink">{value}</p>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(value);
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function Message({ children }: { children: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>;
}
