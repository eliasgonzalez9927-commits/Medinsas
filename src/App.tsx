import { Navigate, Route, Routes } from "react-router-dom";
import { useActiveClinic } from "./contexts/ActiveClinicContext";
import { useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ADMIN_ROLES, CLINIC_ADMIN_ROLES, CLINICAL_ROLES, PROFESSIONAL_ROLES, STAFF_ROLES, getPostLoginPath } from "./lib/auth-roles";
import { AcceptInvitation } from "./pages/auth/AcceptInvitation";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AgendaPage } from "./pages/admin/modules/AgendaPage";
import { AppointmentRequestsPage } from "./pages/admin/modules/AppointmentRequestsPage";
import { AvailabilityPage } from "./pages/admin/modules/AvailabilityPage";
import { ReportsPage } from "./pages/admin/modules/SecondaryModulePage";
import { MessagesPage } from "./pages/admin/modules/MessagesPage";
import { NotificationsPage } from "./pages/admin/modules/NotificationsPage";
import { OnlineBookingPage } from "./pages/admin/modules/OnlineBookingPage";
import { OnboardingPage } from "./pages/admin/modules/OnboardingPage";
import { PatientsPage } from "./pages/admin/modules/PatientsPage";
import { PaymentDetailPage, PaymentSettingsPage, PaymentsPage } from "./pages/admin/modules/PaymentsPage";
import { ProfessionalsPage } from "./pages/admin/modules/ProfessionalsPage";
import { ProfessionalProfilePage } from "./pages/admin/modules/ProfessionalProfilePage";
import { SettingsLocationsPage, SettingsNotificationsPage, SettingsPage, SettingsUsersPage } from "./pages/admin/modules/SettingsPage";
import { CoverageSettingsPage } from "./pages/admin/modules/CoverageSettingsPage";
import { ComingSoonPage } from "./pages/admin/modules/ComingSoonPage";
import { MyPlanPage } from "./pages/admin/modules/MyPlanPage";
import { ImportsPage } from "./pages/admin/modules/ImportsPage";
import { ServicesPage } from "./pages/admin/modules/ServicesPage";
import { PaymentFailurePage, PaymentPendingPage, PaymentSuccessPage } from "./pages/payments/PaymentReturnPage";
import { PublicBookingPage } from "./pages/booking/PublicBookingPage";
import { ClinicLanding } from "./pages/landing/ClinicLanding";
import { PatientBooking } from "./pages/patient/PatientBooking";
import { PublicAppointmentPage } from "./pages/patient/PublicAppointmentPage";
import { ClinicalRecordPage } from "./pages/admin/modules/ClinicalRecordPage";
import { AttendancePage } from "./pages/admin/modules/AttendancePage";
import { SuperadminClinicDetailPage, SuperadminClinicsPage, SuperadminDashboard } from "./pages/superadmin/SuperadminPages";
import { SuperadminPlansPage, SuperadminSubscriptionsPage } from "./pages/superadmin/SaasBillingPages";

