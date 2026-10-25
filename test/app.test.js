import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createSession } from '../src/auth.js';

const config = {
  NODE_ENV: 'test', PORT: 8787, PUBLIC_ORIGIN: 'http://localhost:5500', FRONTEND_URL: 'http://localhost:5500', BACKEND_URL: 'http://localhost:8787', ADMIN_EMAIL: 'bruce@example.com',
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-key',
  RESEND_API_KEY: 're_test_key', NOTIFICATION_FROM: 'Bruce <notify@example.com>', BUSINESS_EMAIL: 'bruce@example.com',
  ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'a-very-long-test-password', SESSION_SECRET: 'a'.repeat(32)
};

function makeSupabase() {
  const inserted = [];
  const records = new Map();
  const authUsers = new Map();
  const from = (table) => {
    const state = { action: 'select', filters: [] };
    const tableRecords = records.get(table) || [];
    records.set(table, tableRecords);
    const matches = (row) => state.filters.every(([operator, field, value]) => {
      if (operator === 'eq') return row[field] === value;
      if (operator === 'neq') return row[field] !== value;
      if (operator === 'gte') return row[field] >= value;
      if (operator === 'gt') return row[field] > value;
      return true;
    });
    const execute = (single = false) => {
      let rows = tableRecords.filter(matches);
      if (state.action === 'insert') {
        const values = Array.isArray(state.values) ? state.values : [state.values];
        rows = values.map((value, index) => ({ id: `${table}-${tableRecords.length + index + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: 'new', ...value }));
        tableRecords.push(...rows);
        inserted.push(...rows);
      } else if (state.action === 'upsert') {
        const values = Array.isArray(state.values) ? state.values : [state.values];
        rows = values.map((value) => {
          const match = tableRecords.find((record) => record[state.conflict || 'id'] === value[state.conflict || 'id']);
          if (match) return Object.assign(match, value);
          const record = { id: `${table}-${tableRecords.length + 1}`, ...value };
          tableRecords.push(record);
          inserted.push(record);
          return record;
        });
      } else if (state.action === 'update') {
        rows.forEach((row) => Object.assign(row, state.values));
      } else if (state.action === 'delete') {
        const deleted = rows;
        for (const row of deleted) tableRecords.splice(tableRecords.indexOf(row), 1);
        rows = deleted;
      }
      if (state.limit !== undefined) rows = rows.slice(0, state.limit);
      if (single) return rows[0] ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } };
      return { data: rows, error: null };
    };
    const query = {
      select() { return query; },
      insert(values) { state.action = 'insert'; state.values = values; return query; },
      upsert(values, options = {}) { state.action = 'upsert'; state.values = values; state.conflict = options.onConflict; return query; },
      update(values) { state.update = values; return query; },
      delete() { state.action = 'delete'; return query; },
      eq(field, value) { state.filters.push(['eq', field, value]); return query; },
      neq(field, value) { state.filters.push(['neq', field, value]); return query; },
      gt(field, value) { state.filters.push(['gt', field, value]); return query; },
      gte(field, value) { state.filters.push(['gte', field, value]); return query; },
      or(value) { state.search = value; return query; },
      order() { return query; },
      limit(value) { state.limit = value; return query; },
      single() { return Promise.resolve(execute(true)); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
    };
    query.update = (values) => { state.action = 'update'; state.values = values; return query; };
    return query;
  };
  return {
    client: {
      from,
      auth: {
        async signUp({ email, options }) { return { data: { user: { id: 'user-id', email, user_metadata: options.data }, session: { access_token: 'signup-token' } }, error: null }; },
        async signInWithPassword({ email }) { return { data: { user: { id: 'user-id', email, email_confirmed_at: new Date().toISOString() }, session: { access_token: 'login-token', refresh_token: 'refresh-token', expires_in: 3600 } }, error: null }; },
        async getUser(token) { return token ? { data: { user: authUsers.get('user-id') || { id: 'user-id', email: 'visitor@example.com', email_confirmed_at: new Date().toISOString() } }, error: null } : { data: { user: null }, error: new Error('Missing token') }; },
        async refreshSession() { return { data: { session: { access_token: 'refreshed-token', refresh_token: 'refresh-token', expires_in: 3600 }, user: authUsers.get('user-id') }, error: null }; },
        admin: {
          async createUser({ email, user_metadata }) {
            const user = { id: 'user-id', email, user_metadata, email_confirmed_at: null };
            authUsers.set(user.id, user);
            return { data: { user }, error: null };
          },
          async updateUserById(id, updates) {
            const user = authUsers.get(id) || { id, email: 'visitor@example.com', user_metadata: {} };
            Object.assign(user, updates, updates.email_confirm ? { email_confirmed_at: new Date().toISOString() } : {});
            authUsers.set(id, user);
            return { data: { user }, error: null };
          },
          async deleteUser(id) { authUsers.delete(id); return { error: null }; },
          async signOut() { return { error: null }; }
        }
      }
    },
    inserted,
    records,
    authUsers
  };
}

function makeEmailService(overrides = {}) {
  return {
    sendVerification: async () => {},
    sendPasswordReset: async () => {},
    notifyContact: async () => {},
    confirmContact: async () => {},
    notifyNewInquiry: async () => {},
    notifyNewClientMessage: async () => {},
    notifyAdminClientMessage: async () => {},
    notifyInquiryStatus: async () => {},
    ...overrides
  };
}

function makeApp(supabase, emailService = makeEmailService()) {
  return createApp(config, { supabase: supabase.client, emailService, notifyNewEnquiry: async () => {} });
}

async function request(app, path, options = {}) {
  const server = app.listen(0);
  const address = server.address();
  try { return await fetch(`http://127.0.0.1:${address.port}${path}`, options); } finally { server.close(); }
}

test('rejects spam honeypot submissions', async () => {
  const supabase = makeSupabase();
  const app = createApp(config, { supabase: supabase.client, notifyNewEnquiry: async () => {} });
  const response = await request(app, '/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ website: 'bot', name: 'Bot', email: 'bot@example.com', service: 'Website', message: 'This is enough text.' }) });
  assert.equal(response.status, 400);
  assert.equal(supabase.inserted.length, 0);
});

test('saves valid enquiry and sends notification', async () => {
  const supabase = makeSupabase();
  let notified = false;
  const app = createApp(config, { supabase: supabase.client, notifyNewEnquiry: async () => { notified = true; } });
  const response = await request(app, '/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bruce', email: 'bruce@example.com', service: 'Business website', message: 'I need a new website for my business.' }) });
  assert.equal(response.status, 201);
  assert.equal(notified, true);
  assert.equal(supabase.inserted.length, 1);
});

test('protects admin API without a session', async () => {
  const app = createApp(config, { supabase: makeSupabase().client, notifyNewEnquiry: async () => {} });
  const response = await request(app, '/api/admin/enquiries');
  assert.equal(response.status, 401);
});

test('keeps the existing environment-session admin enquiry API available', async () => {
  const app = createApp(config, { supabase: makeSupabase().client, notifyNewEnquiry: async () => {} });
  const session = createSession(config.ADMIN_USERNAME, config.SESSION_SECRET);
  const response = await request(app, '/api/admin/enquiries', { headers: { cookie: `bmt_admin_session=${session}` } });
  assert.equal(response.status, 200);
});

test('creates a client profile and requires email verification before sign-in', async () => {
  const supabase = makeSupabase();
  let verificationLink = '';
  const app = createApp(config, { supabase: supabase.client, notifyNewEnquiry: async () => {}, emailService: { sendVerification: async (_user, url) => { verificationLink = url; } } });
  const response = await request(app, '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Visitor', email: 'VISITOR@example.com', password: 'strong-password' }) });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('set-cookie'), null);
  const body = await response.json();
  assert.equal(body.user.email, 'visitor@example.com');
  assert.equal(body.requiresEmailConfirmation, true);
  assert.equal(JSON.stringify(body).includes('password'), false);
  assert.equal(supabase.inserted.some((row) => row.role === 'CLIENT'), true);
  assert.match(verificationLink, /^http:\/\/localhost:8787\/api\/auth\/verify-email\?token=/);
  assert.equal(supabase.inserted.some((row) => row.token_hash && row.token_hash !== new URL(verificationLink).searchParams.get('token')), true);
});

