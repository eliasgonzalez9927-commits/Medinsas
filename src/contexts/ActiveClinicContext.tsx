import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { Clinic } from "../types/clinic";
import { ClinicMember, UserRole } from "../types/database";

type ActiveClinicContextValue = {
  activeClinic: Clinic | null;
  activeClinicId: string | null;
  activeMembership: ClinicMember | null;
  activeRole: UserRole | null;
  availableClinics: Clinic[];
  memberships: ClinicMember[];
  loading: boolean;
  error: string;
  setActiveClinicId: (clinicId: string) => void;
  refreshClinics: () => Promise<void>;
};

const ActiveClinicContext = createContext<ActiveClinicContextValue | undefined>(undefined);

export function ActiveClinicProvider({ children }: { children: ReactNode }) {
  const { clinicMemberships, loading: authLoading, profile, user } = useAuth();
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(null);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // platform_admin puede venir de profiles.role o, como en los datos reales hoy,
  // de una fila clinic_members.role = "platform_admin" (mismo criterio que
  // is_admin()/is_platform_admin() en la base y que AuthContext.role).
  const isPlatformAdmin =
    profile?.role === "platform_admin" ||
    clinicMemberships.some((membership) => membership.role === "platform_admin");
  const storageKey = user ? `medin.activeClinicId.${user.id}` : "";

  // Ref estable para clinicMemberships: evita que refreshClinics se re-cree
  // cada vez que AuthContext produce un nuevo array con la misma data.
  const clinicMembershipsRef = useRef(clinicMemberships);
  useEffect(() => {
    clinicMembershipsRef.current = clinicMemberships;
  }, [clinicMemberships]);

  const activeClinic = useMemo(
    () => availableClinics.find((clinic) => clinic.id === activeClinicId) ?? null,
    [activeClinicId, availableClinics]
  );

  const activeMembership = useMemo(
    () => clinicMemberships.find((membership) => membership.clinic_id === activeClinicId) ?? null,
    [activeClinicId, clinicMemberships]
  );

  const activeRole = isPlatformAdmin ? "platform_admin" : activeMembership?.role ?? null;

  const setActiveClinicId = useCallback((clinicId: string) => {
    setActiveClinicIdState(clinicId);
    if (storageKey) window.localStorage.setItem(storageKey, clinicId);
  }, [storageKey]);

  const refreshClinics = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setAvailableClinics([]);
      setActiveClinicIdState(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const allowedClinicIds = clinicMembershipsRef.current.map((membership) => membership.clinic_id);
      let clinics: Clinic[] = [];

      if (isPlatformAdmin) {
        const { data, error: clinicsError } = await supabase
          .from("clinics")
          .select("*")
          .order("name");
        if (clinicsError) throw clinicsError;
        clinics = (data ?? []) as Clinic[];
      } else if (allowedClinicIds.length > 0) {
        const { data, error: clinicsError } = await supabase
          .from("clinics")
          .select("*")
          .in("id", allowedClinicIds)
          .order("name");
        if (clinicsError) throw clinicsError;
        clinics = (data ?? []) as Clinic[];
      }

      setAvailableClinics(clinics);

      const persisted = storageKey ? window.localStorage.getItem(storageKey) : null;
      const isAllowed = (clinicId: string | null) => {
        if (!clinicId) return false;
        return isPlatformAdmin || allowedClinicIds.includes(clinicId);
      };
      const nextClinicId =
        clinics.find((clinic) => clinic.id === persisted && isAllowed(clinic.id))?.id ??
        clinics.find((clinic) => isAllowed(clinic.id))?.id ??
        null;

      setActiveClinicIdState(nextClinicId);
      if (nextClinicId && storageKey) window.localStorage.setItem(storageKey, nextClinicId);
      if (!nextClinicId && !isPlatformAdmin && clinicMembershipsRef.current.length === 0) {
        setError("No tenés una clínica asignada.");
      }
    } catch (err) {
      console.error("Failed to load active clinic", err);
      setError(err instanceof Error ? err.message : "No pudimos cargar las clínicas disponibles.");
      setAvailableClinics([]);
      setActiveClinicIdState(null);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isPlatformAdmin, storageKey, user]);

  useEffect(() => {
    refreshClinics();
  }, [refreshClinics]);

  const value = useMemo<ActiveClinicContextValue>(() => ({
    activeClinic,
    activeClinicId,
    activeMembership,
    activeRole,
    availableClinics,
    memberships: clinicMemberships,
    loading,
    error,
    setActiveClinicId,
    refreshClinics
  }), [activeClinic, activeClinicId, activeMembership, activeRole, availableClinics, clinicMemberships, error, loading, refreshClinics, setActiveClinicId]);

  return <ActiveClinicContext.Provider value={value}>{children}</ActiveClinicContext.Provider>;
}

export function useActiveClinic() {
  const value = useContext(ActiveClinicContext);
  if (!value) {
    throw new Error("useActiveClinic must be used inside ActiveClinicProvider.");
  }
  return value;
}
