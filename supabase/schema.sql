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
