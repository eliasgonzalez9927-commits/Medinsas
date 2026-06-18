import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";

type PaymentReturnKind = "success" | "pending" | "failure";

type PaymentStatusResponse = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  checkout_url: string | null;
  paid_at: string | null;
};

export function PaymentSuccessPage() {
  return <PaymentReturnPage kind="success" />;
}

export function PaymentPendingPage() {
  return <PaymentReturnPage kind="pending" />;
}

export function PaymentFailurePage() {
  return <PaymentReturnPage kind="failure" />;
}

function PaymentReturnPage({ kind }: { kind: PaymentReturnKind }) {
  const { search } = useLocation();
  const paymentId = useMemo(() => new URLSearchParams(search).get("payment_id"), [search]);
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!paymentId) {
        setError("No encontramos el identificador del pago.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/payments/mercadopago/status?payment_id=${paymentId}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "No pudimos consultar el pago.");
        setPayment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos consultar el pago.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [paymentId]);

  const content = resolveContent(kind, payment?.status);
  const Icon = content.icon;

  return (
    <main className="grid min-h-screen place-items-center bg-clinic-surface px-4 py-8">
      <section className="w-full max-w-xl rounded-lg border border-clinic-line bg-white p-6 text-center shadow-sm">
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-lg ${content.iconClass}`}>
          <Icon size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-clinic-ink">{content.title}</h1>
        {loading ? (
          <p className="mt-3 text-clinic-muted">Consultando estado real del pago...</p>
        ) : error ? (
          <p className="mt-3 text-red-700">{error}</p>
        ) : (
          <>
            <p className="mt-3 text-clinic-muted">{content.description}</p>
            <div className="mt-5 rounded-lg bg-clinic-surface px-4 py-3 text-sm font-semibold text-clinic-ink">
              Estado interno: {payment?.status ?? "sin estado"}
            </div>
            {payment?.checkout_url && payment.status !== "approved" && (
              <a
                href={payment.checkout_url}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-clinic-brand px-5 py-3 font-semibold text-white hover:bg-teal-800"
              >
                Reintentar pago
              </a>
            )}
          </>
        )}
        <Link className="mt-5 inline-flex text-sm font-semibold text-clinic-brand" to="/reservar/clinica-central">
          Volver a reservas
        </Link>
      </section>
    </main>
  );
}

function resolveContent(kind: PaymentReturnKind, status?: string) {
  if (status === "approved") {
    return {
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-700",
      title: "Pago aprobado",
      description: "El pago fue registrado. La emision fiscal se gestiona desde Facturacion."
    };
  }
  if (kind === "failure" || status === "rejected") {
    return {
      icon: AlertCircle,
      iconClass: "bg-red-50 text-red-700",
      title: "No pudimos confirmar el pago",
      description: "El turno queda pendiente hasta que el pago sea aprobado."
    };
  }
  return {
    icon: Clock3,
    iconClass: "bg-amber-50 text-amber-700",
    title: "Pago pendiente",
    description: "Mercado Pago todavia no confirmo la operacion. Vamos a actualizar el estado cuando llegue el webhook."
  };
}
