-- Run this entire file in your new Supabase project's SQL Editor.
-- No sample submissions are inserted.
begin;
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  outcome text not null check (outcome in ('rejection', 'no_response')),
  response text not null default '',
  days integer,
  request_hash text not null unique,
  created_at timestamptz not null default now(),
  approved_at timestamptz check (approved_at >= created_at),
  constraint submission_content check (
    (outcome = 'rejection' and days is null and char_length(btrim(response, E' \t\n\r')) > 0 and char_length(response) <= 3000) or
    (outcome = 'no_response' and days is not null and days >= 1 and response = '')
  )
);
alter table public.submissions enable row level security;
revoke all on public.submissions from public, anon, authenticated;

create or replace function public.submit_rejection(payload jsonb, request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if request_id is null then raise exception 'Request identity required'; end if;
  if payload->>'outcome' is null or payload->>'outcome' not in ('rejection', 'no_response') then
    raise exception 'Choose rejection or no response';
  end if;
  if payload->>'outcome' = 'rejection' and
    (jsonb_typeof(payload->'response') is distinct from 'string') then
    raise exception 'Rejection text required';
  end if;
  if payload->>'outcome' = 'no_response' and
    (jsonb_typeof(payload->'days') is distinct from 'number' or (payload->>'days') !~ '^[0-9]+$') then
    raise exception 'Whole days required';
  end if;
  insert into public.submissions(outcome, response, days, request_hash)
  values (payload->>'outcome',
    case when payload->>'outcome' = 'rejection' then payload->>'response' else '' end,
    case when payload->>'outcome' = 'no_response' then (payload->>'days')::integer else null end,
    encode(sha256(convert_to(request_id::text, 'UTF8')), 'hex'))
  on conflict (request_hash) do nothing;
end;
$$;

-- Public activity exposes only a timestamp, never submission text or identity.
create or replace function public.latest_submission()
returns timestamptz language sql security definer set search_path = '' as $$
  select max(created_at) from public.submissions
  where outcome in ('rejection', 'no_response') and created_at <= now();
$$;
revoke all on function public.submit_rejection(jsonb, uuid) from public;
revoke all on function public.latest_submission() from public;
grant execute on function public.submit_rejection(jsonb, uuid) to anon, authenticated;
grant execute on function public.latest_submission() to anon, authenticated;

commit;

-- Run once in SQL Editor to enable reviewed generator results. Safe to rerun.
-- Existing originals remain private; this does NOT publish any existing row.
begin;
alter table public.submissions add column if not exists public_response text
  check (public_response is null or char_length(public_response) between 1 and 3000);
alter table public.submissions add column if not exists career_context text
  check (career_context is null or char_length(career_context) between 1 and 80);

create or replace function public.draw_rejection(exclude_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id,
    'outcome', s.outcome,
    'response', case when s.outcome = 'rejection' then s.public_response else null end,
    'days', s.days,
    'career_context', s.career_context
  )
  from public.submissions s
  where s.approved_at is not null and s.approved_at <= now()
    and (s.outcome = 'no_response' or
      (s.outcome = 'rejection' and char_length(btrim(s.public_response)) > 0))
  order by (s.id = exclude_id) asc nulls first, random()
  limit 1;
$$;
revoke all on function public.draw_rejection(uuid) from public;
grant execute on function public.draw_rejection(uuid) to anon, authenticated;
commit;
