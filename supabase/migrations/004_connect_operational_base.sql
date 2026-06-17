alter table public.clinics
  add column if not exists updated_at timestamptz not null default now();

alter table public.locations
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.professionals
  add column if not exists slug text,
  add column if not exists consultation_minutes integer not null default 30,
  add column if not exists updated_at timestamptz not null default now();

alter table public.specialties
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.services
  add column if not exists slug text,
  add column if not exists public_booking_enabled boolean not null default true,
  add column if not exists deposit_required boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.availability_rules
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.availability_blocks
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists professionals_clinic_slug_idx
  on public.professionals(clinic_id, slug)
  where slug is not null;

create unique index if not exists specialties_clinic_name_idx
  on public.specialties(clinic_id, name);

create unique index if not exists services_clinic_slug_idx
  on public.services(clinic_id, slug)
  where slug is not null;

alter table public.clinics enable row level security;
alter table public.locations enable row level security;
alter table public.professionals enable row level security;
alter table public.specialties enable row level security;
alter table public.professional_specialties enable row level security;
alter table public.services enable row level security;
alter table public.professional_services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.patients enable row level security;
alter table public.booking_settings enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.reminders enable row level security;

create policy "public can read active clinics"
  on public.clinics for select
  using (true);

create policy "admins can manage clinics"
  on public.clinics for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read active locations"
  on public.locations for select
  using (active = true);

create policy "admins can manage locations"
  on public.locations for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read active professionals"
  on public.professionals for select
  using (active = true);

create policy "admins can manage professionals"
  on public.professionals for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read active specialties"
  on public.specialties for select
  using (active = true);

create policy "admins can manage specialties"
  on public.specialties for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read professional specialties"
  on public.professional_specialties for select
  using (true);

create policy "admins can manage professional specialties"
  on public.professional_specialties for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read active public services"
  on public.services for select
  using (active = true and public_booking_enabled = true);

create policy "admins can manage services"
  on public.services for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read professional services"
  on public.professional_services for select
  using (true);

create policy "admins can manage professional services"
  on public.professional_services for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read active availability rules"
  on public.availability_rules for select
  using (active = true);

create policy "admins can manage availability rules"
  on public.availability_rules for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can manage availability blocks"
  on public.availability_blocks for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can manage patients"
  on public.patients for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public can read booking settings"
  on public.booking_settings for select
  using (public_booking_enabled = true);

create policy "admins can manage booking settings"
  on public.booking_settings for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can manage whatsapp templates"
  on public.whatsapp_templates for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can manage reminders"
  on public.reminders for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.clinics (name, slug, phone, email, address)
values ('Clinica Central', 'clinica-central', '+54 261 555-0100', 'recepcion@clinicacentral.demo', 'Av. San Martin 1240, Mendoza')
on conflict (slug) do update
set name = excluded.name,
    phone = excluded.phone,
    email = excluded.email,
    address = excluded.address,
    updated_at = now();

insert into public.locations (clinic_id, name, address, phone)
select id, 'Sede Central', address, phone
from public.clinics
where slug = 'clinica-central'
on conflict do nothing;

insert into public.specialties (clinic_id, name, description)
select id, specialty_name, specialty_description
from public.clinics
cross join (
  values
    ('Dermatologia', 'Consultas y procedimientos dermatologicos.'),
    ('Odontologia', 'Odontologia general y tratamientos dentales.'),
    ('Clinica medica', 'Atencion primaria y controles generales.'),
    ('Traumatologia', 'Lesiones, dolor osteomuscular y controles.'),
    ('Kinesiologia', 'Rehabilitacion y seguimiento funcional.')
) as seed(specialty_name, specialty_description)
where slug = 'clinica-central'
on conflict (clinic_id, name) do nothing;

insert into public.professionals (clinic_id, name, last_name, slug, email, phone, license_number, bio, consultation_minutes, active)
select id, name, last_name, slug_value, email, phone, license_number, bio, consultation_minutes, true
from public.clinics
cross join (
  values
    ('Laura', 'Perez', 'dr-laura-perez', 'laura.perez@clinicacentral.demo', '+54 261 555-0121', 'MP 18452', 'Dermatologia clinica y procedimientos ambulatorios.', 30),
    ('Martin', 'Gomez', 'dr-martin-gomez', 'martin.gomez@clinicacentral.demo', '+54 261 555-0132', 'MP 22011', 'Odontologia integral, implantes y controles preventivos.', 45),
    ('Camila', 'Rios', 'dra-camila-rios', 'camila.rios@clinicacentral.demo', '+54 261 555-0143', 'MP 19440', 'Clinica medica, controles generales y seguimiento.', 30),
    ('Federico', 'Torres', 'dr-federico-torres', 'federico.torres@clinicacentral.demo', '+54 261 555-0154', 'MP 23774', 'Traumatologia y lesiones osteomusculares.', 30)
) as seed(name, last_name, slug_value, email, phone, license_number, bio, consultation_minutes)
where slug = 'clinica-central'
on conflict (clinic_id, slug) do update
set name = excluded.name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    license_number = excluded.license_number,
    bio = excluded.bio,
    consultation_minutes = excluded.consultation_minutes,
    updated_at = now();

