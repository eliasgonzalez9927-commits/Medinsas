import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-clinic-surface lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex items-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-clinic-brand text-white">
              <Activity />
            </span>
            <div>
              <p className="text-xl font-semibold text-clinic-ink">ClinicOS</p>
              <p className="text-sm text-clinic-muted">Gestion clinica modular</p>
            </div>
          </div>

          <h1 className="text-3xl font-semibold tracking-normal text-clinic-ink">
            Accede a tu portal
          </h1>
          <p className="mt-3 text-clinic-muted">
            Reserva turnos, registra triaje previo o administra la agenda de la clinica.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-clinic-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-clinic-line bg-white px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="paciente@clinica.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-clinic-ink">Contrasena</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-clinic-line bg-white px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-clinic-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Ingresando..." : "Ingresar"}
              <ArrowRight size={18} />
            </button>
          </form>

          <p className="mt-6 text-sm text-clinic-muted">
            No tienes cuenta?{" "}
            <Link to="/register" className="font-semibold text-clinic-brand">
              Registrate
            </Link>
          </p>
        </div>
      </section>
      <aside className="hidden bg-clinic-ink px-12 py-16 text-white lg:flex lg:items-end">
        <div className="max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-200">
            MVP para clinicas
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal">
            Reservas, triaje inicial y seguimiento operativo en una sola vista.
          </h2>
        </div>
      </aside>
    </main>
  );
}
