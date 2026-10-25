create extension if not exists pgcrypto;

create table if not exists public.client_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  business_name text,
  service text not null,
  budget text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'won', 'lost', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_enquiries_created_at_idx on public.client_enquiries (created_at desc);
create index if not exists client_enquiries_status_idx on public.client_enquiries (status);
create index if not exists client_enquiries_email_idx on public.client_enquiries (lower(email));

create or replace function public.set_client_enquiry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_enquiries_updated_at on public.client_enquiries;
create trigger client_enquiries_updated_at
before update on public.client_enquiries
for each row execute function public.set_client_enquiry_updated_at();

alter table public.client_enquiries enable row level security;
alter table public.client_enquiries force row level security;

drop policy if exists "Public cannot read client enquiries" on public.client_enquiries;
drop policy if exists "Public cannot insert client enquiries" on public.client_enquiries;
drop policy if exists "Public cannot update client enquiries" on public.client_enquiries;
drop policy if exists "Public cannot delete client enquiries" on public.client_enquiries;

create policy "Public cannot read client enquiries"
on public.client_enquiries for select to anon, authenticated using (false);
create policy "Public cannot insert client enquiries"
on public.client_enquiries for insert to anon, authenticated with check (false);
create policy "Public cannot update client enquiries"
on public.client_enquiries for update to anon, authenticated using (false) with check (false);
create policy "Public cannot delete client enquiries"
on public.client_enquiries for delete to anon, authenticated using (false);

-- The backend uses the server-only service role for controlled admin operations.
-- Future payments, invoices, and projects can reference client_enquiries.id without
-- putting payment-provider credentials or business workflows in the public client.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  phone text,
  role text not null default 'CLIENT' check (role in ('ADMIN', 'CLIENT')),
  email_verified boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx on public.users (lower(email));
create index if not exists users_role_created_idx on public.users (role, created_at desc);

create table if not exists public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_tokens_user_idx on public.email_verification_tokens (user_id);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx on public.password_reset_tokens (user_id);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  status text not null default 'NEW' check (status in ('NEW', 'READ', 'REPLIED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);
create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_email_idx on public.contact_messages (lower(email));

create table if not exists public.client_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.users(id) on delete cascade,
  project_title text not null,
  business_name text,
  service_type text not null,
  project_description text not null,
  budget text,
  deadline date,
  status text not null default 'NEW' check (status in ('NEW', 'REVIEWING', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_inquiries_client_created_idx on public.client_inquiries (client_id, created_at desc);
create index if not exists client_inquiries_status_idx on public.client_inquiries (status, created_at desc);

create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.users(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists client_messages_client_created_idx on public.client_messages (client_id, created_at desc);
create index if not exists client_messages_unread_idx on public.client_messages (client_id, read) where read = false;

create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  short_description text not null,
  category text not null,
  client_name text,
  problem text,
  solution text,
  result text,
  technologies text[] not null default '{}',
  image_url text,
  live_url text,
  github_url text,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_projects_public_idx on public.portfolio_projects (published, featured desc, created_at desc);
create index if not exists portfolio_projects_category_idx on public.portfolio_projects (category);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text,
  subscribed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['users', 'contact_messages', 'client_inquiries', 'portfolio_projects', 'newsletter_subscribers']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end;
$$;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  full_name text;
  first_name_value text;
  last_name_value text;
begin
  full_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  first_name_value := coalesce(new.raw_user_meta_data ->> 'first_name', split_part(full_name, ' ', 1), '');
  last_name_value := coalesce(new.raw_user_meta_data ->> 'last_name', nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), ''), '');

  insert into public.users (id, first_name, last_name, email, email_verified)
  values (new.id, first_name_value, last_name_value, lower(new.email), new.email_confirmed_at is not null)
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    email_verified = excluded.email_verified;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user_profile();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users', 'email_verification_tokens', 'password_reset_tokens', 'contact_messages',
    'client_inquiries', 'client_messages', 'portfolio_projects', 'newsletter_subscribers'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

-- No anon/authenticated policies are granted. The API uses a server-only service role
-- and enforces user ownership and admin roles before every data operation.
