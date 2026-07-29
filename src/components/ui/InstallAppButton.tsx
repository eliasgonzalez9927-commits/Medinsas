import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Chrome/Edge disparan este evento cuando la pagina cumple los criterios
// de instalabilidad (manifest + service worker) - lo guardamos para poder
// abrir el prompt nativo de instalacion cuando el usuario clickea el
// boton, en vez de depender de que note el icono chiquito en la barra de
// direcciones (justo el feedback real: "no encontraba donde volver a entrar").
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "medin_install_prompt_dismissed";

export function InstallAppButton() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => window.localStorage.getItem(DISMISSED_KEY) === "true");
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setDeferredEvent(null);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || dismissed || !deferredEvent) return null;

  async function handleInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  }

  function handleDismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-clinic-line bg-white pl-3 pr-1 py-1 text-sm">
      <button onClick={handleInstall} className="flex items-center gap-1.5 font-semibold text-clinic-brand">
        <Download size={15} />
        Instalar app
      </button>
      <button onClick={handleDismiss} aria-label="Cerrar" className="grid h-6 w-6 place-items-center rounded-md text-clinic-muted hover:bg-clinic-surface">
        <X size={14} />
      </button>
    </div>
  );
}
