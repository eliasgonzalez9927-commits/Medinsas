const STORAGE_KEY = "medin.active_clinic_id";

export function getActiveClinicOverride(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveClinicOverride(clinicId: string | null): void {
  try {
    if (clinicId) localStorage.setItem(STORAGE_KEY, clinicId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage no disponible (modo privado, etc.) - la app sigue funcionando con el default.
  }
}
