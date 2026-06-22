import { FormEvent, InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, CalendarCheck, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Download, ExternalLink, LockKeyhole, MessageCircle, Search, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
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
  const [privateUrl, setPrivateUrl] = useState("");
  const [publicCode, setPublicCode] = useState("");
  const [publicToken, setPublicToken] = useState("");
  const [coverages, setCoverages] = useState<Array<{ id: string; name: string }>>([]);
  const [serviceQuery, setServiceQuery] = useState("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [step, setStep] = useState(1);

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
            : undefined);
        setServiceId(selectedService?.id ?? "");
        setProfessionalId(
          professionalFromFilter?.id ??
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

  const filteredServices = useMemo(() => {
    const query = serviceQuery.trim().toLowerCase();
    if (!query) return services;
    return services.filter((service) => [service.name, service.specialty?.name ?? "", ...service.professionals.map((professional) => `${professional.name} ${professional.last_name}`)].join(" ").toLowerCase().includes(query));
  }, [services, serviceQuery]);

  useEffect(() => {
    if (!selectedService) return;
    if (!compatibleProfessionals.some((professional) => professional.id === professionalId)) {
      setProfessionalId("");
      setDate("");
      setSlotStartsAt("");
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

  useEffect(() => {
    if (!clinic || !professionalId || !serviceId) return;
    let cancelled = false;
    setDatesLoading(true);
    const timezone = clinic.timezone ?? "America/Argentina/Mendoza";
    const candidates = Array.from({ length: 21 }, (_, index) => addDays(getDateInTimeZone(new Date(), timezone), index));
    Promise.all(candidates.map(async (candidate) => {
      const available = await getPublicAvailableSlots({ clinicSlug: clinic.slug, professionalId, serviceId, date: candidate }).catch(() => []);
      return available.length ? candidate : null;
    })).then((results) => {
      if (cancelled) return;
      const available = results.filter(Boolean) as string[];
      setAvailableDates(available);
      if (available.length && !available.includes(date)) setDate(available[0]);
    }).finally(() => { if (!cancelled) setDatesLoading(false); });
    return () => { cancelled = true; };
  }, [clinic?.slug, clinic?.timezone, professionalId, serviceId]);

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
      } else {
        const linkResponse = await fetch(`/api/appointments/${booking.appointment_id}/public-link`, { method: "POST" });
        const linkData = await linkResponse.json().catch(() => ({}));
        if (linkResponse.ok && linkData.url) {
          setPrivateUrl(linkData.url);
          setPublicCode(linkData.public_code ?? "");
          setPublicToken(linkData.token ?? "");
        }
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
            {checkoutUrl ? "Para confirmar tu turno, completa el pago." : result.status === "confirmed" ? "Tu turno fue confirmado" : "Tu solicitud de turno fue recibida"}
          </h1>
          <p className="mt-3 text-clinic-muted">
            {result.service} con Dr/a. {result.professional}, {formatDateTime(result.starts_at, result.timezone ?? clinic?.timezone ?? undefined)}.
          </p>
          {!checkoutUrl && publicCode && (
            <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-clinic-brand">
              Código de turno: {publicCode}
            </div>
          )}
          <div className="mt-5 rounded-lg bg-teal-50 px-4 py-3 text-sm font-medium text-clinic-brand">
            Estado: {checkoutUrl ? "Pendiente de pago" : result.status === "pending" ? "Pendiente de confirmación" : "Confirmado"}
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
          {!checkoutUrl && (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {privateUrl && (
                <a href={privateUrl} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-clinic-line px-5 py-3 font-semibold text-clinic-ink hover:bg-clinic-surface">
                  <ExternalLink size={18} /> Ver mi turno
                </a>
              )}
              <a
                href={buildConfirmationGoogleCalendarUrl(result, clinic)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-clinic-brand px-5 py-3 font-semibold text-white hover:bg-teal-800"
              >
                <CalendarPlus size={18} /> Agregar a Google Calendar
              </a>
              {publicToken && (
                <a href={`/api/appointments/public/${encodeURIComponent(publicToken)}/calendar.ics`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-clinic-line px-5 py-3 font-semibold text-clinic-ink hover:bg-clinic-surface">
                  <Download size={18} /> Descargar .ics
                </a>
              )}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6faf9] px-4 py-4 text-[#0d3642] sm:px-6 lg:py-8">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 rounded-2xl border border-[#dcebea] bg-white px-5 py-4 shadow-sm sm:px-8">
        <div className="flex items-center gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e6f4f1] text-[#0f8b7c]"><Stethoscope size={24}/></span><div><p className="text-2xl font-semibold">Medin</p><p className="text-xs text-[#0f8b7c]">healthtech</p></div><span className="hidden h-10 w-px bg-[#dcebea] sm:block"/><div className="flex items-center gap-3"><Building2 className="text-[#0d3642]" size={20}/><div><p className="font-semibold">{clinic?.name ?? "Clínica"}</p><p className="text-sm text-clinic-muted">{clinic?.address ?? "Atención presencial y telemedicina"}</p></div></div></div>
        <div className="flex gap-4 text-sm font-medium text-[#0d3642]"><span className="flex items-center gap-2"><ShieldCheck size={19}/>Tus datos están protegidos</span><span className="hidden items-center gap-2 sm:flex"><MessageCircle size={19}/>Recordatorios por WhatsApp</span></div>
      </header>
      <section className="mx-auto max-w-7xl py-7"><BookingStepper step={step}/></section>
      <section className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={handleSubmit} className="order-1 space-y-4">
          {error && <Message>{error}</Message>}
          {loading ? (
            <section className="rounded-lg border border-clinic-line bg-white p-8 text-center text-clinic-muted shadow-sm">
              Cargando reserva online...
            </section>
          ) : (
            <>
              {step === 1 && <StepCard number="1" title="Reservá tu turno" subtitle="Elegí la prestación que necesitás. Luego seleccionaremos el profesional y el horario.">
                <div className="relative mb-4"><Search className="absolute left-3 top-3 text-clinic-muted" size={18}/><input value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Buscá por especialidad, servicio o profesional" className="h-11 w-full rounded-xl border border-clinic-line bg-white pl-10 pr-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" /></div>
                <div className="mb-5 flex flex-wrap gap-2">{["Todas", "Consulta", "Odontología", "Dermatología", "Kinesiología", "Traumatología", "Estudios", "Control"].map((label) => <button key={label} type="button" onClick={() => setServiceQuery(label === "Todas" ? "" : label)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${(!serviceQuery && label === "Todas") || serviceQuery === label ? "border-[#0f8b7c] bg-[#e6f4f1] text-[#0f766e]" : "border-clinic-line bg-white text-clinic-muted"}`}>{label}</button>)}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredServices.length === 0 ? (
                    <p className="text-sm text-clinic-muted">No hay servicios reservables online.</p>
                  ) : (
                    filteredServices.map((service) => (
                      <label
                        key={service.id}
                          className={`cursor-pointer rounded-xl border p-4 transition ${
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
                          onChange={() => {
                            setServiceId(service.id);
                            setProfessionalId("");
                            setDate("");
                            setSlotStartsAt("");
                          }}
                        />
                        <span className="flex items-center justify-between font-semibold text-clinic-ink">{service.name}{serviceId === service.id && <CheckCircle2 size={18} className="text-[#0f8b7c]"/>}</span>
                        <span className="mt-1 block text-sm text-clinic-muted">
                          {service.specialty?.name ?? "Servicio"} · {service.duration_minutes} min
                        </span>
                        {requiresOnlinePayment(service) && (
                          <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            {service.deposit_required ? "Requiere seña para reservar" : "Requiere pago online"}
                          </span>
                        )}
                        {!requiresOnlinePayment(service) && <span className="mt-2 inline-flex rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Sin pago online</span>}
                      </label>
                    ))
                  )}
                </div><p className="mt-5 rounded-xl bg-[#e6f4f1] px-4 py-3 text-sm text-[#0d7066]">Algunas prestaciones requieren seña para confirmar el turno. Podrás ver el monto antes de continuar.</p><StepActions onNext={() => setStep(2)} nextDisabled={!serviceId}/>
              </StepCard>}

              {step === 2 && <StepCard number="2" title="Elegí profesional" subtitle="Seleccioná un profesional o dejá que Medin asigne el primer disponible."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{compatibleProfessionals.map((professional) => <button key={professional.id} type="button" onClick={() => setProfessionalId(professional.id)} className={`rounded-xl border p-4 text-left ${professionalId === professional.id ? "border-[#0f8b7c] bg-[#e6f4f1]" : "border-clinic-line bg-white"}`}><UserRound className="mb-3 text-[#0f8b7c]" size={22}/><p className="font-semibold">Dr/a. {professional.name} {professional.last_name}</p><p className="mt-1 text-sm text-clinic-muted">{professional.specialties?.[0]?.name ?? "Profesional"}</p></button>)}</div><StepActions onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!professionalId}/></StepCard>}

              {step === 3 && <StepCard number="3" title="Elegí fecha y horario" subtitle="Elegí el día y el horario que más te convenga.">
                <p className="mb-3 text-sm text-clinic-muted">{datesLoading ? "Buscando el próximo turno disponible..." : availableDates.length ? `Próximo turno disponible: ${formatDate(availableDates[0])}` : "No encontramos turnos disponibles para este servicio. Contactá a la clínica."}</p>
                <div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={() => availableDates[0] && setDate(availableDates[0])} className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold">Primer turno disponible</button><button type="button" onClick={() => { const next = availableDates.find((value) => value <= addDays(getDateInTimeZone(new Date(), clinic?.timezone ?? "America/Argentina/Mendoza"), 6)); if (next) setDate(next); }} className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold">Esta semana</button><button type="button" onClick={() => { const next = availableDates.find((value) => value >= addDays(getDateInTimeZone(new Date(), clinic?.timezone ?? "America/Argentina/Mendoza"), 7)); if (next) setDate(next); }} className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold">Próxima semana</button></div>
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">{availableDates.map((value) => <button key={value} type="button" onClick={() => setDate(value)} className={`min-w-24 rounded-xl border px-3 py-3 text-sm font-semibold ${date === value ? "border-clinic-brand bg-teal-50 text-clinic-brand" : "border-clinic-line bg-white text-clinic-ink"}`}>{formatDate(value)}</button>)}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    min={availableDates[0]}
                    className="h-11 rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map((slot) => <button key={slot.startsAt} type="button" onClick={() => setSlotStartsAt(slot.startsAt)} className={`h-11 rounded-xl border text-sm font-semibold ${slotStartsAt === slot.startsAt ? "border-[#0f8b7c] bg-[#e6f4f1] text-[#0f766e]" : "border-clinic-line bg-white"}`}>{slot.time}</button>)}{slotsLoading && <p className="text-sm text-clinic-muted">Cargando horarios...</p>}</div>
                </div>
                <StepActions onBack={() => setStep(2)} onNext={() => setStep(4)} nextDisabled={!slotStartsAt}/></StepCard>}

              {step === 4 && <StepCard number="4" title="Completá tus datos" subtitle="Necesitamos esta información para confirmar tu turno y enviarte los recordatorios.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre"><Input required placeholder="Ej. María" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></Field>
                  <Field label="Apellido"><Input required placeholder="Ej. González" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></Field>
                  <Field label="Teléfono / WhatsApp"><Input required placeholder="Ej. 261 555 1234" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
                  <Field label="Email"><Input required placeholder="Ej. maria@email.com" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
                  <Field label="DNI"><Input required placeholder="Ej. 12345678" value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} /></Field>
                  <CoveragePicker form={form} coverages={coverages} onChange={setForm} />
                </div>
                <label className="mt-3 block text-sm font-medium text-clinic-ink">Motivo de consulta
                <textarea
                  placeholder="Motivo de consulta"
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  className="mt-3 min-h-24 w-full resize-none rounded-lg border border-clinic-line bg-white px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                /></label><div className="mt-4 rounded-xl bg-[#e6f4f1] p-4 text-sm"><p className="font-semibold">Resumen de tu reserva</p><p className="mt-1 text-clinic-muted">{selectedService?.name} · Dr/a. {compatibleProfessionals.find((p) => p.id === professionalId)?.name ?? ""} · {formatDate(date)} · {slots.find((slot) => slot.startsAt === slotStartsAt)?.time}</p></div></StepCard>}

              {step === 4 && <section className="rounded-xl border border-clinic-line bg-white p-5 shadow-sm">
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
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={() => setStep(3)} className="min-h-11 rounded-xl border border-clinic-line px-5 text-sm font-semibold">Volver</button><button
                  disabled={saving || !slotStartsAt || services.length === 0 || compatibleProfessionals.length === 0}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d3642] px-5 py-3 font-semibold text-white transition hover:bg-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <MessageCircle size={18} />
                  {saving ? "Confirmando..." : requiresOnlinePayment(selectedService) ? "Continuar al pago" : "Confirmar solicitud"}
                </button></div>
              </section>}
            </>
          )}
        </form>
        <aside className="order-2 h-fit rounded-2xl border border-[#dcebea] bg-white p-5 shadow-sm lg:sticky lg:top-6"><BookingSummary clinic={clinic} service={selectedService} professional={compatibleProfessionals.find((p) => p.id === professionalId) ?? null} date={date} time={slots.find((slot) => slot.startsAt === slotStartsAt)?.time ?? ""}/></aside>
      </section>
      <p className="mx-auto mt-6 max-w-7xl text-center text-xs text-clinic-muted"><LockKeyhole className="mr-1 inline" size={14}/> Sitio seguro y protegido. Cumplimos con la Ley 25.326 de Protección de Datos Personales.</p>
    </main>
  );
}

function BookingStepper({ step }: { step: number }) {
  const labels = ["Prestación", "Profesional", "Fecha y hora", "Tus datos", "Confirmación"];
  return <ol className="grid grid-cols-5 gap-1 border-b border-[#dcebea]">{labels.map((label, index) => { const current = index + 1; const completed = current < step; return <li key={label} className={`flex min-w-0 items-center gap-2 border-b-2 px-1 pb-3 text-xs font-semibold sm:text-sm ${current === step || completed ? "border-[#0f8b7c] text-[#0d3642]" : "border-transparent text-clinic-muted"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${current === step || completed ? "bg-[#0f8b7c] text-white" : "border border-[#dcebea] bg-white"}`}>{completed ? <Check size={15}/> : current}</span><span className="hidden truncate md:block">{label}</span></li>; })}</ol>;
}

function StepActions({ onBack, onNext, nextDisabled }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#dcebea] pt-5 sm:flex-row sm:justify-between">{onBack ? <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-clinic-line px-5 text-sm font-semibold text-clinic-ink"><ChevronLeft className="mr-1 inline" size={17}/>Volver</button> : <span/>}<button type="button" disabled={nextDisabled} onClick={onNext} className="min-h-11 rounded-xl bg-[#0d3642] px-5 text-sm font-semibold text-white disabled:opacity-40">Continuar <ChevronRight className="ml-1 inline" size={17}/></button></div>;
}

function BookingSummary({ clinic, service, professional, date, time }: { clinic: Clinic | null; service?: ServiceWithRelations; professional: ProfessionalWithRelations | null; date: string; time: string }) {
  const items = [["Prestación", service?.name ?? "Aún no seleccionada", Stethoscope], ["Profesional", professional ? `Dr/a. ${professional.name} ${professional.last_name}` : "Aún no seleccionado", UserRound], ["Fecha y hora", date && time ? `${formatDate(date)} · ${time}` : "Aún no seleccionada", CalendarDays]];
  return <><h2 className="text-lg font-semibold">Resumen de tu reserva</h2><div className="mt-5 rounded-xl border border-[#dcebea] p-4"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#e6f4f1]"><Building2 size={19}/></span><div><p className="font-semibold">{clinic?.name ?? "Clínica"}</p><p className="text-sm text-clinic-muted">{clinic?.address ?? "Dirección a confirmar"}</p></div></div></div><div className="mt-4 rounded-xl bg-[#e6f4f1] p-4 text-sm text-[#0d7066]"><MessageCircle className="mr-2 inline" size={17}/>Te enviaremos la confirmación y los recordatorios por WhatsApp.</div><div className="mt-4 divide-y divide-[#e8efee]">{items.map(([label,value,Icon]: any) => <div key={label} className="flex gap-3 py-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6faf9]"><Icon size={17}/></span><div><p className="text-xs font-semibold text-clinic-muted">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div></div>)}</div><div className="mt-5 border-t border-[#dcebea] pt-4 text-sm text-clinic-muted"><p><ShieldCheck className="mr-2 inline text-[#0f8b7c]" size={16}/>Reserva segura</p><p className="mt-3"><LockKeyhole className="mr-2 inline text-[#0f8b7c]" size={16}/>Datos protegidos</p></div></>;
}

function StepCard({
  number,
  title,
  children, subtitle
}: {
  number: string;
  title: string;
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <section className="rounded-2xl border border-[#dcebea] bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-sm font-semibold text-clinic-brand">
          {number}
        </span>
        <div><h2 className="text-2xl font-semibold text-[#0d3642]">{title}</h2>{subtitle && <p className="mt-2 text-sm text-clinic-muted">{subtitle}</p>}</div>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-clinic-ink"><span>{label}</span>{children}</label>;
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

function buildConfirmationGoogleCalendarUrl(result: PublicBookingResult, clinic: Clinic | null) {
  const start = new Date(result.starts_at);
  const end = new Date(result.end_time);
  const timezone = result.timezone ?? clinic?.timezone ?? "America/Argentina/Mendoza";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Turno en ${clinic?.name ?? "Medin"} - ${result.service}`,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    ctz: timezone,
    location: clinic?.address ?? "",
    details: `Servicio: ${result.service}\nProfesional: ${result.professional}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toGoogleDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
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
