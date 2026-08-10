import { ChangeEvent, Fragment, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { useLocation } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { SectionCard } from "../../../components/admin/SectionCard";
import { getDefaultClinic, getPatients } from "../../../lib/clinic-data";
import { supabase } from "../../../lib/supabase";
import { Clinic, PatientWithAppointments } from "../../../types/clinic";

type CsvRow = Record<string, string>;
type ImportMode = "create" | "update" | "upsert";
type JobRowDetail = { row_number: number; raw_data: CsvRow; error: string | null };

const JOB_TYPE_LABELS: Record<string, string> = { patients_csv: "Pacientes (CSV)" };
const JOB_STATUS_LABELS: Record<string, string> = { pending: "Pendiente", processing: "Procesando", completed: "Completado", completed_with_errors: "Completado con errores" };

export function ImportsPage() {
  const { search } = useLocation();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [filename, setFilename] = useState("");
  const [mode, setMode] = useState<ImportMode>("upsert");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [failedRows, setFailedRows] = useState<Record<string, JobRowDetail[]>>({});
  const [loadingFailedId, setLoadingFailedId] = useState<string | null>(null);

  async function loadJobs(clinicId: string) {
    const { data, error: jobsError } = await supabase.from("import_jobs").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(50);
    if (jobsError) setError("No pudimos cargar el historial."); else setJobs(data ?? []);
  }

  useEffect(() => { getDefaultClinic().then(async (currentClinic) => { setClinic(currentClinic); if (!currentClinic) return; await loadJobs(currentClinic.id); }).catch(() => setError("No pudimos cargar la clínica.")); }, []);
  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const patientImportMode = new URLSearchParams(search).get("type") === "patients";

  function downloadTemplate() {
    downloadCsv("pacientes_template.csv", [
      "nombre,apellido,telefono,email,dni,fecha_nacimiento,obra_social,plan,numero_afiliado,notas,acepta_email,acepta_whatsapp",
      csvLine(["Juana", "Perez", "3511234567", "juana.perez@gmail.com", "30111222", "1985-03-15", "OSDE", "310", "123456", "Alergia a la penicilina", "si", "si"]),
      csvLine(["Carlos", "Gomez", "3517654321", "", "27333444", "", "", "", "", "", "si", "no"])
    ]);
  }

  async function exportPatients() {
    if (!clinic) return;
    try {
      const patients = await getPatients(clinic.id);
      const lines = ["nombre,apellido,telefono,email,dni,fecha_nacimiento,obra_social,notas", ...patients.map((patient) => csvLine([patient.first_name, patient.last_name, patient.phone, patient.email ?? "", patient.document_number ?? "", patient.birth_date ?? "", patient.insurance ?? "", patient.notes ?? ""]))];
      downloadCsv(`pacientes_${clinic.slug}.csv`, lines);
      await audit("patients_exported", { count: patients.length });
      setNotice(`${patients.length} pacientes exportados.`);
    } catch { setError("No pudimos exportar pacientes."); }
  }

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name); setError(""); setNotice("");
    const reader = new FileReader();
    reader.onload = () => {
      try { setRows(parseCsv(String(reader.result ?? ""))); } catch { setError("No pudimos leer el CSV. Usá UTF-8 y encabezados en la primera fila."); }
    };
    reader.readAsText(file, "utf-8");
  }

  async function importPatients() {
    if (!clinic || !rows.length) return;
    setSaving(true); setError(""); setNotice(""); setProgress({ done: 0, total: rows.length });
    let created = 0; let updated = 0; let skipped = 0; let errors = 0;
    const { data: session } = await supabase.auth.getUser();
    const { data: job, error: jobError } = await supabase.from("import_jobs").insert({ clinic_id: clinic.id, type: "patients_csv", filename, status: "processing", total_rows: rows.length, created_by: session.user?.id ?? null, metadata: { mode } }).select("id").single();
    if (jobError || !job) { setSaving(false); return setError("No pudimos iniciar la importación."); }
    for (let index = 0; index < rows.length; index += 1) {
      let row: ReturnType<typeof normalizeRow> | null = null;
      try {
        row = normalizeRow(rows[index]);
        if (!row.first_name || !row.last_name || !row.phone) throw new Error("Faltan nombre, apellido o teléfono.");
        const existing = await findPatient(clinic.id, row);
        let entityId: string | null = null; let status = "skipped";
        if (existing && mode !== "create") { const { error: updateError } = await supabase.from("patients").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id); if (updateError) throw updateError; updated += 1; entityId = existing.id; status = "updated"; }
        else if (!existing) { const { data, error: insertError } = await supabase.from("patients").insert({ ...row, clinic_id: clinic.id }).select("id").single(); if (insertError) throw insertError; created += 1; entityId = data.id; status = "created"; }
        else skipped += 1;
        await supabase.from("import_job_rows").insert({ import_job_id: job.id, row_number: index + 2, status, raw_data: rows[index], normalized_data: row, created_entity_id: entityId });
      } catch (err) { errors += 1; await supabase.from("import_job_rows").insert({ import_job_id: job.id, row_number: index + 2, status: "failed", raw_data: rows[index], normalized_data: row ?? {}, error: err instanceof Error ? err.message : "Fila inválida" }); }
      setProgress({ done: index + 1, total: rows.length });
    }
    await supabase.from("import_jobs").update({ status: errors ? "completed_with_errors" : "completed", processed_rows: rows.length, created_count: created, updated_count: updated, skipped_count: skipped, error_count: errors, finished_at: new Date().toISOString() }).eq("id", job.id);
    await audit("patients_imported", { created, updated, skipped, errors });
    await loadJobs(clinic.id);
    setSaving(false); setNotice(`Importación finalizada: ${created} creados, ${updated} actualizados, ${skipped} omitidos y ${errors} con error.`);
  }

  async function audit(action: string, metadata: Record<string, unknown>) { if (!clinic) return; await supabase.from("audit_logs").insert({ clinic_id: clinic.id, action, entity_type: "patients", metadata }); }

  async function toggleJobDetail(job: any) {
    if (expandedJobId === job.id) { setExpandedJobId(null); return; }
    setExpandedJobId(job.id);
    if (failedRows[job.id]) return;
    setLoadingFailedId(job.id);
    const { data } = await supabase.from("import_job_rows").select("row_number, raw_data, error").eq("import_job_id", job.id).eq("status", "failed").order("row_number");
    setFailedRows((prev) => ({ ...prev, [job.id]: (data as JobRowDetail[]) ?? [] }));
    setLoadingFailedId(null);
  }

  function downloadFailedRows(job: any) {
    const details = failedRows[job.id];
    if (!details?.length) return;
    const headerKeys = Object.keys(details[0].raw_data ?? {});
    const lines = [csvLine([...headerKeys, "error"]), ...details.map((detail) => csvLine([...headerKeys.map((key) => detail.raw_data?.[key] ?? ""), detail.error ?? ""]))];
    downloadCsv(`errores_${job.filename ?? "importacion"}.csv`, lines);
  }

  return <AdminPageShell title="Historial de importaciones" eyebrow="Auditoría de datos" description="Las importaciones se inician desde Pacientes, Servicios o Profesionales. Acá podés revisar sus resultados.">
    {notice && <Alert tone="success">{notice}</Alert>}{error && <Alert tone="error">{error}</Alert>}
    {patientImportMode && <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><SectionCard className="p-5"><h2 className="font-semibold">Importar pacientes</h2><p className="mt-1 text-sm text-clinic-muted">La deduplicación usa DNI, email y luego teléfono. Revisá el archivo antes de confirmar.</p><div className="mt-3 rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2.5 text-xs text-clinic-muted"><p>La plantilla ya trae un ejemplo cargado, usala como referencia del formato.</p><ul className="mt-1.5 list-disc space-y-1 pl-4"><li>Obligatorios: nombre, apellido y teléfono.</li><li>Fecha de nacimiento en formato AAAA-MM-DD (ej. 1985-03-15).</li><li>En "acepta_email" y "acepta_whatsapp" escribí sí o no.</li></ul></div><div className="mt-3 flex flex-wrap gap-2"><Button onClick={downloadTemplate} icon={<Download size={16} />}>Descargar plantilla</Button><Button onClick={exportPatients} icon={<Download size={16} />}>Exportar pacientes</Button></div><label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-clinic-line bg-clinic-surface px-4 py-8 text-sm font-semibold text-clinic-ink"><Upload size={18} /> Seleccionar CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={readFile} /></label>{filename && <p className="mt-3 text-sm text-clinic-muted">{filename} · {rows.length} filas</p>}<label className="mt-5 block text-sm font-medium">Modo<select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3"><option value="upsert">Crear y actualizar</option><option value="create">Crear solamente</option><option value="update">Actualizar existentes</option></select></label><Button className="mt-5" disabled={!rows.length || saving} onClick={importPatients} icon={<FileSpreadsheet size={16} />} variant="primary">{saving ? "Importando..." : "Confirmar importación"}</Button>{saving && <div className="mt-3"><div className="h-2 w-full overflow-hidden rounded-full bg-clinic-surface"><div className="h-full rounded-full bg-clinic-accent transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div><p className="mt-1.5 text-xs text-clinic-muted">{progress.done} de {progress.total} filas procesadas</p></div>}</SectionCard><SectionCard className="overflow-hidden"><div className="border-b border-clinic-line px-5 py-4"><h2 className="font-semibold">Previsualización</h2></div>{preview.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-clinic-surface text-clinic-muted"><tr>{Object.keys(preview[0]).slice(0, 7).map((key) => <th className="px-4 py-3 font-medium" key={key}>{key}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr className="border-t border-clinic-line" key={index}>{Object.keys(preview[0]).slice(0, 7).map((key) => <td className="px-4 py-3" key={key}>{row[key]}</td>)}</tr>)}</tbody></table></div> : <p className="px-5 py-8 text-sm text-clinic-muted">Seleccioná un CSV para ver una vista previa.</p>}</SectionCard></section>}
    <SectionCard className="overflow-hidden"><div className="border-b border-clinic-line px-5 py-4"><h2 className="font-semibold">Últimas ejecuciones</h2></div>{jobs.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-clinic-surface text-clinic-muted"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Archivo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody>{jobs.map((job) => <Fragment key={job.id}>
    <tr className={`border-t border-clinic-line ${job.error_count ? "cursor-pointer hover:bg-clinic-surface" : ""}`} onClick={() => job.error_count ? toggleJobDetail(job) : undefined}>
      <td className="px-4 py-3">{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(job.created_at))}</td>
      <td className="px-4 py-3">{JOB_TYPE_LABELS[job.type] ?? job.type}</td>
      <td className="px-4 py-3">{job.filename ?? "Sin archivo"}</td>
      <td className="px-4 py-3">{JOB_STATUS_LABELS[job.status] ?? job.status}</td>
      <td className="px-4 py-3">{job.created_count} creados · {job.updated_count} actualizados · {job.error_count} errores{job.error_count ? <span className="ml-2 text-xs font-medium text-clinic-accent">{expandedJobId === job.id ? "ocultar ▲" : "ver detalle ▼"}</span> : null}</td>
    </tr>
    {expandedJobId === job.id && job.error_count ? <tr key={`${job.id}-detail`}><td colSpan={5} className="bg-clinic-surface px-4 py-4">
      {loadingFailedId === job.id ? <p className="text-sm text-clinic-muted">Cargando errores...</p> : <>
        <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium">{failedRows[job.id]?.length ?? 0} filas con error</p><Button onClick={() => downloadFailedRows(job)} icon={<Download size={14} />}>Descargar CSV de errores</Button></div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-clinic-line bg-white"><table className="w-full text-left text-xs"><thead className="bg-clinic-surface text-clinic-muted"><tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Motivo</th></tr></thead><tbody>{failedRows[job.id]?.map((detail) => <tr className="border-t border-clinic-line" key={detail.row_number}><td className="px-3 py-2">{detail.row_number}</td><td className="px-3 py-2">{detail.raw_data?.nombre ?? ""} {detail.raw_data?.apellido ?? ""}</td><td className="px-3 py-2 text-red-700">{detail.error}</td></tr>)}</tbody></table></div>
      </>}
    </td></tr> : null}
    </Fragment>)}</tbody></table></div> : <p className="px-5 py-8 text-sm text-clinic-muted">Todavía no hay importaciones registradas.</p>}</SectionCard>
  </AdminPageShell>;
}

