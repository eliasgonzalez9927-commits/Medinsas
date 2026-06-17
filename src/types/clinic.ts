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
