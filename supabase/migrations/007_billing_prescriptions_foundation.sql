create table if not exists public.fiscal_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  legal_name text,
  trade_name text,
  cuit text,
  fiscal_condition text,
  fiscal_address text,
  sale_points jsonb not null default '[]'::jsonb,
  receipt_types jsonb not null default '[]'::jsonb,
  arca_integration_status text not null default 'pending_configuration',
  arca_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'ARS',
  method text,
  status text not null default 'pending',
  external_reference text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  fiscal_setting_id uuid references public.fiscal_settings(id) on delete set null,
  document_type text not null default 'internal_receipt',
  status text not null default 'draft',
  sale_point text,
  document_number text,
  issued_at timestamptz,
  due_at timestamptz,
  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  currency text not null default 'ARS',
  pdf_url text,
  arca_status text not null default 'pending_configuration',
  arca_external_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.prescription_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  professional_name text,
  license_number text,
  specialty text,
  habilitation text,
  signature_placeholder_url text,
  electronic_prescription_status text not null default 'prepared_for_future_integration',
  approved_platform_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medical_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  document_type text not null default 'internal_prescription',
  status text not null default 'draft',
  title text not null default 'Recetario interno',
  diagnosis text,
  reason text,
  observations text,
  pdf_url text,
  professional_signature_status text not null default 'placeholder',
  professional_license_number text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medical_document_items (
  id uuid primary key default gen_random_uuid(),
  medical_document_id uuid not null references public.medical_documents(id) on delete cascade,
  item_type text not null default 'indication',
  name text not null,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  created_at timestamptz not null default now()
);

create index if not exists fiscal_settings_clinic_id_idx on public.fiscal_settings(clinic_id);
create index if not exists payments_clinic_id_idx on public.payments(clinic_id);
create index if not exists payments_patient_id_idx on public.payments(patient_id);
create index if not exists invoices_clinic_id_idx on public.invoices(clinic_id);
create index if not exists invoices_patient_id_idx on public.invoices(patient_id);
create index if not exists invoices_status_idx on public.invoices(status);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);
create index if not exists prescription_settings_clinic_professional_idx on public.prescription_settings(clinic_id, professional_id);
create index if not exists medical_documents_clinic_id_idx on public.medical_documents(clinic_id);
create index if not exists medical_documents_patient_id_idx on public.medical_documents(patient_id);
create index if not exists medical_documents_professional_id_idx on public.medical_documents(professional_id);
create index if not exists medical_documents_status_idx on public.medical_documents(status);
create index if not exists medical_document_items_document_id_idx on public.medical_document_items(medical_document_id);

alter table public.fiscal_settings enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.prescription_settings enable row level security;
alter table public.medical_documents enable row level security;
alter table public.medical_document_items enable row level security;

drop policy if exists "admins can manage fiscal settings" on public.fiscal_settings;
create policy "admins can manage fiscal settings"
  on public.fiscal_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage payments" on public.payments;
create policy "admins can manage payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage invoices" on public.invoices;
create policy "admins can manage invoices"
  on public.invoices for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage invoice items" on public.invoice_items;
create policy "admins can manage invoice items"
  on public.invoice_items for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage prescription settings" on public.prescription_settings;
create policy "admins can manage prescription settings"
  on public.prescription_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage medical documents" on public.medical_documents;
create policy "admins can manage medical documents"
  on public.medical_documents for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage medical document items" on public.medical_document_items;
create policy "admins can manage medical document items"
  on public.medical_document_items for all
  using (public.is_admin())
  with check (public.is_admin());
