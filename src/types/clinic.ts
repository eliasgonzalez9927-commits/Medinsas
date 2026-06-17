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
