import { FormEvent, InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarCheck, CheckCircle2, CreditCard, MessageCircle, Stethoscope } from "lucide-react";
import {
  createPublicBooking,
  getClinicBySlug,
  getProfessionals,
  getPublicAvailableSlots,
  getServices
} from "../../lib/clinic-data";
import {
  AvailableSlot,
  Clinic,
  ProfessionalWithRelations,
  PublicBookingResult,
  ServiceWithRelations
} from "../../types/clinic";
import { supabase } from "../../lib/supabase";

type BookingForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  documentNumber: string;
  insurance: string;
  reason: string;
  coverageId: string;
  coverageKind: "catalog" | "particular" | "other" | "";
  customCoverageName: string;
};

const emptyForm: BookingForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  documentNumber: "",
  insurance: "",
  reason: "",
  coverageId: "",
  coverageKind: "",
  customCoverageName: ""
};

export function PublicBookingPage() {
  const { clinicSlug = "clinica-central", filter } = useParams();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [slotStartsAt, setSlotStartsAt] = useState("");
  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [coverages, setCoverages] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const loadedClinic = await getClinicBySlug(clinicSlug);
        setClinic(loadedClinic);
        if (!loadedClinic) {
          setError("No encontramos la clinica solicitada.");
          return;
        }
        setDate((current) => current || getDateInTimeZone(new Date(), loadedClinic.timezone ?? "America/Argentina/Mendoza"));
        const [serviceResult, professionalResult] = await Promise.all([
          getServices(loadedClinic.id),
          getProfessionals(loadedClinic.id)
        ]);
        const publicServices = serviceResult.data.filter((service) => service.active && service.public_booking_enabled);
        const activeProfessionals = professionalResult.data.filter((professional) => professional.active);
        setServices(publicServices);
        setProfessionals(activeProfessionals);

        const serviceFromFilter = publicServices.find((service) => service.slug === filter || service.id === filter);
        const professionalFromFilter = activeProfessionals.find(
          (professional) => professional.slug === filter || professional.id === filter
        );
        const selectedService =
          serviceFromFilter ??
          (professionalFromFilter
            ? publicServices.find((service) =>
                service.professionals.some((professional) => professional.id === professionalFromFilter.id)
              )
            : publicServices[0]);
        setServiceId(selectedService?.id ?? "");
        setProfessionalId(
          professionalFromFilter?.id ??
            selectedService?.professionals.find((professional) => professional.active)?.id ??
            activeProfessionals[0]?.id ??
            ""
        );
        const { data: coverageRows } = await supabase
          .from("health_coverages")
          .select("id, name")
          .eq("active", true)
          .eq("enabled_for_choice", true)
          .order("name")
          .limit(100);
        setCoverages(coverageRows ?? []);
      } catch (err) {
        console.error("Public booking load failed", {
          clinicSlug,
          filter,
          error: err
        });
        setError(err instanceof Error ? err.message : "No pudimos cargar la reserva online.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clinicSlug, filter]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId),
    [services, serviceId]
  );

  const compatibleProfessionals = useMemo(() => {
    if (!selectedService) return professionals;
    const ids = new Set(selectedService.professionals.map((professional) => professional.id));
    return professionals.filter((professional) => ids.has(professional.id));
  }, [professionals, selectedService]);

  useEffect(() => {
    if (!selectedService) return;
    if (!compatibleProfessionals.some((professional) => professional.id === professionalId)) {
      setProfessionalId(compatibleProfessionals[0]?.id ?? "");
    }
  }, [selectedService?.id, compatibleProfessionals.length]);

  useEffect(() => {
    if (!clinic || !professionalId || !serviceId || !date) {
      setSlots([]);
      setSlotStartsAt("");
      return;
    }
    setSlotsLoading(true);
    setError("");
    getPublicAvailableSlots({
      clinicSlug: clinic.slug,
      professionalId,
      serviceId,
      date
    })
      .then((available) => {
        setSlots(available);
        setSlotStartsAt((current) =>
          available.some((slot) => slot.startsAt === current) ? current : available[0]?.startsAt ?? ""
        );
      })
      .catch((err) => {
        console.error("Public booking slots failed", {
          clinicSlug: clinic.slug,
          professionalId,
          serviceId,
          date,
          error: err
        });
        setError(err instanceof Error ? err.message : "No pudimos cargar horarios.");
      })
      .finally(() => setSlotsLoading(false));
  }, [clinic?.slug, professionalId, serviceId, date]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validatePatientForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    const selectedSlot = slots.find((slot) => slot.startsAt === slotStartsAt);
    if (!selectedSlot) {
      setError("Selecciona un horario disponible para continuar.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const booking = await createPublicBooking({
        clinicSlug,
        professionalId,
        serviceId,
        startTime: selectedSlot.startsAt,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email || null,
        documentNumber: form.documentNumber || null,
        insurance: form.coverageKind === "particular" ? "Particular / Sin cobertura" : form.coverageKind === "other" ? "Otra" : form.insurance,
        coverageId: form.coverageKind === "catalog" ? form.coverageId : null,
        customCoverageName: form.coverageKind === "other" ? form.customCoverageName : null,
        reason: form.reason
      });
      if (requiresOnlinePayment(selectedService)) {
        const paymentResponse = await fetch("/api/payments/mercadopago/create-preference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: booking.appointment_id,
            amountType: selectedService?.deposit_required ? "deposit" : "full"
          })
        });
        const paymentData = await paymentResponse.json().catch(() => ({}));
        if (!paymentResponse.ok || !paymentData.checkout_url) {
          console.error("Mercado Pago preference request failed", {
            status: paymentResponse.status,
            error: paymentData.error ?? null,
            code: paymentData.code ?? null,
            stage: paymentData.stage ?? null,
            message: paymentData.message ?? null,
            mpStatus: paymentData.mpStatus ?? null,
            mpError: paymentData.mpError ?? null,
            appointmentId: booking.appointment_id
          });
          throw new Error(
            paymentData.error === "MERCADO_PAGO_NOT_CONFIGURED"
              ? "El pago online todavia no esta configurado para esta clinica."
              : paymentData.message || "No pudimos generar el link de pago."
          );
        }
        setCheckoutUrl(paymentData.checkout_url);
      }
      setResult(booking);
    } catch (err) {
      console.error("Public booking submit failed", {
        clinicSlug,
        professionalId,
        serviceId,
        slotStartsAt,
        error: err
      });
      setError(err instanceof Error ? err.message : "No pudimos crear la reserva.");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-surface px-4 py-8">
        <section className="w-full max-w-xl rounded-lg border border-clinic-line bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-clinic-ink">
            {checkoutUrl ? "Para confirmar tu turno, completa el pago." : "Tu turno fue solicitado correctamente."}
          </h1>
          <p className="mt-3 text-clinic-muted">
            {result.service} con Dr/a. {result.professional}, {formatDateTime(result.starts_at, result.timezone ?? clinic?.timezone ?? undefined)}.
          </p>
          <div className="mt-5 rounded-lg bg-teal-50 px-4 py-3 text-sm font-medium text-clinic-brand">
            Estado: {checkoutUrl ? "pago pendiente" : result.status === "pending" ? "pendiente de confirmacion" : "confirmado"}
          </div>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-5 py-3 font-semibold text-white hover:bg-teal-800"
            >
              <CreditCard size={18} />
              Pagar con Mercado Pago
            </a>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-clinic-surface">
      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[0.8fr_1.2fr] md:py-10">
        <aside className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm md:sticky md:top-6 md:self-start">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-clinic-brand text-white">
            <Stethoscope size={22} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-clinic-ink">Reservar turno</h1>
          <p className="mt-2 text-clinic-muted">
            {clinic?.name ?? "Medin"} · {clinic?.address ?? "Atencion presencial y telemedicina"}
          </p>
          <div className="mt-5 rounded-lg bg-teal-50 p-4 text-sm text-clinic-brand">
            La confirmacion y los recordatorios quedan preparados para WhatsApp.
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Message>{error}</Message>}
          {loading ? (
            <section className="rounded-lg border border-clinic-line bg-white p-8 text-center text-clinic-muted shadow-sm">
              Cargando reserva online...
            </section>
          ) : (
            <>
              <StepCard number="1" title="Elegi especialidad o servicio">
                <div className="grid gap-3">
                  {services.length === 0 ? (
                    <p className="text-sm text-clinic-muted">No hay servicios reservables online.</p>
                  ) : (
                    services.map((service) => (
                      <label
                        key={service.id}
                        className={`cursor-pointer rounded-lg border p-4 ${
                          serviceId === service.id
                            ? "border-clinic-brand bg-teal-50"
                            : "border-clinic-line bg-white"
                        }`}
                      >
                        <input
                          className="sr-only"
                          name="service"
                          type="radio"
                          value={service.id}
                          checked={serviceId === service.id}
                          onChange={() => setServiceId(service.id)}
                        />
                        <span className="font-semibold text-clinic-ink">{service.name}</span>
                        <span className="mt-1 block text-sm text-clinic-muted">
                          {service.specialty?.name ?? "Servicio"} · {service.duration_minutes} min
                        </span>
                        {requiresOnlinePayment(service) && (
                          <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            Requiere pago online {service.deposit_required ? `· Sena ${formatMoney(service.deposit_amount ?? service.price ?? 0)}` : ""}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </StepCard>

              <StepCard number="2" title="Elegi profesional">
                <select
                  value={professionalId}
                  onChange={(event) => setProfessionalId(event.target.value)}
                  className="h-11 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                >
                  {compatibleProfessionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      Dr/a. {professional.name} {professional.last_name}
                    </option>
                  ))}
                </select>
              </StepCard>

              <StepCard number="3" title="Fecha y horario">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-11 rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                  />
                  <select
                    value={slotStartsAt}
                    onChange={(event) => setSlotStartsAt(event.target.value)}
                    className="h-11 rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                  >
                    <option value="">{slotsLoading ? "Cargando..." : "Seleccionar horario"}</option>
                    {slots.map((slot) => (
                      <option key={slot.startsAt} value={slot.startsAt}>
                        {slot.time}
                      </option>
                    ))}
                  </select>
                </div>
              </StepCard>

              <StepCard number="4" title="Tus datos">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input required placeholder="Nombre" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
                  <Input required placeholder="Apellido" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
                  <Input required placeholder="Telefono / WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  <Input required placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                  <Input required placeholder="DNI" value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} />
                  <CoveragePicker form={form} coverages={coverages} onChange={setForm} />
                </div>
                <textarea
                  required
                  placeholder="Motivo de consulta"
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  className="mt-3 min-h-24 w-full resize-none rounded-lg border border-clinic-line bg-white px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                />
              </StepCard>

              <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <CalendarCheck className="mt-1 text-clinic-brand" size={20} />
                  <div>
                    <p className="font-semibold text-clinic-ink">Resumen</p>
                    <p className="mt-1 text-sm text-clinic-muted">
                      {selectedService?.name ?? "Servicio"} · {date} ·{" "}
                      {slots.find((slot) => slot.startsAt === slotStartsAt)?.time ?? "Sin horario"}
                    </p>
                    {requiresOnlinePayment(selectedService) && (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        Para confirmar tu turno, vas a continuar a Mercado Pago.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  disabled={saving || !slotStartsAt || services.length === 0 || compatibleProfessionals.length === 0}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MessageCircle size={18} />
                  {saving ? "Confirmando..." : requiresOnlinePayment(selectedService) ? "Continuar al pago" : "Confirmar solicitud"}
                </button>
              </section>
            </>
          )}
        </form>
      </section>
    </main>
  );
}

function StepCard({
  number,
  title,
  children
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-sm font-semibold text-clinic-brand">
          {number}
        </span>
        <h2 className="font-semibold text-clinic-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="h-11 rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      {...props}
    />
  );
}

function Message({ children }: { children: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>;
}

function formatDateTime(value: string, timezone = "America/Argentina/Mendoza") {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(value));
}

function getDateInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function requiresOnlinePayment(service?: ServiceWithRelations | null) {
  return Boolean(service?.allow_online_payment !== false && (service?.payment_required || service?.deposit_required));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value || 0));
}

function validatePatientForm(form: BookingForm) {
  if (!form.firstName.trim()) return "Ingresá tu nombre.";
  if (!form.lastName.trim()) return "Ingresá tu apellido.";
  if (!form.phone.trim()) return "Ingresá un teléfono o WhatsApp.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Ingresá un email válido.";
  if (!form.documentNumber.trim()) return "Ingresá tu DNI.";
  if (!form.coverageKind) return "Seleccioná tu obra social, prepaga o indicá particular.";
  if (form.coverageKind === "other" && !form.customCoverageName.trim()) return "Indicanos cuál es tu obra social o prepaga.";
  if (!form.reason.trim()) return "Contanos brevemente el motivo de la consulta.";
  return "";
}

function CoveragePicker({ form, coverages, onChange }: { form: BookingForm; coverages: Array<{ id: string; name: string }>; onChange: (next: BookingForm) => void }) {
  const matches = coverages.filter((coverage) => coverage.name.toLowerCase().includes(form.insurance.toLowerCase())).slice(0, 6);
  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-clinic-ink">Obra social, prepaga o cobertura</label>
      <input required value={form.insurance} onChange={(event) => onChange({ ...form, insurance: event.target.value, coverageId: "", coverageKind: "" })} placeholder="Buscá OSDE, OSEP, Swiss Medical..." className="mt-2 h-11 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" />
      {form.insurance && !form.coverageKind && (
        <div className="mt-2 grid gap-1 rounded-lg border border-clinic-line bg-white p-2">
          {matches.map((coverage) => <button key={coverage.id} type="button" onClick={() => onChange({ ...form, insurance: coverage.name, coverageId: coverage.id, coverageKind: "catalog" })} className="rounded-md px-3 py-2 text-left text-sm hover:bg-clinic-surface">{coverage.name}</button>)}
          <button type="button" onClick={() => onChange({ ...form, insurance: "Particular / Sin cobertura", coverageId: "", coverageKind: "particular" })} className="rounded-md px-3 py-2 text-left text-sm hover:bg-clinic-surface">Particular / Sin cobertura</button>
          <button type="button" onClick={() => onChange({ ...form, insurance: "Otra", coverageId: "", coverageKind: "other" })} className="rounded-md px-3 py-2 text-left text-sm hover:bg-clinic-surface">Otra</button>
        </div>
      )}
      {form.coverageKind === "particular" && <p className="mt-2 text-xs text-clinic-muted">Seleccioná esta opción si no tenés obra social/prepaga o preferís atenderte de forma particular.</p>}
      {form.coverageKind === "other" && <Input required placeholder="Indicanos cuál es tu obra social o prepaga" value={form.customCoverageName} onChange={(event) => onChange({ ...form, customCoverageName: event.target.value })} />}
      <p className="mt-2 text-xs text-clinic-muted">Usamos este dato para que la clínica pueda preparar tu atención. La cobertura queda sujeta a validación de la clínica.</p>
    </div>
  );
}
