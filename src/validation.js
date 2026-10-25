import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
const httpUrl = z.string().url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an http or https URL.');

const enquirySchema = z.object({
  name: text(100).min(2),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: text(40).optional().or(z.literal('')),
  business_name: text(150).optional().or(z.literal('')),
  service: text(120).min(2),
  budget: text(100).optional().or(z.literal('')),
  message: text(5000).min(10),
  website: z.string().max(0).optional().or(z.literal(''))
}).strict();

const authSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
  name: text(100).min(2).optional().or(z.literal('')),
  firstName: text(80).min(1).optional().or(z.literal('')),
  lastName: text(80).min(1).optional().or(z.literal('')),
  phone: text(40).optional().or(z.literal(''))
}).strict();

const contactSchema = z.object({
  name: text(100).min(2),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: text(40).optional().or(z.literal('')),
  subject: text(200).min(2),
  message: text(5000).min(10),
  website: z.string().max(0).optional().or(z.literal(''))
}).strict();

const profileSchema = z.object({
  firstName: text(80).min(1).optional(),
  lastName: text(80).min(1).optional(),
  phone: text(40).optional().or(z.literal(''))
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field.');

const clientInquirySchema = z.object({
  projectTitle: text(160).min(2),
  businessName: text(160).optional().or(z.literal('')),
  serviceType: text(120).min(2),
  projectDescription: text(5000).min(20),
  budget: text(120).optional().or(z.literal('')),
  deadline: z.string().date().optional().or(z.literal(''))
}).strict();

const messageSchema = z.object({ message: text(5000).min(1) }).strict();

const portfolioProjectSchema = z.object({
  title: text(160).min(2),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  description: text(10000).optional().or(z.literal('')),
  shortDescription: text(500).min(2),
  category: text(100).min(2),
  clientName: text(160).optional().or(z.literal('')),
  problem: text(5000).optional().or(z.literal('')),
  solution: text(5000).optional().or(z.literal('')),
  result: text(5000).optional().or(z.literal('')),
  technologies: z.array(text(60).min(1)).max(30).default([]),
  imageUrl: httpUrl.optional().or(z.literal('')),
  liveUrl: httpUrl.optional().or(z.literal('')),
  githubUrl: httpUrl.optional().or(z.literal('')),
  featured: z.boolean().default(false),
  published: z.boolean().default(false)
}).strict();

const newsletterSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  name: text(100).optional().or(z.literal(''))
}).strict();

function validate(schema, input) {
  const result = schema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: result.error.flatten().fieldErrors };
}

export function validateAuthCredentials(input, requireName = false) {
  const result = validate(authSchema, input);
  if (!result.success || (requireName && !result.data?.name && !(result.data?.firstName && result.data?.lastName))) {
    return {
      success: false,
      errors: result.success ? { name: ['Name is required'] } : result.errors
    };
  }
  if (requireName && result.data.name && !result.data.firstName) {
    const [firstName, ...lastName] = result.data.name.split(/\s+/);
    result.data.firstName = firstName;
    result.data.lastName = lastName.join(' ') || firstName;
  }
  return result;
}

export function validateEnquiry(input) {
  return validate(enquirySchema, input);
}

export function validateContact(input) {
  return validate(contactSchema, input);
}

export function validateProfile(input) {
  return validate(profileSchema, input);
}

export function validateClientInquiry(input) {
  return validate(clientInquirySchema, input);
}

export function validateMessage(input) {
  return validate(messageSchema, input);
}

export function validatePortfolioProject(input, partial = false) {
  const schema = partial
    ? portfolioProjectSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one project field.')
    : portfolioProjectSchema;
  return validate(schema, input);
}

export function validateNewsletter(input) {
  return validate(newsletterSchema, input);
}

export function normalizeExistingFormPayload(input = {}) {
  const features = typeof input.features === 'string' && input.features.trim()
    ? `\n\nAdditional requirements:\n${input.features.trim()}`
    : '';
  const goal = typeof input.goal === 'string' ? input.goal : input.message;

  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    business_name: input.business_name ?? input.company,
    service: input.service ?? input['project type'],
    budget: input.budget,
    message: typeof goal === 'string' ? `${goal.trim()}${features}` : goal,
    website: input.website
  };
}
