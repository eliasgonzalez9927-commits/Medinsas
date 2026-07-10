import { FormEvent, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SectionCard } from "./SectionCard";
import { Button } from "../ui/Button";
import { createPayment } from "../../lib/clinic-data";
import { PaymentKind, PaymentStatus } from "../../types/clinic";

type DefaultValues = {
  appointmentId?: string | null;
  patientId?: string | null;
  professionalId?: string | null;
  serviceId?: string | null;
  patientName?: string;
  professionalName?: string;
  serviceName?: string;
  appointmentAt?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  clinicId: string;
  defaultValues?: DefaultValues;
};

type FormState = {
  amount: string;
  method: string;
  kind: PaymentKind;
  status: "approved" | "pending";
  notes: string;
};

const METHOD_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card", label: "Tarjeta" },
  { value: "other", label: "Otro" },
];

const KIND_OPTIONS: { value: PaymentKind; label: string }[] = [
  { value: "payment", label: "Pago" },
  { value: "deposit", label: "Seña / anticipo" },
  { value: "copay", label: "Copago" },
  { value: "adjustment", label: "Ajuste" },
];

export function RegisterPaymentPanel({ open, onClose, onSaved, clinicId, defaultValues }: Props) {
  const [form, setForm] = useState<FormState>({
    amount: "",
    method: "cash",
    kind: "payment",
    status: "approved",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const missingContext = !defaultValues?.professionalId || !defaultValues?.serviceId;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("El monto debe ser un número positivo.");
      return;
    }
    setSaving(true);
    try {
      await createPayment({
        clinic_id: clinicId,
        patient_id: defaultValues?.patientId ?? null,
        appointment_id: defaultValues?.appointmentId ?? null,
        service_id: defaultValues?.serviceId ?? null,
        professional_id: defaultValues?.professionalId ?? null,
        amount,
        currency: "ARS",
        method: form.method,
        kind: form.kind,
        source: "manual",
        status: form.status as PaymentStatus,
        paid_at: form.status === "approved" ? new Date().toISOString() : null,
        notes: form.notes || null,
      });
      setForm({ amount: "", method: "cash", kind: "payment", status: "approved", notes: "" });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  const appointmentLabel = defaultValues?.appointmentAt
    ? new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(defaultValues.appointmentAt)
      )
    : null;

  return (
    <SectionCard className="border-clinic-brand/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-clinic-ink">Registrar pago manual</h2>
          {defaultValues?.patientName && (
            <p className="mt-1 text-sm text-clinic-muted">
              Paciente: <span className="font-medium text-clinic-ink">{defaultValues.patientName}</span>
              {defaultValues.professionalName && (
                <> · <span className="font-medium text-clinic-ink">{defaultValues.professionalName}</span></>
              )}
              {defaultValues.serviceName && (
                <> · <span className="font-medium text-clinic-ink">{defaultValues.serviceName}</span></>
              )}
              {appointmentLabel && (
                <> · <span className="font-medium text-clinic-ink">{appointmentLabel}</span></>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-clinic-muted hover:text-clinic-ink"
        >
          Cancelar
        </button>
      </div>

      {missingContext && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Este turno no tiene profesional o servicio asignado. El pago se registrará, pero puede afectar la
            rendición.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-clinic-ink">Monto (ARS) *</span>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            placeholder="0.00"
            className="h-10 rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-clinic-ink">Medio de pago *</span>
          <select
            value={form.method}
            onChange={(event) => setForm({ ...form, method: event.target.value })}
            className="h-10 rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand"
          >
            {METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-clinic-ink">Tipo *</span>
          <select
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value as PaymentKind })}
            className="h-10 rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand"
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-clinic-ink">Estado *</span>
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as "approved" | "pending" })}
            className="h-10 rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand"
          >
            <option value="approved">Cobrado</option>
            <option value="pending">Por cobrar</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2 xl:col-span-4">
          <span className="text-sm font-medium text-clinic-ink">Notas internas</span>
          <input
            type="text"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Opcional"
            className="h-10 rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand"
          />
        </label>

        {error && (
          <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex gap-2 md:col-span-2 xl:col-span-4">
          <Button disabled={saving} type="submit" variant="primary">
            {saving ? "Guardando..." : "Registrar pago"}
          </Button>
          <Button onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </SectionCard>
  );
}
