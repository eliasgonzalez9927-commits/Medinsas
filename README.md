# Medin

Base de aplicacion SaaS para gestion de clinicas con reservas, triaje digital inicial y panel administrativo.

## Estructura

```txt
clinic-saas-mvp/
  supabase/
    functions/
      whatsapp-funnel.js
    migrations/
      002_ai_whatsapp_agent.sql
      003_product_architecture.sql
      004_connect_operational_base.sql
      005_connect_agenda_patients_booking.sql
      006_auth_admin_access.sql
      007_billing_prescriptions_foundation.sql
      008_settings_users_messaging.sql
    schema.sql
  backend/
    src/
      agent/
        agent.js
        systemPrompt.js
        tools.js
      routes/
        whatsappWebhook.js
      server.js
  src/
    components/
      admin/
      ui/
      fintech/
        FinancingSimulator.tsx
      growth/
        GrowthDashboard.tsx
      AppShell.tsx
      ProtectedRoute.tsx
    contexts/
      AuthContext.tsx
    lib/
      clinic-data.ts
      supabase.ts
    pages/
      admin/
        AdminDashboard.tsx
        modules/
      auth/
        Login.tsx
        Register.tsx
      landing/
        ClinicLanding.tsx
      booking/
        PublicBookingPage.tsx
      patient/
        PatientBooking.tsx
    types/
      clinic.ts
      database.ts
    App.tsx
    main.tsx
    index.css
```

## Puesta en marcha

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor.
3. Ejecuta las migraciones en orden: `supabase/migrations/002_ai_whatsapp_agent.sql`, `supabase/migrations/003_product_architecture.sql`, `supabase/migrations/004_connect_operational_base.sql`, `supabase/migrations/005_connect_agenda_patients_booking.sql`, `supabase/migrations/006_auth_admin_access.sql`, `supabase/migrations/007_billing_prescriptions_foundation.sql`, `supabase/migrations/008_settings_users_messaging.sql`, `supabase/migrations/009_mercado_pago_payments.sql`, `supabase/migrations/010_clinic_timezone_fix.sql`, `supabase/migrations/011_payment_expiration_admin_tools.sql`, `supabase/migrations/012_superadmin_onboarding.sql`, `supabase/migrations/013_patient_access_foundation.sql` y `supabase/migrations/014_patient_requests_admin_tools.sql`.
4. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. Instala dependencias con `npm install`.
6. Ejecuta `npm run dev`.

## Modulos incluidos

- Login y registro con Supabase Auth.
- Roles `patient` y `admin` guardados en `profiles`.
- Portal de paciente con triaje digital y reserva presencial o telemedicina.
- Dashboard administrativo con metricas del dia, tabla de turnos, lectura de triaje y cambio de estado.
- Simulador fintech para financiar tratamientos y proyectar flujo de caja.
- Growth dashboard con KPIs de ausentismo, pacientes nuevos/recurrentes y rentabilidad.
- Landing page de marca blanca en `/clinica-demo` con meta tags y JSON-LD Schema.org.
- Webhook base `supabase/functions/whatsapp-funnel.js` para automatizaciones de WhatsApp.
- Backend Node.js en `backend/` para operar Supabase desde WhatsApp con un agente OpenAI y tools por rol.
- Row Level Security para separar acceso de pacientes y administradores.
- Acceso admin protegido con Supabase Auth, perfiles, membresias por clinica y roles operativos.
- Modulos preparados de facturacion y recetarios internos, sin integraciones fiscales o regulatorias activas.
- Roadmap de historia clinica unificada como modulo sensible, regulado y separado de la ficha operativa del paciente.
- Configuracion operativa con clinica, sedes, horarios, usuarios/permisos, notificaciones y mensajeria por Resend desde backend.
- Pagos con Mercado Pago Checkout Pro desde backend, con webhooks, estados de pago y relacion con turnos/servicios.
- Acceso paciente por link privado de turno en `/mi-turno/:token`, sin obligar al paciente a crear usuario para reservar.

