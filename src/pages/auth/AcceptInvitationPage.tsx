import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
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
  const { session, signUp } = useAuth();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState("");

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [accepted, setAccepted] = useState(false);

  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);
  const [autoAccepting, setAutoAccepting] = useState(false);

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

  // Si ya existe una cuenta con este email, el camino sin friccion es un
  // link magico (sin contraseña) en vez de pedirle una contraseña vieja
  // que capaz no recuerda (ej. si esa cuenta viene de haber sido paciente
  // antes) - Supabase abre esta misma URL con la sesion ya activa despues
  // de que la persona clickea el link del mail, y esto acepta la
  // invitacion solo, sin que tenga que tocar nada mas.
  useEffect(() => {
    if (!invitation || accepted || autoAccepting) return;
    if (!session?.user?.email) return;
    if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) return;

    let cancelled = false;
    async function autoAccept() {
      setAutoAccepting(true);
      setFormError("");
      try {
        const result = await acceptUserInvitation(token);
        if (cancelled) return;
        setAccepted(true);
        window.setTimeout(() => {
          window.location.href = getPostLoginPath(result.role as UserRole) ?? "/admin";
        }, 1200);
      } catch (err) {
        if (!cancelled) setFormError(err instanceof Error ? err.message : "No pudimos completar la acción.");
      } finally {
        if (!cancelled) setAutoAccepting(false);
      }
    }
    autoAccept();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email, invitation, accepted]);

  async function handleSendMagicLink() {
    if (!invitation) return;
    setFormError("");
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: invitation.email,
        options: { emailRedirectTo: window.location.href }
      });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No pudimos enviar el link.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setFormError("");
    setSubmitting(true);
    try {
      if (invitation.account_exists) {
        const { error } = await supabase.auth.signInWithPassword({ email: invitation.email, password });
        if (error) throw error;
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

          {(loading || autoAccepting) && (
            <p className="mt-6 text-sm text-slate-500">{autoAccepting ? "Uniéndote a la clínica..." : "Cargando invitación..."}</p>
          )}

          {!loading && loadError && (
            <>
              <h1 className="mt-4 text-2xl font-semibold text-[#0D3642]">No pudimos abrir esta invitación</h1>
              <p className="mt-3 text-sm text-slate-500">{loadError}</p>
            </>
          )}

          {!loading && !autoAccepting && invitation && !accepted && (
            <>
              <h1 className="mt-4 text-2xl font-semibold text-[#0D3642]">
                Te invitaron a {invitation.clinic_name}
              </h1>
              <p className="mt-3 text-sm text-slate-500">
                Rol: <span className="font-semibold text-[#0D3642]">{roleLabels[invitation.role as UserRole] ?? invitation.role}</span>
                <br />
                Email: <span className="font-semibold text-[#0D3642]">{invitation.email}</span>
              </p>

              {formError && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-clinic-danger">
                  {formError}
                </div>
              )}

              {invitation.account_exists && !showPasswordFallback ? (
                magicLinkSent ? (
                  <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    Te mandamos un link a <strong>{invitation.email}</strong>. Abrilo desde tu correo (y revisá spam) para entrar y unirte automáticamente.
                  </div>
                ) : (
                  <div className="mt-8 space-y-4">
                    <p className="text-sm text-slate-500">
                      Este email ya tiene una cuenta en Medin. Te mandamos un link para entrar sin necesidad de contraseña.
                    </p>
                    <button
                      onClick={handleSendMagicLink}
                      disabled={submitting}
                      className="group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#064f4b] to-[#0D766E] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(13,118,110,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                    >
                      {submitting ? "Enviando..." : "Enviarme un link para entrar"}
                      <ArrowRight className="transition group-hover:translate-x-1" size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasswordFallback(true)}
                      className="block text-sm font-semibold text-[#0D766E]"
                    >
                      Prefiero usar mi contraseña
                    </button>
                  </div>
                )
              ) : (
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

                  {invitation.account_exists && (
                    <Link
                      to={`/recuperar-contrasena?email=${encodeURIComponent(invitation.email)}`}
                      onClick={() => window.localStorage.setItem("medin_invitation_return_url", window.location.href)}
                      className="block text-sm font-semibold text-[#0D766E]"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#064f4b] to-[#0D766E] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(13,118,110,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {submitting ? "Un momento..." : invitation.account_exists ? "Iniciar sesión y unirme" : "Crear cuenta y unirme"}
                    <ArrowRight className="transition group-hover:translate-x-1" size={18} />
                  </button>
                  {invitation.account_exists && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordFallback(false)}
                      className="block text-sm font-semibold text-[#0D766E]"
                    >
                      Volver a enviarme un link
                    </button>
                  )}
                </form>
              )}
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