test('rejects invalid visitor credentials before calling auth provider', async () => {
  let called = false;
  const supabase = makeSupabase();
  supabase.client.auth.signInWithPassword = async () => { called = true; return {}; };
  const app = createApp(config, { supabase: supabase.client, notifyNewEnquiry: async () => {} });
  const response = await request(app, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad-email', password: 'short' }) });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test('verifies an email with a one-time hashed token', async () => {
  const supabase = makeSupabase();
  const app = makeApp(supabase);
  const token = 'v'.repeat(48);
  supabase.records.set('email_verification_tokens', [{ id: 'verification-id', user_id: 'user-id', token_hash: createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + 60_000).toISOString() }]);
  supabase.records.set('users', [{ id: 'user-id', role: 'CLIENT', email_verified: false }]);
  const response = await request(app, '/api/auth/verify-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(response.status, 200);
  assert.equal(supabase.authUsers.get('user-id').email_confirm, true);
  assert.equal(supabase.records.get('users')[0].email_verified, true);
  assert.equal(supabase.records.get('email_verification_tokens').length, 0);
});

test('redirects browser verification links to the configured frontend origin', async () => {
  const supabase = makeSupabase();
  const app = createApp({ ...config, FRONTEND_URL: 'https://site.example.com/' }, { supabase: supabase.client, emailService: makeEmailService() });
  const response = await request(app, '/api/auth/verify-email?token=invalid');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://site.example.com/auth.html?verified=0');
});

test('forgot-password response does not disclose whether the email exists', async () => {
  const supabase = makeSupabase();
  const app = makeApp(supabase);
  const post = (email) => request(app, '/api/auth/forgot-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
  const known = await post('visitor@example.com');
  const unknown = await post('missing@example.com');
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal((await known.json()).message, (await unknown.json()).message);
});

test('accepts public contact messages and stores them before notifying', async () => {
  const supabase = makeSupabase();
  let notified = false;
  const app = makeApp(supabase, makeEmailService({ notifyContact: async () => { notified = true; } }));
  const response = await request(app, '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Amina Studio', email: 'AMINA@example.com', subject: 'New website', message: 'I would like to discuss a new business website.' }) });
  assert.equal(response.status, 201);
  assert.equal(supabase.records.get('contact_messages')[0].email, 'amina@example.com');
  assert.equal(notified, true);
});

