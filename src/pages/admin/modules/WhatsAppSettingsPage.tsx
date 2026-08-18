import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, MessageCircle, XCircle } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useAuth } from "../../../contexts/AuthContext";
import {
  connectWhatsAppAccount,
  getDefaultClinic,
  getWhatsAppDeliveries,
  getWhatsAppSettings,
  getWhatsAppTemplates,
  WhatsAppDelivery
} from "../../../lib/clinic-data";
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

const EVENT_LABELS: Record<string, string> = {
  appointment_confirmed: "Confirmación de turno",
  reminder_24h: "Recordatorio 24hs",
  reminder_2h: "Recordatorio 2hs",
  appointment_cancelled: "Turno cancelado"
};

const STATUS_CONFIG = {
  sent: { label: "Enviado", icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Pendiente", icon: Clock, classes: "bg-amber-50 text-amber-700" },
  failed: { label: "Fallido", icon: XCircle, classes: "bg-red-50 text-red-700" },
  skipped: { label: "Omitido", icon: AlertCircle, classes: "bg-slate-50 text-slate-500" }
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
  const [deliveries, setDeliveries] = useState<WhatsAppDelivery[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const clinic = await getDefaultClinic();
      if (!clinic) return;
      setClinicId(clinic.id);
      const [loadedSettings, loadedTemplates, loadedDeliveries] = await Promise.all([
        getWhatsAppSettings(clinic.id),
        getWhatsAppTemplates(clinic.id),
        getWhatsAppDeliveries(clinic.id).catch(() => [] as WhatsAppDelivery[])
      ]);
      setSettings(loadedSettings);
      setTemplates(loadedTemplates);
      setDeliveries(loadedDeliveries);
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

      {/* Panel de setup pendiente (cuando Meta no está configurado) */}
      {notConfigured && (
        <SectionCard className="p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-500">
              <AlertCircle size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-clinic-ink">Integración con Meta pendiente</h2>
              <p className="mt-1 text-sm text-clinic-muted">
                Para activar WhatsApp en Medin hay que completar estos pasos. Una vez listos, el botón de conexión se habilitará.
              </p>
              <div className="mt-5 grid gap-3">
                {[
                  { step: 1, title: "Verificación de negocio en Meta", desc: "Completá la verificación de \"Medin Saas\" en business.facebook.com → Seguridad del Centro de negocios → Verificación del negocio." },
                  { step: 2, title: "Crear la App de Meta", desc: "En developers.facebook.com creá una App de tipo \"Business\" y habilitá el producto WhatsApp Business Platform." },
                  { step: 3, title: "Cargar las variables de entorno en Vercel", desc: "Necesitás: VITE_META_APP_ID, VITE_META_WHATSAPP_CONFIG_ID, META_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN." },
                  { step: 4, title: "Registrar el webhook en Meta", desc: "En el dashboard de la App, registrá la URL https://app.medin.com.ar/api/whatsapp/webhook con el verify token configurado." },
                  { step: 5, title: "Activar el módulo WhatsApp en la clínica", desc: "En Configuración → Módulos, habilitá \"WhatsApp\" para cada clínica que lo quiera usar." }
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-4 rounded-lg border border-clinic-line bg-clinic-surface p-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-clinic-brand ring-1 ring-clinic-brand/20">
                      {step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-clinic-ink">{title}</p>
                      <p className="mt-0.5 text-sm text-clinic-muted">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Cuenta conectada / botón de conexión */}
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

      {/* Plantillas (solo si está conectado) */}
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
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    {TEMPLATE_STATUS_LABELS[status] ?? status}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Historial de mensajes enviados (solo si está conectado) */}
      {settings?.status === "connected" && (
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Últimos envíos por WhatsApp</h2>
            <p className="mt-0.5 text-sm text-clinic-muted">Los 30 más recientes.</p>
          </div>
          {deliveries.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <MessageCircle size={32} className="mx-auto text-clinic-muted/40" />
              <p className="mt-3 text-sm text-clinic-muted">Todavía no hay mensajes enviados.</p>
              <p className="mt-1 text-xs text-clinic-muted">Cuando se envíen confirmaciones o recordatorios vía WhatsApp, aparecerán acá.</p>
            </div>
          ) : (
            <div className="divide-y divide-clinic-line">
              {deliveries.map((delivery) => {
                const statusConfig = STATUS_CONFIG[delivery.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const Icon = statusConfig.icon;
                return (
                  <div key={delivery.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-clinic-ink">
                        {EVENT_LABELS[delivery.event_type] ?? delivery.event_type}
                      </p>
                      <p className="text-xs text-clinic-muted">{delivery.recipient_phone ?? "Sin número"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-xs text-clinic-muted sm:block">
                        {new Date(delivery.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${statusConfig.classes}`}>
                        <Icon size={12} />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