## Rutas de producto

- `/admin`: resumen operativo del dia.
- `/admin/agenda`: agenda con filtros por fecha, profesional, especialidad y estado.
- `/admin/profesionales`: cartilla de medicos/profesionales.
- `/admin/profesionales/:id`: perfil, servicios, disponibilidad y link publico por profesional.
- `/admin/disponibilidad`: reglas de horarios, descansos y bloqueos.
- `/admin/pacientes`: base de pacientes y busqueda.
- `/admin/servicios`: catalogo de servicios/tratamientos.
- `/admin/booking`: configuracion de reservas online y links publicos.
- `/admin/whatsapp`: plantillas y preparacion de flujos por WhatsApp.
- `/admin/mensajes`: comunicaciones por email a pacientes con confirmacion y logs.
- `/admin/pagos`: listado y trazabilidad de pagos.
- `/admin/pagos/:id`: detalle de pago y eventos.
- `/admin/pagos/configuracion`: configuracion Mercado Pago.
- `/admin/financiacion`: simulador de planes de pago.
- `/admin/facturacion`: preparacion fiscal, comprobantes internos, pagos y estado ARCA.
- `/admin/facturacion/comprobantes`: listado preparado de comprobantes.
- `/admin/facturacion/configuracion`: datos fiscales, CUIT, condicion fiscal y puntos de venta.
- `/admin/recetarios`: recetario interno, ordenes e indicaciones.
- `/admin/recetarios/nuevo`: borrador de documento medico interno.
- `/admin/recetarios/configuracion`: datos profesionales, matricula e integracion futura.
- `/admin/configuracion`: datos de clinica, branding e integraciones.
- `/admin/configuracion/sedes`: gestion de sedes.
- `/admin/configuracion/usuarios`: usuarios, roles e invitaciones.
- `/admin/configuracion/notificaciones`: notificaciones automaticas.
- `/admin/reportes`: indicadores de gestion.
- `/reservar/:clinicSlug`: flujo publico mobile-first para reserva de pacientes.
- `/pago/exitoso`, `/pago/pendiente`, `/pago/fallido`: retorno de Mercado Pago con consulta de estado interno.
- `/mi-turno/:token`: consulta privada del turno por token seguro, con calendario, datos de pago y solicitudes de reprogramacion/cancelacion.

Las secciones de producto principales ya operan contra Supabase. Los mocks quedan solo como fallback
visual en modulos que todavia no tengan datos reales cargados.

## Rutas futuras planificadas

- `/admin/historia-clinica`: vista clinica unificada para busqueda y supervision con permisos estrictos.
- `/admin/pacientes/:id/historia-clinica`: historia clinica longitudinal de un paciente especifico.
- `/paciente/login`: acceso futuro por magic link, email + codigo o WhatsApp.
- `/paciente`: inicio del portal paciente.
- `/paciente/turnos`: proximos turnos e historial.
- `/paciente/pagos`: pagos, saldos y comprobantes disponibles.
- `/paciente/documentos`: indicaciones, ordenes y documentos cuando el modulo regulado este listo.

Estas rutas no deben activarse como simples notas administrativas. Requieren modelo de datos,
auditoria, permisos por rol y trazabilidad antes de exponerse en produccion.

## Acceso paciente

El MVP no obliga al paciente a crear usuario para reservar. El flujo recomendado es:

1. El paciente entra a `/reservar/:clinicSlug`.
2. Elige servicio, profesional, fecha y horario.
3. Carga sus datos operativos.
4. Paga seña o pago total si corresponde.
5. Vuelve al post-pago y recibe un link privado para consultar el turno.

La migracion `013_patient_access_foundation.sql` crea:

- `appointment_public_links`: tokens privados no adivinables asociados a turnos, con vencimiento y revocacion opcional.
- `appointment_requests`: solicitudes de cancelacion o reprogramacion iniciadas por paciente, siempre pendientes de aprobacion.

