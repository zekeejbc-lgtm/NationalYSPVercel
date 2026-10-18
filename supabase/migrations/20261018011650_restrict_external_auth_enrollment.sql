begin;

create schema if not exists ysp_auth;
revoke all on schema ysp_auth from public, anon, authenticated;
grant usage on schema ysp_auth to supabase_auth_admin;

create table ysp_auth.google_enrollments (
  email text primary key check (email = lower(btrim(email))),
  account_type text not null check (account_type in ('admin', 'chapter', 'barangay')),
  account_id varchar not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (account_type, account_id)
);
alter table ysp_auth.google_enrollments enable row level security;
revoke all on ysp_auth.google_enrollments from public, anon, authenticated;
grant select, delete on ysp_auth.google_enrollments to supabase_auth_admin;
create policy google_enrollment_hook_read on ysp_auth.google_enrollments
  for select to supabase_auth_admin using (true);
create policy google_enrollment_hook_consume on ysp_auth.google_enrollments
  for delete to supabase_auth_admin using (true);

-- The hook runs as Supabase's internal Auth role, never as an API caller.
grant select (id) on public.admin_users to supabase_auth_admin;
grant select (id, is_active) on public.chapter_users, public.barangay_users to supabase_auth_admin;
create policy google_enrollment_account_read on public.admin_users
  for select to supabase_auth_admin using (true);
create policy google_enrollment_account_read on public.chapter_users
  for select to supabase_auth_admin using (true);
create policy google_enrollment_account_read on public.barangay_users
  for select to supabase_auth_admin using (true);
grant select on public.external_auth_identities to supabase_auth_admin;
grant insert (account_type, account_id, provider, provider_subject, email)
  on public.external_auth_identities to supabase_auth_admin;
create policy google_enrollment_identity_read on public.external_auth_identities
  for select to supabase_auth_admin using (true);
create policy google_enrollment_identity_insert on public.external_auth_identities
  for insert to supabase_auth_admin with check (true);

create function public.ysp_before_user_created(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_email text := lower(btrim(event -> 'user' ->> 'email'));
  requested_subject text := event -> 'user' ->> 'id';
  enrollment ysp_auth.google_enrollments%rowtype;
  account_active boolean := false;
  denied jsonb := jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This Google account is not authorized. Sign in with your YSP username and password, then link this email from My Profile.'
  ));
begin
  -- app_metadata.provider is set by Auth; client-editable user_metadata is not trusted.
  if event -> 'user' -> 'app_metadata' ->> 'provider' is distinct from 'google'
    or coalesce(requested_email, '') = '' or coalesce(requested_subject, '') = '' then
    return denied;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('external-auth-email:' || requested_email));
  select * into enrollment from ysp_auth.google_enrollments
    where email = requested_email and expires_at > now() for update;
  if not found then return denied; end if;

  if enrollment.account_type = 'admin' then
    select exists(select 1 from public.admin_users where id = enrollment.account_id) into account_active;
  elsif enrollment.account_type = 'chapter' then
    select exists(select 1 from public.chapter_users where id = enrollment.account_id and is_active) into account_active;
  elsif enrollment.account_type = 'barangay' then
    select exists(select 1 from public.barangay_users where id = enrollment.account_id and is_active) into account_active;
  end if;
  if not account_active then return denied; end if;

  if exists(select 1 from public.external_auth_identities
    where (account_type = enrollment.account_type and account_id = enrollment.account_id and provider = 'google')
       or provider_subject = requested_subject) then
    return denied;
  end if;

  -- Bind the verified Google identity in the same transaction as Auth creation.
  insert into public.external_auth_identities (account_type, account_id, provider, provider_subject, email)
    values (enrollment.account_type, enrollment.account_id, 'google', requested_subject, requested_email);
  delete from ysp_auth.google_enrollments where email = requested_email;
  return '{}'::jsonb;
end;
$$;
revoke execute on function public.ysp_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.ysp_before_user_created(jsonb) to supabase_auth_admin;

commit;
