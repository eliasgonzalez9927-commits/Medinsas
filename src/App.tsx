import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ADMIN_ROLES, PROFESSIONAL_ROLES, getPostLoginPath } from "./lib/auth-roles";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AgendaPage } from "./pages/admin/modules/AgendaPage";
import { AvailabilityPage } from "./pages/admin/modules/AvailabilityPage";
import { BillingDocumentsPage, BillingPage, BillingSettingsPage } from "./pages/admin/modules/BillingPage";
import { FinancingPage, ReportsPage, SettingsPage } from "./pages/admin/modules/SecondaryModulePage";
import { OnlineBookingPage } from "./pages/admin/modules/OnlineBookingPage";
import { PatientsPage } from "./pages/admin/modules/PatientsPage";
import { NewPrescriptionPage, PrescriptionSettingsPage, PrescriptionsPage } from "./pages/admin/modules/PrescriptionsPage";
import { ProfessionalsPage } from "./pages/admin/modules/ProfessionalsPage";
import { ProfessionalProfilePage } from "./pages/admin/modules/ProfessionalProfilePage";
import { ServicesPage } from "./pages/admin/modules/ServicesPage";
import { WhatsAppPage } from "./pages/admin/modules/WhatsAppPage";
import { PublicBookingPage } from "./pages/booking/PublicBookingPage";
import { ClinicLanding } from "./pages/landing/ClinicLanding";
import { PatientBooking } from "./pages/patient/PatientBooking";

function HomeRedirect() {
  const { role, loading } = useAuth();

  if (loading) return null;
  return <Navigate to={getPostLoginPath(role) ?? "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/clinica-demo" element={<ClinicLanding />} />
      <Route path="/reservar/:clinicSlug" element={<PublicBookingPage />} />
      <Route path="/reservar/:clinicSlug/:filter" element={<PublicBookingPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomeRedirect />} />
      </Route>
      <Route element={<ProtectedRoute roles={["patient"]} />}>
        <Route path="/patient/book" element={<PatientBooking />} />
      </Route>
      <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/agenda" element={<AgendaPage />} />
        <Route path="/admin/profesionales" element={<ProfessionalsPage />} />
        <Route path="/admin/profesionales/:id" element={<ProfessionalProfilePage />} />
        <Route path="/admin/medicos" element={<ProfessionalsPage />} />
        <Route path="/admin/disponibilidad" element={<AvailabilityPage />} />
        <Route path="/admin/horarios" element={<AvailabilityPage />} />
        <Route path="/admin/pacientes" element={<PatientsPage />} />
        <Route path="/admin/servicios" element={<ServicesPage />} />
        <Route path="/admin/tratamientos" element={<ServicesPage />} />
        <Route path="/admin/booking" element={<OnlineBookingPage />} />
        <Route path="/admin/reservas-online" element={<OnlineBookingPage />} />
        <Route path="/admin/whatsapp" element={<WhatsAppPage />} />
        <Route path="/admin/financiacion" element={<FinancingPage />} />
        <Route path="/admin/facturacion" element={<BillingPage />} />
        <Route path="/admin/facturacion/comprobantes" element={<BillingDocumentsPage />} />
        <Route path="/admin/facturacion/configuracion" element={<BillingSettingsPage />} />
        <Route path="/admin/recetarios" element={<PrescriptionsPage />} />
        <Route path="/admin/recetarios/nuevo" element={<NewPrescriptionPage />} />
        <Route path="/admin/recetarios/configuracion" element={<PrescriptionSettingsPage />} />
        <Route path="/admin/reportes" element={<ReportsPage />} />
        <Route path="/admin/configuracion" element={<SettingsPage />} />
      </Route>
      <Route element={<ProtectedRoute roles={PROFESSIONAL_ROLES} />}>
        <Route path="/admin/mi-agenda" element={<AgendaPage />} />
        <Route path="/medico" element={<Navigate to="/admin/mi-agenda" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
