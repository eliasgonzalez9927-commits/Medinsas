import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, CalendarClock, Mail, MapPin, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import { useAuth } from "../../../contexts/AuthContext";
import {
  createLocation,
  getClinicHours,
  getClinicMembers,
  getLocations,
  getProfessionals,
  getUserInvitations,
  updateClinic,
  updateClinicMember,
  updateLocation,
  upsertClinicHour
} from "../../../lib/clinic-data";
import { cancelInvitation, changeClinicMemberRole, createInvitation, updateClinicMemberProfessional } from "../../../lib/invitations";
import { getClinicNotificationSettings, updateClinicNotificationSettings } from "../../../lib/notifications";
import { canManageClinic, canManageUsers } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import {
  Clinic,
  ClinicHours,
  ClinicInput,
  ClinicNotificationSettings,
  ClinicMemberWithProfile,
  Location,
  LocationInput,
  ProfessionalWithRelations,
  UserInvitation
} from "../../../types/clinic";
import { UserRole } from "../../../types/database";
import { AdminPageShell } from "./AdminPageShell";

type SettingsTab =
  | "clinic"
  | "locations"
  | "hours"
  | "users"
  | "notifications"
  | "payments"
  | "booking"
  | "branding"
  | "fiscal"
  | "integrations";

const tabs: Array<{ id: SettingsTab; label: string; to: string }> = [
  { id: "clinic", label: "Datos de la clinica", to: "/admin/configuracion" },
  { id: "locations", label: "Sedes", to: "/admin/configuracion/sedes" },
  { id: "hours", label: "Horarios generales", to: "/admin/configuracion#horarios" },
  { id: "users", label: "Usuarios y permisos", to: "/admin/configuracion/usuarios" },
  { id: "notifications", label: "Notificaciones", to: "/admin/configuracion/notificaciones" },
  { id: "payments", label: "Pagos", to: "/admin/pagos/configuracion" },
  { id: "booking", label: "Reservas online", to: "/admin/booking" },
  { id: "branding", label: "Branding", to: "/admin/configuracion#branding" },
  { id: "fiscal", label: "Datos fiscales", to: "/admin/facturacion/configuracion" },
  { id: "integrations", label: "Integraciones", to: "/admin/configuracion#integraciones" }
];

// La invitacion a clinica nunca debe poder otorgar platform_admin: el backend
// (POST /api/invitations) rechaza ese rol por diseno de seguridad.
const invitableRoles: UserRole[] = ["clinic_admin", "receptionist", "professional"];
const roleLabels: Record<string, string> = {
  platform_admin: "Platform admin",
  clinic_admin: "Admin clinica",
  admin: "Administrador",
  receptionist: "Recepcion",
  professional: "Profesional"
};

// Roles asignables desde "Cambiar rol" en Usuarios y permisos. platform_admin
// queda excluido por diseno: el backend (PATCH /api/clinic-members/:id/role)
// rechaza ese rol explicitamente.
const assignableRoles: Array<"clinic_admin" | "admin" | "receptionist" | "professional"> = [
  "clinic_admin",
  "admin",
  "receptionist",
  "professional"
];
const ADMIN_MEMBER_ROLES = ["clinic_admin", "admin"];

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export function SettingsPage() {
  return <SettingsCenter initialTab="clinic" />;
}

export function SettingsLocationsPage() {
  return <SettingsCenter initialTab="locations" />;
}

export function SettingsUsersPage() {
  return <SettingsCenter initialTab="users" />;
}

export function SettingsNotificationsPage() {
  return <SettingsCenter initialTab="notifications" />;
}

