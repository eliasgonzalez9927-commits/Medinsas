import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { AdminPageShell } from "./AdminPageShell";
import {
  getDefaultClinic,
  getPatientById,
  getProfessionals,
  getServices,
} from "../../../lib/clinic-data";
import {
  AppointmentPaymentStatus,
  AppointmentStatus,
  PatientWithAppointments,
} from "../../../types/clinic";

export function PatientFichaPage() {
  const { id = "" } = useParams();
  const [patient, setPatient] = useState<PatientWithAppointments | null>(null);
  const [profMap, setProfMap] = useState<Record<string, string>>({});
  const [serviceMap, setServiceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const clinic = await getDefaultClinic();
      if (!clinic) throw new Error("No se encontró la clínica.");
      const [p, profsResult, servicesResult] = await Promise.all([
        getPatientById(id),
        getProfessionals(clinic.id),
        getServices(clinic.id),
      ]);
      setPatient(p);
      const pm: Record<string, string> = {};
      for (const prof of profsResult.data ?? []) {
        pm[prof.id] = `${prof.name} ${prof.last_name ?? ""}`.trim();
      }
      setProfMap(pm);
      const sm: Record<string, string> = {};
      for (const svc of servicesResult.data ?? []) {
        sm[svc.id] = svc.name;
      }
      setServiceMap(sm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la ficha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

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

  const active = useMemo(() => isPatientActive(patient?.appointments), [patient]);

  const fullName = patient ? `${patient.first_name} ${patient.last_name}` : "Paciente";

  if (loading) {
    return (
      <AdminPageShell title="Cargando..." description="">
        <p className="p-6 text-sm text-clinic-muted">Cargando ficha...</p>
      </AdminPageShell>
    );
  }

  if (error) {
    return (
      <AdminPageShell title="Error" description="">
        <p className="p-6 text-sm text-red-600">{error}</p>
      </AdminPageShell>
    );
  }

  if (!patient) {
    return (
      <AdminPageShell title="Paciente" description="">
        <p className="p-6 text-sm text-clinic-muted">Paciente no encontrado.</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title={fullName} description="">
      <Link
        to="/admin/pacientes"
        className="mb-2 inline-flex items-center gap-1 text-sm text-clinic-muted hover:text-clinic-ink"
      >
        <ArrowLeft size={14} />
        Volver a pacientes
      </Link>

      {/* T2 — Header operativo */}
      <SectionCard className="mb-6">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-clinic-muted">
              Paciente
            </p>
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
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {active ? "Activo" : "Inactivo"}
            </span>
            <p className="text-sm text-clinic-muted sm:text-right">
              {nextAppointment ? (
                <>
                  Próximo turno:{" "}
                  <span className="font-medium text-clinic-ink">
                    {formatDate(nextAppointment.starts_at)}
                  </span>
                </>
              ) : (
                "Sin próximo turno"
              )}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* T3 — Turnos del paciente */}
      <SectionCard>
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Turnos</h2>
          <Link
            to="/admin/agenda"
            className="text-sm font-medium text-clinic-brand hover:underline"
          >
            Nuevo turno
          </Link>
        </div>
        {appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-clinic-muted">
              Este paciente todavía no tiene turnos registrados.
            </p>
            <Link
              to="/admin/agenda"
              className="text-sm font-semibold text-clinic-brand hover:underline"
            >
              Ir a la agenda
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-line bg-clinic-surface text-left">
                  <th className="px-5 py-3 font-medium text-clinic-muted">Fecha</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Profesional</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Servicio</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Estado</th>
                  <th className="px-5 py-3 font-medium text-clinic-muted">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line">
                {appointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-clinic-surface">
                    <td className="px-5 py-3 text-clinic-ink">{formatDate(appt.starts_at)}</td>
                    <td className="px-5 py-3 text-clinic-muted">
                      {appt.professional_id ? (profMap[appt.professional_id] ?? "—") : "—"}
                    </td>
                    <td className="px-5 py-3 text-clinic-muted">
                      {appt.service_id ? (serviceMap[appt.service_id] ?? "—") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <ApptStatusBadge status={appt.status} />
                    </td>
                    <td className="px-5 py-3 text-clinic-muted">
                      {apptPaymentLabel(appt.payment_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
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
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function apptPaymentLabel(status?: AppointmentPaymentStatus): string {
  if (!status) return "—";
  const map: Record<AppointmentPaymentStatus, string> = {
    unpaid: "Sin pagar",
    deposit_pending: "Seña pendiente",
    deposit_paid: "Seña pagada",
    paid: "Pagado",
    payment_failed: "Pago fallido",
    rejected: "Rechazado",
    refunded: "Reembolsado",
  };
  return map[status] ?? status;
}

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700" },
  confirmed: { label: "Confirmado", cls: "bg-teal-50 text-teal-700" },
  attended: { label: "Atendido", cls: "bg-teal-50 text-teal-700" },
  cancelled: { label: "Cancelado", cls: "bg-red-50 text-red-700" },
  rescheduled: { label: "Reprogramado", cls: "bg-amber-50 text-amber-700" },
  completed: { label: "Completado", cls: "bg-teal-50 text-teal-700" },
  no_show: { label: "Ausente", cls: "bg-slate-100 text-slate-500" },
  urgent: { label: "Urgente", cls: "bg-red-100 text-red-800" },
};

function ApptStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, cls } = STATUS_CONFIG[status] ?? {
    label: status,
    cls: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
