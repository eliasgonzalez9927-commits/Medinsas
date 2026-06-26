# Clinic WhatsApp AI Agent

Backend Node.js para operar la plataforma de salud desde WhatsApp usando Supabase y OpenAI tools.

## Flujo

1. Meta WhatsApp Cloud API envia `POST /webhook/whatsapp`.
2. El servidor valida la firma `x-hub-signature-256` si `WHATSAPP_APP_SECRET` esta configurado.
3. Se extrae el numero y se busca en `profiles.phone`.
4. El rol del perfil se inyecta en el prompt del agente.
5. El modelo recibe solo las tools permitidas para ese rol.
6. Antes de ejecutar cada tool, Node.js vuelve a validar permisos con `assertCanUseTool`.
7. Supabase ejecuta la consulta con Service Role desde backend.
8. El resultado bruto vuelve al modelo y se envia una respuesta redactada por WhatsApp.

## Seguridad por rol

La tool `get_clinic_metrics` solo existe para `admin` en `TOOL_PERMISSIONS`.
Aunque el modelo intentara llamarla para un paciente, `executeToolCall` la bloquea con `TOOL_FORBIDDEN`
antes de ejecutar cualquier consulta financiera.

## Variables

Copia `.env.example` a `.env` y completa:

```txt
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=Medin Turnos <turnos@notificaciones.medin.com.ar>
RESEND_REPLY_TO_EMAIL=medinsaas@gmail.com
```

## Meta WhatsApp Cloud API

- Configura el webhook en Meta Developers apuntando a `https://tu-dominio.com/webhook/whatsapp`.
- Usa el mismo `WHATSAPP_VERIFY_TOKEN` durante la verificacion.
- Suscribe el evento `messages`.
- En produccion, define `WHATSAPP_APP_SECRET` para validar firmas.

## Supabase

Ejecuta primero `supabase/schema.sql` y luego `supabase/migrations/002_ai_whatsapp_agent.sql`.
El backend usa `SUPABASE_SERVICE_ROLE_KEY`; nunca expongas esa clave en frontend.

## Desarrollo

```bash
npm install
npm run dev
```

## Produccion

```bash
npm install --omit=dev
npm start
```

Recomendado:

- Ejecutar detras de HTTPS.
- Mantener logs con redaccion de secretos.
- Usar la tabla `ai_message_logs` para idempotencia por `messageId`.
- Auditar tool calls en una tabla `ai_tool_audit_logs`.
