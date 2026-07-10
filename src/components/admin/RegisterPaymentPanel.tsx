import { FormEvent, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
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
  const [debugError, setDebugError] = useState<{ code?: string; message?: string; details?: string; hint?: string } | null>(null);

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
      setDebugError(null);
      onSaved?.();
      onClose();
    } catch (err) {
      const e = err as { code?: string; message?: string; details?: string; hint?: string } | null;
      setError("No pudimos registrar el pago. Revisá los datos e intentá nuevamente.");
      setDebugError({
        code: e?.code,
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
      });
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-clinic-line bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-clinic-line px-6 py-4">
          <div>
            <h2 className="font-semibold text-clinic-ink">Registrar pago manual</h2>
            {defaultValues?.patientName && (
              <p className="mt-1 text-sm text-clinic-muted">
                <span className="font-medium text-clinic-ink">{defaultValues.patientName}</span>
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
            className="ml-4 rounded-lg p-1 text-clinic-muted hover:bg-[#e6f4f1] hover:text-clinic-ink"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {missingContext && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Este turno no tiene profesional o servicio asignado. El pago se registrará, pero puede afectar la
                rendición.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
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

            <label className="flex flex-col gap-1 md:col-span-2">
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
              <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {debugError && (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 font-mono space-y-1">
                <p className="font-semibold text-slate-500 text-[11px] uppercase tracking-wide">Detalle técnico para soporte</p>
                {debugError.code && <p><span className="text-slate-400">code:</span> {debugError.code}</p>}
                {debugError.message && <p><span className="text-slate-400">message:</span> {debugError.message}</p>}
                {debugError.details && <p><span className="text-slate-400">details:</span> {debugError.details}</p>}
                {debugError.hint && <p><span className="text-slate-400">hint:</span> {debugError.hint}</p>}
                {!debugError.code && !debugError.message && !debugError.details && !debugError.hint && (
                  <p className="text-slate-400">No hay detalles disponibles del error.</p>
                )}
              </div>
            )}

            <div className="flex gap-2 md:col-span-2">
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? "Guardando..." : "Registrar pago"}
              </Button>
              <Button type="button" onClick={onClose}>Cancelar</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
