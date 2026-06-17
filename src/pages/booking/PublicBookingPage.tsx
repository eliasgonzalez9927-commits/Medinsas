import { FormEvent, InputHTMLAttributes, ReactNode, useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, MessageCircle, Stethoscope } from "lucide-react";
import { bookingSlots, professionals, services } from "../../data/clinicMockData";

export function PublicBookingPage() {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState("first-available");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(bookingSlots[0]);
  const [submitted, setSubmitted] = useState(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId),
    [serviceId]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
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
            Te vamos a enviar la confirmacion por WhatsApp. El turno queda pendiente hasta que la
            clinica lo confirme.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button className="rounded-lg bg-clinic-brand px-4 py-3 text-sm font-semibold text-white">
              Enviar WhatsApp
            </button>
            <button className="rounded-lg border border-clinic-line px-4 py-3 text-sm font-semibold text-clinic-ink">
              Agregar a calendario
            </button>
            <button className="rounded-lg border border-clinic-line px-4 py-3 text-sm font-semibold text-clinic-ink">
              Reprogramar
            </button>
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
            Elegi servicio, profesional, fecha y horario. La clinica confirma por WhatsApp.
          </p>
          <div className="mt-5 rounded-lg bg-teal-50 p-4 text-sm text-clinic-brand">
            Clinica Central · Atencion presencial y telemedicina.
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-4">
          <StepCard number="1" title="Elegi especialidad o servicio">
            <div className="grid gap-3">
              {services.map((service) => (
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
                    {service.specialty} · {service.durationMinutes} min
                  </span>
                </label>
              ))}
            </div>
          </StepCard>

          <StepCard number="2" title="Elegi profesional">
            <select
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              className="h-11 w-full rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            >
              <option value="first-available">Primer turno disponible</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  Dr/a. {professional.name} {professional.lastName}
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
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="h-11 rounded-lg border border-clinic-line bg-white px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              >
                {bookingSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </StepCard>

          <StepCard number="4" title="Tus datos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input required placeholder="Nombre" />
              <Input required placeholder="Apellido" />
              <Input required placeholder="Telefono / WhatsApp" />
              <Input placeholder="Email opcional" type="email" />
              <Input placeholder="DNI opcional" />
              <Input placeholder="Obra social / prepaga" />
            </div>
            <textarea
              required
              placeholder="Motivo de consulta"
              className="mt-3 min-h-24 w-full resize-none rounded-lg border border-clinic-line bg-white px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            />
          </StepCard>

          <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <CalendarCheck className="mt-1 text-clinic-brand" size={20} />
              <div>
                <p className="font-semibold text-clinic-ink">Resumen</p>
                <p className="mt-1 text-sm text-clinic-muted">
                  {selectedService?.name} · {date} · {time}
                </p>
              </div>
            </div>
            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white hover:bg-teal-800">
              <MessageCircle size={18} />
              Confirmar solicitud
            </button>
          </section>
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
