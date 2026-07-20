import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { Clinic } from "../types/clinic";

type WorkspaceContextValue = {
  clinic: Clinic | null;
  modules: Record<string, boolean>;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { clinicMembership } = useAuth();
  const clinicId = clinicMembership?.clinic_id ?? null;
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicId) {
      setClinic(null);
      setModules({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    async function loadWorkspace() {
      const [{ data: clinicRow }, { data: moduleRows }] = await Promise.all([
        supabase.from("clinics").select("*").eq("id", clinicId).maybeSingle(),
        supabase.from("clinic_modules").select("module_key, enabled").eq("clinic_id", clinicId)
      ]);
      if (cancelled) return;
      setClinic((clinicRow as Clinic) ?? null);
      setModules(Object.fromEntries((moduleRows ?? []).map((item: { module_key: string; enabled: boolean }) => [item.module_key, item.enabled])));
      setLoading(false);
    }
    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  return <WorkspaceContext.Provider value={{ clinic, modules, loading }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return value;
}
