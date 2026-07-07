import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  deleteAvailabilityBlock,
  deleteAvailabilityRule,
  getAvailabilityBlocks,
  getAvailabilityRules,
  getLocations,
  getProfessionals
} from "../../../lib/clinic-data";
import {
  AvailabilityBlock,
  AvailabilityRuleWithRelations,
  Location,
  ProfessionalWithRelations
} from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

const dayLabels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export function AvailabilityPage() {
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [rules, setRules] = useState<AvailabilityRuleWithRelations[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fromFallback, setFromFallback] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    day_of_week: 1,
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 30,
    location_id: ""
  });
  const [blockForm, setBlockForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    start_time: "10:30",
    end_time: "11:00",
    reason: ""
  });

  const visibleRules = useMemo(
    () => rules.filter((rule) => !professionalId || rule.professional_id === professionalId || rule.professional?.id === professionalId),
    [professionalId, rules]
  );

  async function load() {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      const [professionalsResult, loadedLocations, rulesResult, loadedBlocks] = await Promise.all([
        getProfessionals(clinic.id),
        getLocations(clinic.id),
        getAvailabilityRules(clinic.id),
        getAvailabilityBlocks(clinic.id)
      ]);
      setProfessionals(professionalsResult.data);
      setFromFallback(professionalsResult.fromFallback || rulesResult.fromFallback);
      setLocations(loadedLocations);
      setRules(rulesResult.data);
      setBlocks(loadedBlocks);
      setProfessionalId((current) => current || professionalsResult.data[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la disponibilidad.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (clinic) load();
  }, [clinic?.id]);

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic || !professionalId) return;
    if (clinic.id === "demo" || professionalId.includes("Dr")) {
      setError("Para crear horarios, primero ejecuta el seed real en Supabase.");
      return;
    }
    try {
      await createAvailabilityRule({
        clinic_id: clinic.id,
        professional_id: professionalId,
        location_id: ruleForm.location_id || null,
        day_of_week: Number(ruleForm.day_of_week),
        start_time: ruleForm.start_time,
        end_time: ruleForm.end_time,
        slot_duration_minutes: Number(ruleForm.slot_duration_minutes),
        active: true
      });
      setNotice("Horario creado correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el horario.");
    }
  }

  async function handleDeleteRule(rule: AvailabilityRuleWithRelations) {
    if (rule.clinic_id === "demo") {
      setError("Este horario es demo. Ejecuta el seed real para gestionarlo.");
      return;
    }
    try {
      await deleteAvailabilityRule(rule.id, clinic?.id);
      setNotice("Horario eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos eliminar el horario.");
    }
  }

  async function handleCreateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic) return;
    try {
      await createAvailabilityBlock({
        clinic_id: clinic.id,
        professional_id: professionalId || null,
        date: blockForm.date,
        start_time: blockForm.start_time,
        end_time: blockForm.end_time,
        reason: blockForm.reason || null
      });
      setNotice("Bloqueo creado correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el bloqueo.");
    }
  }

  async function handleDeleteBlock(block: AvailabilityBlock) {
    try {
      await deleteAvailabilityBlock(block.id, clinic?.id);
      setNotice("Bloqueo eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos eliminar el bloqueo.");
    }
  }

  return (
    <AdminPageShell
      description="Define dias de atencion, horarios, duracion de turnos, descansos y bloqueos."
      eyebrow="Configuracion operativa"
      title="Disponibilidad"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {fromFallback && (
        <Message tone="warning">
          Mostrando datos demo. Ejecuta `004_connect_operational_base.sql` para usar Supabase real.
        </Message>
      )}
      {error && <Message tone="error">{error}</Message>}
      {!clinic && !clinicLoading && <NoActiveClinicState />}

      {clinic && <>
      <section className="grid gap-4 lg:grid-cols-4">
        {[
          ["Lunes a viernes", "08:00 a 20:00"],
          ["Sabado", "09:00 a 13:00"],
          ["Domingo", "Cerrado"],
          ["Feriados", "Cerrado"]
        ].map(([label, value]) => (
          <SectionCard key={label} className="p-4">
            <p className="text-sm text-clinic-muted">{label}</p>
            <p className="mt-2 text-lg font-semibold text-clinic-ink">{value}</p>
          </SectionCard>
        ))}
      </section>

      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Disponibilidad por profesional</h2>
        <p className="mt-1 text-sm text-clinic-muted">
          Selecciona un profesional para revisar o cargar sus dias y horarios de atencion.
        </p>
        <label className="block max-w-xl">
          <span className="mt-4 block text-sm font-medium text-clinic-ink">Profesional</span>
          <select
            value={professionalId}
            onChange={(event) => setProfessionalId(event.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
          >
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                Dr/a. {professional.name} {professional.last_name}
              </option>
            ))}
          </select>
        </label>
      </SectionCard>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Dias y horarios de atencion</h2>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-clinic-muted">Cargando horarios...</div>
          ) : visibleRules.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <h3 className="font-semibold text-clinic-ink">Este profesional todavia no tiene horarios configurados.</h3>
              <p className="mt-2 text-sm text-clinic-muted">
                Agrega dias y horarios de atencion para habilitar reservas.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-clinic-line">
              {visibleRules.map((rule) => (
                <article key={rule.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_140px_180px_180px_100px] lg:items-center">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
                      <CalendarClock size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-clinic-ink">
                        {rule.professional
                          ? `Dr/a. ${rule.professional.name} ${rule.professional.last_name}`
                          : "Profesional"}
                      </p>
                      <p className="text-sm text-clinic-muted">{rule.location?.name ?? "Sin sede"}</p>
                    </div>
                  </div>
                  <p className="font-medium text-clinic-ink">{dayLabels[rule.day_of_week]}</p>
                  <p className="text-sm text-clinic-muted">
                    {rule.start_time.slice(0, 5)} a {rule.end_time.slice(0, 5)}
                  </p>
                  <p className="text-sm text-clinic-muted">Turnos de {rule.slot_duration_minutes} min</p>
                  <Button icon={<Trash2 size={15} />} onClick={() => handleDeleteRule(rule)}>
                    Eliminar
                  </Button>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Crear horario</h2>
          <form onSubmit={handleCreateRule} className="mt-4 grid gap-3">
            <SelectNumber label="Dia" value={ruleForm.day_of_week} onChange={(value) => setRuleForm({ ...ruleForm, day_of_week: value })} />
            <Input label="Desde" type="time" value={ruleForm.start_time} onChange={(value) => setRuleForm({ ...ruleForm, start_time: value })} />
            <Input label="Hasta" type="time" value={ruleForm.end_time} onChange={(value) => setRuleForm({ ...ruleForm, end_time: value })} />
            <Input
              label="Duracion"
              type="number"
              value={String(ruleForm.slot_duration_minutes)}
              onChange={(value) => setRuleForm({ ...ruleForm, slot_duration_minutes: Number(value) })}
            />
            <label>
              <span className="text-sm font-medium text-clinic-ink">Sede</span>
              <select
                value={ruleForm.location_id}
                onChange={(event) => setRuleForm({ ...ruleForm, location_id: event.target.value })}
                className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Sin sede</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <Button icon={<Plus size={16} />} type="submit" variant="primary">
              Agregar horario
            </Button>
          </form>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Crear bloqueo o excepcion</h2>
          <p className="mt-1 text-sm text-clinic-muted">Feriados, ausencias, almuerzos o cambios puntuales.</p>
          <form onSubmit={handleCreateBlock} className="mt-4 grid gap-3">
            <Input label="Fecha" type="date" value={blockForm.date} onChange={(value) => setBlockForm({ ...blockForm, date: value })} />
            <Input label="Desde" type="time" value={blockForm.start_time} onChange={(value) => setBlockForm({ ...blockForm, start_time: value })} />
            <Input label="Hasta" type="time" value={blockForm.end_time} onChange={(value) => setBlockForm({ ...blockForm, end_time: value })} />
            <Input label="Motivo" value={blockForm.reason} onChange={(value) => setBlockForm({ ...blockForm, reason: value })} />
            <Button type="submit" variant="primary">Agregar bloqueo</Button>
          </form>
        </SectionCard>
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Bloqueos y excepciones</h2>
          </div>
          {blocks.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-clinic-muted">No hay bloqueos cargados.</div>
          ) : (
            <div className="divide-y divide-clinic-line">
              {blocks.map((block) => (
                <article key={block.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-clinic-ink">{block.date}</p>
                    <p className="text-sm text-clinic-muted">
                      {block.start_time.slice(0, 5)} a {block.end_time.slice(0, 5)} · {block.reason ?? "Sin motivo"}
                    </p>
                  </div>
                  <Button icon={<Trash2 size={15} />} onClick={() => handleDeleteBlock(block)}>Eliminar</Button>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
      </>}
    </AdminPageShell>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}

function SelectNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      >
        {dayLabels.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Message({ children, tone }: { children: string; tone: "success" | "warning" | "error" }) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-700"
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}
