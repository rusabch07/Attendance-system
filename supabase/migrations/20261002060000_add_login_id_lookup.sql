-- Phase 7: Add safe login identifier resolution helper for CR and Admin logins.
-- Allows CR users to sign in using their section's login_id (e.g. 'EE-25-A' or 'EE-A-01')
-- and Admin users to sign in using either email or Admin ID.
-- Supabase Auth retains sole responsibility for passwords.
-- Passwords and auth credentials are never stored in public tables or exposed.

begin;

-- Safe lookup function for CR section login_id -> auth user email
create or replace function public.get_cr_login_email(p_login_id text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
  v_clean_id text;
begin
  if p_login_id is null or trim(p_login_id) = '' then
    return null;
  end if;

  v_clean_id := trim(p_login_id);

  -- If the input already contains an '@', return it directly
  if v_clean_id like '%@%' then
    return v_clean_id;
  end if;

  -- 1. Match section by login_id or section_code, find active CR user profile, and return their email
  select u.email into v_email
  from public.sections s
  join public.profiles p on p.section_id = s.id and p.role = 'cr'
  join auth.users u on u.id = p.user_id
  where (lower(s.login_id) = lower(v_clean_id) or lower(s.section_code) = lower(v_clean_id))
    and s.is_active = true
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 2. Fallback: match by email prefix for a CR user (e.g., cr.ee-25-a@university.edu or ee-25-a@...)
  select u.email into v_email
  from auth.users u
  join public.profiles p on p.user_id = u.id and p.role = 'cr'
  where lower(split_part(u.email, '@', 1)) = lower(v_clean_id)
     or lower(split_part(u.email, '@', 1)) = lower('cr.' || v_clean_id)
     or lower(split_part(u.email, '@', 1)) = lower('cr_' || v_clean_id)
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.get_cr_login_email(text) from public;
grant execute on function public.get_cr_login_email(text) to anon, authenticated;

-- Safe lookup function for Admin ID -> auth user email
create or replace function public.get_admin_login_email(p_admin_id text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
  v_clean_id text;
begin
  if p_admin_id is null or trim(p_admin_id) = '' then
    return null;
  end if;

  v_clean_id := trim(p_admin_id);

  if v_clean_id like '%@%' then
    return v_clean_id;
  end if;

  -- Match admin profile by name, username portion of email, or user_id
  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.role = 'admin'
    and (
      lower(split_part(u.email, '@', 1)) = lower(v_clean_id)
      or lower(p.name) = lower(v_clean_id)
      or p.user_id::text = v_clean_id
    )
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.get_admin_login_email(text) from public;
grant execute on function public.get_admin_login_email(text) to anon, authenticated;

commit;
