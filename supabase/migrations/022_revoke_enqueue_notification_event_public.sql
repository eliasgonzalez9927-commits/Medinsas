-- 022_revoke_enqueue_notification_event_public.sql
--
-- OBJETIVO
-- Completar el fix del punto 10 de 021_clinic_scoped_rls_isolation.sql.
--
-- Esa migracion ejecuto:
--   revoke execute on function public.enqueue_notification_event(...)
--   from anon, authenticated;
--
-- y al validar con has_function_privilege() despues de aplicarla en
-- produccion, se confirmo que NO fue suficiente: anon y authenticated
-- seguian pudiendo ejecutar la funcion via /rest/v1/rpc/enqueue_notification_event.
--
-- CAUSA
-- Postgres otorga EXECUTE sobre cualquier funcion nueva a PUBLIC de forma
-- automatica en el momento de su creacion (CREATE FUNCTION), salvo que se
-- revoque explicitamente. anon y authenticated son roles que heredan los
-- privilegios de PUBLIC (todo rol es miembro implicito de PUBLIC en
-- Postgres). El REVOKE de 021 solo revoco los grants explicitos a esos dos
-- roles, pero no toco el grant implicito de PUBLIC, asi que el privilegio
-- heredado via PUBLIC seguia vigente.
--
-- FIX
-- Revocar tambien de PUBLIC. Se mantiene ademas el revoke explicito de
-- anon/authenticated por claridad y para que la migracion sea autocontenida
-- y reproducible sin depender de 021.
--
-- IMPACTO EN TRIGGERS INTERNOS
-- enqueue_notification_event solo se invoca desde funciones trigger
-- SECURITY DEFINER (ver 020_notifications_base.sql, lineas
-- 519/536/590/600/663/711/761: "perform public.enqueue_notification_event(...)").
-- El propietario/definidor de esas funciones trigger conserva EXECUTE sobre
-- enqueue_notification_event de forma implicita por ser su owner (la
-- propiedad de una funcion siempre incluye EXECUTE sobre ella misma,
-- independientemente de los grants/revokes a otros roles). Revocar de
-- PUBLIC/anon/authenticated no afecta ese flujo interno.
--
-- VERIFICACION SUGERIDA (ejecutar despues de aplicar esta migracion)
--   select
--     has_function_privilege('anon', 'public.enqueue_notification_event(text,text,uuid,uuid,uuid,uuid,jsonb)', 'execute') as anon_can_execute,
--     has_function_privilege('authenticated', 'public.enqueue_notification_event(text,text,uuid,uuid,uuid,uuid,jsonb)', 'execute') as authenticated_can_execute,
--     has_function_privilege('postgres', 'public.enqueue_notification_event(text,text,uuid,uuid,uuid,uuid,jsonb)', 'execute') as postgres_owner_can_execute;
--   -- esperado: anon_can_execute = false, authenticated_can_execute = false,
--   -- postgres_owner_can_execute = true.
--
-- ROLLBACK
--   grant execute on function public.enqueue_notification_event(
--     text, text, uuid, uuid, uuid, uuid, jsonb
--   ) to public, anon, authenticated;
--
-- No se borra ni modifica ninguna fila de datos en esta migracion: solo un
-- grant/revoke de funcion.

revoke execute on function public.enqueue_notification_event(
  text, text, uuid, uuid, uuid, uuid, jsonb
) from public;

revoke execute on function public.enqueue_notification_event(
  text, text, uuid, uuid, uuid, uuid, jsonb
) from anon;

revoke execute on function public.enqueue_notification_event(
  text, text, uuid, uuid, uuid, uuid, jsonb
) from authenticated;
