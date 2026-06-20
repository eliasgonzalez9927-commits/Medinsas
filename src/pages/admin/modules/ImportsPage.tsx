import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { Button } from "../../../components/ui/Button";
import { SectionCard } from "../../../components/admin/SectionCard";
import { getDefaultClinic, getPatients } from "../../../lib/clinic-data";
import { supabase } from "../../../lib/supabase";
import { Clinic, PatientWithAppointments } from "../../../types/clinic";

type CsvRow = Record<string, string>;
type ImportMode = "create" | "update" | "upsert";

export function ImportsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [filename, setFilename] = useState("");
  const [mode, setMode] = useState<ImportMode>("upsert");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { getDefaultClinic().then(setClinic).catch(() => setError("No pudimos cargar la clínica.")); }, []);
  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  function downloadTemplate() { downloadCsv("pacientes_template.csv", ["nombre,apellido,telefono,email,dni,fecha_nacimiento,obra_social,plan,numero_afiliado,notas,email_opt_in,whatsapp_opt_in"]); }

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
    setSaving(true); setError("");
    let created = 0; let updated = 0; let skipped = 0; let errors = 0;
    const { data: session } = await supabase.auth.getUser();
    const { data: job, error: jobError } = await supabase.from("import_jobs").insert({ clinic_id: clinic.id, type: "patients_csv", filename, status: "processing", total_rows: rows.length, created_by: session.user?.id ?? null, metadata: { mode } }).select("id").single();
    if (jobError || !job) { setSaving(false); return setError("No pudimos iniciar la importación."); }
    for (let index = 0; index < rows.length; index += 1) {
      const row = normalizeRow(rows[index]);
      try {
        if (!row.first_name || !row.last_name || !row.phone) throw new Error("Faltan nombre, apellido o teléfono.");
        const existing = await findPatient(clinic.id, row);
        let entityId: string | null = null; let status = "skipped";
        if (existing && mode !== "create") { const { error: updateError } = await supabase.from("patients").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id); if (updateError) throw updateError; updated += 1; entityId = existing.id; status = "updated"; }
        else if (!existing) { const { data, error: insertError } = await supabase.from("patients").insert({ ...row, clinic_id: clinic.id }).select("id").single(); if (insertError) throw insertError; created += 1; entityId = data.id; status = "created"; }
        else skipped += 1;
        await supabase.from("import_job_rows").insert({ import_job_id: job.id, row_number: index + 2, status, raw_data: rows[index], normalized_data: row, created_entity_id: entityId });
      } catch (err) { errors += 1; await supabase.from("import_job_rows").insert({ import_job_id: job.id, row_number: index + 2, status: "failed", raw_data: rows[index], normalized_data: row, error: err instanceof Error ? err.message : "Fila inválida" }); }
    }
    await supabase.from("import_jobs").update({ status: errors ? "completed_with_errors" : "completed", processed_rows: rows.length, created_count: created, updated_count: updated, skipped_count: skipped, error_count: errors, finished_at: new Date().toISOString() }).eq("id", job.id);
    await audit("patients_imported", { created, updated, skipped, errors });
    setSaving(false); setNotice(`Importación finalizada: ${created} creados, ${updated} actualizados, ${skipped} omitidos y ${errors} con error.`);
  }

  async function audit(action: string, metadata: Record<string, unknown>) { if (!clinic) return; await supabase.from("audit_logs").insert({ clinic_id: clinic.id, action, entity_type: "patients", metadata }); }

  return <AdminPageShell title="Importaciones" eyebrow="Datos operativos" description="Importá pacientes desde CSV, revisá una vista previa y exportá información administrativa sin historia clínica.">
    {notice && <Alert tone="success">{notice}</Alert>}{error && <Alert tone="error">{error}</Alert>}
    <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><SectionCard className="p-5"><h2 className="font-semibold">Pacientes CSV</h2><p className="mt-1 text-sm text-clinic-muted">La deduplicación usa DNI, email y luego teléfono. Las coberturas pueden importarse como texto y asociarse después desde la ficha.</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={downloadTemplate} icon={<Download size={16} />}>Descargar plantilla</Button><Button onClick={exportPatients} icon={<Download size={16} />}>Exportar pacientes</Button></div><label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-clinic-line bg-clinic-surface px-4 py-8 text-sm font-semibold text-clinic-ink"><Upload size={18} /> Seleccionar CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={readFile} /></label>{filename && <p className="mt-3 text-sm text-clinic-muted">{filename} · {rows.length} filas</p>}<label className="mt-5 block text-sm font-medium">Modo<select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3"><option value="upsert">Crear y actualizar</option><option value="create">Crear solamente</option><option value="update">Actualizar existentes</option></select></label><Button className="mt-5" disabled={!rows.length || saving} onClick={importPatients} icon={<FileSpreadsheet size={16} />} variant="primary">{saving ? "Importando..." : "Confirmar importación"}</Button></SectionCard><SectionCard className="overflow-hidden"><div className="border-b border-clinic-line px-5 py-4"><h2 className="font-semibold">Previsualizar</h2></div>{preview.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-clinic-surface text-clinic-muted"><tr>{Object.keys(preview[0]).slice(0, 7).map((key) => <th className="px-4 py-3 font-medium" key={key}>{key}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr className="border-t border-clinic-line" key={index}>{Object.keys(preview[0]).slice(0, 7).map((key) => <td className="px-4 py-3" key={key}>{row[key]}</td>)}</tr>)}</tbody></table></div> : <p className="px-5 py-8 text-sm text-clinic-muted">Seleccioná un CSV para revisar las primeras filas antes de importar.</p>}</SectionCard></section>
  </AdminPageShell>;
}

function parseCsv(text: string): CsvRow[] { const [header, ...lines] = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/); const keys = parseLine(header).map((key) => key.trim().toLowerCase()); return lines.filter(Boolean).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [keys[index] ?? `columna_${index + 1}`, value.trim()]))); }
function parseLine(line: string) { const values: string[] = []; let current = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(current); current = ""; } else current += char; } values.push(current); return values; }
function normalizeRow(row: CsvRow) { const first_name = row.nombre ?? row.first_name ?? (row.nombre_completo ?? "").split(" ")[0] ?? ""; const last_name = row.apellido ?? row.last_name ?? (row.nombre_completo ?? "").split(" ").slice(1).join(" "); return { first_name, last_name, phone: row.telefono ?? row.phone ?? "", email: row.email || null, document_number: row.dni ?? row.document_number ?? null, birth_date: row.fecha_nacimiento ?? row.birth_date ?? null, insurance: row.obra_social ?? row.prepaga ?? row.insurance ?? null, notes: row.notas ?? row.notes ?? null, email_opt_in: row.email_opt_in !== "false", whatsapp_opt_in: row.whatsapp_opt_in !== "false" }; }
async function findPatient(clinicId: string, row: ReturnType<typeof normalizeRow>) { const fields = row.document_number ? ["document_number", row.document_number] : row.email ? ["email", row.email] : ["phone", row.phone]; const { data } = await supabase.from("patients").select("id").eq("clinic_id", clinicId).eq(fields[0], fields[1]).maybeSingle(); return data; }
function csvLine(values: string[]) { return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","); }
function downloadCsv(filename: string, lines: string[]) { const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })); anchor.download = filename; anchor.click(); URL.revokeObjectURL(anchor.href); }
function Alert({ children, tone }: { children: string; tone: "success" | "error" }) { return <div className={`rounded-lg border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</div>; }
