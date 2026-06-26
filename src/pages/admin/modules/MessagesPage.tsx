import { FormEvent, useEffect, useMemo, useState } from "react";
import { Mail, Send, ShieldAlert } from "lucide-react";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import { useAuth } from "../../../contexts/AuthContext";
import { getMessageLogs, getPatients, getProfessionals, getServices } from "../../../lib/clinic-data";
import { canSendMessages } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { MessageLog, PatientWithAppointments, ProfessionalWithRelations, ServiceWithRelations } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

type Filter = "all" | "future" | "past" | "new" | "service" | "professional";

export function MessagesPage() {
  const { role } = useAuth();
  const { activeClinic: clinic, activeRole, loading: clinicLoading } = useActiveClinic();
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [filter, setFilter] = useState<Filter>("future");
  const [filterValue, setFilterValue] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const allowed = canSendMessages(activeRole ?? role);

  async function load() {
    if (!clinic) return;
    setError("");
    try {
      const [loadedPatients, serviceResult, professionalResult, loadedLogs] = await Promise.all([
        getPatients(clinic.id),
        getServices(clinic.id),
        getProfessionals(clinic.id),
        getMessageLogs(clinic.id).catch(() => [])
      ]);
      setPatients(loadedPatients);
      setServices(serviceResult.data);
      setProfessionals(professionalResult.data);
      setLogs(loadedLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar mensajes.");
    }
  }

  useEffect(() => {
    if (clinic) load();
  }, [clinic?.id]);

  const recipients = useMemo(() => {
    const now = Date.now();
    return patients.filter((patient) => {
      if (!patient.email || patient.email_opt_in === false) return false;
      const appointments = patient.appointments ?? [];
      if (filter === "future") return appointments.some((appointment) => new Date(appointment.starts_at).getTime() >= now);
      if (filter === "past") return appointments.some((appointment) => new Date(appointment.starts_at).getTime() < now);
      if (filter === "new") return appointments.length <= 1;
      if (filter === "service") return appointments.some((appointment) => appointment.service_id === filterValue);
      if (filter === "professional") return appointments.some((appointment) => appointment.professional_id === filterValue);
      return true;
    });
  }, [filter, filterValue, patients]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!allowed) {
      setError("Tu rol no permite enviar mensajes.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setError("Completa asunto y mensaje.");
      return;
    }
    if (recipients.length === 0) {
      setError("No hay destinatarios con email y consentimiento para este filtro.");
      return;
    }
    setConfirming(true);
  }

  async function send() {
    if (!clinic) return;
    setSending(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sesion expirada.");
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({
          clinicId: clinic.id,
          recipients: recipients.map((patient) => ({ email: patient.email, patientId: patient.id })),
          subject,
          text: body,
          template: "patient_message",
          related_entity_type: "patient_message"
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error === "RESEND_NOT_CONFIGURED" ? "Resend no esta configurado en backend." : "No pudimos enviar el mensaje.");
      }
      setNotice(`Envio finalizado: ${result.sent ?? 0} enviados, ${result.failed ?? 0} fallidos.`);
      setConfirming(false);
      setSubject("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminPageShell
      description="Email operativo y comunicaciones generales a pacientes con confirmacion, opt-in y logs."
      eyebrow="Mensajeria"
      onRefresh={load}
      title="Mensajes"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}
      {!clinic && !clinicLoading && <NoActiveClinicState />}
      {!allowed && <Message tone="warning">Tu rol no permite enviar mensajes.</Message>}

      {clinic && <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand"><Mail size={20} /></span>
            <div>
              <h2 className="font-semibold text-clinic-ink">Enviar comunicacion</h2>
              <p className="mt-1 text-sm text-clinic-muted">Los mensajes generales respetan `email_opt_in`. Evita incluir informacion clinica sensible.</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 grid gap-4">
            <label>
              <span className="text-sm font-medium text-clinic-ink">Destinatarios</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm">
                <option value="future">Pacientes con turno futuro</option>
                <option value="past">Pacientes con turno pasado</option>
                <option value="new">Pacientes nuevos</option>
                <option value="service">Pacientes por servicio</option>
                <option value="professional">Pacientes por profesional</option>
                <option value="all">Todos los pacientes con consentimiento</option>
              </select>
            </label>

            {filter === "service" && (
              <Select label="Servicio" value={filterValue} onChange={setFilterValue} options={services.map((item) => ({ value: item.id, label: item.name }))} />
            )}
            {filter === "professional" && (
              <Select label="Profesional" value={filterValue} onChange={setFilterValue} options={professionals.map((item) => ({ value: item.id, label: `${item.name} ${item.last_name}` }))} />
            )}

            <Input label="Asunto" value={subject} onChange={setSubject} required />
            <label>
              <span className="text-sm font-medium text-clinic-ink">Mensaje</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-2 min-h-40 w-full rounded-lg border border-clinic-line px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" />
            </label>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex gap-2"><ShieldAlert size={17} /> No envies informacion medica sensible por email general.</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-clinic-ink">{recipients.length} destinatarios</span>
              <Button disabled={!allowed || sending} icon={<Send size={16} />} type="submit" variant="primary">Previsualizar y enviar</Button>
            </div>
          </form>
        </SectionCard>

        <section className="grid gap-6">
          <SectionCard className="p-5">
            <h2 className="font-semibold text-clinic-ink">Previsualizacion</h2>
            <div className="mt-4 rounded-lg border border-clinic-line bg-clinic-surface p-4">
              <p className="text-sm font-semibold text-clinic-ink">{subject || "Asunto del mensaje"}</p>
              <p className="mt-3 whitespace-pre-line text-sm text-clinic-muted">{body || "Escribi el mensaje para ver la previsualizacion."}</p>
            </div>
          </SectionCard>
          <SectionCard className="overflow-hidden">
            <div className="border-b border-clinic-line px-5 py-4"><h2 className="font-semibold">Ultimos envios</h2></div>
            <div className="divide-y divide-clinic-line">
              {logs.length === 0 ? (
                <p className="px-5 py-6 text-sm text-clinic-muted">Todavia no hay envios registrados.</p>
              ) : logs.slice(0, 8).map((log) => (
                <article key={log.id} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_100px] md:items-center">
                  <div><p className="font-medium text-clinic-ink">{log.subject ?? "Sin asunto"}</p><p className="text-sm text-clinic-muted">{log.recipient}</p></div>
                  <span className="rounded-lg bg-clinic-surface px-3 py-2 text-center text-xs font-semibold text-clinic-muted">{log.status}</span>
                </article>
              ))}
            </div>
          </SectionCard>
        </section>
      </section>}

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-clinic-ink">Confirmar envio</h2>
            <p className="mt-2 text-sm text-clinic-muted">
              Vas a enviar este mensaje a {recipients.length} pacientes. Confirmalo solo si el contenido no incluye informacion medica sensible.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={sending} onClick={() => setConfirming(false)}>Cancelar</Button>
              <Button disabled={sending} onClick={send} variant="primary">{sending ? "Enviando..." : "Confirmar envio"}</Button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}

function Input({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label><span className="text-sm font-medium text-clinic-ink">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label><span className="text-sm font-medium text-clinic-ink">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Message({ children, tone }: { children: string; tone: "success" | "error" | "warning" }) {
  const colors = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-red-200 bg-red-50 text-red-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${colors[tone]}`}>{children}</div>;
}
