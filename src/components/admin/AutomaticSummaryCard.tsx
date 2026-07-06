import { useEffect, useState } from "react";
import { CheckCircle2, Mic, ShieldCheck, Sparkles, Square } from "lucide-react";
import { SectionCard } from "./SectionCard";

type AutomaticSummaryStatus =
  | "idle"
  | "consent_rejected"
  | "consent_revoked"
  | "listening"
  | "summarizing"
  | "ready"
  | "applied"
  | "discarded"
  | "error";

type AutomaticSummaryConsentStatus = "pending" | "accepted" | "rejected" | "revoked";
type AutomaticSummaryConsentType = "verbal" | "written" | "digital";

const MOCK_TRANSCRIPT = [
  "Profesional y paciente conversan sobre el motivo de consulta, evolucion referida y controles previos.",
  "Se mencionan indicaciones generales y puntos a revisar antes de guardar la evolucion.",
  "Quedan pendientes los datos que el profesional decida completar o ajustar manualmente."
].join("\n\n");

const MOCK_SUMMARY = [
  "Durante la consulta, el paciente y el profesional conversaron sobre el motivo de consulta y la evolucion referida.",
  "El profesional menciono indicaciones generales que deben ser revisadas y editadas antes de guardar el registro.",
  "Se dejo espacio para completar proximo control u otros puntos conversados si corresponde."
].join("\n\n");

async function createMockAutomaticSummary() {
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  return { transcript: MOCK_TRANSCRIPT, summary: MOCK_SUMMARY };
}

function formatAutomaticSummaryDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

type AutomaticSummaryCardProps = {
  canUse: boolean;
  onApplySummary: (summary: string) => void;
};

