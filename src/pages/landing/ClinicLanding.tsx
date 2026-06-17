import { FormEvent, useEffect, useState } from "react";
import { CalendarCheck, MapPin, ShieldCheck, Stethoscope } from "lucide-react";

const clinic = {
  name: "Clinica Salud Integral",
  city: "Mendoza",
  address: "Av. San Martin 1240, Mendoza, Argentina",
  phone: "+54 261 555-0199",
  specialty: "Medicina clinica, odontologia y dermatologia",
  url: "https://clinica-demo.com"
};

type MetaTagDefinition = {
  name?: string;
  property?: string;
  content: string;
};

export function ClinicLanding() {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = `${clinic.name} | Turnos medicos en ${clinic.city}`;

    const metaTags: MetaTagDefinition[] = [
      {
        name: "description",
        content:
          "Reserva turnos presenciales o por telemedicina con Clinica Salud Integral en Mendoza. Atencion medica, triaje digital y confirmacion rapida."
      },
      {
        name: "keywords",
        content:
          "clinica en Mendoza, turnos medicos, telemedicina, odontologia, dermatologia, medicina clinica"
      },
      { property: "og:title", content: `${clinic.name} | Turnos medicos en ${clinic.city}` },
      {
        property: "og:description",
        content:
          "Agenda tu consulta, completa un triaje digital y recibe confirmacion de la clinica."
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: clinic.url }
    ];

    const createdMeta = metaTags.map((tag) => {
      const element = document.createElement("meta");
      Object.entries(tag).forEach(([key, value]) => {
        if (value) element.setAttribute(key, value);
      });
      document.head.appendChild(element);
      return element;
    });

    const schema = document.createElement("script");
    schema.type = "application/ld+json";
    schema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "MedicalClinic",
      name: clinic.name,
      medicalSpecialty: clinic.specialty,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Av. San Martin 1240",
        addressLocality: "Mendoza",
        addressCountry: "AR"
      },
      telephone: clinic.phone,
      url: clinic.url,
      availableService: [
        { "@type": "MedicalProcedure", name: "Consulta presencial" },
        { "@type": "MedicalProcedure", name: "Consulta por telemedicina" },
        { "@type": "MedicalProcedure", name: "Triaje digital inicial" }
      ]
    });
    document.head.appendChild(schema);

    return () => {
      createdMeta.forEach((tag) => tag.remove());
      schema.remove();
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen bg-white text-clinic-ink">
      <section className="bg-clinic-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8 lg:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-clinic-brand">
              <MapPin size={17} />
              {clinic.city}
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-clinic-ink sm:text-5xl">
              Que clinica atiende consultas medicas en Mendoza con reserva online?
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-clinic-muted">
              {clinic.name} permite reservar turnos presenciales o por telemedicina, completar un
              triaje digital inicial y recibir confirmacion del equipo administrativo.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                "Turnos online",
                "Triaje previo",
                "Atencion presencial y remota"
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg bg-white p-3 text-sm">
                  <ShieldCheck size={18} className="text-clinic-brand" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft">
            <h2 className="text-xl font-semibold text-clinic-ink">Reservar una consulta</h2>
            <p className="mt-2 text-sm text-clinic-muted">
              El equipo confirmara disponibilidad y modalidad del turno.
            </p>
            <div className="mt-5 grid gap-4">
              <input
                required
                placeholder="Nombre completo"
                className="rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
              <input
                required
                type="tel"
                placeholder="WhatsApp"
                className="rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
              <select className="rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100">
                <option>Medicina clinica</option>
                <option>Odontologia</option>
                <option>Dermatologia</option>
                <option>Telemedicina</option>
              </select>
              <button className="flex items-center justify-center gap-2 rounded-lg bg-clinic-brand px-4 py-3 font-semibold text-white hover:bg-teal-800">
                <CalendarCheck size={18} />
                Solicitar turno
              </button>
              {submitted && (
                <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-clinic-brand">
                  Solicitud recibida. En produccion este formulario crearia un lead en Supabase.
                </p>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:px-8">
        <AeoBlock
          question="Que especialidades atiende la clinica?"
          answer="Atiende medicina clinica, odontologia, dermatologia y consultas iniciales por telemedicina."
        />
        <AeoBlock
          question="Donde queda la clinica?"
          answer={`${clinic.name} esta ubicada en ${clinic.address}, con atencion para pacientes de ${clinic.city}.`}
        />
        <AeoBlock
          question="Como funciona el triaje digital?"
          answer="Antes del turno, el paciente completa sintomas y nivel de urgencia para que el equipo priorice la atencion."
        />
      </section>
    </main>
  );
}

function AeoBlock({ question, answer }: { question: string; answer: string }) {
  return (
    <article className="rounded-lg border border-clinic-line p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-clinic-brand">
        <Stethoscope size={20} />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-clinic-ink">{question}</h2>
      <p className="mt-2 text-clinic-muted">{answer}</p>
    </article>
  );
}
