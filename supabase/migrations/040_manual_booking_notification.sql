-- notification_appointment_created_trigger (migracion 020) solo dispara
-- una notificacion interna cuando el turno viene de origen 'online'. Un
-- turno manual (el caso mas comun, cargado por el equipo desde el
-- panel, sin marcar "Sobreturno") no generaba ninguna notificacion -
-- por eso la lista de Notificaciones no reflejaba turnos manuales,
-- aunque el sistema de notificaciones en si ya funciona bien para
-- reservas online, pagos aprobados y sobreturnos.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.
insert into public.notification_templates (key, channel, audience, title, body, active, metadata)
values
  ('manual_booking_clinic', 'in_app', 'clinic', 'Turno manual creado', 'Se cargó un turno manual desde el panel para {{service_name}}.', true, '{}'::jsonb)
on conflict (key) do update
set channel = excluded.channel,
    audience = excluded.audience,
    title = excluded.title,
    body = excluded.body,
    active = excluded.active,
    metadata = excluded.metadata,
    updated_at = now();

create or replace function public.notification_appointment_created_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
  v_clinic record;
  v_patient record;
  v_patient_event text;
  v_metadata jsonb;
begin
  -- Los sobreturnos ya tienen su propia notificacion dedicada
  -- (notification_overbooking_created_trigger) - evita duplicar aviso
  -- para el mismo insert.
  if coalesce(new.is_overbooking, false) then
    return new;
  end if;

  select * into v_service from public.services where id = new.service_id;
  select * into v_clinic from public.clinics where id = new.clinic_id;
  select * into v_patient from public.patients where id = new.patient_id;

  v_metadata := jsonb_build_object(
    'service_name', coalesce(v_service.name, new.reason, 'Turno'),
    'clinic_name', coalesce(v_clinic.name, 'Medin'),
    'patient_name', concat_ws(' ', v_patient.first_name, v_patient.last_name),
    'appointment_datetime', coalesce(new.starts_at::text, ''),
    'public_code', new.public_code
  );

  perform public.enqueue_notification_event(
    case when new.source = 'online' then 'new_booking_clinic' else 'manual_booking_clinic' end,
    'clinic',
    new.clinic_id,
    new.patient_id,
    new.id,
    null,
    v_metadata
  );

  -- El aviso "tu turno fue solicitado" solo tiene sentido para reservas
  -- online - en un turno manual el paciente ya hablo con la clinica
  -- directamente (telefono, en persona) al momento de cargarlo.
  if new.source = 'online' then
    v_patient_event := case
      when coalesce(v_service.payment_required, false) = false
        and coalesce(v_service.deposit_required, false) = false
        then 'appointment_no_payment_patient'
      else 'appointment_created_patient'
    end;

    perform public.enqueue_notification_event(
      v_patient_event,
      'patient',
      new.clinic_id,
      new.patient_id,
      new.id,
      null,
      v_metadata
    );
  end if;

  return new;
exception when others then
  raise notice 'notification_appointment_created_trigger skipped: %', sqlerrm;
  return new;
end;
$$;