La ruta `/mi-turno/:token` muestra solo informacion operativa: paciente, servicio, profesional, fecha,
clinica, direccion, estado del turno, estado del pago, monto pagado y saldo pendiente. Tambien permite
agregar a Google Calendar, descargar `.ics`, copiar datos, contactar a la clinica y solicitar
cancelacion o reprogramacion.

No debe mostrar historia clinica, diagnosticos, notas internas, evoluciones, indicaciones sensibles ni
datos medicos regulados. El portal paciente futuro deberia implementarse con magic link, codigo por
email o WhatsApp, sin contrasena obligatoria en la primera version.

## Base operativa conectada

La capa `src/lib/clinic-data.ts` conecta a Supabase estos modulos:

- Profesionales: listar, detalle por `id` o `slug`, crear, editar y activar/desactivar.
- Servicios: listar, crear, editar y activar/desactivar.
- Disponibilidad: listar reglas, crear/eliminar horarios, listar/crear/eliminar bloqueos.
- Pacientes: listar, buscar, crear y editar.
- Agenda: listar turnos reales, filtrar por fecha/profesional/servicio/estado, crear turnos manuales y cambiar estado.
- Reserva publica: `/reservar/:clinicSlug` carga servicios/profesionales reales, consulta horarios libres y crea turnos.
- Motor de slots: `getAvailableSlots({ clinicId, professionalId, serviceId, date })` para admin y RPC `get_public_available_slots(...)` para anonimos.

La migracion `004_connect_operational_base.sql` agrega slugs, campos operativos, RLS inicial,
policies de lectura publica minima y permisos de gestion para administradores. Tambien inserta
datos demo reales para `Clinica Central`.

La migracion `005_connect_agenda_patients_booking.sql` conecta `appointments` con `patients`,
quita el bloqueo global de un turno por hora, agrega `appointment_events`, expone la RPC publica
de slots disponibles y crea `create_public_booking(...)` con validacion anti doble reserva dentro
de la base de datos. Los eventos quedan listos para conectar WhatsApp sin enviar mensajes todavia.

### Timezones de agenda

Los horarios de turnos se eligen y se muestran en la zona horaria de la clinica. Para la demo,
`clinics.timezone` queda en `America/Argentina/Mendoza`.

- El paciente elige fecha y hora local de la clinica.
- La RPC `get_public_available_slots(...)` convierte esa hora local a UTC con `AT TIME ZONE`.
- `appointments.starts_at` y `appointments.end_time` se guardan como `timestamptz`.
- Las pantallas de agenda, pagos, retorno post-pago, emails y calendario formatean usando
  `clinic.timezone`, no la timezone implicita del navegador.
- La migracion `010_clinic_timezone_fix.sql` agrega `clinics.timezone` y corrige las RPC de
  slots/reserva publica para evitar corrimientos como 09:30 -> 06:30.

## Acceso admin

La migracion `006_auth_admin_access.sql` agrega los roles operativos `platform_admin`,
`clinic_admin`, `receptionist` y `professional`, crea `clinic_members` y actualiza
`public.is_admin()` para proteger las rutas y las policies.

## Superadmin y onboarding SaaS

La migracion `012_superadmin_onboarding.sql` agrega la base multi-clinica para operar Medin como
SaaS:

- `subscription_plans` con planes iniciales `Básico`, `Pro` y `Enterprise`.
- `clinic_subscriptions` para estado comercial de cada clinica: `trial`, `active`,
  `past_due`, `suspended` o `cancelled`.
- `clinic_modules` para habilitar u ocultar módulos por clínica.
- `clinic_onboarding_steps` para seguimiento asistido.
- `audit_logs` para eventos sensibles como alta/edicion de clinicas, cambios de módulos,
  cambios de suscripción y pasos de onboarding.

