import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { connectWhatsAppAccount, getDefaultClinic, getWhatsAppSettings, getWhatsAppTemplates } from "../../../lib/clinic-data";
import { WhatsAppMessageTemplate, WhatsAppSettings } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

declare global {
  interface Window {
    FB?: {
      init: (options: { appId?: string; version: string; xfbml: boolean }) => void;
      login: (callback: (response: unknown) => void, options: Record<string, unknown>) => void;
    };
  }
}

const META_APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const META_WHATSAPP_CONFIG_ID = import.meta.env.VITE_META_WHATSAPP_CONFIG_ID as string | undefined;

const TEMPLATE_LABELS: Record<string, string> = {
  appointment_confirmation: "Confirmación de turno",
  reminder_24h: "Recordatorio 24hs antes",
  reminder_2h: "Recordatorio 2hs antes"
};

const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada"
};

function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve();
  return new Promise((resolve) => {
    (window as any).fbAsyncInit = () => {
      window.FB?.init({ appId: META_APP_ID, version: "v21.0", xfbml: false });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
}

export function WhatsAppSettingsPage() {
  const { role } = useAuth();
  const canEdit = role === "platform_admin" || role === "clinic_admin" || role === "admin";
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [templates, setTemplates] = useState<WhatsAppMessageTemplate[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const clinic = await getDefaultClinic();
      if (!clinic) return;
      setClinicId(clinic.id);
      const [loadedSettings, loadedTemplates] = await Promise.all([
        getWhatsAppSettings(clinic.id),
        getWhatsAppTemplates(clinic.id)
      ]);
      setSettings(loadedSettings);
      setTemplates(loadedTemplates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la configuración de WhatsApp.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConnect() {
    if (!META_APP_ID || !META_WHATSAPP_CONFIG_ID || !clinicId) return;
    setConnecting(true);
    setError("");
    setNotice("");
    try {
      await loadFacebookSdk();

      const signupResult = await new Promise<{ wabaId: string; phoneNumberId: string }>((resolve, reject) => {
        function onMessage(event: MessageEvent) {
          if (event.origin !== "https://www.facebook.com") return;
          try {
            const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
            if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
            if (data.event === "FINISH" && data.data?.waba_id && data.data?.phone_number_id) {
              window.removeEventListener("message", onMessage);
              resolve({ wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id });
            }
            if (data.event === "CANCEL" || data.event === "ERROR") {
              window.removeEventListener("message", onMessage);
              reject(new Error("Cancelaste la conexión con WhatsApp."));
            }
          } catch {
            // mensajes de otro origen/formato - ignorar
          }
        }
        window.addEventListener("message", onMessage);
        window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("La conexión con WhatsApp tardó demasiado. Probá de nuevo."));
        }, 3 * 60 * 1000);
      });

      const code = await new Promise<string>((resolve, reject) => {
        window.FB?.login(
          (response: any) => {
            const returnedCode = response?.authResponse?.code;
            if (returnedCode) resolve(returnedCode);
            else reject(new Error("No pudimos completar la conexión con WhatsApp."));
          },
          {
            config_id: META_WHATSAPP_CONFIG_ID,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }
          }
        );
      });

      const updated = await connectWhatsAppAccount({ code, wabaId: signupResult.wabaId, phoneNumberId: signupResult.phoneNumberId });
      setSettings(updated);
      setNotice("WhatsApp conectado. Las plantillas de mensaje quedaron enviadas a revisión de Meta.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos conectar WhatsApp.");
    } finally {
      setConnecting(false);
    }
  }

  const notConfigured = !META_APP_ID || !META_WHATSAPP_CONFIG_ID;

  return (
    <AdminPageShell
      description="Conectá el WhatsApp de la clínica para mandar confirmaciones y recordatorios de turno."
      eyebrow="Comunicación"
      onRefresh={load}
      title="WhatsApp"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}

      {notConfigured && (
        <Message tone="warning">La integración con Meta todavía no está configurada en la plataforma.</Message>
      )}

      <SectionCard className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
              <MessageCircle size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-clinic-ink">Cuenta de WhatsApp</h2>
              {settings?.status === "connected" ? (
                <p className="mt-1 text-sm text-clinic-muted">
                  Conectada: {settings.verified_name ?? "Sin nombre verificado"} ({settings.display_phone_number ?? "sin número"}).
                </p>
              ) : (
                <p className="mt-1 text-sm text-clinic-muted">Todavía no conectaste el WhatsApp de la clínica.</p>
              )}
            </div>
          </div>
          {canEdit && (
            <Button disabled={connecting || notConfigured} onClick={handleConnect} variant="primary">
              {connecting ? "Conectando..." : settings?.status === "connected" ? "Reconectar" : "Conectar WhatsApp"}
            </Button>
          )}
        </div>
      </SectionCard>

      {settings?.status === "connected" && (
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Plantillas de mensaje</h2>
          <p className="mt-1 text-sm text-clinic-muted">Meta tiene que aprobar cada plantilla antes de poder usarla — puede tardar horas.</p>
          <div className="mt-4 grid gap-2">
            {Object.keys(TEMPLATE_LABELS).map((key) => {
              const template = templates.find((item) => item.template_key === key);
              const status = template?.status ?? "pending";
              return (
                <div key={key} className="flex items-center justify-between rounded-lg border border-clinic-line px-3 py-2 text-sm">
                  <span className="font-medium text-clinic-ink">{TEMPLATE_LABELS[key]}</span>
                  <span
                    className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                      status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {TEMPLATE_STATUS_LABELS[status] ?? status}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </AdminPageShell>
  );
}

function Message({ tone, children }: { tone: "success" | "error" | "warning"; children: string }) {
  const colors = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-red-200 bg-red-50 text-red-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${colors[tone]}`}>{children}</div>;
}
