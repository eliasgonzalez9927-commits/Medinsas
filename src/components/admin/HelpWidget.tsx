import { FormEvent, useState } from "react";
import { LifeBuoy, X } from "lucide-react";
import { Button } from "../ui/Button";
import { createSupportTicket } from "../../lib/clinic-data";

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setSubject("");
    setMessage("");
    setSent(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await createSupportTicket({ subject, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar tu consulta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-clinic-brand px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#0b655e]"
      >
        <LifeBuoy size={18} />
        ¿Necesitás ayuda?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={close}>
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-clinic-ink">¿Necesitás ayuda?</h2>
              <button type="button" onClick={close} className="text-clinic-muted hover:text-clinic-ink">
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="mt-4">
                <p className="text-sm text-clinic-ink">Listo, recibimos tu consulta. Te vamos a responder a la brevedad.</p>
                <Button className="mt-4" onClick={close} variant="primary">Cerrar</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 grid gap-3">
                <p className="text-sm text-clinic-muted">Contanos qué necesitás y te respondemos apenas podamos.</p>
                {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <label>
                  <span className="text-sm font-medium text-clinic-ink">Asunto</span>
                  <input
                    required
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-clinic-ink">Mensaje</span>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-clinic-line px-3 py-2 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
                  />
                </label>
                <Button type="submit" disabled={sending} variant="primary">
                  {sending ? "Enviando..." : "Enviar"}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