Rutas agregadas:

```txt
/superadmin
/superadmin/clinicas
/superadmin/clinicas/:id
/admin/onboarding
```

`/superadmin` está protegida para `platform_admin`. Un `clinic_admin` continúa entrando solo al
panel de su clínica. Al crear una clínica desde Superadmin se crea la base operativa mínima:
`clinics`, `booking_settings`, `fiscal_settings`, `payment_settings`, suscripción, módulos y
checklist de onboarding. El slug se valida como único antes de insertar.

El sidebar de `/admin` consulta `clinic_modules`: los módulos base (`Dashboard`, `Agenda`,
`Pacientes`, `Profesionales`, `Servicios`, `Disponibilidad` y `Configuración`) quedan visibles;
módulos opcionales como `Pagos`, `Facturación`, `Recetarios`, `WhatsApp`, `Mensajes`,
`Financiación` y `Reportes` se muestran solo si están habilitados para la clínica.

Para crear el primer administrador, usa la Supabase Admin API desde tu maquina o un entorno backend.
La `SUPABASE_SERVICE_ROLE_KEY` no debe tener prefijo `VITE_` ni subirse al frontend.

Ejemplo local:

```bash
SUPABASE_URL="https://tu-proyecto.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key" \
ADMIN_EMAIL="admin@medin.local" \
ADMIN_PASSWORD="Medin.Admin.2026!" \
ADMIN_FULL_NAME="Admin Medin" \
ADMIN_ROLE="platform_admin" \
CLINIC_SLUG="clinica-central" \
npm run admin:create
```

Luego entra en `/login` con ese email y contrasena. Todas las rutas `/admin` redirigen a
`/login` si no hay sesion activa.

## Facturacion y recetarios

La migracion `007_billing_prescriptions_foundation.sql` agrega las tablas `fiscal_settings`,
`payments`, `invoices`, `invoice_items`, `prescription_settings`, `medical_documents` y
`medical_document_items`, con RLS para administradores.

Facturacion queda preparada para datos fiscales, CUIT, condicion fiscal, puntos de venta,
comprobantes internos, facturas, recibos, notas de credito, pagos, PDF y estado de integracion
ARCA. Mientras no exista WSAA/WSFE o proveedor externo configurado, la UI muestra:
`Integracion ARCA pendiente de configuracion.`

Recetarios queda preparado como `Recetario interno`, `Ordenes e indicaciones` y
`Preparado para integracion con receta electronica`. No se presenta como integracion oficial
activa hasta conectar una plataforma aprobada y completar la configuracion profesional.

## Roadmap: historia clinica unificada

La historia clinica unificada queda definida como un modulo futuro sensible y regulado. Debe
estar separado de `patients`, que hoy representa la base operativa de contacto, agenda y gestion
administrativa. No debe implementarse como un campo de notas ni como texto libre mezclado con
datos administrativos.

Alcance funcional previsto:

- Ficha clinica del paciente, independiente de la ficha administrativa.
- Historial de turnos y relacion con `appointments`.
- Evoluciones medicas por encuentro o episodio.
- Notas clinicas, diagnosticos y motivos de consulta.
- Indicaciones, recetas internas y ordenes de estudios vinculadas a `medical_documents`.
- Archivos adjuntos clinicos con metadatos de origen, tipo documental y paciente asociado.
- Profesional responsable de cada registro.
- Fecha y hora inmutable de creacion, actualizacion y emision cuando aplique.
- Auditoria de lectura y escritura por usuario, rol, accion, IP/contexto y recurso accedido.
- Permisos por rol para `platform_admin`, `clinic_admin`, `receptionist`, `professional` y futuros roles clinicos.
- Privacidad, trazabilidad y separacion entre informacion clinica, operativa y financiera.

Arquitectura de datos sugerida para una etapa posterior:

