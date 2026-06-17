import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { whatsappTemplates } from "../../../data/clinicMockData";
import { AdminPageShell } from "./AdminPageShell";

export function WhatsAppPage() {
  return (
    <AdminPageShell
      actionLabel="Nueva plantilla"
      description="Prepara confirmaciones, recordatorios, reprogramaciones y notificaciones internas."
      eyebrow="Canal principal"
      title="WhatsApp"
    >
      <section className="grid gap-4 lg:grid-cols-4">
        <StatusCard label="Integracion" value="Pendiente" />
        <StatusCard label="Confirmaciones" value="Activas" />
        <StatusCard label="Recordatorios" value="24 h antes" />
        <StatusCard label="Recepcion" value="Notificacion interna" />
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {whatsappTemplates.map((template) => (
          <SectionCard key={template.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
                <MessageCircle size={19} />
              </div>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Activa
              </span>
            </div>
            <h2 className="mt-4 font-semibold text-clinic-ink">{template.name}</h2>
            <p className="mt-3 rounded-lg bg-clinic-surface p-3 text-sm leading-6 text-clinic-muted">
              {template.body}
            </p>
            <Button className="mt-4" icon={<Send size={15} />}>
              Probar mensaje
            </Button>
          </SectionCard>
        ))}
      </section>
    </AdminPageShell>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <CheckCircle2 size={19} className="text-clinic-brand" />
      <p className="mt-3 text-sm text-clinic-muted">{label}</p>
      <p className="mt-1 font-semibold text-clinic-ink">{value}</p>
    </div>
  );
}
