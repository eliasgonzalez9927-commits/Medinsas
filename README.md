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
      fintech/
        FinancingSimulator.tsx
      growth/
        GrowthDashboard.tsx
      AppShell.tsx
      ProtectedRoute.tsx
    contexts/
      AuthContext.tsx
    lib/
      supabase.ts
    pages/
      admin/
        AdminDashboard.tsx
      auth/
        Login.tsx
        Register.tsx
      landing/
        ClinicLanding.tsx
      patient/
        PatientBooking.tsx
    types/
      database.ts
    App.tsx
    main.tsx
    index.css
```

## Puesta en marcha

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor.
3. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Instala dependencias con `npm install`.
5. Ejecuta `npm run dev`.

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
