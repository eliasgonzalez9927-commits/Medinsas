// Cliente minimo para la API REST de Afip SDK (afipsdk.com), que abstrae
// certificados/WSAA/WSFEv1 detras de dos endpoints:
//   POST /v1/afip/auth      -> ticket WSAA (Token/Sign) para un CUIT delegado
//   POST /v1/afip/requests  -> proxy generico a los metodos de WSFEv1 (WSAA)
// Un solo AFIPSDK_ACCESS_TOKEN de plataforma sirve para todas las clinicas:
// cada clinica delega el servicio "Facturacion Electronica" al CUIT de Afip
// SDK desde ARCA: no hace falta certificado propio por clinica.
const AFIPSDK_BASE_URL = "https://app.afipsdk.com/api/v1";

// El ticket WSAA vive ~12hs; se cachea en fiscal_settings y se pide de
// nuevo un rato antes de vencer (mismo patron que REFRESH_BUFFER_MS de
// mercadoPagoAccount.js para el token de Mercado Pago).
const WSAA_REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function afipSdkFetch(path, body) {
  if (!process.env.AFIPSDK_ACCESS_TOKEN) {
    const err = new Error("AFIPSDK_ACCESS_TOKEN no configurado");
    err.code = "ARCA_NOT_CONFIGURED";
    throw err;
  }
  const response = await fetch(`${AFIPSDK_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AFIPSDK_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("Afip SDK request failed");
    err.code = "ARCA_ERROR";
    err.statusCode = response.status;
    err.arcaResponse = responseBody;
    throw err;
  }
  return responseBody;
}

export async function getOrRefreshWsaaTicket(client, fiscalSettings) {
  const expiresAt = fiscalSettings.arca_wsaa_expires_at ? new Date(fiscalSettings.arca_wsaa_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > WSAA_REFRESH_BUFFER_MS && fiscalSettings.arca_wsaa_token && fiscalSettings.arca_wsaa_sign) {
    return { token: fiscalSettings.arca_wsaa_token, sign: fiscalSettings.arca_wsaa_sign };
  }

  const environment = fiscalSettings.arca_environment === "production" ? "prod" : "dev";
  const auth = await afipSdkFetch("/afip/auth", {
    environment,
    wsid: "wsfe",
    tax_id: fiscalSettings.cuit,
    force_create: false
  });

  const token = auth?.token;
  const sign = auth?.sign;
  if (!token || !sign) {
    const err = new Error("Afip SDK auth response missing token/sign");
    err.code = "ARCA_ERROR";
    err.arcaResponse = auth;
    throw err;
  }

  // Afip SDK devuelve "expiration" (confirmado en pruebas contra
  // homologacion) - si en algun caso faltara, el WSAA estandar de ARCA da
  // tickets de 12hs, asi que cacheamos 11hs para quedar del lado seguro.
  const nextExpiresAt = auth?.expiration
    ? new Date(auth.expiration).toISOString()
    : new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await client
    .from("fiscal_settings")
    .update({
      arca_wsaa_token: token,
      arca_wsaa_sign: sign,
      arca_wsaa_expires_at: nextExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", fiscalSettings.id);
  if (updateError) throw updateError;

  return { token, sign };
}

// Codigos oficiales de ARCA (estables desde hace anios, no especificos de
// Afip SDK). MVP cubre solo Factura B y C a consumidor final (ver plan):
// sin Factura A, sin discriminar CUIT del receptor. Verificado contra
// homologacion real (CUIT de prueba de Medin) el 2026-07-28: ambos tipos
// obtuvieron CAE aprobado.
const CBTE_TIPO_BY_DOCUMENT_TYPE = { factura_b: 6, factura_c: 11 };
const CONCEPTO_SERVICIOS = 2;
const DOC_TIPO_CONSUMIDOR_FINAL = 99;
// CondicionIVAReceptorId, obligatorio desde RG 4291 v4.4 - 5 = Consumidor Final.
const CONDICION_IVA_RECEPTOR_CONSUMIDOR_FINAL = 5;

function todayAsArcaDate() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// Concepto=2 (Servicios) exige informar el periodo del servicio y el
// vencimiento de pago (error 10049 si faltan) - una consulta/atencion es
// same-day, asi que las tres fechas son la fecha del comprobante.
async function getNextInvoiceNumber({ client, fiscalSettings, ptoVta, cbteTipo }) {
  const { token, sign } = await getOrRefreshWsaaTicket(client, fiscalSettings);
  const result = await afipSdkFetch("/afip/requests", {
    environment: fiscalSettings.arca_environment === "production" ? "prod" : "dev",
    method: "FECompUltimoAutorizado",
    wsid: "wsfe",
    params: {
      Auth: { Token: token, Sign: sign, Cuit: fiscalSettings.cuit },
      PtoVta: ptoVta,
      CbteTipo: cbteTipo
    }
  });
  const lastNumber = Number(result?.FECompUltimoAutorizadoResult?.CbteNro ?? 0);
  return lastNumber + 1;
}

export async function requestCae({ client, fiscalSettings, invoice }) {
  const { token, sign } = await getOrRefreshWsaaTicket(client, fiscalSettings);
  const cbteTipo = CBTE_TIPO_BY_DOCUMENT_TYPE[invoice.document_type];
  if (!cbteTipo) {
    const err = new Error(`Tipo de comprobante no soportado: ${invoice.document_type}`);
    err.code = "ARCA_UNSUPPORTED_DOCUMENT_TYPE";
    throw err;
  }
  const ptoVta = Number(invoice.sale_point);
  const impNeto = Number(invoice.subtotal);
  const impIva = Number(invoice.tax_amount);
  const impTotal = Number(invoice.total);
  const today = todayAsArcaDate();
  const nextNumber = await getNextInvoiceNumber({ client, fiscalSettings, ptoVta, cbteTipo });

  const result = await afipSdkFetch("/afip/requests", {
    environment: fiscalSettings.arca_environment === "production" ? "prod" : "dev",
    method: "FECAESolicitar",
    wsid: "wsfe",
    params: {
      Auth: { Token: token, Sign: sign, Cuit: fiscalSettings.cuit },
      FeCAEReq: {
        FeCabReq: { CantReg: 1, PtoVta: ptoVta, CbteTipo: cbteTipo },
        FeDetReq: {
          FECAEDetRequest: [
            {
              Concepto: CONCEPTO_SERVICIOS,
              DocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
              DocNro: 0,
              CbteDesde: nextNumber,
              CbteHasta: nextNumber,
              CbteFch: today,
              FchServDesde: today,
              FchServHasta: today,
              FchVtoPago: today,
              ImpTotal: impTotal,
              ImpTotConc: 0,
              ImpNeto: cbteTipo === CBTE_TIPO_BY_DOCUMENT_TYPE.factura_c ? impTotal : impNeto,
              ImpOpEx: 0,
              ImpIVA: cbteTipo === CBTE_TIPO_BY_DOCUMENT_TYPE.factura_c ? 0 : impIva,
              ImpTrib: 0,
              MonId: "PES",
              MonCotiz: 1,
              CondicionIVAReceptorId: CONDICION_IVA_RECEPTOR_CONSUMIDOR_FINAL,
              ...(cbteTipo === CBTE_TIPO_BY_DOCUMENT_TYPE.factura_b
                ? { Iva: { AlicIva: [{ Id: 5, BaseImp: impNeto, Importe: impIva }] } }
                : {})
            }
          ]
        }
      }
    }
  });

  const detResponse = result?.FECAESolicitarResult?.FeDetResp?.FECAEDetResponse?.[0];
  const topLevelError = result?.FECAESolicitarResult?.Errors?.Err?.[0]?.Msg;
  const detailObservation = detResponse?.Observaciones?.Obs?.[0]?.Msg;
  if (!detResponse || detResponse.Resultado !== "A" || !detResponse.CAE) {
    const err = new Error("ARCA rechazo el comprobante");
    err.code = "ARCA_REJECTED";
    err.friendlyMessage = detailObservation ?? topLevelError ?? "ARCA rechazo el comprobante.";
    err.arcaResponse = result;
    throw err;
  }

  return {
    cae: detResponse.CAE,
    caeFchVto: detResponse.CAEFchVto,
    cbteDesde: detResponse.CbteDesde,
    raw: result
  };
}
