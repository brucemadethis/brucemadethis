import crypto from 'node:crypto';

const COOKIE_NAME = 'bmt_admin_session';
const VISITOR_COOKIE_NAME = 'bmt_visitor_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 30;
const VISITOR_REFRESH_COOKIE_NAME = 'bmt_visitor_refresh';

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(username, secret) {
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(cookie, secret) {
  if (!cookie) return null;
  const [payload, signature] = cookie.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, session) {
  res.cookie(COOKIE_NAME, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/'
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function setVisitorSessionCookie(res, session, refreshToken) {
  const accessToken = typeof session === 'string' ? session : session.access_token;
  const nextRefreshToken = refreshToken || (typeof session === 'object' ? session.refresh_token : null);
  const options = {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VISITOR_TTL_SECONDS * 1000,
    path: '/'
  };
  res.cookie(VISITOR_COOKIE_NAME, accessToken, {
    ...options,
    maxAge: (typeof session === 'object' && session.expires_in ? session.expires_in : VISITOR_TTL_SECONDS) * 1000
  });
  if (nextRefreshToken) res.cookie(VISITOR_REFRESH_COOKIE_NAME, nextRefreshToken, options);
}

export function getVisitorSessionToken(req) {
  return req.cookies[VISITOR_COOKIE_NAME] || null;
}

export function getVisitorRefreshToken(req) {
  return req.cookies[VISITOR_REFRESH_COOKIE_NAME] || null;
}

export function clearVisitorSessionCookie(res) {
  const options = {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
  res.clearCookie(VISITOR_COOKIE_NAME, options);
  res.clearCookie(VISITOR_REFRESH_COOKIE_NAME, options);
}

export function requireAdmin(config) {
  return (req, res, next) => {
    const session = readSession(req.cookies[COOKIE_NAME], config.SESSION_SECRET);
    if (!session) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' });
      return res.redirect('/admin/login');
    }
    req.admin = session;
    next();
  };
}
