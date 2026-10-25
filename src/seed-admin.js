import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config.js';

const config = loadConfig();
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const email = config.ADMIN_EMAIL.toLowerCase();
const { data: userList, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

let adminUser = userList.users.find((user) => user.email?.toLowerCase() === email);
if (!adminUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: config.ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Bruce', last_name: 'Admin', full_name: 'Bruce Admin' }
  });
  if (error) throw error;
  adminUser = data.user;
} else if (!adminUser.email_confirmed_at && !adminUser.confirmed_at) {
  const { data, error } = await supabase.auth.admin.updateUserById(adminUser.id, { email_confirm: true });
  if (error) throw error;
  adminUser = data.user;
}

const fullName = adminUser.user_metadata?.full_name || 'Bruce Admin';
const [firstName, ...lastName] = fullName.split(/\s+/);
const { error: profileError } = await supabase.from('users').upsert({
  id: adminUser.id,
  first_name: adminUser.user_metadata?.first_name || firstName,
  last_name: adminUser.user_metadata?.last_name || lastName.join(' '),
  email,
  phone: adminUser.user_metadata?.phone || null,
  role: 'ADMIN',
  email_verified: true
}, { onConflict: 'id' });
if (profileError) throw profileError;

console.log(`Admin role provisioned for ${email}. The existing password was not changed.`);