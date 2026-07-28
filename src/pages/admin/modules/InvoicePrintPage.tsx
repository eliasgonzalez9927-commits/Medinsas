import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { getInvoiceById } from "../../../lib/clinic-data";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  factura_b: "Factura B",
  factura_c: "Factura C"
};

// Codigos oficiales de ARCA - mismos usados en api/_lib/afipSdk.js del lado
// servidor, pero necesarios de nuevo aca porque el QR (RG 4892) se arma
// client-side con datos que ya estan en el comprobante, sin llamar a ARCA.
const CBTE_TIPO_BY_DOCUMENT_TYPE: Record<string, number> = { factura_b: 6, factura_c: 11 };
const DOC_TIPO_CONSUMIDOR_FINAL = 99;

export function InvoicePrintPage() {
  const { id = "" } = useParams();
  const [invoice, setInvoice] = useState<Awaited<ReturnType<typeof getInvoiceById>>>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getInvoiceById(id)
      .then(setInvoice)
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar el comprobante."));
  }, [id]);

  useEffect(() => {
    if (!invoice || invoice.arca_status !== "synced" || !invoice.arca_external_id) return;
    const cbteTipo = CBTE_TIPO_BY_DOCUMENT_TYPE[invoice.document_type];
    // El QR tiene que reflejar el DocTipo/DocNro que ARCA realmente
    // registro (consumidor final anonimo, o DNI si el importe supero el
    // umbral de identificacion) - se lee de la respuesta guardada en vez
    // de asumir siempre consumidor final, para no imprimir un QR que no
    // coincide con lo que ARCA tiene en sus sistemas.
    const detResponse = (invoice.arca_response as any)?.FECAESolicitarResult?.FeDetResp?.FECAEDetResponse?.[0];
    const payload = {
      ver: 1,
      fecha: (invoice.issued_at ?? invoice.created_at).slice(0, 10),
      cuit: Number(invoice.fiscal_settings?.cuit ?? 0),
      ptoVta: Number(invoice.sale_point),
      tipoCmp: cbteTipo,
      nroCmp: Number(invoice.document_number),
      importe: Number(invoice.total),
      moneda: "PES",
      ctz: 1,
      tipoDocRec: detResponse?.DocTipo ?? DOC_TIPO_CONSUMIDOR_FINAL,
      nroDocRec: detResponse?.DocNro ?? 0,
      tipoCodAut: "E",
      codAut: Number(invoice.arca_external_id)
    };
    const url = `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`;
    QRCode.toDataURL(url, { width: 180, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [invoice]);

  if (error) return <div className="p-8 text-sm text-red-700">{error}</div>;
  if (!invoice) return <div className="p-8 text-sm text-clinic-muted">Cargando comprobante...</div>;

  const clinic = invoice.clinics;
  const fiscal = invoice.fiscal_settings;

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-clinic-ink print:max-w-none">
      <div className="no-print mb-6 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Guardar como PDF
        </button>
      </div>

      <div className="flex items-start justify-between border-b border-clinic-line pb-4">
        <div>
          <h1 className="text-lg font-bold">{fiscal?.legal_name ?? clinic?.name ?? "Clinica"}</h1>
          <p className="text-sm">{fiscal?.fiscal_address ?? clinic?.address ?? ""}</p>
          <p className="text-sm">CUIT: {fiscal?.cuit ?? "—"}</p>
          <p className="text-sm">Condicion fiscal: {fiscal?.fiscal_condition === "responsable_inscripto" ? "Responsable Inscripto" : "Monotributo"}</p>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold">{DOCUMENT_TYPE_LABELS[invoice.document_type] ?? invoice.document_type}</h2>
          <p className="text-sm">Punto de venta {invoice.sale_point} · N° {invoice.document_number}</p>
          <p className="text-sm">Fecha: {(invoice.issued_at ?? invoice.created_at).slice(0, 10)}</p>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p>Cliente: {invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name}` : "Consumidor Final"}</p>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-clinic-line text-left">
            <th className="py-2">Descripcion</th>
            <th className="py-2 text-right">Cantidad</th>
            <th className="py-2 text-right">Precio unit.</th>
            <th className="py-2 text-right">IVA</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.invoice_items.map((item) => (
            <tr key={item.id} className="border-b border-clinic-line/50">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">{formatMoney(item.unit_price)}</td>
              <td className="py-2 text-right">{item.tax_rate ? `${item.tax_rate}%` : "—"}</td>
              <td className="py-2 text-right">{formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-48 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(invoice.subtotal)}</span></div>
          <div className="flex justify-between"><span>IVA</span><span>{formatMoney(invoice.tax_amount)}</span></div>
          <div className="mt-1 flex justify-between border-t border-clinic-line pt-1 font-bold"><span>Total</span><span>{formatMoney(invoice.total)}</span></div>
        </div>
      </div>

      <div className="mt-8 flex items-end justify-between border-t border-clinic-line pt-4">
        <div className="text-sm">
          <p>CAE: {invoice.arca_external_id}</p>
          <p>Vencimiento CAE: {invoice.arca_cae_expires_at ? invoice.arca_cae_expires_at.slice(0, 10) : "—"}</p>
        </div>
        {qrDataUrl && <img src={qrDataUrl} alt="QR AFIP" width={120} height={120} />}
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value || 0));
}
