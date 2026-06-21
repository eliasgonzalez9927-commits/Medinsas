import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { getDefaultClinic } from "../../../lib/clinic-data";
import { supabase } from "../../../lib/supabase";
import { Clinic, HealthCoverage } from "../../../types/clinic";

export function CoverageSettingsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [coverages, setCoverages] = useState<HealthCoverage[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("obra_social");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const currentClinic = await getDefaultClinic();
      setClinic(currentClinic);
      if (!currentClinic) return;
      const [coverageResult, acceptedResult] = await Promise.all([
        supabase.from("health_coverages").select("*").eq("active", true).order("name").limit(300),
        supabase.from("clinic_accepted_coverages").select("coverage_id, accepted").eq("clinic_id", currentClinic.id)
      ]);
      if (coverageResult.error) throw coverageResult.error;
      if (acceptedResult.error) throw acceptedResult.error;
      setCoverages((coverageResult.data ?? []) as HealthCoverage[]);
      setAccepted(new Set((acceptedResult.data ?? []).filter((item: any) => item.accepted).map((item: any) => item.coverage_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar coberturas.");
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => coverages.filter((coverage) => coverage.name.toLowerCase().includes(query.toLowerCase())), [coverages, query]);

  async function toggle(coverageId: string) {
    if (!clinic) return;
    const next = !accepted.has(coverageId);
    const { error: saveError } = await supabase.from("clinic_accepted_coverages").upsert({
      clinic_id: clinic.id,
      coverage_id: coverageId,
      accepted: next,
      updated_at: new Date().toISOString()
    }, { onConflict: "clinic_id,coverage_id" });
    if (saveError) return setError("No pudimos actualizar la cobertura aceptada.");
    setAccepted((current) => {
      const result = new Set(current);
      next ? result.add(coverageId) : result.delete(coverageId);
      return result;
    });
  }

  async function createCoverage(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const normalized_name = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const { data, error: saveError } = await supabase.from("health_coverages").upsert({ name: name.trim(), normalized_name, type, source: "clinic_manual", active: true, enabled_for_choice: true }, { onConflict: "normalized_name" }).select("*").single();
    if (saveError || !data) return setError("No pudimos agregar la cobertura.");
    setName("");
    setNotice("Cobertura agregada al catálogo. Ahora podés aceptarla para esta clínica.");
    await load();
  }

  return <AdminPageShell title="Coberturas aceptadas" eyebrow="Configuración" description="Catálogo operativo de obras sociales, prepagas y agentes del seguro. La reserva no se bloquea si el paciente no tiene cobertura." onRefresh={load}>
    {notice && <Alert tone="success">{notice}</Alert>}
    {error && <Alert tone="error">{error}</Alert>}
    {!coverages.length && !error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Todavía no cargaste el catálogo de coberturas. Importá el CSV oficial RNAS desde Importaciones o agregá una cobertura manual.</div>}
    <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <SectionCard className="overflow-hidden">
        <div className="border-b border-clinic-line p-5">
          <div className="relative max-w-xl"><Search size={17} className="absolute left-3 top-3 text-clinic-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cobertura por nombre o código RNAS" className="h-10 w-full rounded-lg border border-clinic-line pl-9 pr-3 text-sm" /></div>
        </div>
        <div className="divide-y divide-clinic-line">
          {visible.map((coverage) => {
            const isAccepted = accepted.has(coverage.id);
            return <div key={coverage.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-semibold text-clinic-ink">{coverage.name}</p><p className="text-sm text-clinic-muted">{coverage.type.replace("_", " ")}{coverage.rnas_code ? ` · RNAS ${coverage.rnas_code}` : ""}</p></div><Button onClick={() => toggle(coverage.id)} icon={isAccepted ? <Check size={16} /> : <Plus size={16} />} variant={isAccepted ? "secondary" : "primary"}>{isAccepted ? "Aceptada" : "Aceptar"}</Button></div>;
          })}
          {!visible.length && <p className="px-5 py-8 text-sm text-clinic-muted">No encontramos coberturas en el catálogo.</p>}
        </div>
      </SectionCard>
      <SectionCard className="p-5"><h2 className="font-semibold text-clinic-ink">Agregar cobertura manual</h2><p className="mt-1 text-sm text-clinic-muted">Útil cuando una cobertura todavía no está incluida en la importación RNAS.</p><form onSubmit={createCoverage} className="mt-5 grid gap-4"><label><span className="text-sm font-medium">Nombre</span><input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" /></label><label><span className="text-sm font-medium">Tipo</span><select value={type} onChange={(event) => setType(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm"><option value="obra_social">Obra social</option><option value="prepaga">Prepaga</option><option value="agente_seguro">Agente del seguro</option></select></label><Button type="submit" icon={<Plus size={16} />} variant="primary">Agregar al catálogo</Button></form><div className="mt-6 rounded-lg bg-clinic-surface p-4 text-sm text-clinic-muted">Para importar el listado oficial RNAS, usá un CSV con columnas `rnas_code`, `name` y `type` desde la pantalla de Importaciones.</div></SectionCard>
    </section>
  </AdminPageShell>;
}

function Alert({ children, tone }: { children: string; tone: "success" | "error" }) { return <div className={`rounded-lg border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</div>; }
