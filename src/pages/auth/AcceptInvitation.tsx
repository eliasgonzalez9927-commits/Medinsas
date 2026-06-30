import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, CirclePlus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { acceptInvitation, getInvitation, InvitationDetails } from "../../lib/invitations";
import { roleLabels } from "../../lib/auth-roles";

type ViewState = "loading" | "valid" | "not_found" | "expired" | "used" | "cancelled" | "error";

export function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<ViewState>("loading");
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("not_found");
      return;
    }
    getInvitation(token)
      .then((data) => {
        setInvitation(data);
        setState("valid");
      })
      .catch((err) => {
        const code = err instanceof Error ? err.message : "";
        if (code === "INVITATION_EXPIRED") setState("expired");
        else if (code === "INVITATION_ALREADY_USED") setState("used");
        else if (code === "INVITATION_CANCELLED") setState("cancelled");
        else if (code === "INVITATION_NOT_FOUND") setState("not_found");
        else setState("error");
      });
  }, [token]);

  const hasSession = Boolean(user);
  const sessionEmailMatches = Boolean(
    invitation && user?.email && user.email.toLowerCase() === invitation.email.toLowerCase()
  );
  const canAcceptExistingAccount = Boolean(invitation?.emailHasAccount) && hasSession && sessionEmailMatches;
  const emailMismatch = Boolean(invitation?.emailHasAccount) && hasSession && !sessionEmailMatches;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (invitation?.emailHasAccount) {
      if (!canAcceptExistingAccount) return;
    } else {
      if (password.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden.");
        return;
      }
    }
    setSubmitting(true);
    try {
      await acceptInvitation(token, invitation?.emailHasAccount ? undefined : password);
      setAccepted(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = code === "LOGIN_REQUIRED"
        ? "Necesitás iniciar sesión para aceptar esta invitación."
        : code === "EMAIL_MISMATCH"
          ? "Esta invitación corresponde a otra cuenta. Cerrá sesión e ingresá con el email invitado."
          : code === "INVITATION_ALREADY_USED"
            ? "Esta invitación ya fue aceptada."
            : code === "INVITATION_CANCELLED"
              ? "Esta invitación fue cancelada."
              : code === "INVITATION_EXPIRED"
                ? "Esta invitación venció."
                : "No pudimos aceptar la invitación.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-clinic-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-clinic-line bg-white p-8 shadow-[0_18px_42px_rgba(13,54,66,0.08)]">
        <Link to="/" className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[#8fd2c6] bg-[#e6f4f1] text-clinic-brand">
            <CirclePlus size={23} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-lg font-semibold text-clinic-ink">Medin</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5e9f98]">Gestión clínica</p>
          </div>
        </Link>

        {state === "loading" && <p className="text-sm text-clinic-muted">Validando invitación...</p>}

        {state === "not_found" && (
          <Message title="Invitación no encontrada" text="Este link no es válido. Pedile a quien te invitó que te envíe una nueva invitación." />
        )}
        {state === "expired" && (
          <Message title="Invitación vencida" text="Esta invitación venció. Pedile a quien te invitó que te envíe una nueva." />
        )}
        {state === "used" && (
          <Message title="Invitación ya utilizada" text="Esta invitación ya fue aceptada anteriormente. Si ya tenés cuenta, iniciá sesión." />
        )}
        {state === "cancelled" && (
          <Message title="Invitación cancelada" text="Quien te invitó canceló esta invitación. Pedile que te envíe una nueva si corresponde." />
        )}
        {state === "error" && (
          <Message title="No pudimos validar la invitación" text="Intentá de nuevo en unos minutos." />
        )}

        {state === "valid" && invitation && !accepted && (
          <>
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-clinic-line bg-clinic-surface p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e6f4f1] text-clinic-brand">
                <Building2 size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-clinic-ink">{invitation.clinicName}</p>
                <p className="text-xs text-clinic-muted">Rol asignado: {roleLabels[invitation.role] ?? invitation.role}</p>
              </div>
            </div>

            <h1 className="text-lg font-semibold text-clinic-ink">Hola {invitation.fullName}</h1>

            {invitation.emailHasAccount ? (
              <>
                {!hasSession && (
                  <>
                    <p className="mt-2 text-sm leading-6 text-clinic-muted">
                      Esta invitación se asociará a tu cuenta existente. Iniciá sesión para continuar.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-clinic-muted">
                      ¿No recordás tu contraseña?{" "}
                      <Link
                        to={`/recuperar-contrasena?email=${encodeURIComponent(invitation.email)}`}
                        className="font-semibold text-clinic-brand"
                      >
                        Restablecer contraseña
                      </Link>
                    </p>
                  </>
                )}
                {emailMismatch && (
                  <p className="mt-2 text-sm leading-6 text-clinic-muted">
                    Esta invitación corresponde a otra cuenta. Cerrá sesión e ingresá con el email invitado.
                  </p>
                )}
                {canAcceptExistingAccount && (
                  <p className="mt-2 text-sm leading-6 text-clinic-muted">
                    Confirmá para asociar tu cuenta a esta clínica con el rol indicado.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-clinic-muted">Creá tu acceso a Medin.</p>
            )}

            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            {invitation.emailHasAccount && !canAcceptExistingAccount ? (
              <>
                <Link
                  to="/login"
                  className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-clinic-brand px-4 text-sm font-semibold text-white"
                >
                  Ir a iniciar sesión
                </Link>
                {!hasSession && (
                  <p className="mt-3 text-xs text-clinic-muted">
                    Después de iniciar sesión, volvé a abrir este mismo link desde el email para aceptar la invitación.
                  </p>
                )}
              </>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {!invitation.emailHasAccount && (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-clinic-ink">Nombre completo</span>
                      <input
                        type="text"
                        value={invitation.fullName}
                        disabled
                        className="mt-2 h-11 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 text-sm text-clinic-muted"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-clinic-ink">Email</span>
                      <input
                        type="email"
                        value={invitation.email}
                        disabled
                        className="mt-2 h-11 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 text-sm text-clinic-muted"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-clinic-ink">Contraseña</span>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="mt-2 h-11 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-clinic-ink">Confirmar contraseña</span>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="mt-2 h-11 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                      />
                    </label>
                  </>
                )}
                <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                  {submitting ? "Procesando..." : invitation.emailHasAccount ? "Aceptar invitación" : "Crear mi acceso"}
                </Button>
              </form>
            )}
          </>
        )}

        {accepted && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={24} />
            </span>
            <h1 className="text-lg font-semibold text-clinic-ink">Invitación aceptada</h1>
            <p className="text-sm text-clinic-muted">Ya podés iniciar sesión. Te vamos a redirigir en un momento.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-4">
      <h1 className="text-lg font-semibold text-clinic-ink">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-clinic-muted">{text}</p>
      <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-clinic-brand">
        Ir al login
      </Link>
    </div>
  );
}
