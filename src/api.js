import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  clearVisitorSessionCookie,
  getVisitorRefreshToken,
  getVisitorSessionToken,
  setVisitorSessionCookie
} from './auth.js';
import {
  validateAuthCredentials,
  validateClientInquiry,
  validateContact,
  validateMessage,
  validateNewsletter,
  validatePortfolioProject,
  validateProfile
} from './validation.js';

const CLIENT_INQUIRY_STATUSES = new Set(['NEW', 'REVIEWING', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
const CONTACT_STATUSES = new Set(['NEW', 'READ', 'REPLIED', 'ARCHIVED']);
const PROFILE_FIELDS = 'id,first_name,last_name,email,phone,role,email_verified,last_login_at,created_at,updated_at';

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const sendSuccess = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
const sendFailure = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, error: message, ...extra });
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createToken = () => crypto.randomBytes(32).toString('base64url');

function safeUser(user, profile) {
  const firstName = profile.first_name || '';
  const lastName = profile.last_name || '';
  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    phone: profile.phone || null,
    role: profile.role || 'CLIENT',
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at || profile.email_verified),
    user_metadata: { full_name: [firstName, lastName].filter(Boolean).join(' ') }
  };
}

function resetPage(token, notice = '') {
  const safeToken = String(token || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const safeNotice = String(notice).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset password | BruceMadeThis</title><body><main><h1>Choose a new password</h1>${safeNotice ? `<p role="status">${safeNotice}</p>` : ''}<form method="post" action="/api/auth/reset-password"><input type="hidden" name="token" value="${safeToken}"><label for="password">New password</label><input id="password" name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required><button type="submit">Update password</button></form></main></body></html>`;
}

function profileFromAuthUser(user) {
  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || '';
  return {
    id: user.id,
    first_name: metadata.first_name || fullName.split(/\s+/)[0] || '',
    last_name: metadata.last_name || fullName.split(/\s+/).slice(1).join(' '),
    email: user.email,
    phone: metadata.phone || null,
    role: 'CLIENT',
    email_verified: Boolean(user.email_confirmed_at || user.confirmed_at)
  };
}

function projectToDatabase(project) {
  const nullableFields = new Set(['clientName', 'problem', 'solution', 'result', 'imageUrl', 'liveUrl', 'githubUrl']);
  const fields = {
    title: 'title',
    slug: 'slug',
    description: 'description',
    shortDescription: 'short_description',
    category: 'category',
    clientName: 'client_name',
    problem: 'problem',
    solution: 'solution',
    result: 'result',
    technologies: 'technologies',
    imageUrl: 'image_url',
    liveUrl: 'live_url',
    githubUrl: 'github_url',
    featured: 'featured',
    published: 'published'
  };
  return Object.fromEntries(Object.entries(fields)
    .filter(([key]) => Object.hasOwn(project, key))
    .map(([key, column]) => [column, project[key] === '' && nullableFields.has(key) ? null : project[key]]));
}

export function createApiRouter({ supabase, config, emailService }) {
  const router = Router();
  const adminRouter = Router();
  const limiter = (windowMs, limit, message) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendFailure(res, 429, message)
  });
  const publicLimiter = limiter(15 * 60 * 1000, 5, 'Too many requests. Please try again later.');
  const authLimiter = limiter(15 * 60 * 1000, 10, 'Too many authentication requests. Please try again later.');
  const loginLimiter = limiter(15 * 60 * 1000, 8, 'Too many sign-in attempts. Please try again later.');
  const clientActionLimiter = limiter(60 * 60 * 1000, 20, 'Too many client submissions. Please try again later.');

  async function loadAuth(req, res) {
    let token = getVisitorSessionToken(req);
    let user = null;
    if (token) {
      const result = await supabase.auth.getUser(token);
      if (!result.error) user = result.data?.user || null;
    }
    if (!user) {
      const refreshToken = getVisitorRefreshToken(req);
      if (refreshToken && supabase.auth.refreshSession) {
        const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (!refreshed.error && refreshed.data?.session?.access_token) {
          setVisitorSessionCookie(res, refreshed.data.session);
          token = refreshed.data.session.access_token;
          user = refreshed.data.user || null;
        }
      }
    }
    if (!user) return null;

    const { data, error } = await supabase.from('users').select(PROFILE_FIELDS).eq('id', user.id).single();
    if (error && error.code !== 'PGRST116') throw error;
    const profile = data || profileFromAuthUser(user);
    req.auth = { user, profile, token };
    return req.auth;
  }

  function requireRole(role) {
    return asyncRoute(async (req, res, next) => {
      const auth = await loadAuth(req, res);
      if (!auth) return sendFailure(res, 401, 'Authentication required.');
      if (!auth.profile.email_verified && !(auth.user.email_confirmed_at || auth.user.confirmed_at)) {
        return sendFailure(res, 403, 'Verify your email address before continuing.');
      }
      if (auth.profile.role !== role) return sendFailure(res, 403, 'You do not have permission to access this resource.');
      next();
    });
  }

  const requireClient = requireRole('CLIENT');
  const requireAdmin = requireRole('ADMIN');

  async function issueOneTimeToken(table, userId, ttlMs) {
    const token = createToken();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const { error: deleteError } = await supabase.from(table).delete().eq('user_id', userId);
    if (deleteError) throw deleteError;
    const { error } = await supabase.from(table).insert({ user_id: userId, token_hash: tokenHash(token), expires_at: expiresAt });
    if (error) throw error;
    return token;
  }

  async function sendVerification(user) {
    const token = await issueOneTimeToken('email_verification_tokens', user.id, 24 * 60 * 60 * 1000);
    const url = new URL('/api/auth/verify-email', config.BACKEND_URL);
    url.searchParams.set('token', token);
    await emailService.sendVerification(user, url.toString());
  }

  router.post(['/auth/register', '/auth/signup'], authLimiter, asyncRoute(async (req, res) => {
    const validation = validateAuthCredentials(req.body, true);
    if (!validation.success) return sendFailure(res, 400, 'Check your account details.', { fields: validation.errors });
    const { email, password, firstName, lastName, phone } = validation.data;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { first_name: firstName, last_name: lastName, phone: phone || null, full_name: fullName }
    });
    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message || '');
      return sendFailure(res, duplicate ? 409 : 400, duplicate ? 'An account with that email already exists.' : 'Unable to create your account.');
    }
    const user = data.user;
    const profile = { ...profileFromAuthUser(user), first_name: firstName, last_name: lastName, phone: phone || null };
    const { error: profileError } = await supabase.from('users').upsert(profile, { onConflict: 'id' });
    if (profileError) {
      await supabase.auth.admin.deleteUser(user.id);
      throw profileError;
    }
    try {
      await sendVerification({ ...profile, email });
    } catch (emailError) {
      console.error('Account created but verification email could not be sent:', emailError);
    }
    const publicUser = safeUser(user, profile);
    const message = 'Account created. Check your email to verify your address.';
    return res.status(201).json({ success: true, data: { user: publicUser, requiresEmailConfirmation: true }, user: publicUser, requiresEmailConfirmation: true, message });
  }));

  router.post('/auth/login', loginLimiter, asyncRoute(async (req, res) => {
    const validation = validateAuthCredentials(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Enter a valid email and password.', { fields: validation.errors });
    const { data, error } = await supabase.auth.signInWithPassword(validation.data);
    if (error || !data.session || !data.user) return sendFailure(res, 401, 'That email or password is not correct.');
    const { data: profileData, error: profileError } = await supabase.from('users').select(PROFILE_FIELDS).eq('id', data.user.id).single();
    if (profileError && profileError.code !== 'PGRST116') throw profileError;
    const profile = profileData || profileFromAuthUser(data.user);
    if (!data.user.email_confirmed_at && !data.user.confirmed_at && !profile.email_verified) {
      return sendFailure(res, 403, 'Verify your email address before signing in.');
    }
    const { error: updateError } = await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id);
    if (updateError) throw updateError;
    setVisitorSessionCookie(res, data.session);
    const user = safeUser(data.user, profile);
    return res.json({ success: true, data: { user }, user, message: 'Signed in.' });
  }));

  router.get('/auth/me', asyncRoute(async (req, res) => {
    const auth = await loadAuth(req, res);
    if (!auth) return sendFailure(res, 401, 'Not signed in.');
    const user = safeUser(auth.user, auth.profile);
    return res.json({ success: true, data: { user }, user });
  }));

  router.post('/auth/logout', asyncRoute(async (req, res) => {
    const token = getVisitorSessionToken(req);
    if (token && supabase.auth.admin?.signOut) {
      const { error } = await supabase.auth.admin.signOut(token, 'local');
      if (error) console.error('Could not revoke visitor session:', error);
    }
    clearVisitorSessionCookie(res);
    return res.status(204).end();
  }));

  const verifyEmailHandler = asyncRoute(async (req, res) => {
    const token = req.method === 'GET' ? req.query.token : req.body.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
      if (req.method === 'GET') return res.redirect(new URL('/auth.html?verified=0', config.FRONTEND_URL).toString());
      return sendFailure(res, 400, 'Verification link is invalid or expired.');
    }
    const { data: storedToken, error } = await supabase.from('email_verification_tokens')
      .select('id,user_id').eq('token_hash', tokenHash(token)).gt('expires_at', new Date().toISOString()).single();
    if (error || !storedToken) {
      if (req.method === 'GET') return res.redirect(new URL('/auth.html?verified=0', config.FRONTEND_URL).toString());
      return sendFailure(res, 400, 'Verification link is invalid or expired.');
    }
    const { error: verifyError } = await supabase.auth.admin.updateUserById(storedToken.user_id, { email_confirm: true });
    if (verifyError) throw verifyError;
    const { error: profileError } = await supabase.from('users').update({ email_verified: true }).eq('id', storedToken.user_id);
    if (profileError) throw profileError;
    const { error: deleteError } = await supabase.from('email_verification_tokens').delete().eq('id', storedToken.id);
    if (deleteError) throw deleteError;
    if (req.method === 'GET') return res.redirect(new URL('/auth.html?verified=1', config.FRONTEND_URL).toString());
    return sendSuccess(res, { verified: true }, 200, { message: 'Email verified.' });
  });
  router.get('/auth/verify-email', verifyEmailHandler);
  router.post('/auth/verify-email', verifyEmailHandler);

  router.post('/auth/resend-verification', authLimiter, asyncRoute(async (req, res) => {
    const parsed = z.string().email().max(254).safeParse(String(req.body.email || '').trim().toLowerCase());
    if (!parsed.success) return sendFailure(res, 400, 'Enter a valid email address.');
    const { data: profile, error } = await supabase.from('users').select(PROFILE_FIELDS).eq('email', parsed.data).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (profile && !profile.email_verified) {
      try { await sendVerification(profile); } catch (emailError) { console.error('Verification email could not be resent:', emailError); }
    }
    return sendSuccess(res, {}, 200, { message: 'If an unverified account exists for that address, a verification email has been sent.' });
  }));

  router.post('/auth/forgot-password', authLimiter, asyncRoute(async (req, res) => {
    const parsed = z.string().email().max(254).safeParse(String(req.body.email || '').trim().toLowerCase());
    if (!parsed.success) return sendFailure(res, 400, 'Enter a valid email address.');
    const { data: profile, error } = await supabase.from('users').select(PROFILE_FIELDS).eq('email', parsed.data).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (profile) {
      try {
        const token = await issueOneTimeToken('password_reset_tokens', profile.id, 60 * 60 * 1000);
        const url = new URL('/api/auth/reset-password', config.BACKEND_URL);
        url.searchParams.set('token', token);
        await emailService.sendPasswordReset(profile, url.toString());
      } catch (emailError) {
        console.error('Password reset email could not be sent:', emailError);
      }
    }
    return sendSuccess(res, {}, 200, { message: 'If an account exists for that address, password reset instructions have been sent.' });
  }));

  router.get('/auth/reset-password', (req, res) => res.type('html').send(resetPage(req.query.token)));
  router.post('/auth/reset-password', authLimiter, asyncRoute(async (req, res) => {
    const token = req.body.token;
    const password = req.body.password;
    if (typeof token !== 'string' || token.length < 32 || token.length > 200 || typeof password !== 'string' || password.length < 8 || password.length > 72) {
      if (req.is('application/x-www-form-urlencoded')) return res.status(400).type('html').send(resetPage(token, 'The link or password is invalid.'));
      return sendFailure(res, 400, 'The reset link or password is invalid.');
    }
    const { data: storedToken, error } = await supabase.from('password_reset_tokens')
      .select('id,user_id').eq('token_hash', tokenHash(token)).gt('expires_at', new Date().toISOString()).single();
    if (error || !storedToken) {
      if (req.is('application/x-www-form-urlencoded')) return res.status(400).type('html').send(resetPage('', 'This reset link is invalid or expired.'));
      return sendFailure(res, 400, 'This reset link is invalid or expired.');
    }
    const { error: passwordError } = await supabase.auth.admin.updateUserById(storedToken.user_id, { password });
    if (passwordError) throw passwordError;
    const { error: deleteError } = await supabase.from('password_reset_tokens').delete().eq('user_id', storedToken.user_id);
    if (deleteError) throw deleteError;
    if (req.is('application/x-www-form-urlencoded')) return res.type('html').send(resetPage('', 'Your password has been updated. You can close this page and sign in.'));
    return sendSuccess(res, { passwordUpdated: true }, 200, { message: 'Password updated.' });
  }));

  router.post('/contact', publicLimiter, asyncRoute(async (req, res) => {
    const validation = validateContact(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Check your message details.', { fields: validation.errors });
    if (validation.data.website) return sendFailure(res, 400, 'Invalid message submission.');
    const message = validation.data;
    const { data, error } = await supabase.from('contact_messages').insert({
      name: message.name,
      email: message.email,
      phone: message.phone || null,
      subject: message.subject,
      message: message.message
    }).select('id').single();
    if (error) throw error;
    try {
      await emailService.notifyContact(message);
      await emailService.confirmContact(message);
    } catch (emailError) {
      console.error('Contact message saved but an email could not be sent:', emailError);
    }
    return sendSuccess(res, { id: data.id }, 201, { message: 'Message received.' });
  }));

  router.post('/newsletter', publicLimiter, asyncRoute(async (req, res) => {
    const validation = validateNewsletter(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Enter a valid email address.', { fields: validation.errors });
    const { email, name } = validation.data;
    const { error } = await supabase.from('newsletter_subscribers').upsert({ email, name: name || null, subscribed: true }, { onConflict: 'email' });
    if (error) throw error;
    return sendSuccess(res, {}, 201, { message: 'You are subscribed.' });
  }));

  router.get('/projects', asyncRoute(async (req, res) => {
    let query = supabase.from('portfolio_projects').select('*').eq('published', true).order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    if (typeof req.query.category === 'string' && req.query.category.length <= 100) query = query.eq('category', req.query.category);
    if (req.query.featured === 'true') query = query.eq('featured', true);
    const { data, error } = await query;
    if (error) throw error;
    return sendSuccess(res, data || []);
  }));

  router.get('/projects/:slug', asyncRoute(async (req, res) => {
    const { data, error } = await supabase.from('portfolio_projects').select('*').eq('slug', req.params.slug).eq('published', true).single();
    if (error || !data) return sendFailure(res, 404, 'Project not found.');
    return sendSuccess(res, data);
  }));

  router.get('/client/dashboard', requireClient, asyncRoute(async (req, res) => {
    const clientId = req.auth.user.id;
    const [inquiriesResult, messagesResult] = await Promise.all([
      supabase.from('client_inquiries').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100),
      supabase.from('client_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100)
    ]);
    if (inquiriesResult.error) throw inquiriesResult.error;
    if (messagesResult.error) throw messagesResult.error;
    const messages = messagesResult.data || [];
    const unreadMessageCount = messages.filter((message) => message.sender_id !== clientId && !message.read).length;
    return sendSuccess(res, { profile: safeUser(req.auth.user, req.auth.profile), inquiries: inquiriesResult.data || [], messages, unreadMessageCount });
  }));

  router.patch('/client/profile', requireClient, asyncRoute(async (req, res) => {
    const validation = validateProfile(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Check the profile details.', { fields: validation.errors });
    const fields = { firstName: 'first_name', lastName: 'last_name', phone: 'phone' };
    const update = Object.fromEntries(Object.entries(fields).filter(([key]) => Object.hasOwn(validation.data, key)).map(([key, column]) => [column, validation.data[key] || null]));
    const { data, error } = await supabase.from('users').update(update).eq('id', req.auth.user.id).select(PROFILE_FIELDS).single();
    if (error) throw error;
    return sendSuccess(res, safeUser(req.auth.user, data));
  }));

  router.post('/client/inquiries', requireClient, clientActionLimiter, asyncRoute(async (req, res) => {
    const validation = validateClientInquiry(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Check the project inquiry details.', { fields: validation.errors });
    const inquiry = validation.data;
    const { data, error } = await supabase.from('client_inquiries').insert({
      client_id: req.auth.user.id,
      project_title: inquiry.projectTitle,
      business_name: inquiry.businessName || null,
      service_type: inquiry.serviceType,
      project_description: inquiry.projectDescription,
      budget: inquiry.budget || null,
      deadline: inquiry.deadline || null
    }).select().single();
    if (error) throw error;
    try { await emailService.notifyNewInquiry(req.auth.profile, data); } catch (emailError) { console.error('Inquiry saved but notification failed:', emailError); }
    return sendSuccess(res, data, 201, { message: 'Project inquiry submitted.' });
  }));

  router.get('/client/inquiries', requireClient, asyncRoute(async (req, res) => {
    const { data, error } = await supabase.from('client_inquiries').select('*').eq('client_id', req.auth.user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return sendSuccess(res, data || []);
  }));

  router.get('/client/inquiries/:id', requireClient, asyncRoute(async (req, res) => {
    const { data, error } = await supabase.from('client_inquiries').select('*').eq('id', req.params.id).eq('client_id', req.auth.user.id).single();
    if (error || !data) return sendFailure(res, 404, 'Inquiry not found.');
    return sendSuccess(res, data);
  }));

  router.get('/client/messages', requireClient, asyncRoute(async (req, res) => {
    const clientId = req.auth.user.id;
    const { data, error } = await supabase.from('client_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return sendSuccess(res, data || []);
  }));

  router.patch('/client/messages/:id/read', requireClient, asyncRoute(async (req, res) => {
    const { data, error } = await supabase.from('client_messages').update({ read: true })
      .eq('id', req.params.id)
      .eq('client_id', req.auth.user.id)
      .neq('sender_id', req.auth.user.id)
      .select().single();
    if (error || !data) return sendFailure(res, 404, 'Message not found.');
    return sendSuccess(res, data);
  }));

  router.post('/client/messages', requireClient, clientActionLimiter, asyncRoute(async (req, res) => {
    const validation = validateMessage(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Enter a message.', { fields: validation.errors });
    const { data, error } = await supabase.from('client_messages').insert({
      client_id: req.auth.user.id,
      sender_id: req.auth.user.id,
      message: validation.data.message
    }).select().single();
    if (error) throw error;
    try { await emailService.notifyAdminClientMessage(req.auth.profile, data.message); } catch (emailError) { console.error('Message saved but administrator notification failed:', emailError); }
    return sendSuccess(res, data, 201, { message: 'Message sent.' });
  }));

  adminRouter.use(['/messages', '/clients', '/inquiries', '/projects'], requireAdmin);

  adminRouter.get('/messages', asyncRoute(async (req, res) => {
    let query = supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (typeof req.query.status === 'string' && CONTACT_STATUSES.has(req.query.status)) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    return sendSuccess(res, data || []);
  }));

  adminRouter.get('/messages/:id', asyncRoute(async (req, res) => {
    const { data, error } = await supabase.from('contact_messages').select('*').eq('id', req.params.id).single();
    if (error || !data) return sendFailure(res, 404, 'Message not found.');
    return sendSuccess(res, data);
  }));

  adminRouter.patch('/messages/:id', asyncRoute(async (req, res) => {
    if (!CONTACT_STATUSES.has(req.body.status)) return sendFailure(res, 400, 'Invalid contact status.');
    const { data, error } = await supabase.from('contact_messages').update({ status: req.body.status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    return sendSuccess(res, data);
  }));

  adminRouter.delete('/messages/:id', asyncRoute(async (req, res) => {
    const { error } = await supabase.from('contact_messages').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.status(204).end();
  }));

  adminRouter.get('/clients', asyncRoute(async (_req, res) => {
    const { data, error } = await supabase.from('users').select(PROFILE_FIELDS).eq('role', 'CLIENT').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return sendSuccess(res, (data || []).map((profile) => ({
      id: profile.id, firstName: profile.first_name, lastName: profile.last_name,
      email: profile.email, phone: profile.phone, emailVerified: profile.email_verified,
      createdAt: profile.created_at, lastLoginAt: profile.last_login_at
    })));
  }));

  adminRouter.get('/clients/:id', asyncRoute(async (req, res) => {
    const { data: profile, error } = await supabase.from('users').select(PROFILE_FIELDS).eq('id', req.params.id).eq('role', 'CLIENT').single();
    if (error || !profile) return sendFailure(res, 404, 'Client not found.');
    const [inquiries, messages] = await Promise.all([
      supabase.from('client_inquiries').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('client_messages').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }).limit(100)
    ]);
    if (inquiries.error) throw inquiries.error;
    if (messages.error) throw messages.error;
    return sendSuccess(res, { client: safeUser({ id: profile.id, email: profile.email }, profile), inquiries: inquiries.data || [], messages: messages.data || [] });
  }));

  adminRouter.get('/inquiries', asyncRoute(async (req, res) => {
    let query = supabase.from('client_inquiries').select('*').order('created_at', { ascending: false }).limit(200);
    if (typeof req.query.status === 'string' && CLIENT_INQUIRY_STATUSES.has(req.query.status)) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    return sendSuccess(res, data || []);
  }));

  adminRouter.get('/inquiries/:id', asyncRoute(async (req, res) => {
    const { data, error } = await supabase.from('client_inquiries').select('*').eq('id', req.params.id).single();
    if (error || !data) return sendFailure(res, 404, 'Inquiry not found.');
    return sendSuccess(res, data);
  }));

  adminRouter.patch('/inquiries/:id', asyncRoute(async (req, res) => {
    if (!CLIENT_INQUIRY_STATUSES.has(req.body.status)) return sendFailure(res, 400, 'Invalid inquiry status.');
    const { data, error } = await supabase.from('client_inquiries').update({ status: req.body.status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    const { data: client, error: clientError } = await supabase.from('users').select(PROFILE_FIELDS).eq('id', data.client_id).single();
    if (!clientError && client) {
      try { await emailService.notifyInquiryStatus(client, data); } catch (emailError) { console.error('Inquiry status updated but notification failed:', emailError); }
    }
    return sendSuccess(res, data);
  }));

  adminRouter.post('/clients/:id/messages', asyncRoute(async (req, res) => {
    const validation = validateMessage(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Enter a message.', { fields: validation.errors });
    const { data: client, error: clientError } = await supabase.from('users').select(PROFILE_FIELDS).eq('id', req.params.id).eq('role', 'CLIENT').single();
    if (clientError || !client) return sendFailure(res, 404, 'Client not found.');
    const { data, error } = await supabase.from('client_messages').insert({
      client_id: client.id,
      sender_id: req.auth.user.id,
      message: validation.data.message
    }).select().single();
    if (error) throw error;
    try { await emailService.notifyNewClientMessage(client, req.auth.profile, data.message); } catch (emailError) { console.error('Message saved but notification failed:', emailError); }
    return sendSuccess(res, data, 201, { message: 'Message sent.' });
  }));

  adminRouter.post('/projects', asyncRoute(async (req, res) => {
    const validation = validatePortfolioProject(req.body);
    if (!validation.success) return sendFailure(res, 400, 'Check the project details.', { fields: validation.errors });
    const { data, error } = await supabase.from('portfolio_projects').insert(projectToDatabase(validation.data)).select().single();
    if (error?.code === '23505') return sendFailure(res, 409, 'A project with that slug already exists.');
    if (error) throw error;
    return sendSuccess(res, data, 201);
  }));

  adminRouter.patch('/projects/:id', asyncRoute(async (req, res) => {
    const validation = validatePortfolioProject(req.body, true);
    if (!validation.success) return sendFailure(res, 400, 'Check the project details.', { fields: validation.errors });
    const { data, error } = await supabase.from('portfolio_projects').update(projectToDatabase(validation.data)).eq('id', req.params.id).select().single();
    if (error?.code === '23505') return sendFailure(res, 409, 'A project with that slug already exists.');
    if (error?.code === 'PGRST116' || !data) return sendFailure(res, 404, 'Project not found.');
    if (error) throw error;
    return sendSuccess(res, data);
  }));

  adminRouter.delete('/projects/:id', asyncRoute(async (req, res) => {
    const { error } = await supabase.from('portfolio_projects').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.status(204).end();
  }));

  router.use('/admin', adminRouter);
  return router;
}