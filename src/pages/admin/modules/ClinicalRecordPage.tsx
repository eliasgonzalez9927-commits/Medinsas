import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import { getClinicalEvolutionsByPatient, getPatientById } from "../../../lib/clinic-data";
import { ClinicalEvolutionWithProfessional } from "../../../types/clinic";
import { PatientWithAppointments } from "../../../types/clinic";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SectionCard } from "../../../components/admin/SectionCard";

export function ClinicalRecordPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { activeClinicId, loading: clinicLoading } = useActiveClinic();

  const [patient, setPatient] = useState<PatientWithAppointments | null>(null);
  const [evolutions, setEvolutions] = useState<ClinicalEvolutionWithProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (clinicLoading || !activeClinicId || !patientId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      getPatientById(patientId, activeClinicId),
      getClinicalEvolutionsByPatient(activeClinicId, patientId)
    ])
      .then(([p, evs]) => {
        if (cancelled) return;
        setPatient(p);
        setEvolutions(evs);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? "No pudimos cargar el registro clínico.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeClinicId, clinicLoading, patientId]);

  return (
    <AdminLayout onCreateAppointment={() => undefined} onRefresh={() => undefined}>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Back link */}
        <Link
          to="/admin/pacientes"
          className="flex w-fit items-center gap-1.5 text-sm text-clinic-muted transition-colors hover:text-clinic-brand"
        >
          <ArrowLeft size={15} />
          Volver a pacientes
        </Link>

        {/* Header */}
        <section className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-clinic-brand">Registro clínico</p>
          <h1 className="text-3xl font-semibold tracking-normal text-clinic-ink">
            {loading || !patient
              ? "Cargando..."
              : `${patient.first_name} ${patient.last_name}`}
          </h1>
          {patient && (
            <p className="mt-1 text-sm text-clinic-muted">
              {[
                patient.document_number ? `DNI ${patient.document_number}` : null,
                patientAge(patient.birth_date),
                patient.phone,
                patient.email
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions bar */}
        {!loading && !error && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-clinic-muted">
              {evolutions.length === 0
                ? "Sin evoluciones registradas"
                : `${evolutions.length} evolución${evolutions.length !== 1 ? "es" : ""}`}
            </p>
            <button
              disabled
              className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-medium text-clinic-muted shadow-sm"
              title="Disponible próximamente"
            >
              <Plus size={15} />
              Nueva evolución
              <span className="rounded bg-clinic-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clinic-muted">
                Próximamente
              </span>
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <SectionCard>
            <div className="divide-y divide-clinic-line">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse px-5 py-5">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-24 rounded bg-clinic-line" />
                    <div className="h-5 w-16 rounded-full bg-clinic-line" />
                  </div>
                  <div className="mt-3 h-3 w-48 rounded bg-clinic-line" />
                  <div className="mt-2 h-3 w-64 rounded bg-clinic-line" />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Empty state */}
        {!loading && !error && evolutions.length === 0 && (
          <SectionCard className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e6f4f1] text-clinic-brand">
              <ClipboardList size={26} />
            </span>
            <div>
              <p className="font-semibold text-clinic-ink">Sin evoluciones todavía</p>
              <p className="mt-1 text-sm text-clinic-muted">
                Todavía no hay evoluciones registradas para este paciente.
              </p>
            </div>
          </SectionCard>
        )}

        {/* Evolution list */}
        {!loading && !error && evolutions.length > 0 && (
          <SectionCard className="overflow-hidden">
            <div className="divide-y divide-clinic-line">
              {evolutions.map((ev) => (
                <EvolutionRow key={ev.id} evolution={ev} />
              ))}
            </div>
          </SectionCard>
        )}
      </main>
    </AdminLayout>
  );
}

function EvolutionRow({ evolution: ev }: { evolution: ClinicalEvolutionWithProfessional }) {
  const professionalName = ev.professional
    ? `${ev.professional.name} ${ev.professional.last_name}`
    : null;

  return (
    <article className="grid gap-3 px-5 py-5 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-1.5">
        {/* Date + status */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-clinic-ink">
            {formatEvolutionDate(ev.created_at)}
          </span>
          <EvolutionStatusChip status={ev.status} />
        </div>

        {/* Professional */}
        {professionalName && (
          <p className="text-sm text-clinic-muted">{professionalName}</p>
        )}

        {/* Clinical content */}
        {ev.reason && (
          <p className="text-sm text-clinic-ink">
            <span className="text-clinic-muted">Motivo: </span>
            {truncate(ev.reason, 120)}
          </p>
        )}
        {ev.diagnosis && (
          <p className="text-sm text-clinic-ink">
            <span className="text-clinic-muted">Diagnóstico: </span>
            {truncate(ev.diagnosis, 120)}
          </p>
        )}

        {/* Last update */}
        <p className="text-xs text-clinic-muted">
          Actualizado {formatRelative(ev.updated_at)}
        </p>
      </div>

      {/* Actions placeholder — Fase 1B/1C */}
      <div className="flex items-start gap-2 md:justify-end">
        <span className="rounded-lg border border-clinic-line px-3 py-1.5 text-xs font-medium text-clinic-muted">
          Ver disponible en próxima fase
        </span>
      </div>
    </article>
  );
}

function EvolutionStatusChip({ status }: { status: "draft" | "closed" }) {
  if (status === "closed") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Cerrada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      Borrador
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patientAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return `${age} años`;
}

function formatEvolutionDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date(iso));
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return formatEvolutionDate(iso);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