insert into public.services (clinic_id, specialty_id, name, slug, description, duration_minutes, price, active, financing_enabled, deposit_required, public_booking_enabled)
select c.id, s.id, seed.name, seed.slug_value, seed.description, seed.duration_minutes, seed.price, true, seed.financing_enabled, seed.deposit_required, true
from public.clinics c
join (
  values
    ('Consulta clinica', 'consulta-clinica', 'Clinica medica', 'Consulta general y seguimiento.', 30, 18000::numeric, false, false),
    ('Control odontologico', 'control-odontologico', 'Odontologia', 'Control preventivo odontologico.', 30, 22000::numeric, false, false),
    ('Implantes', 'implantes', 'Odontologia', 'Evaluacion y tratamiento con implantes.', 60, 180000::numeric, true, true),
    ('Dermatologia laser', 'dermatologia-laser', 'Dermatologia', 'Consulta y procedimiento laser.', 60, 120000::numeric, true, true),
    ('Kinesiologia', 'kinesiologia', 'Kinesiologia', 'Sesion de rehabilitacion.', 45, 28000::numeric, false, false),
    ('Traumatologia', 'traumatologia', 'Traumatologia', 'Consulta traumatologica.', 30, 26000::numeric, false, false)
) as seed(name, slug_value, specialty_name, description, duration_minutes, price, financing_enabled, deposit_required)
  on true
join public.specialties s on s.clinic_id = c.id and s.name = seed.specialty_name
where c.slug = 'clinica-central'
on conflict (clinic_id, slug) do update
set specialty_id = excluded.specialty_id,
    name = excluded.name,
    description = excluded.description,
    duration_minutes = excluded.duration_minutes,
    price = excluded.price,
    financing_enabled = excluded.financing_enabled,
    deposit_required = excluded.deposit_required,
    public_booking_enabled = excluded.public_booking_enabled,
    updated_at = now();

insert into public.professional_specialties (professional_id, specialty_id)
select p.id, s.id
from public.professionals p
join public.clinics c on c.id = p.clinic_id
join public.specialties s on s.clinic_id = c.id
where c.slug = 'clinica-central'
  and (
    (p.slug = 'dr-laura-perez' and s.name = 'Dermatologia') or
    (p.slug = 'dr-martin-gomez' and s.name = 'Odontologia') or
    (p.slug = 'dra-camila-rios' and s.name = 'Clinica medica') or
    (p.slug = 'dr-federico-torres' and s.name = 'Traumatologia')
  )
on conflict do nothing;

insert into public.professional_services (professional_id, service_id)
select p.id, sv.id
from public.professionals p
join public.clinics c on c.id = p.clinic_id
join public.services sv on sv.clinic_id = c.id
where c.slug = 'clinica-central'
  and (
    (p.slug = 'dr-laura-perez' and sv.slug = 'dermatologia-laser') or
    (p.slug = 'dr-martin-gomez' and sv.slug in ('control-odontologico', 'implantes')) or
    (p.slug = 'dra-camila-rios' and sv.slug = 'consulta-clinica') or
    (p.slug = 'dr-federico-torres' and sv.slug = 'traumatologia')
  )
on conflict do nothing;

insert into public.availability_rules (clinic_id, professional_id, location_id, day_of_week, start_time, end_time, slot_duration_minutes, active)
select c.id, p.id, l.id, seed.day_of_week, seed.start_time::time, seed.end_time::time, seed.slot_duration_minutes, true
from public.clinics c
join public.professionals p on p.clinic_id = c.id
left join public.locations l on l.clinic_id = c.id and l.name = 'Sede Central'
join (
  values
    ('dr-laura-perez', 1, '09:00', '13:00', 30),
    ('dr-laura-perez', 3, '15:00', '19:00', 30),
    ('dr-martin-gomez', 2, '10:00', '16:00', 45),
    ('dr-martin-gomez', 4, '10:00', '16:00', 45),
    ('dra-camila-rios', 1, '08:00', '12:00', 30),
    ('dra-camila-rios', 2, '08:00', '12:00', 30),
    ('dra-camila-rios', 3, '08:00', '12:00', 30),
    ('dra-camila-rios', 4, '08:00', '12:00', 30),
    ('dra-camila-rios', 5, '08:00', '12:00', 30),
    ('dr-federico-torres', 2, '14:00', '18:00', 30),
    ('dr-federico-torres', 5, '14:00', '18:00', 30)
) as seed(professional_slug, day_of_week, start_time, end_time, slot_duration_minutes)
  on p.slug = seed.professional_slug
where c.slug = 'clinica-central'
on conflict do nothing;
