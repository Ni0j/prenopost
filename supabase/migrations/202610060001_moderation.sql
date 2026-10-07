begin;
-- Explicit allowlist: having a Supabase account never grants moderation rights.
create table if not exists public.mailbox_moderators (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.mailbox_moderators enable row level security;
revoke all on public.mailbox_moderators from public, anon, authenticated;
create table if not exists public.mailbox_queue (
 id uuid primary key,
 source_kind text not null check (source_kind in ('mailbox','legacy')),
 source_id uuid not null,
 payload jsonb check (payload is null or public.valid_mailbox_payload(payload) is true),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 version integer not null default 0,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null,
 unique(source_kind,source_id),
 check (source_kind = 'legacy' or payload is not null)
);
alter table public.mailbox_queue enable row level security;
revoke all on public.mailbox_queue from public, anon, authenticated;
create index if not exists mailbox_queue_status_created on public.mailbox_queue(status,created_at,id);
-- Preserve existing approvals; legacy copies need explicit review under the new rules.
insert into public.mailbox_queue(id,source_kind,source_id,payload,status,created_at,reviewed_at)
 select id,'mailbox',id,payload,case when approved_at is not null and approved_at<=now() then 'approved' else 'pending' end,created_at,approved_at
 from public.mailbox_entries on conflict do nothing;
insert into public.mailbox_queue(id,source_kind,source_id,created_at)
 select gen_random_uuid(),'legacy',id,created_at from public.submissions on conflict do nothing;
delete from public.mailbox_entries where approved_at is null or approved_at>now();

create or replace function public.is_mailbox_moderator()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mailbox_moderators where user_id=auth.uid());
$$;
revoke all on function public.is_mailbox_moderator() from public, anon;
grant execute on function public.is_mailbox_moderator() to authenticated;

create or replace function public.submit_mailbox_entry(entry_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if entry_id is null or not coalesce(public.valid_mailbox_payload(payload),false) then raise exception 'Invalid submission representation'; end if;
 perform pg_advisory_xact_lock(726191240);
 if exists(select 1 from public.mailbox_queue where id=entry_id) then return jsonb_build_object('status','received'); end if;
 if (select count(*) from public.mailbox_queue where source_kind='mailbox' and created_at>=now()-interval '1 hour')>=200 then raise exception 'Mailbox temporarily busy'; end if;
 insert into public.mailbox_queue(id,source_kind,source_id,payload) values(entry_id,'mailbox',entry_id,payload);
 return jsonb_build_object('status','received');
end;
$$;
revoke all on function public.submit_mailbox_entry(uuid,jsonb) from public;
grant execute on function public.submit_mailbox_entry(uuid,jsonb) to anon,authenticated;

create or replace function public.moderation_list(review_status text default 'pending',page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_mailbox_moderator() then raise exception 'Moderator access required' using errcode='42501'; end if;
 if review_status not in ('pending','approved','rejected') or page_offset<0 or page_offset>100000 then raise exception 'Invalid review filter'; end if;
 select coalesce(jsonb_agg(item order by created_at,id),'[]'::jsonb) into result from (
  select q.id,q.created_at,jsonb_build_object('id',q.id,'status',q.status,'version',q.version,'created_at',q.created_at,
   'source',q.source_kind,'previously_reviewed',coalesce(s.approved_at is not null,false),
   'payload',coalesce(q.payload,jsonb_build_object('outcome',s.outcome,'days',s.days,'segments',
    case when s.outcome='no_response' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','text','text',coalesce(nullif(s.public_response,''),s.response))) end))) as item
  from public.mailbox_queue q left join public.submissions s on q.source_kind='legacy' and s.id=q.source_id
  where q.status=review_status order by q.created_at,q.id limit 50 offset page_offset
 ) page;
 return result;
end;
$$;
revoke all on function public.moderation_list(text,integer) from public,anon;
grant execute on function public.moderation_list(text,integer) to authenticated;

create or replace function public.moderate_mailbox(queue_id uuid,expected_version integer,decision text,public_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.mailbox_queue; original_outcome text; original_days integer;
begin
 if not public.is_mailbox_moderator() then raise exception 'Moderator access required' using errcode='42501'; end if;
 if decision is null or decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
 select * into item from public.mailbox_queue where id=queue_id for update;
 if not found then raise exception 'Item no longer exists' using errcode='40001'; end if;
 if expected_version is null or item.version<>expected_version then raise exception 'Item changed; reload before reviewing' using errcode='40001'; end if;
 if decision='approve' then
  if not coalesce(public.valid_mailbox_payload(public_payload),false) then raise exception 'Invalid public representation'; end if;
  if item.source_kind='legacy' then select outcome,days into original_outcome,original_days from public.submissions where id=item.source_id;
  else original_outcome:=item.payload->>'outcome'; original_days:=(item.payload->>'days')::integer; end if;
  if public_payload->>'outcome' is distinct from original_outcome or (public_payload->>'days')::integer is distinct from original_days then raise exception 'Submission outcome cannot change'; end if;
  -- Replace, rather than mutate, the reviewed public snapshot. Transaction is atomic.
  delete from public.mailbox_entries where id=item.id;
  insert into public.mailbox_entries(id,payload,created_at,approved_at) values(item.id,public_payload,item.created_at,now());
 else
  delete from public.mailbox_entries where id=item.id;
 end if;
 update public.mailbox_queue set status=case when decision='approve' then 'approved' else 'rejected' end,
  version=version+1,reviewed_at=now(),reviewed_by=auth.uid() where id=item.id;
 return jsonb_build_object('status',case when decision='approve' then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.moderate_mailbox(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.moderate_mailbox(uuid,integer,text,jsonb) to authenticated;

create or replace function public.mailbox_collection()
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'outcome',t.payload->'outcome','days',t.payload->'days','segments',t.payload->'segments') order by t.created_at desc,t.id),'[]'::jsonb)
 from (select m.id,m.payload,m.created_at from public.mailbox_entries m
 join public.mailbox_queue q on q.id=m.id and q.status='approved'
 where m.approved_at is not null and m.approved_at<=now() order by m.created_at desc,m.id limit 80) t;
$$;
create or replace function public.latest_submission()
returns timestamptz language sql security definer set search_path='' as $$
 select max(created_at) from (select max(created_at) as created_at from public.mailbox_queue union all select max(created_at) from public.submissions where created_at<=now()) activity;
$$;
commit;
