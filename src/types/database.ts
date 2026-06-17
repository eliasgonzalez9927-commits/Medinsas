export type UserRole = "patient" | "doctor" | "admin";
export type AppointmentStatus = "pending" | "confirmed" | "attended";
export type AppointmentType = "in_person" | "telemedicine";
export type UrgencyLevel = "low" | "medium" | "high";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
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
  created_at: string;
};

export type AdminAppointmentRow = Appointment & {
  profiles: Pick<Profile, "full_name" | "phone"> | null;
  triage_results: Pick<
    TriageResult,
    "symptoms" | "urgency_level" | "has_fever" | "has_breathing_difficulty" | "notes"
  > | null;
};