- `clinical_records`: contenedor longitudinal por paciente y clinica.
- `clinical_entries`: evoluciones, notas clinicas, diagnosticos, motivos e indicaciones.
- `clinical_attachments`: documentos, imagenes o estudios adjuntos.
- `clinical_record_access_logs`: auditoria de lectura, escritura, exportacion y cambios de permisos.
- Relaciones con `patients`, `appointments`, `professionals`, `medical_documents` y `medical_document_items`.

Antes de implementar este modulo hay que definir RLS especifico, permisos por membresia clinica,
politicas de acceso minimo necesario, retencion documental, exportacion segura, backups y un
modelo de auditoria que no dependa solo del frontend.

## Configuracion, usuarios y Resend

La migracion `008_settings_users_messaging.sql` agrega columnas operativas a `clinics`,
`locations`, `patients`, `clinic_members` y `booking_settings`. Tambien crea:

- `clinic_hours`: horarios generales de apertura por dia.
- `clinic_schedule_exceptions`: feriados, excepciones y bloqueos generales futuros.
- `user_invitations`: invitaciones de usuarios por email, rol, sede y profesional asociado.
- `message_templates`: plantillas por canal y tipo.
- `message_logs`: auditoria basica de emails enviados, fallidos u omitidos.

Permisos centralizados:

- `platform_admin`: gestiona todo.
- `clinic_admin`: gestiona su clinica, usuarios, agenda, pacientes, configuracion, reportes y modulos administrativos.
- `receptionist`: gestiona agenda, pacientes, turnos, reservas y mensajes operativos.
- `professional`: ve su agenda/pacientes asignados y documentos medicos; no edita configuracion general.

Los helpers viven en `src/lib/permissions.ts` y el backend replica la matriz en
`backend/src/security/permissions.js`.

### Resend

El envio de emails se hace desde backend en `/api/messages/send`. El frontend nunca
lee `RESEND_API_KEY`.

Variables backend:

```txt
RESEND_API_KEY=
RESEND_FROM_EMAIL=Medin <no-reply@tu-dominio.com>
RESEND_REPLY_TO_EMAIL=soporte@tu-dominio.com
```

Pasos:

1. Crear cuenta en Resend.
2. Verificar dominio o remitente.
3. Cargar `RESEND_API_KEY`, `RESEND_FROM_EMAIL` y `RESEND_REPLY_TO_EMAIL` en Vercel para el backend.
4. Redeploy.
5. Entrar a `/admin/mensajes`, elegir destinatarios, escribir asunto/mensaje y confirmar envio.

Los mensajes generales respetan `patients.email_opt_in`. Los emails transaccionales de turnos
quedan preparados con plantillas iniciales y logs; WhatsApp real y webhooks completos de Resend
quedan pendientes. La ruta preparada `/api/webhooks/resend` queda lista para completar
validacion de firma y eventos `delivered`, `bounced`, `opened` y `clicked`.

## Pagos con Mercado Pago

La migracion `009_mercado_pago_payments.sql` agrega:

- `payment_settings`: configuracion por clinica/proveedor.
- `payment_events`: eventos recibidos por webhook.
- Columnas de Mercado Pago en `payments`: `provider`, `provider_payment_id`,
  `provider_preference_id`, `external_reference`, `checkout_url`, `status_detail`,
  `payment_method`, `payer_email`, `invoice_id` y `service_id`.
- Columnas de pago en `appointments`: `payment_status`, `deposit_amount` y `payment_required`.
- Columnas comerciales en `services`: `payment_required`, `deposit_required`,
  `deposit_amount` y `allow_online_payment`.

Estados separados:

- Turno: `appointments.status` mantiene el estado operativo/clinico.
- Pago del turno: `appointments.payment_status` usa `unpaid`, `deposit_pending`,
  `deposit_paid`, `paid`, `rejected` o `refunded`.
- Pago: `payments.status` usa estados Mercado Pago normalizados como `pending`,
  `in_process`, `approved`, `rejected`, `cancelled`, `refunded`, `charged_back` o `expired`.

