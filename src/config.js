import 'dotenv/config';
import { z } from 'zod';

const originUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol)
    && url.pathname === '/'
    && !url.search
    && !url.hash
    && !url.username
    && !url.password;
}, 'Use an http or https origin without a path, query, or fragment.')
  .transform((value) => new URL(value).origin);
const rejectPlaceholder = (value) => !/(^your-|^replace-with|re_your_api_key|your-project\.supabase\.co|your-verified-domain\.com|example\.com)/i.test(value);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  PUBLIC_ORIGIN: originUrl.default('http://localhost:5500'),
  FRONTEND_URL: originUrl.optional(),
  BACKEND_URL: originUrl.optional(),
  SUPABASE_URL: z.string().url().refine(rejectPlaceholder, 'Replace the example project URL with your Supabase project URL.'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).refine(rejectPlaceholder, 'Replace the placeholder with the server-only Supabase service_role key.'),
  RESEND_API_KEY: z.string().min(10).refine(rejectPlaceholder, 'Replace the placeholder with your Resend API key.'),
  NOTIFICATION_FROM: z.string().min(3).refine(rejectPlaceholder, 'Replace the example sender with a verified email identity.'),
  BUSINESS_EMAIL: z.string().email(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_USERNAME: z.string().min(3),
  ADMIN_PASSWORD: z.string().min(12).refine(rejectPlaceholder, 'Replace the placeholder with a unique admin password.'),
  SESSION_SECRET: z.string().min(32).refine(rejectPlaceholder, 'Replace the placeholder with a random secret of at least 32 characters.')
}).superRefine((config, context) => {
  if (config.NODE_ENV !== 'production') return;
  for (const key of ['FRONTEND_URL', 'BACKEND_URL']) {
    const value = config[key];
    if (!value) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'This origin is required in production.' });
    } else if (!value.startsWith('https://')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use HTTPS in production.' });
    }
  }
  for (const key of ['BUSINESS_EMAIL', 'ADMIN_EMAIL']) {
    const value = config[key];
    if (value && /example\.com$/i.test(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Replace the example email address in production.' });
    }
  }
});

export function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const frontendOrigin = result.data.FRONTEND_URL || result.data.PUBLIC_ORIGIN;
  return {
    ...result.data,
    PUBLIC_ORIGIN: result.data.PUBLIC_ORIGIN,
    FRONTEND_URL: frontendOrigin,
    BACKEND_URL: result.data.BACKEND_URL || `http://localhost:${result.data.PORT}`,
    ADMIN_EMAIL: result.data.ADMIN_EMAIL || result.data.BUSINESS_EMAIL
  };
}
