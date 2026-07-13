-- Agrega porcentaje de rendición por profesional.
-- La clínica retiene (100 - professional_share_percentage)%.
-- El campo es nullable: null significa "sin configurar".

alter table public.professionals
  add column if not exists professional_share_percentage numeric(5,2);

-- Agrega check constraint evitando duplicado si ya existe.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'professionals_share_percentage_check'
      and conrelid = 'public.professionals'::regclass
  ) then
    alter table public.professionals
      add constraint professionals_share_percentage_check
      check (
        professional_share_percentage is null
        or (
          professional_share_percentage >= 0
          and professional_share_percentage <= 100
        )
      );
  end if;
end $$;
