import { ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Video } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { FinancingSimulator } from "../../components/fintech/FinancingSimulator";
import { GrowthDashboard } from "../../components/growth/GrowthDashboard";
import { supabase } from "../../lib/supabase";
import { AdminAppointmentRow, AppointmentStatus } from "../../types/database";

const statusLabels: Record<AppointmentStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  attended: "Atendido"
};

const urgencyClasses = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700"
};

export function AdminDashboard() {
  const [appointments, setAppointments] = useState<AdminAppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAppointments() {
    setError("");
    setLoading(true);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data, error: queryError } = await supabase
      .from("appointments")
      .select(
        `
        *,
        profiles:patient_id(full_name, phone),
        triage_results(symptoms, urgency_level, has_fever, has_breathing_difficulty, notes)
      `
      )
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setAppointments((data ?? []) as AdminAppointmentRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  const stats = useMemo(() => {
    const pending = appointments.filter((item) => item.status === "pending").length;
    const confirmed = appointments.filter((item) => item.status === "confirmed").length;
    const highUrgency = appointments.filter(
      (item) => item.triage_results?.urgency_level === "high"
    ).length;
    return { pending, confirmed, highUrgency, total: appointments.length };
  }, [appointments]);

  async function updateStatus(id: string, status: AppointmentStatus) {
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === id ? { ...appointment, status } : appointment
      )
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-clinic-ink">Panel administrativo</h1>
            <p className="mt-2 text-clinic-muted">Reservas del dia y resultados de triaje previo.</p>
          </div>
          <button
            type="button"
            onClick={loadAppointments}
            className="rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface"
          >
            Actualizar
          </button>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat title="Turnos hoy" value={stats.total} icon={<Clock3 size={20} />} />
          <Stat title="Pendientes" value={stats.pending} icon={<AlertTriangle size={20} />} />
          <Stat title="Confirmados" value={stats.confirmed} icon={<CheckCircle2 size={20} />} />
          <Stat title="Urgencia alta" value={stats.highUrgency} icon={<AlertTriangle size={20} />} />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <GrowthDashboard />
          <FinancingSimulator />
        </div>

        <section className="mt-6 overflow-hidden rounded-lg border border-clinic-line bg-white shadow-soft">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Gestion de turnos</h2>
          </div>

          {error && (
            <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-clinic-danger">
              {error}
            </div>
          )}

          {loading ? (
            <div className="px-5 py-10 text-center text-clinic-muted">Cargando turnos...</div>
          ) : appointments.length === 0 ? (
            <div className="px-5 py-10 text-center text-clinic-muted">
              No hay reservas para hoy.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-clinic-line">
                <thead className="bg-clinic-surface">
                  <tr>
                    <Th>Horario</Th>
                    <Th>Paciente</Th>
                    <Th>Modalidad</Th>
                    <Th>Triaje</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-line">
                  {appointments.map((appointment) => (
                    <tr key={appointment.id} className="align-top">
                      <Td>
                        {new Intl.DateTimeFormat("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit"
                        }).format(new Date(appointment.starts_at))}
                        <p className="mt-1 text-xs text-clinic-muted">{appointment.reason}</p>
                      </Td>
                      <Td>
                        <p className="font-medium text-clinic-ink">
                          {appointment.profiles?.full_name ?? "Paciente"}
                        </p>
                        <p className="mt-1 text-xs text-clinic-muted">
                          {appointment.profiles?.phone ?? "Sin telefono"}
                        </p>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700">
                          {appointment.appointment_type === "telemedicine" && <Video size={14} />}
                          {appointment.appointment_type === "telemedicine"
                            ? "Telemedicina"
                            : "Presencial"}
                        </span>
                      </Td>
                      <Td>
                        {appointment.triage_results ? (
                          <div className="max-w-md">
                            <span
                              className={`inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${
                                urgencyClasses[appointment.triage_results.urgency_level]
                              }`}
                            >
                              Urgencia {appointment.triage_results.urgency_level}
                            </span>
                            <p className="mt-2 text-sm text-clinic-ink">
                              {appointment.triage_results.symptoms}
                            </p>
                            <p className="mt-1 text-xs text-clinic-muted">
                              Fiebre: {appointment.triage_results.has_fever ? "Si" : "No"} ·
                              Respiracion:{" "}
                              {appointment.triage_results.has_breathing_difficulty ? "Si" : "No"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-clinic-muted">Sin triaje</span>
                        )}
                      </Td>
                      <Td>
                        <select
                          value={appointment.status}
                          onChange={(event) =>
                            updateStatus(appointment.id, event.target.value as AppointmentStatus)
                          }
                          className="rounded-lg border border-clinic-line px-3 py-2 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

function Stat({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between text-clinic-muted">
        <span className="text-sm font-medium">{title}</span>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-semibold text-clinic-ink">{value}</p>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-clinic-muted">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-5 py-4 text-sm text-clinic-ink">{children}</td>;
}
