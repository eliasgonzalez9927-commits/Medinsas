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
3. Ejecuta las migraciones en orden: `supabase/migrations/002_ai_whatsapp_agent.sql`, `supabase/migrations/003_product_architecture.sql` y `supabase/migrations/004_connect_operational_base.sql`.
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

Las secciones nuevas usan mocks realistas desde `src/data/clinicMockData.ts` para dejar la UX y
la arquitectura listas antes de conectar todas las tablas reales de Supabase.

## Base operativa conectada

La capa `src/lib/clinic-data.ts` conecta a Supabase estos modulos:

- Profesionales: listar, detalle por `id` o `slug`, crear, editar y activar/desactivar.
- Servicios: listar, crear, editar y activar/desactivar.
- Disponibilidad: listar reglas, crear/eliminar horarios, listar/crear/eliminar bloqueos.
- Motor base de slots: `getAvailableSlots({ clinicId, professionalId, serviceId, date })`.

La migracion `004_connect_operational_base.sql` agrega slugs, campos operativos, RLS inicial,
policies de lectura publica minima y permisos de gestion para administradores. Tambien inserta
datos demo reales para `Clinica Central`.

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
