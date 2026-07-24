import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import {
  getInAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationLink
} from "../../lib/notifications";
import { InAppNotification } from "../../types/clinic";

const POLL_INTERVAL_MS = 45_000;
const MAX_TOASTS = 3;

export function NotificationBell({ clinicId }: { clinicId: string | undefined }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<InAppNotification[]>([]);
  const seenEventIds = useRef<Set<string> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    const next = await getInAppNotifications(clinicId);
    setItems(next);

    // La primera carga solo establece la linea de base - no dispara toasts
    // retroactivos por cosas que ya pasaron antes de abrir la pantalla.
    if (seenEventIds.current === null) {
      seenEventIds.current = new Set(next.map((item) => item.event_id));
      return;
    }
    const freshOnes = next.filter((item) => !seenEventIds.current!.has(item.event_id));
    if (freshOnes.length) {
      freshOnes.forEach((item) => seenEventIds.current!.add(item.event_id));
      setToasts((current) => [...freshOnes, ...current].slice(0, MAX_TOASTS));
      freshOnes.forEach((item) => {
        window.setTimeout(() => {
          setToasts((current) => current.filter((entry) => entry.event_id !== item.event_id));
        }, 8000);
      });
    }
  }, [clinicId]);

  useEffect(() => {
    seenEventIds.current = null;
    setItems([]);
    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = items.filter((item) => !item.read_at).length;

  async function openNotification(item: InAppNotification) {
    setOpen(false);
    setItems((current) => current.map((entry) => (entry.delivery_id === item.delivery_id ? { ...entry, read_at: entry.read_at ?? new Date().toISOString() } : entry)));
    await markNotificationRead(item.delivery_id);
    navigate(resolveNotificationLink(item.event_type));
  }

  async function markAllRead() {
    if (!clinicId) return;
    setItems((current) => current.map((entry) => ({ ...entry, read_at: entry.read_at ?? new Date().toISOString() })));
    await markAllNotificationsRead(clinicId);
  }

  function dismissToast(eventId: string) {
    setToasts((current) => current.filter((item) => item.event_id !== eventId));
  }

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-clinic-line bg-white text-clinic-muted transition hover:bg-[#f6faf9]"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-12 z-30 w-96 max-w-[90vw] overflow-hidden rounded-2xl border border-clinic-line bg-white shadow-[0_18px_42px_rgba(13,54,66,0.14)]" role="menu">
            <div className="flex items-center justify-between border-b border-clinic-line px-4 py-3">
              <p className="text-sm font-semibold text-clinic-ink">Notificaciones</p>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs font-semibold text-clinic-brand hover:underline">
                  Marcar todas como leídas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-clinic-muted">No hay notificaciones todavía.</p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.delivery_id}
                    type="button"
                    onClick={() => openNotification(item)}
                    className={`flex w-full flex-col gap-1 border-b border-clinic-line px-4 py-3 text-left transition last:border-b-0 hover:bg-clinic-surface ${!item.read_at ? "bg-[#f6faf9]" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      {!item.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-clinic-brand" />}
                      <span className="text-sm font-semibold text-clinic-ink">{item.title}</span>
                    </span>
                    {item.message && <span className="text-sm text-clinic-muted">{item.message}</span>}
                    <span className="text-xs text-clinic-muted">{formatRelative(item.created_at)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-5 right-5 z-50 flex w-80 max-w-[90vw] flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.event_id} className="flex items-start gap-3 rounded-xl border border-clinic-line bg-white p-4 shadow-[0_18px_42px_rgba(13,54,66,0.18)]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e6f4f1] text-clinic-brand">
              <Bell size={16} />
            </span>
            <button type="button" onClick={() => openNotification(toast)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-clinic-ink">{toast.title}</p>
              {toast.message && <p className="mt-1 text-sm text-clinic-muted">{toast.message}</p>}
            </button>
            <button type="button" onClick={() => dismissToast(toast.event_id)} className="shrink-0 text-clinic-muted hover:text-clinic-ink" aria-label="Cerrar">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function formatRelative(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
