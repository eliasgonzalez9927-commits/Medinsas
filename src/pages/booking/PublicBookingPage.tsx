import { FormEvent, InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarCheck, CheckCircle2, MessageCircle, Stethoscope } from "lucide-react";
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

type BookingForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  documentNumber: string;
  insurance: string;
  reason: string;
};

const emptyForm: BookingForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  documentNumber: "",
  insurance: "",
  reason: ""
};

export function PublicBookingPage() {
  const { clinicSlug = "clinica-central", filter } = useParams();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slotStartsAt, setSlotStartsAt] = useState("");
  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicBookingResult | null>(null);

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
        const selectedService = serviceFromFilter ?? publicServices[0];
        setServiceId(selectedService?.id ?? "");
        setProfessionalId(
          professionalFromFilter?.id ??
            selectedService?.professionals.find((professional) => professional.active)?.id ??
            activeProfessionals[0]?.id ??
            ""
        );
      } catch (err) {
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
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar horarios."))
      .finally(() => setSlotsLoading(false));
  }, [clinic?.slug, professionalId, serviceId, date]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        insurance: form.insurance || null,
        reason: form.reason || selectedService?.name || "Consulta"
      });
      setResult(booking);
    } catch (err) {
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
            Tu turno fue solicitado correctamente.
          </h1>
          <p className="mt-3 text-clinic-muted">
            {result.service} con Dr/a. {result.professional}, {formatDateTime(result.starts_at)}.
          </p>
          <div className="mt-5 rounded-lg bg-teal-50 px-4 py-3 text-sm font-medium text-clinic-brand">
            Estado: {result.status === "pending" ? "pendiente de confirmacion" : "confirmado"}
          </div>
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
            {clinic?.name ?? "ClinicOS"} · {clinic?.address ?? "Atencion presencial y telemedicina"}
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
                  <Input placeholder="Email opcional" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                  <Input placeholder="DNI opcional" value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} />
                  <Input placeholder="Obra social / prepaga" value={form.insurance} onChange={(event) => setForm({ ...form, insurance: event.target.value })} />
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
                  </div>
                </div>
                <button
                  disabled={saving || !slotStartsAt || services.length === 0 || compatibleProfessionals.length === 0}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MessageCircle size={18} />
                  {saving ? "Confirmando..." : "Confirmar solicitud"}
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