function SettingsCenter({ initialTab }: { initialTab: SettingsTab }) {
  const { role, user } = useAuth();
  const { hash } = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(hashToTab(hash) ?? initialTab);
  const { activeClinic: clinic, activeRole, loading: clinicLoading, refreshClinics } = useActiveClinic();
  const [locations, setLocations] = useState<Location[]>([]);
  const [hours, setHours] = useState<ClinicHours[]>([]);
  const [members, setMembers] = useState<ClinicMemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const permissions = useMemo(() => ({
    manageClinic: canManageClinic(activeRole ?? role),
    manageUsers: canManageUsers(activeRole ?? role)
  }), [activeRole, role]);

  async function load() {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      const [loadedLocations, loadedHours, loadedMembers, loadedInvitations, professionalResult] = await Promise.all([
        getLocations(clinic.id),
        getClinicHours(clinic.id).catch(() => []),
        getClinicMembers(clinic.id).catch(() => []),
        getUserInvitations(clinic.id).catch(() => []),
        getProfessionals(clinic.id)
      ]);
      setLocations(loadedLocations);
      setHours(loadedHours);
      setMembers(loadedMembers);
      setInvitations(loadedInvitations);
      setProfessionals(professionalResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar configuracion.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (clinic) load();
    else if (!clinicLoading) setLoading(false);
  }, [clinic?.id, clinicLoading]);

  useEffect(() => {
    const next = hashToTab(hash);
    if (next) setActiveTab(next);
  }, [hash]);

  async function saveClinic(data: ClinicInput) {
    if (!clinic || !permissions.manageClinic) return;
    setSaving(true);
    setError("");
    try {
      await updateClinic(clinic.id, data);
      await refreshClinics();
      setNotice("Datos de la clinica actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la clinica.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation(data: LocationInput, id?: string) {
    if (!clinic || !permissions.manageClinic) return;
    setSaving(true);
    try {
      if (id) await updateLocation(id, data);
      else await createLocation(data);
      setNotice(id ? "Sede actualizada." : "Sede creada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la sede.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHour(hour: ClinicHours) {
    if (!clinic || !permissions.manageClinic) return;
    setSaving(true);
    try {
      await upsertClinicHour(hour);
      setNotice("Horario general actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el horario.");
    } finally {
      setSaving(false);
    }
  }

  async function inviteUser(data: {
    email: string;
    full_name: string;
    role: string;
    location_id?: string | null;
    professional_id?: string | null;
  }) {
    if (!clinic || !permissions.manageUsers) return;
    setSaving(true);
    setError("");
    try {
      await createInvitation({
        clinicId: clinic.id,
        email: data.email,
        fullName: data.full_name,
        role: data.role as "clinic_admin" | "receptionist" | "professional",
        locationId: data.location_id ?? null,
        professionalId: data.professional_id ?? null
      });
      setNotice("Invitación enviada. El usuario va a recibir un email con el link para aceptarla.");
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = code === "ALREADY_PENDING"
        ? "Ya hay una invitación pendiente para ese email en esta clínica."
        : code === "FORBIDDEN_CLINIC"
          ? "Tu rol no permite invitar usuarios a esta clínica."
          : code === "INVALID_PAYLOAD"
            ? "Revisá los datos del formulario, hay un campo inválido."
            : code === "PROFESSIONAL_REQUIRED"
              ? "Para invitar un usuario profesional, es obligatorio seleccionar un profesional de la clínica."
              : code === "PROFESSIONAL_NOT_FOUND"
                ? "El profesional seleccionado no existe."
                : code === "PROFESSIONAL_CLINIC_MISMATCH"
                  ? "El profesional seleccionado no pertenece a esta clínica."
                  : "No pudimos invitar al usuario.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelUserInvitation(id: string) {
    if (!permissions.manageUsers) return;
    setSaving(true);
    setError("");
    try {
      await cancelInvitation(id);
      setNotice("Invitación cancelada. Ya podés enviar una nueva invitación si hace falta.");
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = code === "INVITATION_ALREADY_ACCEPTED"
        ? "Esa invitación ya fue aceptada, no se puede cancelar."
        : code === "FORBIDDEN"
          ? "Tu rol no permite cancelar invitaciones de esta clínica."
          : code === "INVITATION_NOT_FOUND"
            ? "No encontramos esa invitación."
            : "No pudimos cancelar la invitación.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function changeMemberRole(id: string, role: "clinic_admin" | "admin" | "receptionist" | "professional") {
    if (!permissions.manageUsers) return;
    setSaving(true);
    setError("");
    try {
      await changeClinicMemberRole(id, role);
      setNotice("Rol actualizado correctamente.");
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = code === "FORBIDDEN"
        ? "No tenés permisos para cambiar roles."
        : code === "INVALID_PAYLOAD"
          ? "No se puede asignar platform admin desde esta pantalla."
          : code === "SELF_DEMOTION_FORBIDDEN"
            ? "No podés quitarte tu propio rol administrativo."
            : code === "CLINIC_WITHOUT_ADMIN"
              ? "La clínica debe conservar al menos un administrador activo."
              : code === "MEMBER_NOT_FOUND"
                ? "No encontramos ese usuario."
                : "No pudimos actualizar el rol.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberProfessional(id: string, professionalId: string | null) {
    if (!permissions.manageUsers) return;
    setSaving(true);
    setError("");
    try {
      await updateClinicMemberProfessional(id, professionalId);
      setNotice("Profesional asociado actualizado.");
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = code === "FORBIDDEN"
        ? "No tenés permisos para editar esta vinculación."
        : code === "MEMBER_NOT_FOUND"
          ? "No encontramos ese usuario."
          : code === "PROFESSIONAL_NOT_FOUND"
            ? "El profesional seleccionado no existe."
            : code === "PROFESSIONAL_CLINIC_MISMATCH"
              ? "El profesional no pertenece a esta clínica."
              : "No pudimos actualizar el profesional asociado.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      description="Centro de administracion para datos de clinica, sedes, usuarios, notificaciones e integraciones."
      eyebrow="Administracion"
      onRefresh={load}
      title="Configuracion"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}
      {!permissions.manageClinic && (
        <Message tone="warning">Tu rol no permite editar configuracion general.</Message>
      )}

      <SectionCard className="p-3">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              to={tab.to}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${
                activeTab === tab.id ? "bg-teal-50 text-clinic-brand" : "text-clinic-muted hover:bg-clinic-surface"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </SectionCard>

      {loading || clinicLoading ? (
        <SectionCard className="p-8 text-center text-clinic-muted">Cargando configuracion...</SectionCard>
      ) : !clinic ? (
        <NoActiveClinicState />
      ) : (
        <>
          {activeTab === "clinic" && <ClinicForm clinic={clinic} disabled={!permissions.manageClinic || saving} onSave={saveClinic} />}
          {activeTab === "locations" && <LocationsPanel clinic={clinic} disabled={!permissions.manageClinic || saving} locations={locations} onSave={saveLocation} />}
          {activeTab === "hours" && <HoursPanel disabled={!permissions.manageClinic || saving} hours={hours} clinicId={clinic.id} onSave={saveHour} />}
          {activeTab === "users" && (
            <UsersPanel
              canManageUsers={permissions.manageUsers}
              currentUserId={user?.id ?? ""}
              disabled={!permissions.manageUsers || saving}
              invitations={invitations}
              locations={locations}
              members={members}
              onCancelInvitation={cancelUserInvitation}
              onChangeRole={changeMemberRole}
              onUpdateProfessional={updateMemberProfessional}
              onInvite={inviteUser}
              onRefresh={load}
              professionals={professionals}
            />
          )}
          {activeTab === "notifications" && <NotificationsPanel clinic={clinic} disabled={!permissions.manageClinic || saving} />}
          {activeTab === "branding" && <PreparedPanel icon={<SlidersHorizontal size={20} />} title="Branding" text="Logo, color principal, textos publicos y dominio personalizado quedan preparados sobre la tabla clinics." />}
          {activeTab === "integrations" && <PreparedPanel icon={<ShieldCheck size={20} />} title="Integraciones" text="Resend queda activo desde backend. WhatsApp, ARCA y receta electronica se mantienen como integraciones futuras controladas." />}
        </>
      )}
    </AdminPageShell>
  );
}

function ClinicForm({ clinic, disabled, onSave }: { clinic: Clinic; disabled: boolean; onSave: (data: ClinicInput) => void }) {
  const [form, setForm] = useState({
    name: clinic.name ?? "",
    legal_name: clinic.legal_name ?? "",
    slug: clinic.slug ?? "",
    phone: clinic.phone ?? "",
    whatsapp: clinic.whatsapp ?? "",
    email: clinic.email ?? "",
    address: clinic.address ?? "",
    logo_url: clinic.logo_url ?? "",
    website_url: clinic.website_url ?? "",
    active: clinic.active ?? true
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...form,
      legal_name: form.legal_name || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      address: form.address || null,
      logo_url: form.logo_url || null,
      website_url: form.website_url || null
    });
  }

  return (
    <SectionCard className="p-5">
      <Header icon={<Building2 size={20} />} title="Datos de la clinica" text="Informacion institucional usada en reservas, mensajes y configuracion operativa." />
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
        <Input label="Nombre comercial" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Input label="Razon social" value={form.legal_name} onChange={(value) => setForm({ ...form, legal_name: value })} />
        <Input label="Slug publico" value={form.slug} onChange={(value) => setForm({ ...form, slug: value })} required />
        <Input label="Telefono" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <Input label="WhatsApp" value={form.whatsapp} onChange={(value) => setForm({ ...form, whatsapp: value })} />
        <Input label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <Input label="Sitio web" value={form.website_url} onChange={(value) => setForm({ ...form, website_url: value })} />
        <Input label="Logo URL" value={form.logo_url} onChange={(value) => setForm({ ...form, logo_url: value })} />
        <label className="md:col-span-2">
          <span className="text-sm font-medium text-clinic-ink">Direccion principal</span>
          <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" />
        </label>
        <label className="flex items-center gap-2">
          <input checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} type="checkbox" />
          <span className="text-sm font-medium text-clinic-ink">Clinica activa</span>
        </label>
        <div className="md:col-span-2">
          <Button disabled={disabled} type="submit" variant="primary">Guardar cambios</Button>
        </div>
      </form>
    </SectionCard>
  );
}

function LocationsPanel({ clinic, disabled, locations, onSave }: { clinic: Clinic; disabled: boolean; locations: Location[]; onSave: (data: LocationInput, id?: string) => void }) {
  const [form, setForm] = useState({ id: "", name: "", address: "", phone: "", active: true, is_primary: false });
  function edit(location: Location) {
    setForm({
      id: location.id,
      name: location.name,
      address: location.address ?? "",
      phone: location.phone ?? "",
      active: location.active ?? true,
      is_primary: location.is_primary ?? false
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      clinic_id: clinic.id,
      name: form.name,
      address: form.address || null,
      phone: form.phone || null,
      active: form.active,
      is_primary: form.is_primary
    }, form.id || undefined);
    setForm({ id: "", name: "", address: "", phone: "", active: true, is_primary: false });
  }
  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <Header icon={<MapPin size={20} />} title={form.id ? "Editar sede" : "Crear sede"} text="Direccion, telefono, estado y sede principal." />
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <Input label="Nombre" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <Input label="Direccion" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <Input label="Telefono" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <label className="flex items-center gap-2"><input checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} type="checkbox" /><span className="text-sm font-medium">Activa</span></label>
          <label className="flex items-center gap-2"><input checked={form.is_primary} onChange={(event) => setForm({ ...form, is_primary: event.target.checked })} type="checkbox" /><span className="text-sm font-medium">Sede principal</span></label>
          <Button disabled={disabled} type="submit" variant="primary">{form.id ? "Guardar sede" : "Crear sede"}</Button>
        </form>
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <div className="border-b border-clinic-line px-5 py-4"><h2 className="font-semibold">Sedes</h2></div>
        <div className="divide-y divide-clinic-line">
          {locations.map((location) => (
            <article key={location.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px_120px] md:items-center">
              <div>
                <p className="font-semibold text-clinic-ink">{location.name}</p>
                <p className="text-sm text-clinic-muted">{location.address ?? "Sin direccion"} · {location.phone ?? "Sin telefono"}</p>
              </div>
              <span className="text-sm text-clinic-muted">{location.is_primary ? "Principal" : "Sucursal"}</span>
              <Button onClick={() => edit(location)}>Editar</Button>
            </article>
          ))}
        </div>
      </SectionCard>
    </section>
  );
}

function HoursPanel({ clinicId, disabled, hours, onSave }: { clinicId: string; disabled: boolean; hours: ClinicHours[]; onSave: (hour: ClinicHours) => void }) {
  const normalized = days.map((_, day) => hours.find((hour) => hour.day_of_week === day) ?? {
    id: `new-${day}`,
    clinic_id: clinicId,
    day_of_week: day,
    is_open: day > 0 && day < 6,
    opens_at: day > 0 && day < 6 ? "08:00:00" : null,
    closes_at: day > 0 && day < 6 ? "20:00:00" : null,
    notes: null,
    created_at: "",
    updated_at: ""
  });
  return (
    <SectionCard className="overflow-hidden">
      <div className="border-b border-clinic-line px-5 py-4">
        <Header icon={<CalendarClock size={20} />} title="Horarios generales" text="Marco global de apertura. No reemplaza la disponibilidad de cada profesional." />
      </div>
      <div className="divide-y divide-clinic-line">
        {normalized.map((hour) => <HourRow key={hour.day_of_week} disabled={disabled} hour={hour} onSave={onSave} />)}
      </div>
    </SectionCard>
  );
}

function HourRow({ disabled, hour, onSave }: { disabled: boolean; hour: ClinicHours; onSave: (hour: ClinicHours) => void }) {
  const [draft, setDraft] = useState(hour);
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[130px_120px_120px_1fr_120px] md:items-center">
      <label className="flex items-center gap-2"><input checked={draft.is_open} onChange={(event) => setDraft({ ...draft, is_open: event.target.checked })} type="checkbox" /><span className="font-semibold">{days[draft.day_of_week]}</span></label>
      <input disabled={!draft.is_open} type="time" value={(draft.opens_at ?? "").slice(0, 5)} onChange={(event) => setDraft({ ...draft, opens_at: event.target.value })} className="h-10 rounded-lg border border-clinic-line px-3 text-sm" />
      <input disabled={!draft.is_open} type="time" value={(draft.closes_at ?? "").slice(0, 5)} onChange={(event) => setDraft({ ...draft, closes_at: event.target.value })} className="h-10 rounded-lg border border-clinic-line px-3 text-sm" />
      <input placeholder="Notas o excepciones" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} className="h-10 rounded-lg border border-clinic-line px-3 text-sm" />
      <Button disabled={disabled} onClick={() => onSave(draft)}>Guardar</Button>
    </div>
  );
}

function UsersPanel({ canManageUsers, currentUserId, disabled, invitations, locations, members, onCancelInvitation, onChangeRole, onUpdateProfessional, onInvite, onRefresh, professionals }: { canManageUsers: boolean; currentUserId: string; disabled: boolean; invitations: UserInvitation[]; locations: Location[]; members: ClinicMemberWithProfile[]; onCancelInvitation: (id: string) => void; onChangeRole: (id: string, role: "clinic_admin" | "admin" | "receptionist" | "professional") => void; onUpdateProfessional: (id: string, professionalId: string | null) => void; onInvite: (data: { email: string; full_name: string; role: string; location_id?: string | null; professional_id?: string | null }) => void; onRefresh: () => void; professionals: ProfessionalWithRelations[] }) {
  const [form, setForm] = useState({ email: "", full_name: "", role: "receptionist", location_id: "", professional_id: "" });
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  const requiresProfessional = form.role === "professional";
  const activeProfessionals = professionals.filter((p) => p.active);
  const noProfessionalsAvailable = requiresProfessional && activeProfessionals.length === 0;
  const missingProfessional = requiresProfessional && !form.professional_id;
  const inviteBlocked = disabled || noProfessionalsAvailable || missingProfessional;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteBlocked) return;
    onInvite({ ...form, location_id: form.location_id || null, professional_id: form.professional_id || null });
    setForm({ email: "", full_name: "", role: "receptionist", location_id: "", professional_id: "" });
  }
  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <Header icon={<ShieldCheck size={20} />} title="Invitar usuario" text="Registra la invitacion y dispara email si Resend esta configurado." />
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <Input label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required />
          <Input label="Nombre" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} required />
          <Select label="Rol" value={form.role} onChange={(value) => setForm({ ...form, role: value, professional_id: "" })} options={invitableRoles.map((item) => ({ value: item, label: roleLabels[item] }))} />
          <Select label="Sede opcional" value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })} options={[{ value: "", label: "Sin sede asignada" }, ...locations.map((item) => ({ value: item.id, label: item.name }))]} />
          <div className="grid gap-1.5">
            <Select
              label={requiresProfessional ? "Profesional asociado (obligatorio)" : "Profesional asociado"}
              value={form.professional_id}
              onChange={(value) => setForm({ ...form, professional_id: value })}
              options={[
                { value: "", label: requiresProfessional ? "Seleccioná un profesional…" : "Sin profesional" },
                ...activeProfessionals.map((item) => ({ value: item.id, label: `${item.name} ${item.last_name}` }))
              ]}
            />
            {noProfessionalsAvailable && (
              <Message tone="warning">No hay profesionales cargados. Creá un profesional antes de invitar un usuario con rol Profesional.</Message>
            )}
            {requiresProfessional && !noProfessionalsAvailable && missingProfessional && (
              <p className="text-xs font-medium text-amber-700">Para invitar un usuario profesional, primero vinculalo a un profesional de la clínica.</p>
            )}
          </div>
          <Button disabled={inviteBlocked} type="submit" variant="primary">Enviar invitacion</Button>
        </form>
      </SectionCard>
      <div className="grid gap-6">
        <SectionCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
            <div>
              <h2 className="font-semibold">Usuarios del equipo</h2>
              <p className="text-xs text-clinic-muted">Personas con acceso a la clínica y permisos asignados.</p>
            </div>
            <Button onClick={onRefresh}>Actualizar</Button>
          </div>
          <div className="divide-y divide-clinic-line">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                canManageUsers={canManageUsers}
                currentUserId={currentUserId}
                disabled={disabled}
                member={member}
                professionals={professionals}
                onChangeRole={onChangeRole}
                onUpdateProfessional={onUpdateProfessional}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </SectionCard>
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold">Invitaciones pendientes</h2>
            <p className="text-xs text-clinic-muted">Invitaciones enviadas que todavía no fueron aceptadas.</p>
          </div>
          <div className="divide-y divide-clinic-line">
            {pendingInvitations.length === 0 && (
              <p className="px-5 py-4 text-sm text-clinic-muted">No hay invitaciones pendientes.</p>
            )}
            {pendingInvitations.map((invitation) => (
              <article key={invitation.id} className="grid gap-3 bg-amber-50/40 px-5 py-4 md:grid-cols-[1fr_130px_120px_140px] md:items-center">
                <div><p className="font-semibold">{invitation.full_name}</p><p className="text-sm text-clinic-muted">{invitation.email}</p></div>
                <span className="text-sm font-medium">{roleLabels[invitation.role] ?? invitation.role}</span>
                <span className="rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-amber-700">Pendiente</span>
                <Button disabled={disabled} onClick={() => onCancelInvitation(invitation.id)}>Cancelar invitación</Button>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </section>
  );
}

const PROFESSIONAL_ROLES_SET = new Set(["professional", "doctor"]);

function MemberRow({ canManageUsers, currentUserId, disabled, member, professionals, onChangeRole, onUpdateProfessional, onRefresh }: { canManageUsers: boolean; currentUserId: string; disabled: boolean; member: ClinicMemberWithProfile; professionals: ProfessionalWithRelations[]; onChangeRole: (id: string, role: "clinic_admin" | "admin" | "receptionist" | "professional") => void; onUpdateProfessional: (id: string, professionalId: string | null) => void; onRefresh: () => void }) {
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [professionalModalOpen, setProfessionalModalOpen] = useState(false);
  const isProfRole = PROFESSIONAL_ROLES_SET.has(member.role);
  const unlinked = isProfRole && !member.professional_id;

  async function toggle() {
    await updateClinicMember(member.id, { active: !member.active });
    onRefresh();
  }

  const profName = member.professionals
    ? `Dr/a. ${member.professionals.name} ${member.professionals.last_name}`
    : null;
  const accountName = member.profiles?.full_name ?? member.user_id;
  const locationLabel = member.locations?.name ?? "Sin sede";

  const primaryName = isProfRole && profName ? profName : accountName;
  const subtitle = isProfRole
    ? profName
      ? `Cuenta: ${accountName} · ${locationLabel}`
      : `Sin profesional asociado · ${locationLabel}`
    : locationLabel;

  return (
    <article className="px-5 py-4">
      <div className="grid gap-3 md:grid-cols-[1fr_140px_100px_120px_120px] md:items-center">
        <div>
          <p className="font-semibold text-clinic-ink">{primaryName}</p>
          <p className="text-sm text-clinic-muted">{subtitle}</p>
        </div>
        <span className="text-sm font-medium">{roleLabels[member.role] ?? member.role}</span>
        <span className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${member.active ? "bg-emerald-50 text-emerald-700" : "bg-clinic-surface text-clinic-muted"}`}>
          {member.active ? "Activo" : "Inactivo"}
        </span>
        <Button disabled={disabled} onClick={toggle}>{member.active ? "Desactivar" : "Activar"}</Button>
        {canManageUsers && (
          <Button disabled={disabled} onClick={() => setRoleModalOpen(true)}>Cambiar rol</Button>
        )}
      </div>
      {canManageUsers && isProfRole && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {unlinked && (
            <p className="text-xs font-medium text-amber-700">
              Este usuario profesional todavía no está vinculado a un profesional.
            </p>
          )}
          <Button disabled={disabled} onClick={() => setProfessionalModalOpen(true)}>
            {member.professional_id ? "Editar profesional asociado" : "Vincular profesional"}
          </Button>
        </div>
      )}
      {roleModalOpen && (
        <ChangeRoleModal
          isSelf={member.user_id === currentUserId}
          member={member}
          onClose={() => setRoleModalOpen(false)}
          onConfirm={(role) => {
            setRoleModalOpen(false);
            onChangeRole(member.id, role);
          }}
        />
      )}
      {professionalModalOpen && (
        <LinkProfessionalModal
          member={member}
          professionals={professionals}
          onClose={() => setProfessionalModalOpen(false)}
          onConfirm={(professionalId) => {
            setProfessionalModalOpen(false);
            onUpdateProfessional(member.id, professionalId);
          }}
        />
      )}
    </article>
  );
}

function LinkProfessionalModal({ member, professionals, onClose, onConfirm }: { member: ClinicMemberWithProfile; professionals: ProfessionalWithRelations[]; onClose: () => void; onConfirm: (professionalId: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<string>(member.professional_id ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-clinic-ink">Vincular profesional</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <div>
            <span className="text-clinic-muted">Usuario</span>
            <p className="font-medium text-clinic-ink">{member.profiles?.full_name ?? member.user_id}</p>
          </div>
          <div>
            <span className="text-clinic-muted">Rol</span>
            <p className="font-medium text-clinic-ink">{roleLabels[member.role] ?? member.role}</p>
          </div>
          <Select
            label="Profesional asociado"
            value={selectedId}
            onChange={setSelectedId}
            options={[
              { value: "", label: "Sin profesional asociado" },
              ...professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} ${p.last_name}` }))
            ]}
          />
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            disabled={selectedId === (member.professional_id ?? "")}
            onClick={() => onConfirm(selectedId || null)}
            variant="primary"
          >
            Guardar cambio
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChangeRoleModal({ isSelf, member, onClose, onConfirm }: { isSelf: boolean; member: ClinicMemberWithProfile; onClose: () => void; onConfirm: (role: "clinic_admin" | "admin" | "receptionist" | "professional") => void }) {
  const [role, setRole] = useState<"clinic_admin" | "admin" | "receptionist" | "professional">(
    (assignableRoles.includes(member.role as typeof assignableRoles[number]) ? member.role : "receptionist") as "clinic_admin" | "admin" | "receptionist" | "professional"
  );
  const wasAdmin = ADMIN_MEMBER_ROLES.includes(member.role);
  const staysAdmin = ADMIN_MEMBER_ROLES.includes(role);
  const blockedBySelfDemotion = isSelf && wasAdmin && !staysAdmin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-clinic-ink">Cambiar rol</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <div>
            <span className="text-clinic-muted">Usuario</span>
            <p className="font-medium text-clinic-ink">{member.profiles?.full_name ?? member.user_id}</p>
          </div>
          <div>
            <span className="text-clinic-muted">Rol actual</span>
            <p className="font-medium text-clinic-ink">{roleLabels[member.role] ?? member.role}</p>
          </div>
          <Select
            label="Nuevo rol"
            value={role}
            onChange={(value) => setRole(value as typeof role)}
            options={assignableRoles.map((item) => ({ value: item, label: roleLabels[item] }))}
          />
          {!wasAdmin && staysAdmin && (
            <Message tone="warning">Vas a otorgarle permisos administrativos completos a este usuario.</Message>
          )}
          {wasAdmin && !staysAdmin && !blockedBySelfDemotion && (
            <Message tone="warning">Vas a quitarle el rol administrativo a este usuario.</Message>
          )}
          {blockedBySelfDemotion && (
            <Message tone="error">No podés quitarte tu propio rol administrativo.</Message>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            disabled={blockedBySelfDemotion || role === member.role}
            onClick={() => onConfirm(role)}
            variant="primary"
          >
            Guardar cambio
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel({ clinic, disabled }: { clinic: Clinic; disabled: boolean }) {
  const [settings, setSettings] = useState<ClinicNotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getClinicNotificationSettings(clinic.id)
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar notificaciones."));
  }, [clinic.id]);

  async function update<K extends keyof ClinicNotificationSettings>(key: K, value: ClinicNotificationSettings[K]) {
    if (!settings) return;
    setSaving(true);
    setNotice("");
    setError("");
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      const saved = await updateClinicNotificationSettings(clinic.id, { [key]: value });
      setSettings(saved);
      setNotice("Configuración de notificaciones guardada.");
    } catch (err) {
      setSettings(previous);
      setError(err instanceof Error ? err.message : "No pudimos guardar notificaciones.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <SectionCard className="p-5 text-sm text-clinic-muted">Cargando notificaciones...</SectionCard>;
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <SectionCard className="p-5">
        <Header icon={<Mail size={20} />} title="Notificaciones automáticas" text="Eventos internos, email transaccional y preparación de WhatsApp futuro." />
        {notice && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mt-5 grid gap-3">
          <Toggle disabled={disabled || saving} label="Notificaciones internas en la plataforma" checked={settings.in_app_enabled} onChange={(checked) => update("in_app_enabled", checked)} />
          <Toggle disabled={disabled || saving} label="Preparar emails transaccionales" checked={settings.email_enabled} onChange={(checked) => update("email_enabled", checked)} />
          <Toggle disabled={disabled || saving} label="Preparar WhatsApp futuro" checked={settings.whatsapp_enabled} onChange={(checked) => update("whatsapp_enabled", checked)} />
          <Toggle disabled={disabled || saving} label="Recordatorio 24h antes" checked={settings.reminder_24h_enabled} onChange={(checked) => update("reminder_24h_enabled", checked)} />
          <Toggle disabled={disabled || saving} label="Recordatorio 2h antes" checked={settings.reminder_2h_enabled} onChange={(checked) => update("reminder_2h_enabled", checked)} />
          <Toggle disabled={disabled || saving} label="Avisar nueva reserva online" checked={settings.notify_new_booking} onChange={(checked) => update("notify_new_booking", checked)} />
          <Toggle disabled={disabled || saving} label="Avisar pago aprobado" checked={settings.notify_payment_approved} onChange={(checked) => update("notify_payment_approved", checked)} />
          <Toggle disabled={disabled || saving} label="Avisar solicitudes de reprogramación" checked={settings.notify_reschedule_requests} onChange={(checked) => update("notify_reschedule_requests", checked)} />
          <Toggle disabled={disabled || saving} label="Avisar solicitudes de cancelación" checked={settings.notify_cancellation_requests} onChange={(checked) => update("notify_cancellation_requests", checked)} />
          <Input label="WhatsApp de la clínica" value={settings.whatsapp_phone_number ?? ""} onChange={(value) => update("whatsapp_phone_number", value || null)} />
        </div>
      </SectionCard>
      <section className="grid gap-6">
        <PreparedPanel icon={<Mail size={20} />} title="Resend" text="Los emails transaccionales se enviarán cuando el dominio y RESEND_API_KEY estén configurados en el backend. Si falta la API key, la entrega queda marcada con error claro sin romper el flujo clínico." />
        <PreparedPanel icon={<Mail size={20} />} title="WhatsApp futuro" text="WhatsApp automático todavía no está activo. Esta configuración prepara la integración para la clínica." />
      </section>
    </section>
  );
}

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-clinic-line px-4 py-3">
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function PreparedPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <SectionCard className="p-5"><Header icon={icon} title={title} text={text} /></SectionCard>;
}

function Header({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">{icon}</span><div><h2 className="font-semibold text-clinic-ink">{title}</h2><p className="mt-1 text-sm text-clinic-muted">{text}</p></div></div>;
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span className="text-sm font-medium text-clinic-ink">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label><span className="text-sm font-medium text-clinic-ink">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Message({ children, tone }: { children: string; tone: "success" | "error" | "warning" }) {
  const colors = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-red-200 bg-red-50 text-red-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${colors[tone]}`}>{children}</div>;
}

function hashToTab(hash: string): SettingsTab | null {
  if (hash === "#horarios") return "hours";
  if (hash === "#branding") return "branding";
  if (hash === "#integraciones") return "integrations";
  return null;
}
