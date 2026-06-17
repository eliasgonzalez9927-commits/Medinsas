# ClinicOS MVP

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
3. Ejecuta las migraciones en orden: `supabase/migrations/002_ai_whatsapp_agent.sql`, `supabase/migrations/003_product_architecture.sql`, `supabase/migrations/004_connect_operational_base.sql` y `supabase/migrations/005_connect_agenda_patients_booking.sql`.
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
- `/admin/financiacion`: simulador de planes de pago.
- `/admin/reportes`: indicadores de gestion.
- `/reservar/:clinicSlug`: flujo publico mobile-first para reserva de pacientes.

Las secciones de producto principales ya operan contra Supabase. Los mocks quedan solo como fallback
visual en modulos que todavia no tengan datos reales cargados.

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
