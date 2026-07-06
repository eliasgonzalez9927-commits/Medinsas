const PATIENT_PREVIEW_STORAGE_KEY = "medin.patientPreview.active";

export const patientPreviewEnabled =
  import.meta.env.DEV &&
  !import.meta.env.PROD &&
  import.meta.env.VITE_ENABLE_PATIENT_PREVIEW !== "false";

export function isPatientPreviewActive() {
  if (!patientPreviewEnabled) return false;
  return window.sessionStorage.getItem(PATIENT_PREVIEW_STORAGE_KEY) === "true";
}

export function enablePatientPreview() {
  if (!patientPreviewEnabled) return false;
  window.sessionStorage.setItem(PATIENT_PREVIEW_STORAGE_KEY, "true");
  return true;
}

export function disablePatientPreview() {
  window.sessionStorage.removeItem(PATIENT_PREVIEW_STORAGE_KEY);
}
