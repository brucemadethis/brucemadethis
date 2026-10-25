import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExistingFormPayload,
  validateAuthCredentials,
  validateClientInquiry,
  validateContact,
  validateEnquiry,
  validatePortfolioProject
} from '../src/validation.js';

test('normalizes the existing form payload into the API contract', () => {
  const result = validateEnquiry(normalizeExistingFormPayload({
    name: 'Bruce', email: 'BRUCE@example.com', company: 'BMT', 'project type': 'E-commerce store',
    goal: 'Sell products online', features: 'Payments and bookings', budget: 'KSh 100,000–250,000'
  }));
  assert.equal(result.success, true);
  assert.equal(result.data.email, 'bruce@example.com');
  assert.match(result.data.message, /Payments and bookings/);
});

test('rejects missing or malformed enquiry data', () => {
  const result = validateEnquiry({ name: 'A', email: 'bad', service: '', message: 'short' });
  assert.equal(result.success, false);
  assert.ok(result.errors.email);
  assert.ok(result.errors.message);
});

test('normalizes visitor auth credentials and requires a name for signup', () => {
  const result = validateAuthCredentials({ name: 'Visitor', email: 'VISITOR@example.com', password: 'strong-password' }, true);
  assert.equal(result.success, true);
  assert.equal(result.data.email, 'visitor@example.com');
  assert.equal(validateAuthCredentials({ email: 'visitor@example.com', password: 'strong-password' }, true).success, false);
});

test('validates and normalizes visitor contact messages', () => {
  const result = validateContact({ name: 'Amina Studio', email: 'AMINA@example.com', subject: 'Website enquiry', message: 'I would like to talk about a website project.' });
  assert.equal(result.success, true);
  assert.equal(result.data.email, 'amina@example.com');
  assert.equal(validateContact({ name: 'Bot', email: 'bot@example.com', subject: 'Spam', message: 'This should be rejected.', website: 'filled' }).success, false);
});

test('validates inquiry deadlines and rejects unsafe portfolio URLs', () => {
  assert.equal(validateClientInquiry({ projectTitle: 'Studio site', serviceType: 'Business website', projectDescription: 'A public site that generates new client leads.', deadline: '2027-02-28' }).success, true);
  const project = validatePortfolioProject({ title: 'Test site', slug: 'test-site', shortDescription: 'A test project', category: 'Web design', liveUrl: 'javascript:alert(1)' });
  assert.equal(project.success, false);
});
