import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, HeartPulse } from "lucide-react";
import { supabase } from "../../lib/supabase";

export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      await supabase.auth.signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar la contraseña.");
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

        <h1 className="text-2xl font-semibold text-clinic-ink">Elegí una nueva contraseña</h1>

        {done ? (
          <div className="mt-6 grid gap-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Contraseña actualizada. Ya podés iniciar sesión.
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-clinic-brand">
              <Link to="/paciente/login">Ingresar como paciente</Link>
              <Link to="/login">Ingresar al panel del equipo</Link>
            </div>
          </div>
        ) : !ready ? (
          <p className="mt-4 text-sm leading-6 text-clinic-muted">
            Este link ya no es válido o expiró. Pedí uno nuevo desde{" "}
            <Link to="/recuperar-contrasena" className="font-semibold text-clinic-brand">
              recuperar contraseña
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
            <label className="block">
              <span className="text-sm font-semibold text-clinic-ink">Nueva contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
                className="mt-2 h-12 w-full rounded-lg border border-clinic-line bg-white px-4 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="••••••••"
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
              {submitting ? "Guardando..." : "Guardar nueva contraseña"}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
