-- Apply after the existing schema. Existing originals remain private and untouched.
begin;
create or replace function public.valid_mailbox_payload(payload jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare segment jsonb; total integer := 0; n integer;
begin
  if jsonb_typeof(payload) is distinct from 'object' or
     not (payload ?& array['outcome','days','segments']) or
     (select count(*) from jsonb_object_keys(payload)) <> 3 or
     jsonb_typeof(payload->'segments') is distinct from 'array' then return false; end if;
  if payload->>'outcome' = 'no_response' then
    return payload->'segments' = '[]'::jsonb and jsonb_typeof(payload->'days') = 'number'
      and (payload->>'days') ~ '^[0-9]+$' and (payload->>'days')::numeric between 1 and 2147483647;
  end if;
  if payload->>'outcome' is distinct from 'rejection' or payload->'days' is distinct from 'null'::jsonb
     or jsonb_array_length(payload->'segments') not between 1 and 3000 then return false; end if;
  for segment in select value from jsonb_array_elements(payload->'segments') loop
    if jsonb_typeof(segment) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(segment)) <> 2 then return false; end if;
    if segment->>'type' = 'text' and jsonb_typeof(segment->'text') = 'string' then
      n := char_length(segment->>'text');
      if n < 1 then return false; end if;
    elsif segment->>'type' = 'redaction' and jsonb_typeof(segment->'width') = 'number'
       and (segment->>'width') ~ '^[0-9]+$' then
      if (segment->>'width')::numeric not between 1 and 32 then return false; end if;
      n := (segment->>'width')::integer;
    else return false; end if;
    total := total + n;
    if total > 3000 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.mailbox_entries (
  id uuid primary key,
  payload jsonb not null check (public.valid_mailbox_payload(payload) is true),
  created_at timestamptz not null default now(),
  approved_at timestamptz check (approved_at >= created_at)
);
alter table public.mailbox_entries enable row level security;
revoke all on public.mailbox_entries from public, anon, authenticated;
create index if not exists mailbox_entries_created on public.mailbox_entries(created_at desc, id);

-- Editing a reviewed copy always removes publication until reviewed again.
create or replace function public.mailbox_reset_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payload is distinct from old.payload then new.approved_at := null; end if;
  return new;
end;
$$;
drop trigger if exists mailbox_reset_review on public.mailbox_entries;
create trigger mailbox_reset_review before update on public.mailbox_entries
for each row execute function public.mailbox_reset_review();

create or replace function public.submit_mailbox_entry(entry_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if entry_id is null or not coalesce(public.valid_mailbox_payload(payload), false) then
    raise exception 'Invalid submission representation';
  end if;
  -- Global insertion budget, serialized across concurrent submissions. Retries are free.
  perform pg_advisory_xact_lock(726191240);
  if exists(select 1 from public.mailbox_entries m where m.id = entry_id) then
    return jsonb_build_object('status','received');
  end if;
  if (select count(*) from public.mailbox_entries where created_at >= now() - interval '1 hour') >= 200 then
    raise exception 'Mailbox temporarily busy';
  end if;
  insert into public.mailbox_entries(id, payload) values(entry_id, payload);
  return jsonb_build_object('status','received');
end;
$$;
revoke all on function public.submit_mailbox_entry(uuid,jsonb) from public;
grant execute on function public.submit_mailbox_entry(uuid,jsonb) to anon, authenticated;

create or replace function public.mailbox_collection()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'outcome', t.payload->'outcome',
    'days', t.payload->'days', 'segments', t.payload->'segments') order by t.created_at desc, t.id), '[]'::jsonb)
  from (select id, payload, created_at from public.mailbox_entries
        where approved_at is not null and approved_at <= now()
        order by created_at desc, id limit 80) t;
$$;
revoke all on function public.mailbox_collection() from public;
grant execute on function public.mailbox_collection() to anon, authenticated;
create or replace function public.latest_submission()
returns timestamptz language sql security definer set search_path = '' as $$
  select max(created_at) from (
    select max(created_at) as created_at from public.mailbox_entries
    union all select max(created_at) from public.submissions where created_at <= now()
  ) activity;
$$;
commit;
