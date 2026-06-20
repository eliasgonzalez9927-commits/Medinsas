export type Clinic = {
  id: string;
  name: string;
  slug: string;
  legal_name?: string | null;
  cuit?: string | null;
  status?: string | null;
  plan?: string | null;
  phone: string | null;
  whatsapp?: string | null;
  email: string | null;
  address: string | null;
  timezone?: string | null;
  logo_url: string | null;
  website_url?: string | null;
  active?: boolean;
  created_at: string;
  updated_at?: string;
};

export type Location = {
  id: string;
  clinic_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  is_primary?: boolean;
  business_hours?: Array<Record<string, unknown>>;
  updated_at?: string;
};

export type Professional = {
  id: string;
  clinic_id: string;
  name: string;
  last_name: string;
  slug: string | null;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  bio: string | null;
  avatar_url: string | null;
  consultation_minutes: number;
  active: boolean;
  created_at: string;
  updated_at?: string;
};

export type Specialty = {
  id: string;
  clinic_id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type Service = {
  id: string;
  clinic_id: string;
  specialty_id: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  active: boolean;
  financing_enabled: boolean;
  deposit_required: boolean;
  public_booking_enabled: boolean;
  payment_required?: boolean;
  deposit_amount?: number | null;
  allow_online_payment?: boolean;
};

export type ProfessionalService = {
  professional_id: string;
  service_id: string;
};

export type Patient = {
  id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  document_number: string | null;
  insurance: string | null;
  birth_date: string | null;
  notes: string | null;
  email_opt_in?: boolean;
  whatsapp_opt_in?: boolean;
  communication_notes?: string | null;
  created_at: string;
  updated_at?: string;
};

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "attended"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "urgent";

export type AppointmentSource = "manual" | "online" | "whatsapp" | "imported";

export type Appointment = {
  id: string;
  public_code?: string | null;
  clinic_id: string | null;
  patient_id: string;
  professional_id: string | null;
  service_id: string | null;
  location_id: string | null;
  starts_at: string;
  end_time: string | null;
  appointment_type: "in_person" | "telemedicine";
  status: AppointmentStatus;
  source: AppointmentSource;
  reason: string;
  notes: string | null;
  cancellation_reason: string | null;
  rescheduled_from_id: string | null;
  whatsapp_status: string | null;
  payment_status?: AppointmentPaymentStatus;
  deposit_amount?: number | null;
  payment_required?: boolean;
  created_at: string;
  updated_at?: string;
};

export type AppointmentPaymentStatus =
  | "unpaid"
  | "deposit_pending"
  | "deposit_paid"
  | "paid"
  | "payment_failed"
  | "rejected"
  | "refunded";

export type AppointmentEvent = {
  id: string;
  appointment_id: string;
  event_type: string;
  old_status: AppointmentStatus | null;
  new_status: AppointmentStatus | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AvailabilityRule = {
  id: string;
  clinic_id: string;
  professional_id: string;
  location_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  active: boolean;
};

export type AvailabilityBlock = {
  id: string;
  clinic_id: string;
  professional_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
};

export type AppointmentWithRelations = Appointment & {
  patient: Patient | null;
  professional: Professional | null;
  service: Service | null;
  location: Location | null;
};

export type PatientWithAppointments = Patient & {
  appointments?: AppointmentWithRelations[];
};

export type ProfessionalWithRelations = Professional & {
  specialties: Specialty[];
  services: Service[];
  availability_rules?: AvailabilityRule[];
};

export type ServiceWithRelations = Service & {
  specialty: Specialty | null;
  professionals: Professional[];
};

export type AvailabilityRuleWithRelations = AvailabilityRule & {
  professional: Professional | null;
  location: Location | null;
};

export type ClinicDataResult<T> = {
  data: T;
  fromFallback: boolean;
};

export type ProfessionalInput = {
  clinic_id: string;
  name: string;
  last_name: string;
  slug?: string | null;
  email?: string | null;
  phone?: string | null;
  license_number?: string | null;
  bio?: string | null;
  consultation_minutes?: number;
  active?: boolean;
};

export type ServiceInput = {
  clinic_id: string;
  specialty_id?: string | null;
  name: string;
  slug?: string | null;
  description?: string | null;
  duration_minutes: number;
  price?: number | null;
  active?: boolean;
  financing_enabled?: boolean;
  deposit_required?: boolean;
  public_booking_enabled?: boolean;
  payment_required?: boolean;
  deposit_amount?: number | null;
  allow_online_payment?: boolean;
};

export type AvailabilityRuleInput = {
  clinic_id: string;
  professional_id: string;
  location_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  active?: boolean;
};

export type AvailabilityBlockInput = {
  clinic_id: string;
  professional_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  reason?: string | null;
};

export type PatientInput = {
  clinic_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  document_number?: string | null;
  insurance?: string | null;
  birth_date?: string | null;
  notes?: string | null;
  email_opt_in?: boolean;
  whatsapp_opt_in?: boolean;
  communication_notes?: string | null;
};

export type ClinicInput = {
  name: string;
  legal_name?: string | null;
  slug: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  logo_url?: string | null;
  website_url?: string | null;
  active?: boolean;
};

export type LocationInput = {
  clinic_id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  active?: boolean;
  is_primary?: boolean;
  business_hours?: Array<Record<string, unknown>>;
};

export type AppointmentInput = {
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  service_id: string;
  location_id?: string | null;
  starts_at: string;
  end_time: string;
  appointment_type?: "in_person" | "telemedicine";
  status?: AppointmentStatus;
  source?: AppointmentSource;
  reason: string;
  notes?: string | null;
  cancellation_reason?: string | null;
  rescheduled_from_id?: string | null;
  whatsapp_status?: string | null;
};

export type AppointmentFilters = {
  date?: string;
  timezone?: string;
  professionalId?: string;
  status?: AppointmentStatus | "all";
  serviceId?: string;
};

export type PublicBookingPayload = {
  clinicSlug: string;
  professionalId: string;
  serviceId: string;
  startTime: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  documentNumber?: string | null;
  insurance?: string | null;
  coverageId?: string | null;
  customCoverageName?: string | null;
  reason?: string | null;
};

export type PublicBookingResult = {
  appointment_id: string;
  patient_id: string;
  status: AppointmentStatus;
  starts_at: string;
  end_time: string;
  timezone?: string;
  service: string;
  professional: string;
};

export type AvailableSlot = {
  time: string;
  startsAt: string;
  endTime: string;
};

export type FiscalSettings = {
  id: string;
  clinic_id: string;
  legal_name: string | null;
  trade_name: string | null;
  cuit: string | null;
  fiscal_condition: string | null;
  fiscal_address: string | null;
  sale_points: Array<Record<string, unknown>>;
  receipt_types: Array<Record<string, unknown>>;
  arca_integration_status: "pending_configuration" | "configured" | "disabled" | string;
  arca_provider: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  invoice_id?: string | null;
  service_id?: string | null;
  amount: number;
  currency: string;
  method: string | null;
  provider?: string;
  provider_payment_id?: string | null;
  provider_preference_id?: string | null;
  external_reference: string | null;
  status: PaymentStatus;
  status_detail?: string | null;
  payment_method?: string | null;
  payer_email?: string | null;
  checkout_url?: string | null;
  expires_at?: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentStatus =
  | "pending"
  | "in_process"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back"
  | "expired"
  | string;

export type PaymentWithRelations = Payment & {
  clinics?: Clinic | null;
  patients?: Patient | null;
  appointments?: Appointment | null;
  services?: Service | null;
};

export type PaymentSettings = {
  id: string;
  clinic_id: string;
  provider: string;
  active: boolean;
  mode: "sandbox" | "production" | string;
  public_key: string | null;
  access_token_encrypted: string | null;
  webhook_secret: string | null;
  default_currency: string;
  checkout_public_name: string | null;
  collect_deposit_online: boolean;
  deposit_type: "fixed" | "percentage" | string;
  deposit_amount: number | null;
  deposit_percentage: number | null;
  payment_link_expiration_minutes: number | null;
  support_email: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentEvent = {
  id: string;
  payment_id: string | null;
  clinic_id: string;
  provider: string;
  event_type: string;
  provider_event_id: string | null;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  payment_id: string | null;
  fiscal_setting_id: string | null;
  document_type: "internal_receipt" | "invoice" | "receipt" | "credit_note" | string;
  status: "draft" | "issued" | "cancelled" | "pending_integration" | string;
  sale_point: string | null;
  document_number: string | null;
  issued_at: string | null;
  due_at: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  pdf_url: string | null;
  arca_status: "pending_configuration" | "pending" | "synced" | "failed" | string;
  arca_external_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
  created_at: string;
};

export type PrescriptionSettings = {
  id: string;
  clinic_id: string;
  professional_id: string | null;
  professional_name: string | null;
  license_number: string | null;
  specialty: string | null;
  habilitation: string | null;
  signature_placeholder_url: string | null;
  electronic_prescription_status: "prepared_for_future_integration" | "configured" | string;
  approved_platform_provider: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicalDocument = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  professional_id: string | null;
  appointment_id: string | null;
  document_type: "internal_prescription" | "study_order" | "medical_indication" | string;
  status: "draft" | "issued" | "cancelled" | string;
  title: string;
  diagnosis: string | null;
  reason: string | null;
  observations: string | null;
  pdf_url: string | null;
  professional_signature_status: "placeholder" | "signed" | string;
  professional_license_number: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicalDocumentItem = {
  id: string;
  medical_document_id: string;
  item_type: "medication" | "practice" | "indication" | string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  created_at: string;
};

export type ClinicHours = {
  id: string;
  clinic_id: string;
  day_of_week: number;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicMemberWithProfile = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  active: boolean;
  location_id: string | null;
  professional_id: string | null;
  invitation_status: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string;
    phone: string | null;
    role: string;
  } | null;
  professionals?: Professional | null;
  locations?: Location | null;
};

export type UserInvitation = {
  id: string;
  clinic_id: string;
  email: string;
  full_name: string;
  role: string;
  location_id: string | null;
  professional_id: string | null;
  status: string;
  invited_by: string | null;
  invitation_token: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageTemplate = {
  id: string;
  clinic_id: string;
  channel: "email" | "whatsapp_future" | string;
  type: string;
  name: string;
  subject: string | null;
  body: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageLog = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  user_id: string | null;
  appointment_id: string | null;
  channel: string;
  provider: string;
  recipient: string;
  subject: string | null;
  body_preview: string | null;
  status: "pending" | "sent" | "failed" | "delivered" | "bounced" | "opened" | "clicked" | "omitted" | string;
  provider_message_id: string | null;
  error_message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  sent_at: string | null;
  created_at: string;
};

export type HealthCoverage = {
  id: string;
  rnas_code: string | null;
  rnos_code: string | null;
  name: string;
  normalized_name: string;
  type: string;
  active: boolean;
  enabled_for_choice: boolean;
  source: string;
};

export type HealthPlan = {
  id: string;
  coverage_id: string;
  name: string;
  code: string | null;
  active: boolean;
};
