-- Permite autocompletar el alta de un paciente cuando el mismo DNI ya existe
-- como paciente en OTRA clinica de la plataforma Medin. No expone turnos,
-- pagos ni historia clinica: solo los campos administrativos minimos
-- necesarios para prellenar el formulario (nombre, contacto, cobertura).
-- Requiere estar autenticado y ser staff activo de alguna clinica (no es
-- una consulta publica ni anonima).
create or replace function public.lookup_patient_by_document(p_document_number text)
returns table (
  clinic_id uuid,
  clinic_name text,
  first_name text,
  last_name text,
  phone text,
  email text,
  insurance text,
  coverage_id uuid,
  plan_name text,
  affiliate_number text,
  birth_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document text := btrim(coalesce(p_document_number, ''));
begin
  if v_document = '' then
    return;
  end if;

  if not exists (
    select 1 from public.clinic_members
    where user_id = auth.uid() and active = true
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select p.clinic_id, c.name, p.first_name, p.last_name, p.phone, p.email, p.insurance, p.coverage_id, p.plan_name, p.affiliate_number, p.birth_date
  from public.patients p
  join public.clinics c on c.id = p.clinic_id
  where p.document_number = v_document
  order by p.updated_at desc nulls last
  limit 5;
end;
$$;

grant execute on function public.lookup_patient_by_document(text) to authenticated;
