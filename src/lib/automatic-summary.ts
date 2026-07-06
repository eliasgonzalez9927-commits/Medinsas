export type AutomaticSummaryStatus =
  | "idle"
  | "consent_rejected"
  | "consent_revoked"
  | "listening"
  | "summarizing"
  | "ready"
  | "applied"
  | "discarded"
  | "error";

export type AutomaticSummaryConsentStatus = "pending" | "accepted" | "rejected" | "revoked";
export type AutomaticSummaryConsentType = "verbal" | "written" | "digital";

export type AutomaticSummaryDraft = {
  transcript: string;
  summary: string;
};

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

export async function createMockAutomaticSummary(): Promise<AutomaticSummaryDraft> {
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  return {
    transcript: MOCK_TRANSCRIPT,
    summary: MOCK_SUMMARY
  };
}

export function formatAutomaticSummaryDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
