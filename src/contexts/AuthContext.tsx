import { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ClinicMember, Profile, UserRole } from "../types/database";

type AuthSnapshot = {
  profile: Profile | null;
  clinicMembership: ClinicMember | null;
  role: UserRole | null;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  clinicMembership: ClinicMember | null;
  role: UserRole | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthSnapshot>;
  signUp: (payload: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: UserRole;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

async function fetchClinicMembership(userId: string) {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("id, clinic_id, user_id, role, active, professional_id, created_at, updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ClinicMember | null;
}

async function fetchAuthSnapshot(userId: string): Promise<AuthSnapshot> {
  const [profile, clinicMembership] = await Promise.all([
    fetchProfile(userId),
    fetchClinicMembership(userId)
  ]);
  return {
    profile,
    clinicMembership,
    role: clinicMembership?.role ?? profile?.role ?? null
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clinicMembership, setClinicMembership] = useState<ClinicMember | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  function applySnapshot(snapshot: AuthSnapshot) {
    setProfile(snapshot.profile);
    setClinicMembership(snapshot.clinicMembership);
    setRole(snapshot.role);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        applySnapshot(await fetchAuthSnapshot(data.session.user.id));
      }
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        applySnapshot(await fetchAuthSnapshot(nextSession.user.id));
      } else {
        applySnapshot({ profile: null, clinicMembership: null, role: null });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      clinicMembership,
      role,
      loading,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user) return { profile: null, clinicMembership: null, role: null };
        const snapshot = await fetchAuthSnapshot(data.user.id);
        applySnapshot(snapshot);
        return snapshot;
      },
      async signUp({ email, password, fullName, phone, role }) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone,
              role
            }
          }
        });
        if (error) throw error;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    }),
    [clinicMembership, loading, profile, role, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
