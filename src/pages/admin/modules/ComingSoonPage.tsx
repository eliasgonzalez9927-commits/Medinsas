import { Sparkles } from "lucide-react";
import { AdminPageShell } from "./AdminPageShell";
import { SectionCard } from "../../../components/admin/SectionCard";

export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <AdminPageShell title={title} eyebrow="Próximamente" description="Este módulo está en preparación.">
      <SectionCard className="max-w-2xl p-6">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
          <Sparkles size={20} />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-clinic-ink">Este módulo está en preparación.</h2>
        <p className="mt-2 text-sm leading-6 text-clinic-muted">{description}</p>
        <p className="mt-4 text-sm text-clinic-muted">No se simulan acciones ni integraciones hasta que el flujo esté listo para operar.</p>
      </SectionCard>
    </AdminPageShell>
  );
}
