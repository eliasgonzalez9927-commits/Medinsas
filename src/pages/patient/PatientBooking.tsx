import { FormEvent, useMemo, useState } from "react";
import { CalendarCheck, Stethoscope } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { AppointmentType, UrgencyLevel } from "../../types/database";

const urgencyOptions: Array<{ value: UrgencyLevel; label: string; hint: string }> = [
  { value: "low", label: "Baja", hint: "Molestia leve o control rutinario" },
  { value: "medium", label: "Media", hint: "Sintomas persistentes sin alarma" },
  { value: "high", label: "Alta", hint: "Dolor intenso o signos de alerta" }
];

export function PatientBooking() {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>("medium");
  const [hasFever, setHasFever] = useState(false);
  const [hasBreathingDifficulty, setHasBreathingDifficulty] = useState(false);
  const [notes, setNotes] = useState("");
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("in_person");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const availableTimes = useMemo(
    () => ["08:30", "09:00", "09:30", "10:00", "11:00", "12:00", "15:00", "16:00"],
    []
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setSuccess("");
    setError("");
    setSubmitting(true);

    try {
      const startsAt = new Date(`${date}T${time}:00`).toISOString();

      const { data: triage, error: triageError } = await supabase
        .from("triage_results")
        .insert({
          patient_id: user.id,
          symptoms,
          urgency_level: urgencyLevel,
          has_fever: hasFever,
          has_breathing_difficulty: hasBreathingDifficulty,
          notes: notes || null
        })
        .select("id")
        .single();

      if (triageError) throw triageError;

      const { error: appointmentError } = await supabase.from("appointments").insert({
        patient_id: user.id,
        triage_result_id: triage.id,
        starts_at: startsAt,
        appointment_type: appointmentType,
        status: "pending",
        reason
      });

      if (appointmentError) throw appointmentError;

      setSuccess("Reserva creada. La clinica revisara el triaje y confirmara el turno.");
      setReason("");
      setSymptoms("");
      setNotes("");
      setHasFever(false);
      setHasBreathingDifficulty(false);
      setDate("");
      setTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
        <section className="rounded-lg border border-clinic-line bg-white p-6 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-50 text-clinic-brand">
            <Stethoscope />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-clinic-ink">Nueva reserva</h1>
          <p className="mt-3 text-clinic-muted">
            Completa un triaje inicial para orientar al equipo clinico antes de la consulta.
          </p>
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Si presentas dificultad respiratoria severa, dolor toracico o perdida de conciencia,
            busca atencion de emergencia.
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-lg border border-clinic-line bg-white p-6 shadow-soft">
          <div className="grid gap-5">
            <label>
              <span className="text-sm font-medium text-clinic-ink">Motivo de consulta</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="Control, dolor, seguimiento..."
              />
            </label>

            <label>
              <span className="text-sm font-medium text-clinic-ink">Sintomas principales</span>
              <textarea
                value={symptoms}
                onChange={(event) => setSymptoms(event.target.value)}
                required
                rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="Describe sintomas, duracion e intensidad."
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium text-clinic-ink">Nivel de urgencia</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {urgencyOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-lg border p-4 transition ${
                      urgencyLevel === option.value
                        ? "border-clinic-brand bg-teal-50"
                        : "border-clinic-line bg-white hover:bg-clinic-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={option.value}
                      checked={urgencyLevel === option.value}
                      onChange={() => setUrgencyLevel(option.value)}
                      className="sr-only"
                    />
                    <span className="block font-semibold text-clinic-ink">{option.label}</span>
                    <span className="mt-1 block text-sm text-clinic-muted">{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-clinic-line p-4">
                <input
                  type="checkbox"
                  checked={hasFever}
                  onChange={(event) => setHasFever(event.target.checked)}
                  className="h-4 w-4 rounded border-clinic-line text-clinic-brand focus:ring-clinic-brand"
                />
                <span className="text-sm font-medium text-clinic-ink">Presenta fiebre</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-clinic-line p-4">
                <input
                  type="checkbox"
                  checked={hasBreathingDifficulty}
                  onChange={(event) => setHasBreathingDifficulty(event.target.checked)}
                  className="h-4 w-4 rounded border-clinic-line text-clinic-brand focus:ring-clinic-brand"
                />
                <span className="text-sm font-medium text-clinic-ink">
                  Dificultad respiratoria
                </span>
              </label>
            </div>

            <label>
              <span className="text-sm font-medium text-clinic-ink">Notas adicionales</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                placeholder="Medicacion actual, antecedentes o datos relevantes."
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-3">
              <label>
                <span className="text-sm font-medium text-clinic-ink">Modalidad</span>
                <select
                  value={appointmentType}
                  onChange={(event) => setAppointmentType(event.target.value as AppointmentType)}
                  className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  <option value="in_person">Presencial</option>
                  <option value="telemedicine">Telemedicina</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-medium text-clinic-ink">Fecha</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-clinic-ink">Horario</span>
                <select
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">Seleccionar</option>
                  {availableTimes.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {success && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-clinic-brand">
                {success}
              </div>
            )}
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
              <CalendarCheck size={18} />
              {submitting ? "Reservando..." : "Solicitar turno"}
            </button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