test('blocks unauthenticated clients and CLIENT access to admin endpoints', async () => {
  const supabase = makeSupabase();
  const app = makeApp(supabase);
  const unauthenticated = await request(app, '/api/client/dashboard');
  const clientAdmin = await request(app, '/api/admin/projects', { headers: { cookie: 'bmt_visitor_session=client-token' } });
  assert.equal(unauthenticated.status, 401);
  assert.equal(clientAdmin.status, 403);
});

test('clients can only read their own inquiries', async () => {
  const supabase = makeSupabase();
  supabase.records.set('client_inquiries', [{ id: 'another-clients-inquiry', client_id: 'other-client', project_title: 'Private project' }]);
  const app = makeApp(supabase);
  const response = await request(app, '/api/client/inquiries/another-clients-inquiry', { headers: { cookie: 'bmt_visitor_session=client-token' } });
  assert.equal(response.status, 404);
});

test('only ADMIN role can create portfolio projects', async () => {
  const supabase = makeSupabase();
  supabase.records.set('users', [{ id: 'user-id', email: 'admin@example.com', first_name: 'Site', last_name: 'Admin', role: 'ADMIN', email_verified: true }]);
  supabase.authUsers.set('user-id', { id: 'user-id', email: 'admin@example.com', email_confirmed_at: new Date().toISOString() });
  const app = makeApp(supabase);
  const project = { title: 'Portfolio Site', slug: 'portfolio-site', shortDescription: 'A portfolio project', category: 'Web design' };
  const response = await request(app, '/api/admin/projects', { method: 'POST', headers: { cookie: 'bmt_visitor_session=admin-token', 'content-type': 'application/json' }, body: JSON.stringify(project) });
  assert.equal(response.status, 201);
  assert.equal(supabase.records.get('portfolio_projects')[0].published, false);
});

