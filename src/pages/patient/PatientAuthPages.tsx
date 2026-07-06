import { FormEvent, ReactNode, useState } from "react";
import { ArrowRight, HeartPulse, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function PatientLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signOut } = useAuth();
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
      if (snapshot.role !== "patient") {
        await signOut();
        setError("Este acceso corresponde al equipo de la clinica. Usa el login administrativo.");
        return;
      }
      navigate("/paciente", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PatientAuthShell
      eyebrow="Mi Medin"
      title="Entrá a tu portal de paciente"
      description="Consultá tus turnos, reservá una nueva atención y mantené tus datos actualizados desde un espacio simple y seguro."
    >
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        <PatientInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="tu@email.com"
          required
        />
        <PatientInput
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          required
        />

        <Link to="/recuperar-contrasena" className="text-sm font-semibold text-clinic-brand">
          Olvidé mi contraseña
        </Link>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Ingresando..." : "Ingresar a Mi Medin"}
          <ArrowRight size={18} />
        </button>
      </form>

      <p className="text-sm text-clinic-muted">
        ¿Todavía no tenés cuenta?{" "}
        <Link to="/paciente/registro" className="font-semibold text-clinic-brand">
          Crear acceso paciente
        </Link>
      </p>
    </PatientAuthShell>
  );
}

export function PatientRegisterPage() {
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
      navigate("/paciente/login", {
        replace: true,
        state: { notice: "Cuenta paciente creada. Revisá tu email si la clínica requiere confirmación." }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PatientAuthShell
      eyebrow="Portal del Paciente"
      title="Creá tu acceso a Medin"
      description="Este acceso es solo para pacientes. Las cuentas del equipo de la clínica se gestionan desde el panel administrativo."
    >
      <form onSubmit={handleSubmit} className="grid gap-5">
        <PatientInput label="Nombre completo" value={fullName} onChange={setFullName} required />
        <PatientInput label="Teléfono" value={phone} onChange={setPhone} placeholder="+54 261..." />
        <PatientInput label="Email" type="email" value={email} onChange={setEmail} required />
        <PatientInput
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          minLength={8}
          required
        />

        <div className="rounded-lg border border-teal-200 bg-[#E6F4F1] px-4 py-3 text-sm leading-6 text-teal-900">
          El portal no muestra historia clínica ni datos médicos sensibles en esta versión.
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creando cuenta..." : "Crear cuenta paciente"}
          <ArrowRight size={18} />
        </button>
      </form>

      <p className="text-sm text-clinic-muted">
        ¿Ya tenés cuenta?{" "}
        <Link to="/paciente/login" className="font-semibold text-clinic-brand">
          Ingresar
        </Link>
      </p>
    </PatientAuthShell>
  );
}

function PatientAuthShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#F6FAF9] text-clinic-ink">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
          <div className="w-full max-w-md rounded-2xl border border-clinic-line bg-white p-6 shadow-soft sm:p-8">
            <Link to="/" className="mb-8 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-clinic-brand text-white">
                <HeartPulse size={22} />
              </span>
              <span>
                <span className="block text-xl font-semibold leading-none">Medin</span>
                <span className="mt-1 block text-xs font-medium text-clinic-muted">Mi Medin</span>
              </span>
            </Link>

            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#54AAA0]">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-clinic-ink">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-clinic-muted">{description}</p>

            <div className="mt-8 grid gap-5">{children}</div>
          </div>
        </section>

        <aside className="hidden bg-[linear-gradient(135deg,#E6F4F1_0%,#F6FAF9_48%,#0D3642_140%)] px-12 py-14 lg:flex lg:items-center">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/70 px-4 py-2 text-sm font-semibold text-clinic-brand">
              <ShieldCheck size={16} />
              Acceso paciente separado del panel del equipo
            </div>
            <h2 className="mt-8 text-5xl font-semibold leading-tight tracking-normal text-clinic-ink">
              Tus turnos y datos personales, en un lugar claro.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Una experiencia pensada para pacientes: menos pasos, información operativa y sin exponer contenido clínico sensible.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function PatientInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  minLength
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-clinic-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="mt-2 h-12 w-full rounded-lg border border-clinic-line bg-white px-4 text-clinic-ink outline-none transition placeholder:text-slate-400 focus:border-[#8FD2C6] focus:ring-4 focus:ring-[#8FD2C6]/25"
      />
    </label>
  );
}
