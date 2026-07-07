export type PatientAppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed";

export type PatientAppointment = {
  id: string;
  startsAt: string;
  patientName: string;
  patientRelation: "Titular" | "Hijo/a" | "Pareja" | "Madre" | "Padre";
  clinicName: string;
  location: string;
  specialty: string;
  professional: string;
  service: string;
  status: PatientAppointmentStatus;
  paymentStatus: "none" | "pending" | "paid";
  notes?: string;
};

export type PatientProfileMock = {
  firstName: string;
  lastName: string;
  documentNumber: string;
  birthDate: string;
  phone: string;
  email: string;
  insurance: string;
  plan: string;
  memberNumber: string;
  emergencyContact: string;
};

export type FamilyMemberMock = {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  relationship: string;
  birthDate: string;
};

export type PatientSpecialtyMock = {
  id: string;
  name: string;
  professionals: Array<{
    id: string;
    name: string;
    slots: string[];
  }>;
};

export const patientProfileMock: PatientProfileMock = {
  firstName: "Lucia",
  lastName: "Martinez",
  documentNumber: "32.456.789",
  birthDate: "1990-08-18",
  phone: "+54 261 555-0198",
  email: "lucia.martinez@demo.com",
  insurance: "Particular",
  plan: "Unico",
  memberNumber: "",
  emergencyContact: "Sofia Martinez · +54 261 555-0120"
};

export const patientAppointmentsMock: PatientAppointment[] = [
  {
    id: "apt-101",
    startsAt: "2026-07-08T10:30:00-03:00",
    patientName: "Lucia Martinez",
    patientRelation: "Titular",
    clinicName: "Medin Clinica Central",
    location: "San Martin 123, Mendoza",
    specialty: "Clinica medica",
    professional: "Dra. Ana Romero",
    service: "Consulta",
    status: "confirmed",
    paymentStatus: "none",
    notes: "Llegar 10 minutos antes para admision."
  },
  {
    id: "apt-102",
    startsAt: "2026-07-15T16:00:00-03:00",
    patientName: "Tomas Martinez",
    patientRelation: "Hijo/a",
    clinicName: "Medin Clinica Central",
    location: "San Martin 123, Mendoza",
    specialty: "Pediatria",
    professional: "Dr. Nicolas Perez",
    service: "Control",
    status: "pending",
    paymentStatus: "pending"
  },
  {
    id: "apt-080",
    startsAt: "2026-06-18T09:00:00-03:00",
    patientName: "Lucia Martinez",
    patientRelation: "Titular",
    clinicName: "Medin Clinica Central",
    location: "San Martin 123, Mendoza",
    specialty: "Dermatologia",
    professional: "Dra. Camila Ruiz",
    service: "Consulta",
    status: "completed",
    paymentStatus: "paid"
  },
  {
    id: "apt-071",
    startsAt: "2026-06-02T12:00:00-03:00",
    patientName: "Lucia Martinez",
    patientRelation: "Titular",
    clinicName: "Medin Clinica Central",
    location: "San Martin 123, Mendoza",
    specialty: "Clinica medica",
    professional: "Dr. Lucas Molina",
    service: "Consulta",
    status: "cancelled",
    paymentStatus: "none"
  }
];

export const familyMembersMock: FamilyMemberMock[] = [
  {
    id: "fam-1",
    firstName: "Tomas",
    lastName: "Martinez",
    documentNumber: "51.234.987",
    relationship: "Hijo",
    birthDate: "2018-04-12"
  }
];

export const patientSpecialtiesMock: PatientSpecialtyMock[] = [
  {
    id: "clinica",
    name: "Clinica medica",
    professionals: [
      { id: "ana-romero", name: "Dra. Ana Romero", slots: ["09:30", "10:30", "12:00"] },
      { id: "lucas-molina", name: "Dr. Lucas Molina", slots: ["15:00", "16:30"] }
    ]
  },
  {
    id: "pediatria",
    name: "Pediatria",
    professionals: [
      { id: "nicolas-perez", name: "Dr. Nicolas Perez", slots: ["11:00", "11:30", "17:00"] }
    ]
  },
  {
    id: "dermatologia",
    name: "Dermatologia",
    professionals: [
      { id: "camila-ruiz", name: "Dra. Camila Ruiz", slots: ["08:30", "14:30"] }
    ]
  }
];
