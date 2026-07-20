import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getPostLoginPath, roleLabels } from "../../lib/auth-roles";
import { acceptUserInvitation, getInvitationByToken } from "../../lib/clinic-data";
import { UserRole } from "../../types/database";

type InvitationPreview = {
  full_name: string;
  email: string;
  role: string;
  clinic_name: string;
  account_exists: boolean;
};

export function AcceptInvitationPage() {
  const { token = "" } = useParams();
  const { signIn, signUp } = useAuth();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState("");

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getInvitationByToken(token);
        if (cancelled) return;
        setInvitation(data);
        setFullName(data.full_name);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "No pudimos cargar la invitación.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setFormError("");
    setSubmitting(true);
    try {
      if (invitation.account_exists) {
        await signIn(invitation.email, password);
      } else {
        await signUp({ email: invitation.email, password, fullName, role: "patient" as UserRole });
      }
      const result = await acceptUserInvitation(token);
      setAccepted(true);
      // Fuerza una recarga completa para que el contexto de auth
      // vuelva a resolver clinicMembership - la membresia recien se
      // creo en accept_user_invitation, y el snapshot de signIn/signUp
      // es de antes de eso.
      window.setTimeout(() => {
        window.location.href = getPostLoginPath(result.role as UserRole) ?? "/admin";
      }, 1200);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No pudimos completar la acción.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6FAF9] text-[#0D3642]">
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[480px] rounded-3xl border border-[#DCE8E6] bg-white p-10 shadow-[0_20px_50px_rgba(13,54,66,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#54aaa0]">Medin</p>

          {loading && <p className="mt-6 text-sm text-slate-500">Cargando invitación...</p>}

          {!loading && loadError && (
            <>
              <h1 className="mt-4 text-2xl font-semibold text-[#0D3642]">No pudimos abrir esta invitación</h1>
              <p className="mt-3 text-sm text-slate-500">{loadError}</p>
            </>
          )}

          {!loading && invitation && !accepted && (
            <>
              <h1 className="mt-4 text-2xl font-semibold text-[#0D3642]">
                Te invitaron a {invitation.clinic_name}
              </h1>
              <p className="mt-3 text-sm text-slate-500">
                Rol: <span className="font-semibold text-[#0D3642]">{roleLabels[invitation.role as UserRole] ?? invitation.role}</span>
                <br />
                Email: <span className="font-semibold text-[#0D3642]">{invitation.email}</span>
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {!invitation.account_exists && (
                  <label className="block">
                    <span className="text-sm font-semibold text-[#0D3642]">Tu nombre</span>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                      className="mt-2 h-12 w-full rounded-xl border border-[#DCE8E6] bg-white px-4 text-sm outline-none focus:border-[#8FD2C6] focus:ring-4 focus:ring-[#8FD2C6]/25"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-sm font-semibold text-[#0D3642]">
                    {invitation.account_exists ? "Contraseña" : "Creá una contraseña"}
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="mt-2 h-12 w-full rounded-xl border border-[#DCE8E6] bg-white px-4 text-sm outline-none focus:border-[#8FD2C6] focus:ring-4 focus:ring-[#8FD2C6]/25"
                    placeholder="••••••••"
                  />
                </label>

                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-clinic-danger">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#064f4b] to-[#0D766E] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(13,118,110,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                >
                  {submitting ? "Un momento..." : invitation.account_exists ? "Iniciar sesión y unirme" : "Crear cuenta y unirme"}
                  <ArrowRight className="transition group-hover:translate-x-1" size={18} />
                </button>
              </form>
            </>
          )}

          {accepted && (
            <>
              <h1 className="mt-4 text-2xl font-semibold text-[#0D3642]">¡Listo!</h1>
              <p className="mt-3 text-sm text-slate-500">Te unimos a la clínica. Redirigiendo...</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
