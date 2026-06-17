export type ClinicProfessional = {
  id: string;
  name: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  specialties: string[];
  services: string[];
  location: string;
  active: boolean;
  consultationMinutes: number;
  attentionDays: string[];
  upcomingAppointments: number;
  bio: string;
};

export type ClinicService = {
  id: string;
  name: string;
  specialty: string;
  professionals: string[];
  durationMinutes: number;
  price: number;
  depositRequired: boolean;
  financingEnabled: boolean;
  active: boolean;
};

export type ClinicPatient = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  documentNumber: string;
  insurance: string;
  birthDate: string;
  nextAppointment: string;
  status: "active" | "follow_up" | "inactive";
  notes: string;
  appointmentHistory: number;
};

export type AvailabilityRule = {
  id: string;
  professionalName: string;
  location: string;
  day: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  block?: string;
  active: boolean;
};

export type WhatsAppTemplate = {
  id: string;
  type: "confirmation" | "reminder" | "reschedule" | "internal";
  name: string;
  body: string;
  active: boolean;
};

export const professionals: ClinicProfessional[] = [
  {
    id: "dr-laura-perez",
    name: "Laura",
    lastName: "Perez",
    email: "laura.perez@clinicos.demo",
    phone: "+54 261 555-0121",
    licenseNumber: "MP 18452",
    specialties: ["Clinica medica", "Telemedicina"],
    services: ["Consulta clinica", "Control general"],
    location: "Clinica Central",
    active: true,
    consultationMinutes: 30,
    attentionDays: ["Lunes", "Miercoles", "Viernes"],
    upcomingAppointments: 18,
    bio: "Atencion clinica general, controles preventivos y seguimiento de pacientes cronicos."
  },
  {
    id: "dra-martina-rios",
    name: "Martina",
    lastName: "Rios",
    email: "martina.rios@clinicos.demo",
    phone: "+54 261 555-0188",
    licenseNumber: "MP 22140",
    specialties: ["Odontologia"],
    services: ["Control odontologico", "Limpieza dental", "Implantes"],
    location: "Sede Norte",
    active: true,
    consultationMinutes: 45,
    attentionDays: ["Martes", "Jueves"],
    upcomingAppointments: 12,
    bio: "Odontologia integral, controles preventivos y tratamientos restaurativos."
  },
  {
    id: "dr-sebastian-molina",
    name: "Sebastian",
    lastName: "Molina",
    email: "sebastian.molina@clinicos.demo",
    phone: "+54 261 555-0144",
    licenseNumber: "MP 19772",
    specialties: ["Dermatologia"],
    services: ["Dermatologia laser", "Consulta dermatologica"],
    location: "Clinica Central",
    active: false,
    consultationMinutes: 30,
    attentionDays: ["Lunes", "Jueves"],
    upcomingAppointments: 6,
    bio: "Dermatologia clinica y procedimientos ambulatorios."
  }
];

export const services: ClinicService[] = [
  {
    id: "consulta-clinica",
    name: "Consulta clinica",
    specialty: "Clinica medica",
    professionals: ["Dra. Laura Perez"],
    durationMinutes: 30,
    price: 18000,
    depositRequired: false,
    financingEnabled: false,
    active: true
  },
  {
    id: "limpieza-dental",
    name: "Limpieza dental",
    specialty: "Odontologia",
    professionals: ["Dra. Martina Rios"],
    durationMinutes: 45,
    price: 42000,
    depositRequired: true,
    financingEnabled: true,
    active: true
  },
  {
    id: "dermatologia-laser",
    name: "Dermatologia laser",
    specialty: "Dermatologia",
    professionals: ["Dr. Sebastian Molina"],
    durationMinutes: 60,
    price: 120000,
    depositRequired: true,
    financingEnabled: true,
    active: true
  }
];

export const patients: ClinicPatient[] = [
  {
    id: "pac-001",
    firstName: "Juan",
    lastName: "Gomez",
    phone: "+54 261 555-1001",
    email: "juan.gomez@mail.com",
    documentNumber: "32111222",
    insurance: "OSDE",
    birthDate: "1986-04-12",
    nextAppointment: "Hoy 10:30",
    status: "active",
    notes: "Prefiere confirmacion por WhatsApp.",
    appointmentHistory: 7
  },
  {
    id: "pac-002",
    firstName: "Carla",
    lastName: "Fernandez",
    phone: "+54 261 555-1002",
    email: "carla.fernandez@mail.com",
    documentNumber: "28999111",
    insurance: "Swiss Medical",
    birthDate: "1990-09-03",
    nextAppointment: "Viernes 16:00",
    status: "follow_up",
    notes: "Seguimiento post tratamiento odontologico.",
    appointmentHistory: 4
  },
  {
    id: "pac-003",
    firstName: "Miguel",
    lastName: "Sosa",
    phone: "+54 261 555-1003",
    email: "miguel.sosa@mail.com",
    documentNumber: "30123456",
    insurance: "Particular",
    birthDate: "1979-11-21",
    nextAppointment: "Sin turno",
    status: "inactive",
    notes: "Reactivar para control anual.",
    appointmentHistory: 2
  }
];

export const availabilityRules: AvailabilityRule[] = [
  {
    id: "av-001",
    professionalName: "Dra. Laura Perez",
    location: "Clinica Central",
    day: "Lunes",
    startTime: "09:00",
    endTime: "13:00",
    slotDurationMinutes: 30,
    block: "10:30 a 11:00",
    active: true
  },
  {
    id: "av-002",
    professionalName: "Dra. Laura Perez",
    location: "Clinica Central",
    day: "Miercoles",
    startTime: "15:00",
    endTime: "19:00",
    slotDurationMinutes: 30,
    active: true
  },
  {
    id: "av-003",
    professionalName: "Dra. Martina Rios",
    location: "Sede Norte",
    day: "Jueves",
    startTime: "09:00",
    endTime: "15:00",
    slotDurationMinutes: 45,
    active: true
  }
];

export const whatsappTemplates: WhatsAppTemplate[] = [
  {
    id: "tpl-confirmation",
    type: "confirmation",
    name: "Confirmacion automatica",
    body:
      "Hola {nombre}, recibimos tu solicitud para {servicio} con {medico} el {fecha} a las {hora}. Responde CONFIRMAR para confirmar o REPROGRAMAR para cambiar el horario.",
    active: true
  },
  {
    id: "tpl-reminder",
    type: "reminder",
    name: "Recordatorio 24 horas",
    body:
      "Hola {nombre}, te recordamos tu turno manana a las {hora} en {clinica}. Responde 1 para confirmar o 2 para reprogramar.",
    active: true
  },
  {
    id: "tpl-internal",
    type: "internal",
    name: "Notificacion a recepcion",
    body: "Nuevo turno solicitado: {paciente}, {servicio}, {fecha}, {hora}.",
    active: true
  }
];

export const bookingSlots = ["09:00", "09:30", "10:00", "10:30", "11:30", "15:00", "16:00"];