function parseCsv(text: string): CsvRow[] { const [header, ...lines] = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/); const keys = parseLine(header).map((key) => key.trim().toLowerCase()); return lines.filter(Boolean).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [keys[index] ?? `columna_${index + 1}`, value.trim()]))); }
function parseLine(line: string) { const values: string[] = []; let current = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(current); current = ""; } else current += char; } values.push(current); return values; }
// Acepta "si"/"no" (con o sin tilde), "true"/"false", "1"/"0", en cualquier
// mayuscula/minuscula - antes solo reconocia el string exacto "false" en
// minuscula, asi que alguien tipeando "No" o "FALSE" en Excel quedaba
// opteado-in sin darse cuenta.
function parseOptIn(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["no", "false", "0", "n"].includes(normalized)) return false;
  return true;
}

// Solo acepta fechas en formato ISO (AAAA-MM-DD), que es lo unico que
// Postgres interpreta sin ambiguedad. "15/03/1985" es ambiguo (dia/mes vs
// mes/dia segun configuracion) y podia guardarse invertido en silencio -
// mejor rechazar la fila con un error claro que corromper una fecha de
// nacimiento real.
function parseBirthDate(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Fecha de nacimiento inválida: "${trimmed}". Usá el formato AAAA-MM-DD (ej. 1985-03-15).`);
  }
  return trimmed;
}

function normalizeRow(row: CsvRow) { const first_name = row.nombre ?? row.first_name ?? (row.nombre_completo ?? "").split(" ")[0] ?? ""; const last_name = row.apellido ?? row.last_name ?? (row.nombre_completo ?? "").split(" ").slice(1).join(" "); return { first_name, last_name, phone: row.telefono ?? row.phone ?? "", email: row.email || null, document_number: row.dni ?? row.document_number ?? null, birth_date: parseBirthDate(row.fecha_nacimiento ?? row.birth_date), insurance: row.obra_social ?? row.prepaga ?? row.insurance ?? null, plan_name: row.plan ?? row.plan_name ?? null, affiliate_number: row.numero_afiliado ?? row.affiliate_number ?? null, notes: row.notas ?? row.notes ?? null, email_opt_in: parseOptIn(row.acepta_email ?? row.email_opt_in), whatsapp_opt_in: parseOptIn(row.acepta_whatsapp ?? row.whatsapp_opt_in) }; }
async function findPatient(clinicId: string, row: ReturnType<typeof normalizeRow>) { const fields = row.document_number ? ["document_number", row.document_number] : row.email ? ["email", row.email] : ["phone", row.phone]; const { data } = await supabase.from("patients").select("id").eq("clinic_id", clinicId).eq(fields[0], fields[1]).maybeSingle(); return data; }
function csvLine(values: string[]) { return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","); }
function downloadCsv(filename: string, lines: string[]) { const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })); anchor.download = filename; anchor.click(); URL.revokeObjectURL(anchor.href); }
function Alert({ children, tone }: { children: string; tone: "success" | "error" }) { return <div className={`rounded-lg border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</div>; }
