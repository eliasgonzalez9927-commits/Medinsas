-- Onboarding por rol: hoy "Onboarding" nunca desaparece del menu porque el
-- progreso se calcula en vivo (getOnboardingProgress) sin ningun flag
-- persistido de "ya termine". Se agrega uno por clinica (admin/recepcion,
-- checklist compartido de la clinica) y uno por membresia (profesional,
-- cada uno con su propio perfil/disponibilidad - y tambien usado para el
-- tour de recepcion, que no tiene checklist real, solo un dismiss).
alter table public.clinics
  add column if not exists onboarding_completed_at timestamptz;

alter table public.clinic_members
  add column if not exists onboarding_completed_at timestamptz;

-- Tickets de soporte simples (boton "Necesitas ayuda?" en todo el panel).
-- RLS habilitada sin policies a proposito: todavia no hay UI que los liste,
-- solo el endpoint serverless (service role) los escribe/leeria.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  role text,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_clinic_id_idx on public.support_tickets(clinic_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);

alter table public.support_tickets enable row level security;
