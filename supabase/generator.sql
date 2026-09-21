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
