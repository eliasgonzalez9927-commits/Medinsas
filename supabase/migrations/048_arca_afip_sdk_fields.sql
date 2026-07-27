-- Facturacion electronica ARCA via Afip SDK. fiscal_settings/invoices ya
-- existian desde la migracion 007 pero nunca se usaron de verdad. Sumamos
-- solo lo que no tiene donde vivir hoy:
--
-- fiscal_settings: cada clinica puede estar en sandbox u homologacion
-- mientras otra ya factura en produccion real, asi que el ambiente vive
-- por clinica, no en una env var global. El ticket WSAA (Token/Sign) que
-- devuelve Afip SDK vive ~12hs y pedirlo de nuevo en cada factura pega
-- contra el rate-limit propio de ARCA, asi que lo cacheamos por CUIT.
--
-- invoices: falta la fecha de vencimiento del CAE y la respuesta cruda de
-- ARCA, para poder mostrar el motivo real de un rechazo (arca_status =
-- 'failed') en vez de un generico "fallo la emision".
alter table public.fiscal_settings
  add column if not exists arca_environment text not null default 'sandbox',
  add column if not exists arca_wsaa_token text,
  add column if not exists arca_wsaa_sign text,
  add column if not exists arca_wsaa_expires_at timestamptz;

alter table public.invoices
  add column if not exists arca_cae_expires_at timestamptz,
  add column if not exists arca_requested_at timestamptz,
  add column if not exists arca_response jsonb;

-- payment_settings se sembro por clinica en la migracion 009; fiscal_settings
-- nunca se sembro (unique(clinic_id) existe pero sin filas). Cada clinica
-- necesita su fila antes de poder configurar CUIT/condicion fiscal.
insert into public.fiscal_settings (clinic_id)
select c.id from public.clinics c
where not exists (select 1 from public.fiscal_settings fs where fs.clinic_id = c.id);

-- Freno de ultima linea a nivel de base contra 2 CAE para el mismo
-- comprobante: si la transicion de estado condicional del endpoint
-- (ver api/invoices/[id].js) fallara por alguna carrera no prevista, esto
-- revienta con 23505 antes de guardar un numero de comprobante duplicado.
create unique index if not exists invoices_clinic_saletype_number_idx
  on public.invoices(clinic_id, sale_point, document_type, document_number)
  where document_number is not null;
