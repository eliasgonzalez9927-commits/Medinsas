import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, CheckCircle2, CircleDashed, ReceiptText, WalletCards } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { Button } from "../../../components/ui/Button";
import { InfoTooltip } from "../../../components/ui/InfoTooltip";
import { useAuth } from "../../../contexts/AuthContext";
import { finishClinicOnboarding, finishMemberOnboarding, getDefaultClinic } from "../../../lib/clinic-data";
import { getOnboardingProgress, getProfessionalOnboardingProgress } from "../../../lib/superadmin-data";
import { ClinicMember } from "../../../types/database";

type Step = { stepKey: string; label: string; status: string; to: string; summary: string };
type Progress = { steps: Step[]; percent: number };

// "Ver más tarde" no marca el onboarding como terminado (a diferencia de
// "Finalizar") - solo evita que AdminLayout vuelva a interceptar el
// aterrizaje en /admin en esta misma sesion, para poder ver el dashboard
// sin perder el checklist (la proxima vez que inicie sesion, vuelve a
// aparecer).
function skipForNow(navigate: (path: string) => void, path: string) {
  window.sessionStorage.setItem("medin_onboarding_skip", "true");
  navigate(path);
}

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

  // A partir del 50% ya se puede terminar el onboarding y explorar el
  // resto de la app - no hace falta completar los 8 pasos para salir del
  // checklist, se puede volver a este mismo lugar despues.
  const readyToFinish = (progress?.percent ?? 0) >= 50;

  async function handleFinish() {
    if (!clinicId) return;
    setFinishing(true);
    setError("");
    try {
      await finishClinicOnboarding(clinicId);
      // navigate() no alcanza: WorkspaceContext ya tiene "clinic" en memoria
      // desde que se cargo la pagina, y no se re-consulta solo. Recarga
      // completa para que el menu deje de mostrar "Onboarding" ya mismo,
      // no recien la proxima vez que se refresque la app por otro motivo.
      window.location.href = "/admin";
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
      <div className="flex gap-2">
        {readyToFinish && (
          <Button onClick={handleFinish} disabled={finishing} variant="primary">
            {finishing ? "Finalizando..." : "Finalizar"}
          </Button>
        )}
        <Button onClick={() => skipForNow(navigate, "/admin")}>Ver más tarde</Button>
      </div>
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

  const readyToFinish = (progress?.percent ?? 0) >= 50;

  async function handleFinish() {
    if (!clinicMembership) return;
    setFinishing(true);
    setError("");
    try {
      await finishMemberOnboarding(clinicMembership.id);
      window.location.href = "/admin/mi-agenda";
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
      <div className="flex gap-2">
        {readyToFinish && (
          <Button onClick={handleFinish} disabled={finishing} variant="primary">
            {finishing ? "Finalizando..." : "Finalizar"}
          </Button>
        )}
        <Button onClick={() => skipForNow(navigate, "/admin/mi-agenda")}>Ver más tarde</Button>
      </div>
    </AdminPageShell>
  );
}

const RECEPTIONIST_TOUR_CARDS = [
  {
    icon: CalendarDays,
    title: "Agenda",
    text: "Confirmá, cancelá o reprogramá turnos, y marcá ausencias desde ahí.",
    detail: "Cada turno tiene un botón \"⋮ Más acciones\" con confirmar, marcar atendido, registrar pago, generar link de pago y cancelar. El ícono de WhatsApp abre el chat directo con el paciente."
  },
  {
    icon: WalletCards,
    title: "Pagos",
    text: "Registrá pagos manuales o revisá los que se cobraron por Mercado Pago.",
    detail: "Si el paciente paga en efectivo o transferencia, registralo vos desde el turno (\"Registrar pago\"). Los pagos por Mercado Pago se acreditan solos, no hace falta cargarlos a mano."
  },
  {
    icon: ReceiptText,
    title: "Facturación",
    text: "Emití el comprobante de un pago acreditado con un click, cuando la clínica lo pida.",
    detail: "Entrá a Pagos, abrí el pago ya acreditado y usá el botón \"Facturar\". Solo aparece si la clínica tiene la facturación electrónica configurada."
  }
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
      window.location.href = "/admin/agenda";
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
        {RECEPTIONIST_TOUR_CARDS.map(({ icon: Icon, title, text, detail }) => (
          <article key={title} className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
              <Icon size={20} />
            </div>
            <h3 className="mt-3 flex items-center gap-1.5 font-semibold text-clinic-ink">
              {title}
              <InfoTooltip text={detail} />
            </h3>
            <p className="mt-1 text-sm text-clinic-muted">{text}</p>
          </article>
        ))}
      </section>
      <div className="flex gap-2">
        <Button onClick={handleFinish} disabled={finishing} variant="primary">
          {finishing ? "Guardando..." : "Listo, entendido"}
        </Button>
        <Button onClick={() => skipForNow(navigate, "/admin/agenda")}>Ver más tarde</Button>
      </div>
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
