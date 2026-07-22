import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, HeartPulse } from "lucide-react";
import { supabase } from "../../lib/supabase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/restablecer-contrasena`
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar el email.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#F6FAF9] px-4 text-[#0D3642]">
      <div className="w-full max-w-md rounded-2xl border border-clinic-line bg-white p-6 shadow-soft sm:p-8">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-clinic-brand text-white">
            <HeartPulse size={22} />
          </span>
          <span className="text-xl font-semibold">Medin</span>
        </Link>

        <h1 className="text-2xl font-semibold text-clinic-ink">Recuperar contraseña</h1>
        <p className="mt-2 text-sm leading-6 text-clinic-muted">
          Ingresá el email de tu cuenta y te mandamos un link para elegir una nueva contraseña.
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Si ese email tiene una cuenta en Medin, te llegó un link para restablecer la contraseña. Revisá tu bandeja de entrada (y spam).
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
            <label className="block">
              <span className="text-sm font-semibold text-clinic-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-2 h-12 w-full rounded-lg border border-clinic-line bg-white px-4 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="tu@email.com"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar link de recuperación"}
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-clinic-brand">
          <Link to="/paciente/login" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Volver al login de paciente
          </Link>
          <Link to="/login" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Volver al login del equipo
          </Link>
        </div>
      </div>
    </main>
  );
}