export function AutomaticSummaryCard({ canUse, onApplySummary }: AutomaticSummaryCardProps) {
  const [status, setStatus] = useState<AutomaticSummaryStatus>("idle");
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentStatus, setConsentStatus] = useState<AutomaticSummaryConsentStatus>("pending");
  const [consentType, setConsentType] = useState<AutomaticSummaryConsentType>("verbal");
  const [listeningSeconds, setListeningSeconds] = useState(0);
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [auditNote, setAuditNote] = useState("");

  useEffect(() => {
    if (status !== "listening") return;
    const timer = window.setInterval(() => setListeningSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  function handleAcceptConsent() {
    setConsentStatus("accepted");
    setShowConsentModal(false);
    setListeningSeconds(0);
    setTranscriptPreview("");
    setSummaryDraft("");
    setAuditNote(`Consentimiento ${consentType} registrado para transcribir y resumir esta atencion.`);
    setStatus("listening");
  }

  function handleRejectConsent() {
    setConsentStatus("rejected");
    setShowConsentModal(false);
    setAuditNote("Consentimiento rechazado. No se activo el resumen automatico.");
    setStatus("consent_rejected");
  }

  function handleRevokeConsent() {
    setConsentStatus("revoked");
    setTranscriptPreview("");
    setSummaryDraft("");
    setAuditNote("Consentimiento revocado. Se descarto el resumen y no se aplico al registro.");
    setStatus("consent_revoked");
  }

  async function handleFinishListening() {
    setStatus("summarizing");
    setAuditNote("Preparando transcripcion y resumen en modo simulado.");

    try {
      const draft = await createMockAutomaticSummary();
      setTranscriptPreview(draft.transcript);
      setSummaryDraft(draft.summary);
      setAuditNote("Resumen generado en modo preparatorio. Debe ser revisado y aprobado por el profesional.");
      setStatus("ready");
    } catch {
      setAuditNote("No pudimos preparar el resumen automatico. Intentá nuevamente.");
      setStatus("error");
    }
  }

  function handleApply() {
    const cleanSummary = summaryDraft.trim();
    if (!cleanSummary) return;
    onApplySummary(cleanSummary);
    setAuditNote("Resumen aplicado al borrador de atencion. Revisalo antes de guardar o cerrar la evolucion.");
    setStatus("applied");
  }

  function handleDiscard() {
    setTranscriptPreview("");
    setSummaryDraft("");
    setAuditNote("Resumen descartado. No se aplico al registro de atencion.");
    setStatus("discarded");
  }

  const isListening = status === "listening";
  const isSummarizing = status === "summarizing";
  const canEditSummary = status === "ready" || status === "applied";

  return (
    <>
      <SectionCard className="overflow-hidden">
        <div className="px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e6f4f1] text-clinic-brand">
                <Sparkles size={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-clinic-ink">Resumen automatico</p>
                  <AutomaticSummaryStatusChip status={status} />
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-clinic-muted">
                  Transcribe y resume lo conversado en la atencion. No diagnostica, no indica tratamientos, no recomienda medicacion y no toma decisiones clinicas. El profesional debe revisar y aprobar antes de guardar.
                </p>
                {auditNote && (
                  <p className="mt-2 text-xs font-medium text-clinic-muted">{auditNote}</p>
                )}
              </div>
            </div>

            {status === "idle" && (
              <button
                onClick={() => setShowConsentModal(true)}
                disabled={!canUse}
                className="shrink-0 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Activar resumen
              </button>
            )}

            {isListening && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  onClick={handleRevokeConsent}
                  className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
                >
                  Revocar
                </button>
                <button
                  onClick={handleFinishListening}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
                >
                  <Square size={14} />
                  Finalizar escucha
                </button>
              </div>
            )}
          </div>

          {!canUse && status === "idle" && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              El resumen automatico queda disponible durante una atencion abierta y para roles con permiso de escritura clinica.
            </div>
          )}

          {(status === "consent_rejected" || status === "consent_revoked") && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {status === "consent_rejected"
                ? "El consentimiento fue rechazado. No se activo transcripcion ni resumen automatico."
                : "El consentimiento fue revocado. No se aplico ningun resumen al registro."}
            </div>
          )}

          {isListening && (
            <div className="mt-4 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold">Escuchando atencion</span>
                <span>{formatAutomaticSummaryDuration(listeningSeconds)}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <ShieldCheck size={14} />
                Consentimiento aceptado
              </span>
            </div>
          )}

          {isSummarizing && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Preparando transcripcion y resumen. Esta version usa un flujo simulado hasta conectar servicios reales.
            </div>
          )}
        </div>

        {(canEditSummary || status === "discarded" || status === "error") && (
          <div className="border-t border-clinic-line px-5 py-5">
            {status === "discarded" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Resumen descartado. Podés activarlo nuevamente si el paciente autoriza.
              </div>
            )}

            {status === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                No pudimos preparar el resumen. No se aplico ningun cambio al registro.
              </div>
            )}

            {canEditSummary && (
              <div className="grid gap-4">
                {transcriptPreview && (
                  <details className="rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-medium text-clinic-ink">Ver transcripcion simulada</summary>
                    <p className="mt-3 whitespace-pre-line leading-6 text-clinic-muted">{transcriptPreview}</p>
                  </details>
                )}

                <label>
                  <span className="text-sm font-medium text-clinic-ink">Resumen editable de la conversacion</span>
                  <textarea
                    value={summaryDraft}
                    onChange={(event) => setSummaryDraft(event.target.value)}
                    className="mt-2 min-h-44 w-full rounded-lg border border-clinic-line px-3 py-3 text-sm leading-6 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Revisá el resumen antes de aplicarlo. No agregues conclusiones, diagnosticos o indicaciones que no hayan sido mencionadas durante la consulta.
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleApply}
                    disabled={!summaryDraft.trim()}
                    className="flex items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={15} />
                    Copiar al borrador
                  </button>
                  <button
                    onClick={handleDiscard}
                    className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
                  >
                    Descartar resumen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f4f1] text-clinic-brand">
                <Mic size={18} />
              </span>
              <div>
                <p className="font-semibold text-clinic-ink">Consentimiento para resumen automatico</p>
                <p className="mt-1 text-sm leading-6 text-clinic-muted">
                  Confirmá que el paciente autorizó transcribir la conversación para generar un resumen editable. Esta función no reemplaza el criterio profesional.
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-clinic-ink">Tipo de consentimiento</span>
              <select
                value={consentType}
                onChange={(event) => setConsentType(event.target.value as AutomaticSummaryConsentType)}
                className="mt-2 w-full rounded-lg border border-clinic-line px-3 py-2 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              >
                <option value="verbal">Verbal</option>
                <option value="written">Escrito</option>
                <option value="digital">Digital</option>
              </select>
            </label>

            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No se guardara audio por defecto en esta version. Solo queda preparado un flujo simulado de transcripcion, resumen y revision humana.
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => setShowConsentModal(false)}
                className="rounded-lg border border-clinic-line px-4 py-2 text-sm font-medium text-clinic-ink transition-colors hover:bg-clinic-surface"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectConsent}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Consentimiento rechazado
              </button>
              <button
                onClick={handleAcceptConsent}
                className="rounded-lg bg-clinic-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Consentimiento aceptado
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AutomaticSummaryStatusChip({ status }: { status: AutomaticSummaryStatus }) {
  const config: Record<AutomaticSummaryStatus, { label: string; className: string }> = {
    idle: { label: "Preparado", className: "bg-slate-100 text-slate-600" },
    consent_rejected: { label: "Consentimiento rechazado", className: "bg-slate-100 text-slate-600" },
    consent_revoked: { label: "Consentimiento revocado", className: "bg-slate-100 text-slate-600" },
    listening: { label: "Escuchando", className: "bg-emerald-100 text-emerald-700" },
    summarizing: { label: "Resumiendo", className: "bg-blue-100 text-blue-700" },
    ready: { label: "Listo para revisar", className: "bg-[#e6f4f1] text-clinic-brand" },
    applied: { label: "Aplicado", className: "bg-emerald-100 text-emerald-700" },
    discarded: { label: "Descartado", className: "bg-slate-100 text-slate-600" },
    error: { label: "Error", className: "bg-red-100 text-red-700" }
  };

  const item = config[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.className}`}>{item.label}</span>;
}
