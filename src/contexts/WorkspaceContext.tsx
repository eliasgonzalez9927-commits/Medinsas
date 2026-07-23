import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { getDefaultClinic } from "../lib/clinic-data";
import { Clinic } from "../types/clinic";

type WorkspaceContextValue = {
  clinic: Clinic | null;
  modules: Record<string, boolean>;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, clinicMembership } = useAuth();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setClinic(null);
      setModules({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    async function loadWorkspace() {
      // getDefaultClinic() respeta el override de "Cambiar clinica" (localStorage) -
      // no se puede derivar directo de clinicMembership.clinic_id, que siempre apunta
      // a la membresia propia del usuario, no a la clinica que eligio ver.
      const resolvedClinic = await getDefaultClinic();
      if (cancelled) return;
      if (!resolvedClinic) {
        setClinic(null);
        setModules({});
        setLoading(false);
        return;
      }
      const { data: moduleRows } = await supabase
        .from("clinic_modules")
        .select("module_key, enabled")
        .eq("clinic_id", resolvedClinic.id);
      if (cancelled) return;
      setClinic(resolvedClinic);
      setModules(Object.fromEntries((moduleRows ?? []).map((item: { module_key: string; enabled: boolean }) => [item.module_key, item.enabled])));
      setLoading(false);
    }
    loadWorkspace();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, clinicMembership?.clinic_id]);

  return <WorkspaceContext.Provider value={{ clinic, modules, loading }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return value;
}
