import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Bell,
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
  | "summary"
  | "clinical_management"
  | "operations"
  | "communication"
  | "administration"
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
  { key: "summary", label: "Resumen" },
  { key: "clinical_management", label: "Gestión clínica" },
  { key: "operations", label: "Operaciones" },
  { key: "communication", label: "Comunicación" },
  { key: "administration", label: "Administración" },
  { key: "platform", label: "Plataforma" }
];

export const ADMIN_MODULES: AdminModuleDefinition[] = [
  { key: "dashboard", label: "Dashboard", path: "/admin", icon: ClipboardList, group: "summary", status: "active" },
  { key: "agenda", label: "Agenda", path: "/admin/agenda", icon: CalendarDays, group: "clinical_management", status: "active", moduleFlag: "agenda" },
  { key: "my_income", label: "Mis ingresos", path: "/admin/mi-agenda/ingresos", icon: WalletCards, group: "clinical_management", status: "active", allowedRoles: ["professional", "doctor"] },
  { key: "patients", label: "Pacientes", path: "/admin/pacientes", icon: UsersRound, group: "clinical_management", status: "active", moduleFlag: "pacientes" },

  { key: "professionals", label: "Profesionales", path: "/admin/profesionales", icon: Stethoscope, group: "clinical_management", status: "active", moduleFlag: "profesionales" },
  { key: "services", label: "Servicios", path: "/admin/servicios", icon: WalletCards, group: "clinical_management", status: "active", moduleFlag: "servicios" },
  { key: "requests", label: "Solicitudes", path: "/admin/solicitudes", icon: ClipboardCheck, group: "operations", status: "active", moduleFlag: "agenda" },
  { key: "availability", label: "Disponibilidad", path: "/admin/disponibilidad", icon: SlidersHorizontal, group: "operations", status: "active", moduleFlag: "disponibilidad" },
  { key: "online_booking", label: "Reservas online", path: "/admin/booking", icon: CalendarDays, group: "operations", status: "active", moduleFlag: "reservas_online" },
  { key: "onboarding", label: "Onboarding", path: "/admin/onboarding", icon: ClipboardCheck, group: "operations", status: "beta" },

  { key: "payments", label: "Pagos", path: "/admin/pagos", icon: WalletCards, group: "administration", status: "active", moduleFlag: ["pagos", "mercado_pago"] },
  { key: "financing", label: "Financiación", path: "/admin/financiacion", icon: Banknote, group: "administration", status: "coming_soon", moduleFlag: "financiacion", description: "Opciones de financiación y simulaciones para tratamientos." },
  { key: "billing", label: "Facturación", path: "/admin/facturacion", icon: ReceiptText, group: "administration", status: "coming_soon", moduleFlag: "facturacion", description: "Comprobantes internos e integración fiscal cuando esté lista." },

  { key: "notifications", label: "Notificaciones", path: "/admin/notificaciones", icon: Bell, group: "communication", status: "active" },
  { key: "messages", label: "Mensajes", path: "/admin/mensajes", icon: MessageCircle, group: "communication", status: "beta", moduleFlag: "mensajes" },
  { key: "whatsapp", label: "WhatsApp", path: "/admin/whatsapp", icon: MessageCircle, group: "communication", status: "coming_soon", moduleFlag: "whatsapp", description: "Automatizaciones y conversaciones por WhatsApp con integración oficial." },

  { key: "reports", label: "Reportes", path: "/admin/reportes", icon: PieChart, group: "administration", status: "beta", moduleFlag: "reportes" },
  { key: "my_plan", label: "Mi plan", path: "/admin/mi-plan", icon: ReceiptText, group: "administration", status: "active" },
  { key: "settings", label: "Configuración", path: "/admin/configuracion", icon: Settings, group: "administration", status: "active" },

  { key: "superadmin", label: "Superadmin", path: "/superadmin", icon: ShieldCheck, group: "platform", status: "active", allowedRoles: ["platform_admin"] },
  { key: "prescriptions", label: "Recetarios", path: "/admin/recetarios", icon: FilePenLine, group: "administration", status: "coming_soon", moduleFlag: "recetarios", description: "Recetarios internos, indicaciones y futuras integraciones reguladas." },
  { key: "clinical_records", label: "Historia clínica", path: "/admin/historia-clinica", icon: FilePenLine, group: "administration", status: "hidden", moduleFlag: "historia_clinica" },
  { key: "imports", label: "Importaciones", path: "/admin/importaciones", icon: ClipboardList, group: "administration", status: "hidden", moduleFlag: "importaciones" }
];
