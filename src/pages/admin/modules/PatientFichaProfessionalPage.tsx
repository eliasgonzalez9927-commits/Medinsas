import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { SectionCard } from "../../../components/admin/SectionCard";
import { AdminPageShell } from "./AdminPageShell";
import { useAuth } from "../../../contexts/AuthContext";
import {
  getClinicalTimeline,
  getDefaultClinic,
  getPatientForProfessional,
  getProfessionalPatientProduction,
  getServices
} from "../../../lib/clinic-data";
import { MedicalRecord, MedicalRecordType, PatientWithAppointments } from "../../../types/clinic";

type Production = { totalCobrado: number; totalPendiente: number };

export function PatientFichaProfessionalPage() {
  const { id = "" } = useParams();
  const { clinicMembership } = useAuth();
  const myProfessionalId = clinicMembership?.professional_id ?? null;

  const [patient, setPatient] = useState<PatientWithAppointments | null>(null);
  const [serviceMap, setServiceMap] = useState<Record<string, string>>({});
  const [production, setProduction] = useState<Production>({ totalCobrado: 0, totalPendiente: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);

  useEffect(() => {
    if (!myProfessionalId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const clinic = await getDefaultClinic();
        if (!clinic) throw new Error("No se encontró la clínica.");
        const [foundPatient, prod, servicesResult, foundTimeline] = await Promise.all([
          getPatientForProfessional(clinic.id, id, myProfessionalId as string),
          getProfessionalPatientProduction(clinic.id, id, myProfessionalId as string),
          getServices(clinic.id),
          getClinicalTimeline(clinic.id, id, myProfessionalId as string)
        ]);
        if (cancelled) return;
        if (!foundPatient) {
          setNotFound(true);
          return;
        }
        setPatient(foundPatient);
        setProduction(prod);
        setTimeline(foundTimeline);
        const sm: Record<string, string> = {};
        for (const svc of servicesResult.data ?? []) {
          sm[svc.id] = svc.name;
        }
        setServiceMap(sm);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No pudimos cargar la ficha.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, myProfessionalId]);

  const appointments = useMemo(() => {
    if (!Array.isArray(patient?.appointments)) return [];
    return [...patient.appointments].sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
    );
  }, [patient]);

  const nextAppointment = useMemo(() => {
    const now = Date.now();
    return (patient?.appointments ?? [])
      .filter((a) => new Date(a.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
  }, [patient]);

  const lastAppointment = useMemo(() => {
    const now = Date.now();
    return (patient?.appointments ?? [])
      .filter((a) => new Date(a.starts_at).getTime() < now)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null;
  }, [patient]);

  const appointmentCounts = useMemo(() => {
    const now = Date.now();
    const all = patient?.appointments ?? [];
    const upcoming = all.filter((a) => new Date(a.starts_at).getTime() >= now).length;
    return { total: all.length, upcoming, past: all.length - upcoming };
  }, [patient]);

  const active = useMemo(() => isPatientActive(patient?.appointments), [patient]);

  const fullName = patient ? `${patient.first_name} ${patient.last_name}` : "Paciente";

  if (!myProfessionalId) {
    return (
      <AdminPageShell description="" eyebrow="Ficha operativa" title="Ficha del paciente">
        <Message tone="error">
          Tu usuario no está vinculado a un profesional en esta clínica. Contactá al administrador para que
          te asocie a tu perfil profesional.
        </Message>
      </AdminPageShell>
    );
  }

  if (loading) {
    return (
      <AdminPageShell description="" eyebrow="Ficha operativa" title="Cargando...">
        <p className="p-6 text-sm text-clinic-muted">Cargando ficha...</p>
      </AdminPageShell>
    );
  }

  if (error) {
    return (
      <AdminPageShell description="" eyebrow="Ficha operativa" title="Error">
        <p className="p-6 text-sm text-red-600">{error}</p>
      </AdminPageShell>
    );
  }

  // notFound covers both "el paciente no existe" y "el paciente existe pero no
  // tiene turnos con este profesional" — a propósito no se distinguen, para no
  // confirmarle a un profesional que un paciente existe en la clínica si no
  // tiene acceso a su ficha.
  if (notFound || !patient) {
    return (
      <AdminPageShell description="" eyebrow="Ficha operativa" title="Ficha del paciente">
        <Message tone="error">No tenés acceso a esta ficha desde tu usuario profesional.</Message>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="Ficha operativa del paciente" description="">
      <Link
        to="/admin/mi-agenda"
        className="mb-2 inline-flex items-center gap-1 text-sm text-clinic-muted hover:text-clinic-ink"
      >
        <ArrowLeft size={14} />
        Volver a mi agenda
      </Link>

      <SectionCard className="mb-6">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-clinic-muted">Paciente</p>
            <h1 className="text-2xl font-bold text-clinic-ink">{fullName}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-clinic-muted">
              {patient.document_number && <span>DNI {patient.document_number}</span>}
              {patient.phone && <span>{patient.phone}</span>}
              {patient.email && <span>{patient.email}</span>}
              {calcAge(patient.birth_date) && <span>{calcAge(patient.birth_date)}</span>}
            </div>
            {patient.insurance && (
              <span className="mt-2 inline-flex w-fit items-center rounded-full border border-clinic-line bg-clinic-surface px-2.5 py-0.5 text-xs font-medium text-clinic-ink">
                {patient.insurance}
              </span>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {active ? "Activo" : "Inactivo"}
          </span>
        </div>
      </SectionCard>

      <SectionCard className="mb-6">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Resumen operativo</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Último turno registrado">
            {lastAppointment ? (
              <>
                <p className="font-medium text-clinic-ink">{formatDate(lastAppointment.starts_at)}</p>
                <p className="text-clinic-muted">{serviceName(lastAppointment.service_id, serviceMap)}</p>
                <AppointmentStatusBadge status={lastAppointment.status} />
              </>
            ) : (
              <p className="text-clinic-muted">Sin turnos registrados</p>
            )}
          </SummaryCard>
          <SummaryCard label="Próximo turno">
            {nextAppointment ? (
              <>
                <p className="font-medium text-clinic-ink">{formatDate(nextAppointment.starts_at)}</p>
                <p className="text-clinic-muted">{serviceName(nextAppointment.service_id, serviceMap)}</p>
                <AppointmentStatusBadge status={nextAppointment.status} />
              </>
            ) : (
              <p className="text-clinic-muted">Sin próximo turno</p>
            )}
          </SummaryCard>
          <SummaryCard label="Turnos con vos">
            {appointmentCounts.total === 0 ? (
              <p className="text-clinic-muted">Sin turnos registrados</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-clinic-ink">{appointmentCounts.total}</p>
                <p className="text-clinic-muted">
                  {appointmentCounts.past} pasados · {appointmentCounts.upcoming} próximos
                </p>
              </>
            )}
          </SummaryCard>
          <SummaryCard label="Producción con este paciente">
            <p className="text-clinic-muted">
              Cobrado por tus turnos: <span className="font-medium text-clinic-ink">{formatARS(production.totalCobrado)}</span>
            </p>
            <p className="text-clinic-muted">
              Pendiente: <span className="font-medium text-clinic-ink">{formatARS(production.totalPendiente)}</span>
            </p>
          </SummaryCard>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Turnos con vos</h2>
        </div>
        {appointments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-clinic-muted">Todavía no tenés turnos registrados con este paciente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-line bg-clinic-surface text-left">
                  <th className="px-5 py-3 font-medium text-clinic-muted">Fecha</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Servicio</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Estado</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line">
                {appointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-clinic-surface">
                    <td className="px-5 py-3 text-clinic-ink">{formatDate(appt.starts_at)}</td>
                    <td className="px-5 py-3 text-clinic-muted">{serviceName(appt.service_id, serviceMap)}</td>
                    <td className="px-5 py-3">
                      <AppointmentStatusBadge status={appt.status} />
                    </td>
                    <td className="px-5 py-3 text-clinic-muted">
                      {appt.notes ? (
                        <span title={appt.notes} className="block max-w-[220px] truncate">
                          {appt.notes}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-6">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Historia clínica</h2>
          <p className="mt-1 text-sm text-clinic-muted">
            Línea de tiempo clínica de este paciente — solo vos podés verla, ni administración, ni recepción, ni
            otros profesionales tienen acceso. Las evoluciones se cargan desde "Iniciar atención" en tu agenda.
          </p>
        </div>
        {timeline.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-clinic-muted">Todavía no hay registros clínicos para este paciente.</p>
          </div>
        ) : (
          <div className="divide-y divide-clinic-line">
            {timeline.map((record) => (
              <div key={record.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={recordTypeBadgeClass(record.record_type)}>{recordTypeLabel(record.record_type)}</span>
                  <span className={recordStatusBadgeClass(record)}>{recordStatusLabel(record)}</span>
                  <span className="text-xs text-clinic-muted">{formatDate(record.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-clinic-ink">{record.notes || "Sin contenido."}</p>
                {record.appointment_id && (
                  <Link
                    to={`/admin/mi-agenda/atencion/${record.appointment_id}`}
                    className="mt-2 inline-block text-xs font-semibold text-clinic-brand hover:underline"
                  >
                    Ver turno relacionado
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

function recordTypeLabel(type: MedicalRecordType): string {
  if (type === "appointment_evolution") return "Evolución de consulta";
  if (type === "standalone_clinical_note") return "Nota clínica sin turno";
  return "Registro clínico anterior";
}

function recordTypeBadgeClass(type: MedicalRecordType): string {
  const base = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (type === "appointment_evolution") return `${base} bg-teal-50 text-teal-700`;
  if (type === "standalone_clinical_note") return `${base} bg-amber-50 text-amber-700`;
  return `${base} bg-slate-100 text-slate-500`;
}

function recordStatusLabel(record: MedicalRecord): string {
  if (record.record_type === "legacy_clinical_record") return "Registro legado";
  if (record.record_status === "draft") return "Borrador";
  if (record.record_status === "amended") return "Corregida";
  return "Finalizada";
}

function recordStatusBadgeClass(record: MedicalRecord): string {
  const base = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (record.record_type === "legacy_clinical_record") return `${base} bg-slate-100 text-slate-500`;
  if (record.record_status === "draft") return `${base} bg-amber-50 text-amber-700`;
  return `${base} bg-emerald-50 text-emerald-700`;
}

function isPatientActive(appointments: PatientWithAppointments["appointments"]): boolean {
  if (!Array.isArray(appointments) || appointments.length === 0) return false;
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  return appointments.some((a) => new Date(a.starts_at) >= twelveMonthsAgo);
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const born = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
  return `${age} años`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatARS(amount: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount);
}

function serviceName(serviceId: string | null | undefined, serviceMap: Record<string, string>): string {
  return serviceId ? (serviceMap[serviceId] ?? "—") : "—";
}

function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-clinic-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-clinic-muted">{label}</p>
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Message({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
