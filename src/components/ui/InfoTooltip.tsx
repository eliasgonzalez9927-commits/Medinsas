import { useState } from "react";
import { HelpCircle } from "lucide-react";

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Más información"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full text-clinic-muted transition hover:bg-teal-50 hover:text-clinic-brand"
      >
        <HelpCircle size={16} />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg border border-clinic-line bg-white p-3 text-xs leading-5 text-clinic-ink shadow-[0_18px_42px_rgba(13,54,66,0.14)]"
        >
          {text}
        </div>
      )}
    </span>
  );
}
