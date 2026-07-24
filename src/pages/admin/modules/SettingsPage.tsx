import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, CalendarClock, Mail, MapPin, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useAuth } from "../../../contexts/AuthContext";
import {
  cancelUserInvitation,
  createLocation,
  createUserInvitation,
  deleteClinicMember,
  getClinicHours,
  getClinicMembers,
  getDefaultClinic,
  getLocations,
  getProfessionals,
  getUserInvitations,
  updateClinic,
  updateClinicMember,
  updateLocation,
  upsertClinicHour
} from "../../../lib/clinic-data";
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

export type SettingsTab =
  | "clinic"
  | "locations"
  | "hours"
  | "users"
  | "notifications"
  | "payments"
  | "booking"
  | "branding"
  | "fiscal"
  | "integrations"
  | "delivery_log";

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
  { id: "integrations", label: "Integraciones", to: "/admin/configuracion#integraciones" },
  { id: "delivery_log", label: "Registro de envíos", to: "/admin/notificaciones" }
];

export function SettingsTabsNav({ activeTab }: { activeTab: SettingsTab }) {
  return (
    <SectionCard className="p-3">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            to={tab.to}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${
              activeTab === tab.id ? "bg-teal-50 text-clinic-brand" : "text-clinic-muted hover:bg-clinic-surface"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

const roles: UserRole[] = ["platform_admin", "clinic_admin", "receptionist", "professional"];
const roleLabels: Record<string, string> = {
  platform_admin: "Platform admin",
  clinic_admin: "Admin clinica",
  receptionist: "Recepcion",
  professional: "Profesional"
};

const invitationStatusLabels: Record<string, string> = {
  pending: "Esperando respuesta",
  accepted: "Aceptada"
};

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
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [hours, setHours] = useState<ClinicHours[]>([]);
  const [members, setMembers] = useState<ClinicMemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const permissions = useMemo(() => ({
    manageClinic: canManageClinic(role),
    manageUsers: canManageUsers(role)
  }), [role]);

  async function load() {
    // Only show the full-page loading state on the very first load. On
    // refetches after a save (invite, edit, cancel, toggle), keep the
    // current content visible and just swap it in place once it resolves -
    // otherwise every small action makes the whole tab flash blank.
    if (!clinic) setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) return;
      const [loadedLocations, loadedHours, loadedMembers, loadedInvitations, professionalResult] = await Promise.all([
        getLocations(loadedClinic.id),
        getClinicHours(loadedClinic.id).catch(() => []),
        getClinicMembers(loadedClinic.id).catch(() => []),
        getUserInvitations(loadedClinic.id).catch(() => []),
        getProfessionals(loadedClinic.id)
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
    load();
  }, []);

  useEffect(() => {
    const next = hashToTab(hash);
    if (next) setActiveTab(next);
  }, [hash]);

  async function saveClinic(data: ClinicInput) {
    if (!clinic || !permissions.manageClinic) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateClinic(clinic.id, data);
      setClinic(updated);
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
    setInviteLink("");
    try {
      const invitation = await createUserInvitation({
        clinic_id: clinic.id,
        invited_by: user?.id ?? null,
        ...data
      });
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        // El envio de mail automatico todavia no funciona en produccion
        // (no hay backend de Resend conectado) - este fetch queda como
        // best-effort y no bloquea el flujo. Por eso mostramos el link
        // abajo para que el admin lo comparta a mano mientras tanto.
        fetch("/api/messages/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({
            clinicId: clinic.id,
            recipients: [{ email: data.email }],
            subject: "Te invitaron a Medin",
            text: `Hola ${data.full_name}, te invitaron a Medin como ${roleLabels[data.role] ?? data.role}. Ingresá acá: ${window.location.origin}/invitacion/${invitation.invitation_token}`,
            template: "user_invitation",
            related_entity_type: "user_invitation",
            related_entity_id: invitation.id
          })
        }).catch(() => undefined);
      }
      if (invitation.invitation_token) {
        setInviteLink(`${window.location.origin}/invitacion/${invitation.invitation_token}`);
      }
      setNotice("Invitacion registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos invitar al usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelInvitation(id: string) {
    if (!permissions.manageUsers) return;
    setSaving(true);
    try {
      await cancelUserInvitation(id);
      setNotice("Invitacion cancelada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cancelar la invitacion.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMember(id: string, name: string) {
    if (role !== "platform_admin") return;
    if (!window.confirm(`Vas a borrar a ${name} de esta clínica. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setSaving(true);
    try {
      await deleteClinicMember(id);
      setNotice("Usuario borrado de la clínica.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos borrar el usuario.");
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

      <SettingsTabsNav activeTab={activeTab} />

      {loading ? (
        <SectionCard className="p-8 text-center text-clinic-muted">Cargando configuracion...</SectionCard>
      ) : !clinic ? (
        <Message tone="error">No encontramos la clinica principal.</Message>
      ) : (
        <>
          {activeTab === "clinic" && <ClinicForm clinic={clinic} disabled={!permissions.manageClinic || saving} onSave={saveClinic} />}
          {activeTab === "locations" && <LocationsPanel clinic={clinic} disabled={!permissions.manageClinic || saving} locations={locations} onSave={saveLocation} />}
          {activeTab === "hours" && <HoursPanel disabled={!permissions.manageClinic || saving} hours={hours} clinicId={clinic.id} onSave={saveHour} />}
          {activeTab === "users" && (
            <UsersPanel
              currentRole={role}
              disabled={!permissions.manageUsers || saving}
              inviteLink={inviteLink}
              invitations={invitations}
              locations={locations}
              members={members}
              onCancelInvitation={cancelInvitation}
              onDeleteMember={deleteMember}
              onDismissInviteLink={() => setInviteLink("")}
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

function UsersPanel({
  currentRole,
  disabled,
  inviteLink,
  invitations,
  locations,
  members,
  onCancelInvitation,
  onDeleteMember,
  onDismissInviteLink,
  onInvite,
  onRefresh,
  professionals
}: {
  currentRole: UserRole | null;
  disabled: boolean;
  inviteLink: string;
  invitations: UserInvitation[];
  locations: Location[];
  members: ClinicMemberWithProfile[];
  onCancelInvitation: (id: string) => void;
  onDeleteMember: (id: string, name: string) => void;
  onDismissInviteLink: () => void;
  onInvite: (data: { email: string; full_name: string; role: string; location_id?: string | null; professional_id?: string | null }) => void;
  onRefresh: () => void;
  professionals: ProfessionalWithRelations[];
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "receptionist", location_id: "", professional_id: "" });
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const historyInvitations = invitations.filter((invitation) => invitation.status !== "pending");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onInvite({ ...form, location_id: form.location_id || null, professional_id: form.professional_id || null });
    setForm({ email: "", full_name: "", role: "receptionist", location_id: "", professional_id: "" });
    setShowInviteForm(false);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard className="p-5">
        <Header icon={<ShieldCheck size={20} />} title="Invitar usuario" text="Registra la invitacion. El envio de mail automatico todavia no esta activo - compartí el link vos mismo." />
        {inviteLink && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Invitación creada. Compartí este link:</p>
            <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 text-xs text-clinic-ink">{inviteLink}</p>
            <div className="mt-3 flex gap-2">
              <Button onClick={copyLink} variant="primary">{copied ? "¡Copiado!" : "Copiar link"}</Button>
              <Button onClick={onDismissInviteLink}>Cerrar</Button>
            </div>
          </div>
        )}
        {showInviteForm ? (
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <Input label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required />
            <Input label="Nombre" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} required />
            <Select label="Rol" value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={roles.map((item) => ({ value: item, label: roleLabels[item] }))} />
            <Select label="Sede opcional" value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })} options={[{ value: "", label: "Sin sede asignada" }, ...locations.map((item) => ({ value: item.id, label: item.name }))]} />
            <Select label="Profesional asociado" value={form.professional_id} onChange={(value) => setForm({ ...form, professional_id: value })} options={[{ value: "", label: "Sin profesional" }, ...professionals.map((item) => ({ value: item.id, label: `${item.name} ${item.last_name}` }))]} />
            <div className="flex gap-2">
              <Button disabled={disabled} type="submit" variant="primary">Enviar invitacion</Button>
              <Button type="button" onClick={() => setShowInviteForm(false)}>Cancelar</Button>
            </div>
          </form>
        ) : (
          <div className="mt-5">
            <Button disabled={disabled} onClick={() => setShowInviteForm(true)} variant="primary">Invitar usuario</Button>
          </div>
        )}
      </SectionCard>
      <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold">Usuarios y permisos</h2>
          <div className="flex gap-2">
            {historyInvitations.length > 0 && (
              <Button onClick={() => setShowHistory((current) => !current)}>
                {showHistory ? "Ocultar historial" : `Historial (${historyInvitations.length})`}
              </Button>
            )}
            <Button onClick={onRefresh}>Actualizar</Button>
          </div>
        </div>
        <div className="divide-y divide-clinic-line">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              canDelete={currentRole === "platform_admin"}
              disabled={disabled}
              locations={locations}
              member={member}
              onDelete={onDeleteMember}
              onRefresh={onRefresh}
              professionals={professionals}
            />
          ))}
          {pendingInvitations.map((invitation) => (
            <article key={invitation.id} className="grid gap-3 bg-amber-50/40 px-5 py-4 md:grid-cols-[1fr_130px_120px_110px] md:items-center">
              <div><p className="font-semibold">{invitation.full_name}</p><p className="text-sm text-clinic-muted">{invitation.email}</p></div>
              <span className="text-sm font-medium">{roleLabels[invitation.role] ?? invitation.role}</span>
              <span className="rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-amber-700">{invitationStatusLabels[invitation.status] ?? invitation.status}</span>
              <Button
                aria-label="Cancelar invitacion"
                className="justify-self-start text-red-500 hover:bg-red-50 hover:text-red-600"
                disabled={disabled}
                onClick={() => onCancelInvitation(invitation.id)}
                title="Cancelar invitacion"
              >
                <X size={16} />
              </Button>
            </article>
          ))}
          {showHistory && historyInvitations.map((invitation) => (
            <article key={invitation.id} className="grid gap-3 bg-slate-50 px-5 py-4 md:grid-cols-[1fr_130px_120px] md:items-center">
              <div><p className="font-semibold">{invitation.full_name}</p><p className="text-sm text-clinic-muted">{invitation.email}</p></div>
              <span className="text-sm font-medium">{roleLabels[invitation.role] ?? invitation.role}</span>
              <span className="rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-clinic-muted">{invitationStatusLabels[invitation.status] ?? invitation.status}</span>
            </article>
          ))}
        </div>
      </SectionCard>
    </section>
  );
}

function MemberRow({
  canDelete,
  disabled,
  locations,
  member,
  onDelete,
  onRefresh,
  professionals
}: {
  canDelete: boolean;
  disabled: boolean;
  locations: Location[];
  member: ClinicMemberWithProfile;
  onDelete: (id: string, name: string) => void;
  onRefresh: () => void;
  professionals: ProfessionalWithRelations[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    role: member.role,
    location_id: member.location_id ?? "",
    professional_id: member.professional_id ?? ""
  });

  async function toggle() {
    await updateClinicMember(member.id, { active: !member.active });
    onRefresh();
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await updateClinicMember(member.id, {
        role: form.role,
        location_id: form.location_id || null,
        professional_id: form.professional_id || null
      });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <article className="grid gap-3 px-5 py-4">
        <p className="font-semibold text-clinic-ink">{member.profiles?.full_name ?? member.user_id}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Select label="Rol" value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={roles.map((item) => ({ value: item, label: roleLabels[item] }))} />
          <Select label="Sede" value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })} options={[{ value: "", label: "Sin sede asignada" }, ...locations.map((item) => ({ value: item.id, label: item.name }))]} />
          <Select label="Profesional asociado" value={form.professional_id} onChange={(value) => setForm({ ...form, professional_id: value })} options={[{ value: "", label: "Sin profesional" }, ...professionals.map((item) => ({ value: item.id, label: `${item.name} ${item.last_name}` }))]} />
        </div>
        <div className="flex gap-2">
          <Button disabled={disabled || saving} onClick={saveEdit} variant="primary">{saving ? "Guardando..." : "Guardar cambios"}</Button>
          <Button disabled={saving} onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      </article>
    );
  }

  const memberName = member.profiles?.full_name ?? member.user_id;

  return (
    <article className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_140px_100px_100px_100px] md:items-center">
      <div>
        <p className="font-semibold text-clinic-ink">{memberName}</p>
        <p className="text-sm text-clinic-muted">{member.locations?.name ?? "Sin sede"} · {member.professionals ? `${member.professionals.name} ${member.professionals.last_name}` : "Sin profesional asociado"}</p>
      </div>
      <span className="text-sm font-medium">{roleLabels[member.role] ?? member.role}</span>
      <Button disabled={disabled} onClick={() => setEditing(true)}>Editar</Button>
      <Button disabled={disabled} onClick={toggle}>{member.active ? "Desactivar" : "Activar"}</Button>
      {canDelete && (
        <Button
          aria-label="Borrar usuario"
          className="justify-self-start text-red-500 hover:bg-red-50 hover:text-red-600"
          disabled={disabled}
          onClick={() => onDelete(member.id, memberName)}
          title="Borrar usuario"
        >
          <X size={16} />
        </Button>
      )}
    </article>
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
