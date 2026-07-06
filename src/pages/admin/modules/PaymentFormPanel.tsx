import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { getProfessionals, getServices, searchPatients } from "../../../lib/clinic-data";
import {
  ManualPaymentInput,
  Patient,
  PaymentKind,
  Professional,
  Service,
} from "../../../types/clinic";

type Props = {
  clinicId: string;
  defaultValues?: Partial<ManualPaymentInput>;
  error?: string;
  onCancel: () => void;
  onSubmit?: (input: ManualPaymentInput) => Promise<void> | void;
  submitDisabled?: boolean;
  submitLabel?: string;
};

const KIND_OPTIONS: { value: PaymentKind; label: string }[] = [
  { value: "payment",    label: "Pago completo" },
  { value: "deposit",    label: "Seña" },
  { value: "copay",      label: "Copago" },
  { value: "adjustment", label: "Ajuste" },
];

const METHOD_OPTIONS = [
  { value: "cash",     label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card",     label: "Tarjeta" },
  { value: "other",    label: "Otro" },
] as const;

const STATUS_OPTIONS = [
  { value: "approved", label: "Pagado" },
  { value: "pending",  label: "Pendiente" },
] as const;

export function PaymentFormPanel({
  clinicId,
  defaultValues,
  error: externalError,
  onCancel,
  onSubmit,
  submitDisabled = false,
  submitLabel = "Registrar pago",
}: Props) {
  // Patient search
  const [patientQuery, setPatientQuery]       = useState("");
  const [patientResults, setPatientResults]   = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const patientDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Professionals & services
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices]           = useState<Service[]>([]);

  // Form fields
  const [professionalId, setProfessionalId] = useState(defaultValues?.professionalId ?? "");
  const [serviceId, setServiceId]           = useState(defaultValues?.serviceId ?? "");
  const [kind, setKind]                     = useState<PaymentKind>(defaultValues?.kind ?? "payment");
  const [amount, setAmount]                 = useState(defaultValues?.amount ? String(defaultValues.amount) : "");
  const [method, setMethod]                 = useState<ManualPaymentInput["method"]>(defaultValues?.method ?? "cash");
  const [status, setStatus]                 = useState<"approved" | "pending">(defaultValues?.status ?? "approved");
  const [notes, setNotes]                   = useState(defaultValues?.notes ?? "");

  // Validation messages
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting]   = useState(false);

  // Load professionals and services once
  useEffect(() => {
    getProfessionals(clinicId).then((r) => setProfessionals(r.data.map((p) => p as unknown as Professional))).catch(() => {});
    getServices(clinicId).then((r) => setServices(r.data.map((s) => s as unknown as Service))).catch(() => {});
  }, [clinicId]);

  // Debounced patient search
  useEffect(() => {
    if (patientDebounce.current) clearTimeout(patientDebounce.current);
    if (!patientQuery.trim()) { setPatientResults([]); return; }
    patientDebounce.current = setTimeout(async () => {
      setSearchingPatient(true);
      try {
        const results = await searchPatients(clinicId, patientQuery);
        setPatientResults(results as unknown as Patient[]);
      } catch { setPatientResults([]); }
      finally { setSearchingPatient(false); }
    }, 300);
    return () => { if (patientDebounce.current) clearTimeout(patientDebounce.current); };
  }, [patientQuery, clinicId]);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!selectedPatient) errors.patient = "Seleccioná un paciente para registrar el pago.";
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) errors.amount = "El monto debe ser mayor a cero.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedPatient) return;
    if (!onSubmit) return;

    const input: ManualPaymentInput = {
      clinicId,
      patientId:      selectedPatient.id,
      professionalId: professionalId || null,
      serviceId:      serviceId || null,
      amount:         parseFloat(amount),
      currency:       "ARS",
      method,
      kind,
      status,
      notes:          notes.trim() || null,
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
    } finally {
      setSubmitting(false);
    }
  }

  const missingContext = !professionalId || !serviceId;

  return (
    <SectionCard className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-clinic-ink">Registrar pago</h2>
          <p className="mt-1 text-sm text-clinic-muted">
            Guardá un cobro operativo asociado a un paciente, turno o servicio.
          </p>
        </div>
        <button
          aria-label="Cerrar formulario"
          className="mt-0.5 rounded-md p-1 text-clinic-muted hover:bg-clinic-surface"
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
      </div>

      {externalError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {externalError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="grid gap-5">
        {/* Paciente */}
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-clinic-ink">
            Paciente <span className="text-red-500">*</span>
          </label>
          {selectedPatient ? (
            <div className="flex items-center gap-2 rounded-lg border border-clinic-brand bg-teal-50 px-3 py-2 text-sm">
              <span className="flex-1 font-medium text-clinic-ink">
                {selectedPatient.first_name} {selectedPatient.last_name}
              </span>
              <button
                className="text-clinic-muted hover:text-clinic-ink"
                onClick={() => { setSelectedPatient(null); setPatientQuery(""); }}
                type="button"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" />
              <input
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-clinic-line bg-white pl-8 pr-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                onChange={(e) => setPatientQuery(e.target.value)}
                placeholder="Buscar por nombre, DNI o teléfono..."
                type="text"
                value={patientQuery}
              />
              {(patientResults.length > 0 || searchingPatient) && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-clinic-line bg-white shadow-lg">
                  {searchingPatient && (
                    <li className="px-3 py-2 text-sm text-clinic-muted">Buscando...</li>
                  )}
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-clinic-surface"
                        onClick={() => { setSelectedPatient(p); setPatientQuery(""); setPatientResults([]); }}
                        type="button"
                      >
                        <span className="font-medium text-clinic-ink">{p.first_name} {p.last_name}</span>
                        {p.phone && <span className="ml-2 text-clinic-muted">{p.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {fieldErrors.patient && (
            <p className="text-xs text-red-500">{fieldErrors.patient}</p>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Profesional */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-clinic-ink">Profesional</label>
            <select
              className="h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              onChange={(e) => setProfessionalId(e.target.value)}
              value={professionalId}
            >
              <option value="">Sin profesional</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.last_name}</option>
              ))}
            </select>
          </div>

          {/* Servicio */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-clinic-ink">Servicio</label>
            <select
              className="h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              onChange={(e) => setServiceId(e.target.value)}
              value={serviceId}
            >
              <option value="">Sin servicio</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {missingContext && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sin profesional o servicio, este ingreso puede no aparecer en algunos reportes operativos.
          </p>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          {/* Tipo */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-clinic-ink">Tipo</label>
            <select
              className="h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              onChange={(e) => setKind(e.target.value as PaymentKind)}
              value={kind}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Medio */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-clinic-ink">Medio de pago</label>
            <select
              className="h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              onChange={(e) => setMethod(e.target.value as ManualPaymentInput["method"])}
              value={method}
            >
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-clinic-ink">Estado</label>
            <select
              className="h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              onChange={(e) => setStatus(e.target.value as "approved" | "pending")}
              value={status}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Monto */}
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-clinic-ink">
            Monto (ARS) <span className="text-red-500">*</span>
          </label>
          <input
            className="h-10 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100 md:max-w-[200px]"
            inputMode="decimal"
            min="0.01"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            step="0.01"
            type="number"
            value={amount}
          />
          {fieldErrors.amount && (
            <p className="text-xs text-red-500">{fieldErrors.amount}</p>
          )}
        </div>

        {/* Nota interna */}
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-clinic-ink">Nota interna</label>
          <textarea
            className="w-full rounded-lg border border-clinic-line bg-white px-3 py-2 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional. No visible para el paciente."
            rows={2}
            value={notes}
          />
        </div>

        {/* Microcopy fiscal */}
        <p className="text-xs text-clinic-muted">
          Este registro es operativo y no reemplaza comprobantes fiscales.
        </p>

        {/* Acciones */}
        <div className="flex items-center gap-3 border-t border-clinic-line pt-4">
          <Button
            disabled={submitDisabled || submitting}
            type="submit"
            variant="primary"
          >
            {submitting ? "Registrando..." : submitLabel}
          </Button>
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancelar
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
