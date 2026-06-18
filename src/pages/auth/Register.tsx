import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signUp({ email, password, fullName, phone, role: "patient" });
      navigate("/patient/book");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-clinic-surface px-4 py-10">
      <section className="w-full max-w-xl rounded-lg border border-clinic-line bg-white p-6 shadow-soft sm:p-8">
        <h1 className="text-2xl font-semibold text-clinic-ink">Crear cuenta</h1>
        <p className="mt-2 text-clinic-muted">
          Crea un acceso paciente. Los accesos del equipo se crean desde el script seguro de administracion.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
          <label>
            <span className="text-sm font-medium text-clinic-ink">Nombre completo</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Telefono</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Contrasena</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
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
            className="flex items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creando..." : "Crear cuenta"}
            <ArrowRight size={18} />
          </button>
        </form>

        <p className="mt-6 text-sm text-clinic-muted">
          Ya tienes cuenta?{" "}
          <Link to="/login" className="font-semibold text-clinic-brand">
            Inicia sesion
          </Link>
        </p>
      </section>
    </main>
  );
}
