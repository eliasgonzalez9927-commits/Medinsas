import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getPostLoginPath } from "../../lib/auth-roles";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const notice = (location.state as { notice?: string } | null)?.notice ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const snapshot = await signIn(email, password);
      const nextPath = getPostLoginPath(snapshot.role);
      if (!nextPath || nextPath === "/patient/book") {
        setError("Sin permisos para acceder al panel.");
        return;
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6FAF9] text-[#0D3642]">
      <div className="grid min-h-screen overflow-hidden bg-white lg:grid-cols-[0.92fr_1.08fr]">
        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
          <div className="w-full max-w-[520px]">
            <div className="mb-14">
              <MedinLogo />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.32em] text-[#54aaa0]">
                Healthcare Technology
              </p>
            </div>

            <div className="max-w-[470px]">
              <h1 className="text-[2.45rem] font-semibold leading-[1.05] tracking-normal text-[#0D3642] sm:text-5xl">
                Acceso al panel
              </h1>
              <p className="mt-5 max-w-md text-base leading-8 text-slate-500 sm:text-lg">
                Ingresá con tu usuario del equipo para administrar agenda, pacientes y reservas.
              </p>
            </div>

            {notice && (
              <div className="mt-8 max-w-[470px] rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-10 max-w-[470px] space-y-6">
              <label className="block">
                <span className="text-sm font-semibold text-[#0D3642]">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="mt-3 h-14 w-full rounded-2xl border border-[#DCE8E6] bg-white px-5 text-base text-[#0D3642] shadow-[0_10px_30px_rgba(13,54,66,0.035)] outline-none transition placeholder:text-slate-400 focus:border-[#8FD2C6] focus:ring-4 focus:ring-[#8FD2C6]/25"
                  placeholder="admin@medin.local"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[#0D3642]">Contraseña</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="mt-3 h-14 w-full rounded-2xl border border-[#DCE8E6] bg-white px-5 text-base text-[#0D3642] shadow-[0_10px_30px_rgba(13,54,66,0.035)] outline-none transition placeholder:text-slate-400 focus:border-[#8FD2C6] focus:ring-4 focus:ring-[#8FD2C6]/25"
                  placeholder="••••••••"
                />
              </label>

              <Link to="/recuperar-contrasena" className="block text-sm font-semibold text-[#0D766E]">
                ¿Olvidaste tu contraseña?
              </Link>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-clinic-danger">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="group flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#064f4b] to-[#0D766E] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(13,118,110,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(13,118,110,0.28)] focus:outline-none focus:ring-4 focus:ring-[#8FD2C6]/35 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
              >
                {submitting ? "Ingresando..." : "Ingresar"}
                <ArrowRight className="transition group-hover:translate-x-1" size={21} />
              </button>
            </form>

            <p className="mt-9 max-w-[470px] text-base leading-7 text-slate-500">
              Los accesos del equipo son creados por administración.
            </p>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_70%_18%,rgba(143,210,198,0.46),transparent_30%),linear-gradient(135deg,#F6FAF9_0%,#E6F4F1_45%,#0D3642_118%)] px-16 py-16 lg:flex lg:items-center">
          <OrbitalMark />
          <div className="relative z-10 ml-4 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.34em] text-[#54aaa0]">
              Plataforma Medin
            </p>
            <h2 className="mt-10 text-5xl font-semibold leading-[1.14] tracking-normal text-[#0D3642] xl:text-6xl">
              Agenda, pacientes y operación clínica{" "}
              <span className="text-[#0D766E]">en una sola vista.</span>
            </h2>
          </div>
        </aside>
      </div>
    </main>
  );
}

function MedinLogo() {
  return (
    <div className="flex items-center gap-4" aria-label="Medin">
      <svg className="h-16 w-16 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path
          d="M46.8 12.2A25 25 0 1 0 52.9 42"
          stroke="#0D3642"
          strokeWidth="4.8"
          strokeLinecap="round"
        />
        <path
          d="M46.8 12.2A25 25 0 0 1 52.9 42"
          stroke="#8FD2C6"
          strokeWidth="4.8"
          strokeLinecap="round"
        />
        <circle cx="52" cy="14" r="3.4" fill="#8FD2C6" />
        <path d="M32 25v14M25 32h14" stroke="#8FD2C6" strokeWidth="4.2" strokeLinecap="round" />
      </svg>
      <span className="text-5xl font-light tracking-[-0.03em] text-[#0D3642]">Medin</span>
    </div>
  );
}

function OrbitalMark() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute -right-28 -top-44 h-[680px] w-[680px] rounded-full border border-dashed border-[#8FD2C6]/60" />
      <div className="absolute -right-44 -top-32 h-[560px] w-[560px] rounded-full border border-[#8FD2C6]/30" />
      <div className="absolute right-28 top-72 h-8 w-8 rounded-full bg-[#8FD2C6]/55 shadow-[0_0_34px_rgba(143,210,198,0.7)]" />
      <div className="absolute -right-20 top-16 grid h-80 w-80 place-items-center rounded-full bg-[#8FD2C6]/20 shadow-[inset_0_0_80px_rgba(13,54,66,0.08)]">
        <span className="text-8xl font-semibold leading-none text-[#8FD2C6]">+</span>
      </div>
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-tl-full bg-[#0D3642]/18 blur-3xl" />
    </div>
  );
}
