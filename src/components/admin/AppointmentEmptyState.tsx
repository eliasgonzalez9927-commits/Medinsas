import { CalendarPlus, RotateCw } from "lucide-react";
import { Button } from "../ui/Button";

export function AppointmentEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
        <CalendarPlus size={22} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-clinic-ink">
        No hay reservas cargadas para hoy.
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-clinic-muted">
        Cuando se creen nuevos turnos, apareceran en esta seccion.
      </p>
      <Button className="mt-5" icon={<CalendarPlus size={17} />} onClick={onCreate} variant="primary">
        Crear primer turno
      </Button>
    </div>
  );
}

export function AppointmentLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-amber-50 text-amber-700">
        <RotateCw size={22} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-clinic-ink">No pudimos cargar los turnos.</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-clinic-muted">Intenta actualizar la pagina.</p>
      <Button className="mt-5" icon={<RotateCw size={17} />} onClick={onRetry} variant="primary">
        Reintentar
      </Button>
    </div>
  );
}