test('login sets HTTP-only auth cookies and returns no password data', async () => {
  const supabase = makeSupabase();
  const app = makeApp(supabase);
  const response = await request(app, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'visitor@example.com', password: 'strong-password' }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /bmt_visitor_session=login-token/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes('password'), false);
});

test('logout clears visitor session cookies', async () => {
  const response = await request(makeApp(makeSupabase()), '/api/auth/logout', { method: 'POST', headers: { cookie: 'bmt_visitor_session=old-token; bmt_visitor_refresh=old-refresh' } });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /bmt_visitor_session=.*Expires=Thu, 01 Jan 1970/);
  assert.match(response.headers.get('set-cookie'), /bmt_visitor_refresh=.*Expires=Thu, 01 Jan 1970/);
});

test('password reset updates the account and consumes its token', async () => {
  const supabase = makeSupabase();
  const profile = { id: 'user-id', email: 'visitor@example.com', first_name: 'Site', last_name: 'Visitor', role: 'CLIENT', email_verified: true };
  supabase.records.set('users', [profile]);
  let resetUrl = '';
  const app = makeApp(supabase, makeEmailService({ sendPasswordReset: async (_user, url) => { resetUrl = url; } }));
  const forgot = await request(app, '/api/auth/forgot-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: profile.email }) });
  assert.equal(forgot.status, 200);
  const token = new URL(resetUrl).searchParams.get('token');
  const reset = await request(app, '/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'new-strong-password' }) });
  assert.equal(reset.status, 200);
  assert.equal(supabase.authUsers.get('user-id').password, 'new-strong-password');
  assert.equal(supabase.records.get('password_reset_tokens').length, 0);
});

test('clients can create inquiries that are tied to their own account', async () => {
  const supabase = makeSupabase();
  const app = makeApp(supabase);
  const response = await request(app, '/api/client/inquiries', {
    method: 'POST',
    headers: { cookie: 'bmt_visitor_session=client-token', 'content-type': 'application/json' },
    body: JSON.stringify({ projectTitle: 'New website', businessName: 'Visitor Studio', serviceType: 'Business website', projectDescription: 'A clear website that helps my studio get new client enquiries.' })
  });
  assert.equal(response.status, 201);
  assert.equal(supabase.records.get('client_inquiries')[0].client_id, 'user-id');
});

test('client messages are stored for the owner and notify the administrator', async () => {
  const supabase = makeSupabase();
  let notified = false;
  const app = makeApp(supabase, makeEmailService({ notifyAdminClientMessage: async () => { notified = true; } }));
  const response = await request(app, '/api/client/messages', {
    method: 'POST',
    headers: { cookie: 'bmt_visitor_session=client-token', 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Could you share the next steps for my project?' })
  });
  assert.equal(response.status, 201);
  assert.equal(supabase.records.get('client_messages')[0].client_id, 'user-id');
  assert.equal(supabase.records.get('client_messages')[0].sender_id, 'user-id');
  assert.equal(notified, true);
});

test('public portfolio API returns published projects only', async () => {
  const supabase = makeSupabase();
  supabase.records.set('portfolio_projects', [
    { id: 'published-project', slug: 'public', title: 'Public project', published: true },
    { id: 'draft-project', slug: 'draft', title: 'Draft project', published: false }
  ]);
  const response = await request(makeApp(supabase), '/api/projects');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].slug, 'public');
});
