import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const validEnvironment = {
  NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'https://site.example.com/',
  FRONTEND_URL: 'https://site.example.com/',
  BACKEND_URL: 'https://api.example.com/',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-long-enough',
  RESEND_API_KEY: 're_test_key_long_enough',
  NOTIFICATION_FROM: 'Bruce <notifications@site.test>',
  BUSINESS_EMAIL: 'bruce@site.test',
  ADMIN_USERNAME: 'administrator',
  ADMIN_PASSWORD: 'test-password-long-enough',
  SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters'
};

test('normalizes configured frontend and backend origins', () => {
  const config = loadConfig(validEnvironment);
  assert.equal(config.PUBLIC_ORIGIN, 'https://site.example.com');
  assert.equal(config.FRONTEND_URL, 'https://site.example.com');
  assert.equal(config.BACKEND_URL, 'https://api.example.com');
});

test('rejects frontend and backend URLs that include a path', () => {
  assert.throws(() => loadConfig({ ...validEnvironment, FRONTEND_URL: 'https://site.example.com/account' }), /Invalid environment configuration/);
  assert.throws(() => loadConfig({ ...validEnvironment, BACKEND_URL: 'https://api.example.com/api' }), /Invalid environment configuration/);
});

test('requires explicit HTTPS frontend and backend origins in production', () => {
  assert.throws(() => loadConfig({ ...validEnvironment, NODE_ENV: 'production', FRONTEND_URL: undefined, BACKEND_URL: undefined }), /Invalid environment configuration/);
  assert.throws(() => loadConfig({ ...validEnvironment, NODE_ENV: 'production', FRONTEND_URL: 'http://site.example.com', BACKEND_URL: 'https://api.example.com' }), /Invalid environment configuration/);
  assert.doesNotThrow(() => loadConfig({
    ...validEnvironment,
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://site.example.com',
    BACKEND_URL: 'https://api.example.com',
    BUSINESS_EMAIL: 'bruce@site.com',
    NOTIFICATION_FROM: 'Bruce <notifications@site.com>'
  }));
});

test('rejects unedited credential placeholders', () => {
  assert.throws(() => loadConfig({ ...validEnvironment, SUPABASE_URL: 'https://your-project.supabase.co' }), /Invalid environment configuration/);
  assert.throws(() => loadConfig({ ...validEnvironment, RESEND_API_KEY: 're_your_api_key' }), /Invalid environment configuration/);
});
