-- El portal de paciente (/paciente/*) tenia login real (Supabase auth,
-- rol patient) pero las paginas de adentro (dashboard, turnos, perfil,
-- grupo familiar) leian todo desde un mock fijo en el frontend - ningun
-- paciente veia sus datos reales. patient_user_links (migracion 030) ya
-- existia como tabla puente pero se dejo con RLS cerrada a proposito y
-- sin ningun mecanismo que la poblara.
--
-- Esta migracion:
-- 1) Agrega las policies de RLS que le permiten a un paciente autenticado
--    ver/editar solo lo que le corresponde (sus patient_user_links, sus
--    patients, sus appointments, sus payments, sus appointment_requests).
-- 2) Agrega sync_patient_user_links(): al loguearse, vincula automatica-
--    mente al usuario con cualquier fila de patients cuyo email coincida
--    (across clinics - la misma persona puede ser paciente en mas de una
--    clinica).
-- 3) Agrega add_patient_family_member(): permite que el paciente cargue
--    un familiar (nueva fila en patients + link con relationship
--    'family_member'), en la misma clinica que su propio vinculo 'self'.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.

drop policy if exists "patient can view own links" on public.patient_user_links;
create policy "patient can view own links"
  on public.patient_user_links for select
  using (user_id = auth.uid());

drop policy if exists "patient can view linked patients" on public.patients;
create policy "patient can view linked patients"
  on public.patients for select
  using (
    exists (
      select 1 from public.patient_user_links pul
      where pul.patient_id = patients.id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
    )
  );

drop policy if exists "patient can update own patient record" on public.patients;
create policy "patient can update own patient record"
  on public.patients for update
  using (
    exists (
      select 1 from public.patient_user_links pul
      where pul.patient_id = patients.id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
        and pul.relationship = 'self'
    )
  )
  with check (
    exists (
      select 1 from public.patient_user_links pul
      where pul.patient_id = patients.id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
        and pul.relationship = 'self'
    )
  );

drop policy if exists "patient can view own appointments" on public.appointments;
create policy "patient can view own appointments"
  on public.appointments for select
  using (
    exists (
      select 1 from public.patient_user_links pul
      where pul.patient_id = appointments.patient_id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
    )
  );

drop policy if exists "patient can view own payments" on public.payments;
create policy "patient can view own payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.patient_user_links pul
      where pul.patient_id = payments.patient_id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
    )
  );

drop policy if exists "patient can view own appointment requests" on public.appointment_requests;
create policy "patient can view own appointment requests"
  on public.appointment_requests for select
  using (
    exists (
      select 1
      from public.appointments a
      join public.patient_user_links pul on pul.patient_id = a.patient_id
      where a.id = appointment_requests.appointment_id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
    )
  );

drop policy if exists "patient can create own appointment requests" on public.appointment_requests;
create policy "patient can create own appointment requests"
  on public.appointment_requests for insert
  with check (
    requested_by = 'patient'
    and exists (
      select 1
      from public.appointments a
      join public.patient_user_links pul on pul.patient_id = a.patient_id
      where a.id = appointment_requests.appointment_id
        and pul.user_id = auth.uid()
        and pul.status = 'active'
    )
  );

create or replace function public.sync_patient_user_links()
returns setof public.patient_user_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if v_email is null or btrim(v_email) = '' then
    return query select * from public.patient_user_links where user_id = v_user_id and status = 'active';
    return;
  end if;

  insert into public.patient_user_links (user_id, clinic_id, patient_id, relationship, status, created_by, verified_at)
  select v_user_id, p.clinic_id, p.id, 'self', 'active', v_user_id, now()
  from public.patients p
  where lower(p.email) = lower(v_email)
    and not exists (
      select 1 from public.patient_user_links pul
      where pul.user_id = v_user_id
        and pul.patient_id = p.id
        and pul.status <> 'revoked'
    );

  return query select * from public.patient_user_links where user_id = v_user_id and status = 'active';
end;
$$;

grant execute on function public.sync_patient_user_links() to authenticated;

create or replace function public.add_patient_family_member(
  p_first_name text,
  p_last_name text,
  p_document_number text,
  p_relationship text,
  p_birth_date date
)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_clinic_id uuid;
  v_self_phone text;
  v_patient public.patients%rowtype;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if coalesce(btrim(p_first_name), '') = '' then raise exception 'FIRST_NAME_REQUIRED'; end if;
  if coalesce(btrim(p_last_name), '') = '' then raise exception 'LAST_NAME_REQUIRED'; end if;
  if coalesce(btrim(p_relationship), '') = '' then raise exception 'RELATIONSHIP_REQUIRED'; end if;

  select pul.clinic_id, p.phone
    into v_clinic_id, v_self_phone
  from public.patient_user_links pul
  join public.patients p on p.id = pul.patient_id
  where pul.user_id = v_user_id
    and pul.relationship = 'self'
    and pul.status = 'active'
  order by pul.created_at asc
  limit 1;

  if v_clinic_id is null then raise exception 'NO_SELF_PATIENT_LINK'; end if;

  insert into public.patients (clinic_id, first_name, last_name, document_number, birth_date, phone, email)
  values (v_clinic_id, btrim(p_first_name), btrim(p_last_name), nullif(btrim(p_document_number), ''), p_birth_date, coalesce(v_self_phone, ''), null)
  returning * into v_patient;

  insert into public.patient_user_links (user_id, clinic_id, patient_id, relationship, status, created_by, verified_at)
  values (v_user_id, v_clinic_id, v_patient.id, 'family_member', 'active', v_user_id, now());

  return v_patient;
end;
$$;

grant execute on function public.add_patient_family_member(text, text, text, text, date) to authenticated;