Endpoints backend:

```txt
GET  /api/health/env
POST /api/payments/mercadopago/create-preference
POST /api/payments/mercadopago/webhook
GET  /api/payments/mercadopago/status?payment_id=...
POST /api/payments/mercadopago/:id/sync
```

Variables backend requeridas:

```txt
SUPABASE_URL=https://nlouwkcytkmyjexperyt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_ENV=sandbox
APP_PUBLIC_URL=https://clinic-saas-mvp.vercel.app
```

Para probar en modo test:

1. Crear credenciales de prueba en Mercado Pago.
2. Cargar `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`,
   `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_ENV=sandbox`, `APP_PUBLIC_URL`,
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
3. Redeploy para que el backend lea las nuevas variables.
4. Verificar `/api/health/env`; solo devuelve booleanos, nunca secretos.
5. Entrar a `/admin/pagos/configuracion` y activar Mercado Pago.
6. En `/admin/servicios`, configurar un servicio con `Pago online`, `Requiere sena` y monto de sena.
7. Probar `/reservar/clinica-central`, crear la reserva y continuar a Mercado Pago.
8. Confirmar el estado en `/admin/pagos`.

Medin no maneja datos de tarjeta ni guarda access tokens de Mercado Pago en frontend. La
confirmacion confiable del pago ocurre por webhook y consulta backend a Mercado Pago, no por
la URL de retorno del usuario.

La migracion `011_payment_expiration_admin_tools.sql` agrega `payments.expires_at`. En
`/admin/pagos`, un pago `pending` o `in_process` con `expires_at` pasado se muestra como
`Vencido`; no cuenta como pendiente ni cobrado. El boton `Actualizar estado` consulta el backend
para sincronizar con Mercado Pago o marcar el pago como vencido si corresponde.

### Dominio publico

Para usar `https://app.medin.com.ar` como dominio final:

1. Agregar `app.medin.com.ar` en Vercel, seccion Domains del proyecto.
2. Crear en DNS un `CNAME` para `app` apuntando a `cname.vercel-dns.com`, o al valor exacto que indique Vercel.
3. Cambiar `APP_PUBLIC_URL` en Vercel a `https://app.medin.com.ar`.
4. Hacer redeploy para que backend use el nuevo dominio en Mercado Pago, emails y calendario.
5. Cambiar el webhook de Mercado Pago a `https://app.medin.com.ar/api/payments/mercadopago/webhook`.
6. Probar una reserva con seña desde `https://app.medin.com.ar/reservar/clinica-central`.

`APP_PUBLIC_URL` es server-side y no debe llevar prefijo `VITE_`. Mientras el dominio final no este
validado, debe mantenerse en `https://clinic-saas-mvp.vercel.app`. El frontend genera links publicos
desde `window.location.origin`, con ese mismo fallback temporal.

## Integracion WhatsApp

`supabase/functions/whatsapp-funnel.js` espera eventos HTTP `POST` con `eventType`,
`appointment` y `patient`. Puede recibir eventos desde:

- Triggers de base de datos que llamen una Edge Function cuando cambia `appointments.status`.
- Un cron diario de Supabase que busque turnos entre 24 y 25 horas futuras y dispare recordatorios.
- Un worker externo Node.js que consuma cambios via Supabase Realtime.

Para conectar Twilio o Meta WhatsApp API, configura:

```txt
WHATSAPP_PROVIDER_URL=https://graph.facebook.com/v20.0/{phone-number-id}/messages
WHATSAPP_ACCESS_TOKEN=token-del-proveedor
```

Con Twilio, reemplaza `sendWhatsAppMessage` por una llamada a su endpoint de Messages usando
`From=whatsapp:+...`, `To=whatsapp:+...` y `Body=...`. Con Meta, la estructura actual ya sigue el
formato base de Cloud API para mensajes de texto.
