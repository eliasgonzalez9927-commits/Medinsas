import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CirclePlus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";

type ScreenState = "checking" | "form" | "expired" | "missing";

function getLinkError(): string {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hashParams.get("error_code") ?? hashParams.get("error") ?? "";
}

function hadRecoveryHash(): boolean {
  return window.location.hash.includes("type=recovery");
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestEmail = searchParams.get("email") ?? "";
  const [screenState, setScreenState] = useState<ScreenState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getLinkError()) {
      setScreenState("expired");
      return;
    }

    const recoveryHashPresent = hadRecoveryHash();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreenState("form");
      }
    });

    // Red de seguridad por timing: si el evento PASSWORD_RECOVERY ya se
    // disparo antes de que este listener se suscriba, getSession() confirma
    // la sesion. Solo la habilitamos como "form" si el hash realmente traia
    // un token de recovery: una sesion normal preexistente (alguien ya
    // logueado que entra directo a esta ruta) nunca debe destrabar el form.
    supabase.auth.getSession().then(({ data }) => {
      setScreenState((current) => {
        if (current !== "checking") return current;
        return data.session && recoveryHashPresent ? "form" : "missing";
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      navigate("/login", { replace: true, state: { notice: "Contraseña actualizada. Ya podés iniciar sesión." } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar la contraseña.");
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

        {screenState === "checking" && (
          <p className="text-sm text-clinic-muted">Verificando link...</p>
        )}

        {screenState === "expired" && (
          <>
            <h1 className="text-lg font-semibold text-clinic-ink">Este link ya no es válido</h1>
            <p className="mt-2 text-sm leading-6 text-clinic-muted">
              El link para restablecer tu contraseña venció o ya fue utilizado. Pedí uno nuevo para continuar.
            </p>
            <Link
              to={requestEmail ? `/recuperar-contrasena?email=${encodeURIComponent(requestEmail)}` : "/recuperar-contrasena"}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-clinic-brand px-4 text-sm font-semibold text-white"
            >
              Pedir un nuevo link
            </Link>
          </>
        )}

        {screenState === "missing" && (
          <>
            <h1 className="text-lg font-semibold text-clinic-ink">Necesitás un link de recuperación</h1>
            <p className="mt-2 text-sm leading-6 text-clinic-muted">
              Para crear una nueva contraseña, abrí el link que te enviamos por email o pedí uno nuevo.
            </p>
            <Link
              to={requestEmail ? `/recuperar-contrasena?email=${encodeURIComponent(requestEmail)}` : "/recuperar-contrasena"}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-clinic-brand px-4 text-sm font-semibold text-white"
            >
              Pedir un nuevo link
            </Link>
          </>
        )}

        {screenState === "form" && (
          <>
            <h1 className="text-lg font-semibold text-clinic-ink">Crear nueva contraseña</h1>
            <p className="mt-2 text-sm leading-6 text-clinic-muted">
              Ingresá una nueva contraseña para recuperar el acceso a tu cuenta.
            </p>

            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-clinic-ink">Nueva contraseña</span>
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
              <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                {submitting ? "Actualizando..." : "Actualizar contraseña"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
