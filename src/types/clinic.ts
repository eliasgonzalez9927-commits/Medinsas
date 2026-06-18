export type Clinic = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
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
  created_at: string;
  updated_at?: string;
};

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
  reason?: string | null;
};

export type PublicBookingResult = {
  appointment_id: string;
  patient_id: string;
  status: AppointmentStatus;
  starts_at: string;
  end_time: string;
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
  amount: number;
  currency: string;
  method: string | null;
  status: "pending" | "paid" | "cancelled" | "refunded" | string;
  external_reference: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
