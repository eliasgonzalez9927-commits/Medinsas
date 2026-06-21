import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FilePenLine,
  MessageCircle,
  PieChart,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  UsersRound,
  WalletCards
} from "lucide-react";
import type { ClinicModuleKey } from "./modules";
import type { UserRole } from "../types/database";

export type AdminNavigationGroup =
  | "operation"
  | "clinic_configuration"
  | "finance"
  | "communication"
  | "management"
  | "platform";

export type ModuleStatus = "active" | "beta" | "coming_soon" | "hidden";

export type AdminModuleDefinition = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: AdminNavigationGroup;
  status: ModuleStatus;
  moduleFlag?: ClinicModuleKey | ClinicModuleKey[];
  allowedRoles?: UserRole[];
  description?: string;
};

export const ADMIN_NAVIGATION_GROUPS: Array<{ key: AdminNavigationGroup; label: string }> = [
  { key: "operation", label: "Operación" },
  { key: "clinic_configuration", label: "Configuración clínica" },
  { key: "finance", label: "Finanzas" },
  { key: "communication", label: "Comunicación" },
  { key: "management", label: "Gestión" },
  { key: "platform", label: "Plataforma" }
];

export const ADMIN_MODULES: AdminModuleDefinition[] = [
  { key: "dashboard", label: "Dashboard", path: "/admin", icon: ClipboardList, group: "operation", status: "active" },
  { key: "agenda", label: "Agenda", path: "/admin/agenda", icon: CalendarDays, group: "operation", status: "active", moduleFlag: "agenda" },
  { key: "requests", label: "Solicitudes", path: "/admin/solicitudes", icon: ClipboardCheck, group: "operation", status: "active", moduleFlag: "agenda" },
  { key: "patients", label: "Pacientes", path: "/admin/pacientes", icon: UsersRound, group: "operation", status: "active", moduleFlag: "pacientes" },

  { key: "professionals", label: "Profesionales", path: "/admin/profesionales", icon: Stethoscope, group: "clinic_configuration", status: "active", moduleFlag: "profesionales" },
  { key: "services", label: "Servicios", path: "/admin/servicios", icon: WalletCards, group: "clinic_configuration", status: "active", moduleFlag: "servicios" },
  { key: "availability", label: "Disponibilidad", path: "/admin/disponibilidad", icon: SlidersHorizontal, group: "clinic_configuration", status: "active", moduleFlag: "disponibilidad" },
  { key: "online_booking", label: "Reservas online", path: "/admin/booking", icon: CalendarDays, group: "clinic_configuration", status: "active", moduleFlag: "reservas_online" },
  { key: "coverages", label: "Coberturas", path: "/admin/configuracion/coberturas", icon: ShieldCheck, group: "clinic_configuration", status: "beta", moduleFlag: "obras_sociales" },

  { key: "payments", label: "Pagos", path: "/admin/pagos", icon: WalletCards, group: "finance", status: "active", moduleFlag: ["pagos", "mercado_pago"] },
  { key: "financing", label: "Financiación", path: "/admin/financiacion", icon: Banknote, group: "finance", status: "coming_soon", moduleFlag: "financiacion", description: "Opciones de financiación y simulaciones para tratamientos." },
  { key: "billing", label: "Facturación", path: "/admin/facturacion", icon: ReceiptText, group: "finance", status: "coming_soon", moduleFlag: "facturacion", description: "Comprobantes internos e integración fiscal cuando esté lista." },

  { key: "messages", label: "Mensajes", path: "/admin/mensajes", icon: MessageCircle, group: "communication", status: "beta", moduleFlag: "mensajes" },
  { key: "whatsapp", label: "WhatsApp", path: "/admin/whatsapp", icon: MessageCircle, group: "communication", status: "coming_soon", moduleFlag: "whatsapp", description: "Automatizaciones y conversaciones por WhatsApp con integración oficial." },

  { key: "reports", label: "Reportes", path: "/admin/reportes", icon: PieChart, group: "management", status: "beta", moduleFlag: "reportes" },
  { key: "onboarding", label: "Onboarding", path: "/admin/onboarding", icon: ClipboardCheck, group: "management", status: "beta" },
  { key: "settings", label: "Configuración", path: "/admin/configuracion", icon: Settings, group: "management", status: "active" },

  { key: "superadmin", label: "Superadmin", path: "/superadmin", icon: ShieldCheck, group: "platform", status: "active", allowedRoles: ["platform_admin"] },
  { key: "prescriptions", label: "Recetarios", path: "/admin/recetarios", icon: FilePenLine, group: "management", status: "coming_soon", moduleFlag: "recetarios", description: "Recetarios internos, indicaciones y futuras integraciones reguladas." },
  { key: "clinical_records", label: "Historia clínica", path: "/admin/historia-clinica", icon: FilePenLine, group: "management", status: "hidden", moduleFlag: "historia_clinica" },
  { key: "imports", label: "Importaciones", path: "/admin/importaciones", icon: ClipboardList, group: "management", status: "hidden", moduleFlag: "importaciones" }
];
