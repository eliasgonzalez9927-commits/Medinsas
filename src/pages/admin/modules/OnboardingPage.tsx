import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, CheckCircle2, CircleDashed, ReceiptText, WalletCards } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { Button } from "../../../components/ui/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { finishClinicOnboarding, finishMemberOnboarding, getDefaultClinic } from "../../../lib/clinic-data";
import { getOnboardingProgress, getProfessionalOnboardingProgress } from "../../../lib/superadmin-data";
import { ClinicMember } from "../../../types/database";

type Step = { stepKey: string; label: string; status: string; to: string; summary: string };
type Progress = { steps: Step[]; percent: number };

export function OnboardingPage() {
  const { role, clinicMembership } = useAuth();
  if (role === "professional" || role === "doctor") return <ProfessionalOnboarding clinicMembership={clinicMembership} />;
  if (role === "receptionist") return <ReceptionistOnboarding clinicMembership={clinicMembership} />;
  return <AdminOnboarding />;
}

function AdminOnboarding() {
  const navigate = useNavigate();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  async function load() {
    try {
      const clinic = await getDefaultClinic();
      if (!clinic) return;
      setClinicId(clinic.id);
      setProgress(await getOnboardingProgress(clinic.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar onboarding.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const readyToFinish = progress?.steps.find((item) => item.stepKey === "finish")?.status === "completed";

  async function handleFinish() {
    if (!clinicId) return;
    setFinishing(true);
    setError("");
    try {
      await finishClinicOnboarding(clinicId);
      navigate("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos finalizar el onboarding.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <AdminPageShell
      description="Checklist asistido para dejar la clínica lista para operar."
      eyebrow="Onboarding"
      onRefresh={load}
      onCreateAppointment={() => navigate("/admin/agenda")}
      title="Puesta en marcha"
    >
      {error && <ErrorBanner text={error} />}
      <ProgressHeader percent={progress?.percent ?? 0} />
      <ChecklistSteps steps={progress?.steps ?? []} />
      {readyToFinish && (
        <Button onClick={handleFinish} disabled={finishing} variant="primary">
          {finishing ? "Finalizando..." : "Finalizar"}
        </Button>
      )}
    </AdminPageShell>
  );
}

function ProfessionalOnboarding({ clinicMembership }: { clinicMembership: ClinicMember | null }) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  async function load() {
    if (!clinicMembership?.professional_id) return;
    try {
      setProgress(await getProfessionalOnboardingProgress(clinicMembership.professional_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar onboarding.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicMembership?.professional_id]);

  const readyToFinish = progress?.steps.find((item) => item.stepKey === "finish")?.status === "completed";

  async function handleFinish() {
    if (!clinicMembership) return;
    setFinishing(true);
    setError("");
    try {
      await finishMemberOnboarding(clinicMembership.id);
      navigate("/admin/mi-agenda");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos finalizar el onboarding.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <AdminPageShell
      description="Checklist para dejar tu perfil listo para atender."
      eyebrow="Onboarding"
      onRefresh={load}
      title="Puesta en marcha"
    >
      {error && <ErrorBanner text={error} />}
      <ProgressHeader percent={progress?.percent ?? 0} />
      <ChecklistSteps steps={progress?.steps ?? []} />
      {readyToFinish && (
        <Button onClick={handleFinish} disabled={finishing} variant="primary">
          {finishing ? "Finalizando..." : "Finalizar"}
        </Button>
      )}
    </AdminPageShell>
  );
}

const RECEPTIONIST_TOUR_CARDS = [
  { icon: CalendarDays, title: "Agenda", text: "Confirmá, cancelá o reprogramá turnos, y marcá ausencias desde ahí." },
  { icon: WalletCards, title: "Pagos", text: "Registrá pagos manuales o revisá los que se cobraron por Mercado Pago." },
  { icon: ReceiptText, title: "Facturación", text: "Emití el comprobante de un pago acreditado con un click, cuando la clínica lo pida." }
];

function ReceptionistOnboarding({ clinicMembership }: { clinicMembership: ClinicMember | null }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  async function handleFinish() {
    if (!clinicMembership) return;
    setFinishing(true);
    setError("");
    try {
      await finishMemberOnboarding(clinicMembership.id);
      navigate("/admin/agenda");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <AdminPageShell description="Un repaso rápido de dónde está cada cosa." eyebrow="Onboarding" title="Bienvenida/o a Medin">
      {error && <ErrorBanner text={error} />}
      <section className="grid gap-3 md:grid-cols-3">
        {RECEPTIONIST_TOUR_CARDS.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
              <Icon size={20} />
            </div>
            <h3 className="mt-3 font-semibold text-clinic-ink">{title}</h3>
            <p className="mt-1 text-sm text-clinic-muted">{text}</p>
          </article>
        ))}
      </section>
      <Button onClick={handleFinish} disabled={finishing} variant="primary">
        {finishing ? "Guardando..." : "Listo, entendido"}
      </Button>
    </AdminPageShell>
  );
}

function ProgressHeader({ percent }: { percent: number }) {
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold text-clinic-ink">Progreso de onboarding</h2>
          <p className="mt-1 text-sm text-clinic-muted">Basado en datos reales cargados en Medin.</p>
        </div>
        <p className="text-3xl font-semibold text-clinic-brand">{percent}%</p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-clinic-surface">
        <div className="h-full rounded-full bg-clinic-brand" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}

function ChecklistSteps({ steps }: { steps: Step[] }) {
  const visibleSteps = steps.filter((item) => item.stepKey !== "finish");
  return (
    <section className="grid gap-3">
      {visibleSteps.map((step, index) => {
        const done = step.status === "completed";
        const Icon = done ? CheckCircle2 : CircleDashed;
        return (
          <article key={step.stepKey} className="flex flex-col gap-3 rounded-lg border border-clinic-line bg-white p-4 shadow-sm md:flex-row md:items-center">
            <div className={`grid h-10 w-10 place-items-center rounded-lg ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <Icon size={20} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-clinic-ink">{index + 1}. {step.label}</p>
              <p className="mt-1 text-sm text-clinic-muted">{step.summary}</p>
            </div>
            <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {done ? "Completo" : "Pendiente"}
            </span>
            <Link className="text-sm font-semibold text-clinic-brand" to={step.to}>Configurar</Link>
          </article>
        );
      })}
    </section>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{text}</div>;
}