function HomeRedirect() {
  const { role, loading } = useAuth();
  const { activeRole, loading: clinicLoading } = useActiveClinic();

  if (loading || clinicLoading) return null;
  return <Navigate to={getPostLoginPath(activeRole ?? role) ?? "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/aceptar-invitacion" element={<AcceptInvitation />} />
      <Route path="/recuperar-contrasena" element={<ForgotPassword />} />
      <Route path="/restablecer-contrasena" element={<ResetPassword />} />
      <Route path="/clinica-demo" element={<ClinicLanding />} />
      <Route path="/reservar/:clinicSlug" element={<PublicBookingPage />} />
      <Route path="/reservar/:clinicSlug/:filter" element={<PublicBookingPage />} />
      <Route path="/pago/exitoso" element={<PaymentSuccessPage />} />
      <Route path="/pago/pendiente" element={<PaymentPendingPage />} />
      <Route path="/pago/fallido" element={<PaymentFailurePage />} />
      <Route path="/mi-turno/:token" element={<PublicAppointmentPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomeRedirect />} />
      </Route>
      <Route element={<ProtectedRoute roles={["patient"]} />}>
        <Route path="/patient/book" element={<PatientBooking />} />
      </Route>
      <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/agenda" element={<AgendaPage />} />
        <Route path="/admin/solicitudes" element={<AppointmentRequestsPage />} />
        <Route path="/admin/profesionales" element={<ProfessionalsPage />} />
        <Route path="/admin/profesionales/:id" element={<ProfessionalProfilePage />} />
        <Route path="/admin/medicos" element={<ProfessionalsPage />} />
        {/* /admin/pacientes se mueve al bloque STAFF_ROLES debajo */}
        <Route path="/admin/servicios" element={<ServicesPage />} />
        <Route path="/admin/tratamientos" element={<ServicesPage />} />
        <Route path="/admin/booking" element={<OnlineBookingPage />} />
        <Route path="/admin/reservas-online" element={<OnlineBookingPage />} />
        <Route path="/admin/whatsapp" element={<ComingSoonPage title="WhatsApp" description="Próximamente vas a poder usar automatizaciones, confirmaciones y recordatorios mediante una integración oficial de WhatsApp." />} />
        <Route path="/admin/mensajes" element={<MessagesPage />} />
      </Route>
      {/*
        Rutas administrativas sensibles: configuracion, usuarios y permisos,
        pagos/facturacion, datos fiscales, reportes, notificaciones de
        clinica y disponibilidad/horarios. receptionist y professional
        quedan fuera por diseno (P0 RBAC) -- ninguna de estas pantallas
        tiene un caso de uso operativo legitimo para esos roles, y los
        datos ya estan ademas bloqueados por RLS (migraciones 021/023/
        024/025/026).
      */}
      <Route element={<ProtectedRoute roles={CLINIC_ADMIN_ROLES} />}>
        <Route path="/admin/disponibilidad" element={<AvailabilityPage />} />
        <Route path="/admin/horarios" element={<AvailabilityPage />} />
        <Route path="/admin/onboarding" element={<OnboardingPage />} />
        <Route path="/admin/mi-plan" element={<MyPlanPage />} />
        <Route path="/admin/importaciones" element={<ImportsPage />} />
        <Route path="/admin/notificaciones" element={<NotificationsPage />} />
        <Route path="/admin/notificaciones/configuracion" element={<SettingsNotificationsPage />} />
        {/* Configuración MP — solo clinic_admin/admin, receptionist excluida */}
        <Route path="/admin/pagos/configuracion" element={<PaymentSettingsPage />} />
        </Route>
      {/* Ingresos — receptionist incluida: puede registrar y consultar cobros operativos */}
      <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
        <Route path="/admin/pagos" element={<PaymentsPage />} />
        <Route path="/admin/pagos/:id" element={<PaymentDetailPage />} />
      </Route>
      <Route element={<ProtectedRoute roles={CLINIC_ADMIN_ROLES} />}>
        <Route path="/admin/financiacion" element={<ComingSoonPage title="Financiación" description="Próximamente vas a poder preparar opciones de financiación de tratamientos y conectar proveedores de scoring cuando estén validados." />} />
        <Route path="/admin/facturacion" element={<ComingSoonPage title="Facturación" description="Próximamente vas a poder gestionar comprobantes internos e integraciones fiscales. No se emitirán facturas reales hasta contar con la integración correspondiente." />} />
        <Route path="/admin/facturacion/comprobantes" element={<ComingSoonPage title="Comprobantes" description="La emisión y gestión de comprobantes estará disponible cuando el módulo de facturación esté operativo." />} />
        <Route path="/admin/facturacion/configuracion" element={<ComingSoonPage title="Configuración fiscal" description="Los datos fiscales e integración ARCA se habilitarán junto con el módulo de facturación operativo." />} />
        <Route path="/admin/recetarios" element={<ComingSoonPage title="Recetarios" description="Próximamente vas a poder trabajar con recetarios internos, órdenes e indicaciones bajo el circuito clínico y regulatorio correspondiente." />} />
        <Route path="/admin/recetarios/nuevo" element={<ComingSoonPage title="Nuevo documento" description="La creación de documentos médicos se habilitará junto con las validaciones profesionales y de trazabilidad necesarias." />} />
        <Route path="/admin/recetarios/configuracion" element={<ComingSoonPage title="Configuración de recetarios" description="La configuración de matrícula, firma e integraciones aprobadas estará disponible cuando el módulo esté operativo." />} />
        <Route path="/admin/reportes" element={<ReportsPage />} />
        <Route path="/admin/configuracion" element={<SettingsPage />} />
        <Route path="/admin/configuracion/sedes" element={<SettingsLocationsPage />} />
        <Route path="/admin/configuracion/usuarios" element={<SettingsUsersPage />} />
        <Route path="/admin/configuracion/notificaciones" element={<SettingsNotificationsPage />} />
        <Route path="/admin/configuracion/coberturas" element={<CoverageSettingsPage />} />
      </Route>
      {/* Pacientes — accesible para todo el staff (admin + professional/doctor). receptionist ya incluida en ADMIN_ROLES. */}
      <Route element={<ProtectedRoute roles={STAFF_ROLES} />}>
        <Route path="/admin/pacientes" element={<PatientsPage />} />
      </Route>

      {/* Registro clínico y panel de atención — accesibles para roles clínicos (sin receptionist) */}
      <Route element={<ProtectedRoute roles={CLINICAL_ROLES} />}>
        <Route path="/admin/registro-clinico/:patientId" element={<ClinicalRecordPage />} />
        <Route path="/admin/atencion/:appointmentId" element={<AttendancePage />} />
      </Route>

      <Route element={<ProtectedRoute roles={["platform_admin"]} />}>
        <Route path="/superadmin" element={<SuperadminDashboard />} />
        <Route path="/superadmin/planes" element={<SuperadminPlansPage />} />
        <Route path="/superadmin/suscripciones" element={<SuperadminSubscriptionsPage />} />
        <Route path="/superadmin/clinicas" element={<SuperadminClinicsPage />} />
        <Route path="/superadmin/clinicas/:id" element={<SuperadminClinicDetailPage />} />
      </Route>
      <Route element={<ProtectedRoute roles={PROFESSIONAL_ROLES} />}>
        <Route path="/admin/mi-agenda" element={<AgendaPage />} />
        <Route path="/medico" element={<Navigate to="/admin/mi-agenda" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
