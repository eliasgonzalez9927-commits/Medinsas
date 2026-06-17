import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AgendaPage } from "./pages/admin/modules/AgendaPage";
import { AvailabilityPage } from "./pages/admin/modules/AvailabilityPage";
import { FinancingPage, ReportsPage, SettingsPage } from "./pages/admin/modules/SecondaryModulePage";
import { OnlineBookingPage } from "./pages/admin/modules/OnlineBookingPage";
import { PatientsPage } from "./pages/admin/modules/PatientsPage";
import { ProfessionalsPage } from "./pages/admin/modules/ProfessionalsPage";
import { ProfessionalProfilePage } from "./pages/admin/modules/ProfessionalProfilePage";
import { ServicesPage } from "./pages/admin/modules/ServicesPage";
import { WhatsAppPage } from "./pages/admin/modules/WhatsAppPage";
import { PublicBookingPage } from "./pages/booking/PublicBookingPage";
import { ClinicLanding } from "./pages/landing/ClinicLanding";
import { PatientBooking } from "./pages/patient/PatientBooking";

function HomeRedirect() {
  const { profile, loading } = useAuth();

  if (loading) return null;
  return <Navigate to={profile?.role === "admin" ? "/admin" : "/patient/book"} replace />;
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
      <Route element={<ProtectedRoute roles={["admin"]} />}>
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
        <Route path="/admin/reportes" element={<ReportsPage />} />
        <Route path="/admin/configuracion" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
