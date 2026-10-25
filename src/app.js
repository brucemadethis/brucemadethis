import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { createEmailService, createNotifier } from './notifications.js';
import { createApiRouter } from './api.js';
import { validateEnquiry, normalizeExistingFormPayload } from './validation.js';
import { createSession, setSessionCookie, clearSessionCookie, requireAdmin } from './auth.js';
import { renderLogin, renderDashboard, renderDetail } from './admin-view.js';

const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'won', 'lost', 'archived']);

export function createApp(config, dependencies = {}) {
  const supabase = dependencies.supabase || createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const resend = dependencies.resend || new Resend(config.RESEND_API_KEY);
  const emailService = dependencies.emailService || createEmailService({ resend, config });
  const notifyNewEnquiry = dependencies.notifyNewEnquiry || createNotifier({ resend, config });
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '20kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const origin = req.get('origin');
    const isFrontendOrigin = origin === config.FRONTEND_URL;
    const isBackendOrigin = origin === config.BACKEND_URL;
    res.vary('Origin');
    if (isFrontendOrigin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'POST, GET, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      if (origin && !isFrontendOrigin && !isBackendOrigin) return res.status(403).end();
      return res.sendStatus(204);
    }
    if (origin && !isFrontendOrigin && !isBackendOrigin && !['GET', 'HEAD'].includes(req.method)) {
      return res.status(403).json({ success: false, message: 'Origin is not allowed.', error: 'Origin is not allowed.' });
    }
    next();
  });

  const enquiryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many enquiries. Please try again later.', error: 'Too many enquiries. Please try again later.' }) });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many sign-in attempts. Please try again later.', error: 'Too many sign-in attempts. Please try again later.' }) });
  const adminOnly = requireAdmin(config);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api', createApiRouter({ supabase, config, emailService }));

  app.post('/api/enquiries', enquiryLimiter, async (req, res, next) => {
    try {
      const validation = validateEnquiry(normalizeExistingFormPayload(req.body));
      if (!validation.success) return res.status(400).json({ error: 'Invalid enquiry data', fields: validation.errors });
      if (req.body.website) return res.status(400).json({ error: 'Invalid enquiry data' });

      const { data: duplicate, error: duplicateError } = await supabase
        .from('client_enquiries')
        .select('id')
        .eq('email', validation.data.email)
        .eq('message', validation.data.message)
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1);
      if (duplicateError) throw duplicateError;
      if (duplicate?.length) return res.status(409).json({ error: 'This enquiry was already received.' });

      const { data: enquiry, error } = await supabase.from('client_enquiries').insert({
        name: validation.data.name,
        email: validation.data.email,
        phone: validation.data.phone || null,
        business_name: validation.data.business_name || null,
        service: validation.data.service,
        budget: validation.data.budget || null,
        message: validation.data.message
      }).select().single();
      if (error) throw error;

      try {
        await notifyNewEnquiry(enquiry);
      } catch (notificationError) {
        console.error('Enquiry saved but notification failed:', notificationError);
        return res.status(503).json({ error: 'Your enquiry was saved, but notification delivery is temporarily unavailable.' });
      }
      return res.status(201).json({ id: enquiry.id, message: 'Enquiry received.' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/admin/login', (_req, res) => res.type('html').send(renderLogin()));
  app.post('/admin/login', authLimiter, (req, res) => {
    if (req.body.username !== config.ADMIN_USERNAME || req.body.password !== config.ADMIN_PASSWORD) return res.status(401).type('html').send(renderLogin('Invalid credentials.'));
    setSessionCookie(res, createSession(config.ADMIN_USERNAME, config.SESSION_SECRET));
    res.redirect('/admin');
  });
  app.post('/admin/logout', (req, res) => { clearSessionCookie(res); res.redirect('/admin/login'); });

  async function listEnquiries({ search, status }) {
    let query = supabase.from('client_enquiries').select('*').order('created_at', { ascending: false }).limit(200);
    if (status && ALLOWED_STATUSES.has(status)) query = query.eq('status', status);
    const safeSearch = typeof search === 'string' ? search.slice(0, 100).replace(/[%,()\\]/g, ' ') : '';
    if (safeSearch) query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,business_name.ilike.%${safeSearch}%`);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  app.get('/admin', adminOnly, async (req, res, next) => {
    try { res.type('html').send(renderDashboard(await listEnquiries(req.query), req.query)); } catch (error) { next(error); }
  });
  app.get('/admin/enquiries/:id', adminOnly, async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('client_enquiries').select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).send('Enquiry not found');
      res.type('html').send(renderDetail(data));
    } catch (error) { next(error); }
  });
  app.post('/admin/enquiries/:id/status', adminOnly, async (req, res, next) => {
    try {
      if (!ALLOWED_STATUSES.has(req.body.status)) return res.status(400).send('Invalid status');
      const { error } = await supabase.from('client_enquiries').update({ status: req.body.status }).eq('id', req.params.id);
      if (error) throw error;
      res.redirect(`/admin/enquiries/${req.params.id}`);
    } catch (error) { next(error); }
  });
  app.post('/admin/enquiries/:id/archive', adminOnly, async (req, res, next) => {
    try {
      const { error } = await supabase.from('client_enquiries').update({ status: 'archived' }).eq('id', req.params.id);
      if (error) throw error;
      res.redirect('/admin');
    } catch (error) { next(error); }
  });

  app.get('/api/admin/enquiries', adminOnly, async (req, res, next) => {
    try { res.json(await listEnquiries(req.query)); } catch (error) { next(error); }
  });
  app.get('/api/admin/enquiries/:id', adminOnly, async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('client_enquiries').select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Enquiry not found' });
      res.json(data);
    } catch (error) { next(error); }
  });
  app.patch('/api/admin/enquiries/:id', adminOnly, async (req, res, next) => {
    try {
      if (!ALLOWED_STATUSES.has(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
      const { data, error } = await supabase.from('client_enquiries').update({ status: req.body.status }).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (error) { next(error); }
  });
  app.delete('/api/admin/enquiries/:id', adminOnly, async (req, res, next) => {
    try {
      const { error } = await supabase.from('client_enquiries').update({ status: 'archived' }).eq('id', req.params.id);
      if (error) throw error;
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, message: 'API endpoint not found.', error: 'API endpoint not found.' });
    next();
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    const message = status === 400 ? 'The request could not be parsed.' : status === 413 ? 'The request is too large.' : 'Internal server error.';
    res.status(status).json({ success: false, message, error: message });
  });
  return app;
}
