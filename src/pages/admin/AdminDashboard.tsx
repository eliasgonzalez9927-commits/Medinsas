import { useEffect, useMemo, useState } from "react";
import { toastCreateAppointment } from "../../components/admin/adminNotifications";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AppointmentFilter, AppointmentTable } from "../../components/admin/AppointmentTable";
import { DashboardHeader } from "../../components/admin/DashboardHeader";
import { TodaySummaryCards } from "../../components/admin/TodaySummaryCards";
import { FinancingSimulator } from "../../components/fintech/FinancingSimulator";
import { GrowthDashboard } from "../../components/growth/GrowthDashboard";
import { supabase } from "../../lib/supabase";
import { AdminAppointmentRow, AppointmentStatus } from "../../types/database";

const DAILY_CAPACITY = 24;

export function AdminDashboard() {
  const [appointments, setAppointments] = useState<AdminAppointmentRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<AppointmentFilter>("all");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  async function loadAppointments() {
    setLoadFailed(false);
    setLoading(true);

    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const { data, error } = await supabase
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

      if (error) throw error;

      setAppointments((data ?? []) as AdminAppointmentRow[]);
    } catch (error) {
      console.error("Failed to load appointments", error);
      setAppointments([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  const summary = useMemo(() => {
    const pending = appointments.filter((item) => item.status === "pending").length;
    const confirmed = appointments.filter((item) => item.status === "confirmed").length;
    const urgent = appointments.filter((item) => item.triage_results?.urgency_level === "high").length;
    const cancellations = appointments.filter((item) =>
      ["cancelled", "no_show"].includes(item.status)
    ).length;
    const occupancy = Math.min(100, Math.round((appointments.length / DAILY_CAPACITY) * 100));

    return {
      total: appointments.length,
      pending,
      confirmed,
      urgent,
      cancellations,
      occupancy
    };
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (activeFilter === "pending") return appointment.status === "pending";
      if (activeFilter === "confirmed") return appointment.status === "confirmed";
      if (activeFilter === "cancelled") {
        return appointment.status === "cancelled" || appointment.status === "no_show";
      }
      if (activeFilter === "urgency") return appointment.triage_results?.urgency_level === "high";
      return true;
    });
  }, [activeFilter, appointments]);

  async function updateStatus(id: string, status: AppointmentStatus) {
    const previousAppointments = appointments;

    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === id ? { ...appointment, status } : appointment
      )
    );

    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);

    if (error) {
      console.error("Failed to update appointment status", error);
      setAppointments(previousAppointments);
    }
  }

  function handleCreateAppointment() {
    toastCreateAppointment();
  }

  return (
    <AdminLayout onCreateAppointment={handleCreateAppointment} onRefresh={loadAppointments}>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <DashboardHeader />

        <TodaySummaryCards summary={summary} />

        <AppointmentTable
          activeFilter={activeFilter}
          appointments={filteredAppointments}
          hasError={loadFailed}
          loading={loading}
          professionalFilter={professionalFilter}
          onCreate={handleCreateAppointment}
          onFilterChange={setActiveFilter}
          onProfessionalChange={setProfessionalFilter}
          onRetry={loadAppointments}
          onStatusChange={updateStatus}
        />

        <GrowthDashboard />

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <FinancingSimulator />
          <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-clinic-ink">Proximas integraciones</h2>
            <p className="mt-1 text-sm text-clinic-muted">
              Funcionalidades preparadas para escalar la operacion sin sobrecargar el tablero diario.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {["WhatsApp", "Pagos", "Calendario", "Scoring crediticio"].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3 text-sm font-medium text-clinic-ink"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AdminLayout>
  );
}
