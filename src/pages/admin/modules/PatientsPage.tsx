import { Search, UserPlus } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { patients } from "../../../data/clinicMockData";
import { AdminPageShell } from "./AdminPageShell";

export function PatientsPage() {
  return (
    <AdminPageShell
      actionLabel="Crear paciente"
      description="Base de pacientes con busqueda, proximo turno, historial y notas internas."
      eyebrow="Gestion de pacientes"
      title="Pacientes"
    >
      <SectionCard className="p-5">
        <div className="relative max-w-xl">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" />
          <input
            placeholder="Buscar por nombre, telefono, DNI o email..."
            className="h-11 w-full rounded-lg border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100"
          />
        </div>
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <div className="divide-y divide-clinic-line">
          {patients.map((patient) => (
            <article key={patient.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_180px_180px_1fr_160px] lg:items-center">
              <div>
                <p className="font-semibold text-clinic-ink">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="text-sm text-clinic-muted">{patient.phone}</p>
              </div>
              <p className="text-sm text-clinic-muted">DNI {patient.documentNumber}</p>
              <p className="text-sm text-clinic-muted">{patient.insurance}</p>
              <div>
                <p className="text-sm font-medium text-clinic-ink">{patient.nextAppointment}</p>
                <p className="text-xs text-clinic-muted">{patient.notes}</p>
              </div>
              <Button>Ver historial</Button>
            </article>
          ))}
        </div>
      </SectionCard>
      <Button className="self-start" icon={<UserPlus size={16} />} variant="primary">
        Crear paciente manualmente
      </Button>
    </AdminPageShell>
  );
}
