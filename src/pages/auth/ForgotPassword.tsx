import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CirclePlus, MailCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";

export function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/restablecer-contrasena`
      });
    } catch {
      // No revelamos si el email existe o no: el mensaje de exito es siempre
      // el mismo, tanto si Supabase encontro la cuenta como si no.
    } finally {
      setSent(true);
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

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <MailCheck size={24} />
            </span>
            <h1 className="text-lg font-semibold text-clinic-ink">Revisá tu email</h1>
            <p className="text-sm text-clinic-muted">
              Si el email existe en Medin, te enviaremos un link para restablecer tu contraseña.
            </p>
            <p className="text-sm text-clinic-muted">
              Después de cambiar tu contraseña, volvé a abrir el link de invitación que recibiste por email.
            </p>
            <Link to="/login" className="mt-3 text-sm font-semibold text-clinic-brand">
              Volver al login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-clinic-ink">Recuperar acceso</h1>
            <p className="mt-2 text-sm leading-6 text-clinic-muted">
              Ingresá tu email y te enviaremos un link seguro para crear una nueva contraseña.
            </p>

            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-clinic-ink">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                {submitting ? "Enviando..." : "Enviar link de recuperación"}
              </Button>
            </form>

            <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-clinic-brand">
              Volver al login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
