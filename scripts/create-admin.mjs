import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_FULL_NAME ?? "Admin Medin";
const clinicSlug = process.env.CLINIC_SLUG ?? "clinica-central";
const adminRole = process.env.ADMIN_ROLE ?? "platform_admin";

if (!supabaseUrl || !serviceRoleKey || !adminEmail || !adminPassword) {
  console.error(
    [
      "Missing required environment variables.",
      "Set SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL and ADMIN_PASSWORD."
    ].join("\n")
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function upsertAdminUser() {
  let user = await findUserByEmail(adminEmail);

  if (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        role: adminRole
      }
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: adminName,
        role: adminRole
      }
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: user.id,
      full_name: adminName,
      role: adminRole
    },
    { onConflict: "id" }
  );
  if (profileError) throw profileError;

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from("clinics")
    .select("id, name, slug")
    .eq("slug", clinicSlug)
    .maybeSingle();
  if (clinicError) throw clinicError;

  if (clinic) {
    const { error: memberError } = await supabaseAdmin.from("clinic_members").upsert(
      {
        clinic_id: clinic.id,
        user_id: user.id,
        role: adminRole,
        active: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "clinic_id,user_id" }
    );
    if (memberError) throw memberError;
  }

  console.log(`Admin ready: ${adminEmail}`);
  console.log(`Role: ${adminRole}`);
  console.log(clinic ? `Clinic: ${clinic.name} (${clinic.slug})` : `Clinic not found for slug: ${clinicSlug}`);
}

upsertAdminUser().catch((error) => {
  console.error("Failed to create admin user");
  console.error(error);
  process.exit(1);
});
