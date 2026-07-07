export type UserRole =
  | "platform_admin"
  | "clinic_admin"
  | "receptionist"
  | "professional"
  | "patient"
  | "admin"
  | "doctor";
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "attended"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show"
  | "urgent";
export type AppointmentType = "in_person" | "telemedicine";
export type UrgencyLevel = "low" | "medium" | "high";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
};

export type ClinicMember = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: UserRole;
  professional_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TriageResult = {
  id: string;
  patient_id: string;
  symptoms: string;
  urgency_level: UrgencyLevel;
  has_fever: boolean;
  has_breathing_difficulty: boolean;
  notes: string | null;
  created_at: string;
};

export type Appointment = {
  id: string;
  patient_id: string;
  triage_result_id: string | null;
  starts_at: string;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  reason: string;
  specialty: string | null;
  created_at: string;
};

export type AdminAppointmentRow = Appointment & {
  profiles: Pick<Profile, "full_name" | "phone"> | null;
  triage_results: Pick<
    TriageResult,
    "symptoms" | "urgency_level" | "has_fever" | "has_breathing_difficulty" | "notes"
  > | null;
};
