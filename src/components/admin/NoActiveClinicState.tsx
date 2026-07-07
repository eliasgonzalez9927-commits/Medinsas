import { Building2, LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveClinic } from "../../contexts/ActiveClinicContext";
import { Button } from "../ui/Button";

export function NoActiveClinicState() {
  const { signOut } = useAuth();
  const { error, loading } = useActiveClinic();

  return (
    <section className="rounded-lg border border-clinic-line bg-white p-8 text-center shadow-sm">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#e6f4f1] text-clinic-brand">
        <Building2 size={22} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-clinic-ink">
        {loading ? "Cargando clínica..." : "No tenés una clínica asignada."}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-clinic-muted">
        {loading
          ? "Estamos preparando tu espacio de trabajo."
          : error || "Pedile a un administrador de plataforma que te asocie a una clínica activa para operar Medin."}
      </p>
      {!loading && (
        <Button className="mt-5" icon={<LogOut size={16} />} onClick={signOut}>
          Cerrar sesión
        </Button>
      )}
    </section>
  );
}
