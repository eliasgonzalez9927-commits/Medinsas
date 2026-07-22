-- get_public_available_slots devolvia una columna llamada literalmente
-- "time" (coincide con el nombre del tipo de dato de Postgres). Algo en
-- el camino entre la funcion y el cliente la estaba resolviendo con
-- otro nombre (se confirmo "slot_time" al consultarla directo en el
-- SQL Editor), por lo que el frontend (que lee slot.time) recibia
-- undefined - los botones de horario se renderizaban vacios, sin
-- ningun error visible.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.
--
-- Fix: renombrar la columna a algo sin ambiguedad (slot_label) tanto
-- en la funcion como en el frontend.
drop function if exists public.get_public_available_slots(text, uuid, uuid, date);

create function public.get_public_available_slots(
  p_clinic_slug text,
  p_professional_id uuid,
  p_service_id uuid,
  p_date date
)
returns table (
  slot_label text,
  starts_at timestamptz,
  end_time timestamptz
)
language sql
security definer
set search_path = public
as $$
  with context as (
    select
      c.id as clinic_id,
      coalesce(c.timezone, 'America/Argentina/Mendoza') as clinic_timezone,
      s.duration_minutes,
      coalesce(bs.min_notice_hours, 0) as min_notice_hours,
      coalesce(bs.max_days_ahead, 45) as max_days_ahead
    from public.clinics c
    join public.services s
      on s.clinic_id = c.id
     and s.id = p_service_id
     and s.active = true
     and s.public_booking_enabled = true
    join public.professionals p
      on p.clinic_id = c.id
     and p.id = p_professional_id
     and p.active = true
    left join public.booking_settings bs on bs.clinic_id = c.id
    where c.slug = p_clinic_slug
      and exists (
        select 1
        from public.professional_services ps
        where ps.professional_id = p_professional_id
          and ps.service_id = p_service_id
      )
  ),
  normalized_slots as (
    select
      local_slot_start as slot_start,
      local_slot_start + make_interval(mins => duration_minutes) as slot_end,
      duration_minutes,
      clinic_timezone
    from context ctx
    join public.availability_rules ar
      on ar.clinic_id = ctx.clinic_id
     and ar.professional_id = p_professional_id
     and ar.active = true
     and ar.day_of_week = extract(dow from p_date)::integer
    cross join lateral generate_series(
      0,
      floor(extract(epoch from (ar.end_time - ar.start_time)) / 60)::integer - ctx.duration_minutes,
      ctx.duration_minutes
    ) as offsets(slot_offset_minutes)
    cross join lateral (
      select ((p_date + (ar.start_time + make_interval(mins => slot_offset_minutes))) at time zone ctx.clinic_timezone) as local_slot_start
    ) local_slot
    where p_date <= (now() at time zone ctx.clinic_timezone)::date + ctx.max_days_ahead
      and local_slot.local_slot_start >= now() + make_interval(hours => ctx.min_notice_hours)
  )
  select
    to_char(ns.slot_start at time zone ns.clinic_timezone, 'HH24:MI') as slot_label,
    ns.slot_start as starts_at,
    ns.slot_end as end_time
  from normalized_slots ns
  where not exists (
    select 1
    from public.availability_blocks ab
    where ab.professional_id = p_professional_id
      and ab.date = p_date
      and ((p_date + ab.start_time) at time zone ns.clinic_timezone) < ns.slot_end
      and ((p_date + ab.end_time) at time zone ns.clinic_timezone) > ns.slot_start
  )
    and not exists (
      select 1
      from public.appointments a
      where a.professional_id = p_professional_id
        and a.status in ('pending', 'confirmed', 'rescheduled', 'urgent')
        and not (
          a.status = 'pending'
          and coalesce(a.payment_required, false)
          and a.payment_hold_expires_at is not null
          and a.payment_hold_expires_at < now()
        )
        and a.starts_at < ns.slot_end
        and coalesce(a.end_time, a.starts_at + make_interval(mins => ns.duration_minutes)) > ns.slot_start
    )
  order by ns.slot_start;
$$;

grant execute on function public.get_public_available_slots(text, uuid, uuid, date) to anon, authenticated;
