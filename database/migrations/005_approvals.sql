begin;

alter table public.tracks add column approval_kind text check (approval_kind in ('plan','launch'));
update public.tracks set approval_kind=lower(name) where name in ('Plan','Launch') and recurring=false;

alter table public.items add constraint items_id_client_unique unique(id,client_id);
create table public.approval_requests (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null,
 track_id uuid not null,
 request_number integer not null,
 kind text not null check (kind in ('plan','launch')),
 item_id uuid not null,
 version_id uuid,
 item_title text not null,
 item_url text,
 item_updated_at timestamptz not null,
 version_label text not null check (length(btrim(version_label)) between 1 and 120),
 scope text not null check (length(btrim(scope)) between 1 and 3000),
 consent_text text not null,
 requested_by text not null references public.profiles(id),
 requested_at timestamptz not null default now(),
 decision text check (decision in ('approved','changes_requested')),
 response_comment text check (length(response_comment)<=3000),
 responded_by text references public.profiles(id),
 responder_name text,
 responder_email text,
 responded_at timestamptz,
 withdrawn_at timestamptz,
 superseded_at timestamptz,
 invalidated_at timestamptz,
 foreign key(track_id,client_id) references public.tracks(id,client_id),
 foreign key(item_id,client_id) references public.items(id,client_id),
 foreign key(version_id,item_id) references public.item_versions(id,item_id),
 unique(track_id,request_number),
 check (kind<>'plan' or version_id is not null),
 check ((decision is null and responded_by is null and responded_at is null)
   or (decision is not null and responded_by is not null and responded_at is not null
       and responder_name is not null and responder_email is not null))
);
create index approval_requests_client_idx on public.approval_requests(client_id,track_id,request_number desc);
alter table public.approval_requests enable row level security;
revoke all on public.approval_requests from public,koodos_app;
grant select on public.approval_requests to koodos_app;
create policy approvals_read on public.approval_requests for select to koodos_app using (
 private.is_admin() or (private.can_access_client(client_id)
   and exists(select 1 from public.tracks t where t.id=track_id and t.archived_at is null))
);

-- Mutation functions build snapshots and identities in the database. The runtime role
-- has no direct INSERT/UPDATE/DELETE grant, including for admins or response authors.
create function private.request_approval(target_track uuid, target_item uuid, label text, scope_text text)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tracks; i public.items; new_id uuid; seq integer;
begin
 if not private.is_admin() then raise exception 'Admin required'; end if;
 select * into t from public.tracks where id=target_track;
 if not found then raise exception 'Track unavailable'; end if;
 perform 1 from public.clients where id=t.client_id and status='active' for update;
 if not found then raise exception 'Workspace unavailable'; end if;
 select * into t from public.tracks where id=target_track and archived_at is null for update;
 if not found or t.approval_kind is null or t.recurring then raise exception 'Choose a Plan or Launch checkpoint'; end if;
 select * into i from public.items where id=target_item and client_id=t.client_id for update;
 if not found or i.archived_at is not null or i.published_at is null or i.published_at>now()
   or (i.folder_id is not null and not exists(select 1 from public.folders f where f.id=i.folder_id and f.archived_at is null))
   then raise exception 'Choose a published deliverable in this workspace'; end if;
 if (t.approval_kind='plan' and i.type='link') or (i.type<>'link' and i.current_version_id is null)
   then raise exception 'Plan approval needs an uploaded, versioned document'; end if;
 if length(btrim(label)) not between 1 and 120 or length(btrim(scope_text)) not between 1 and 3000
   then raise exception 'Add a version label and scope'; end if;
 select coalesce(max(request_number),0)+1 into seq from public.approval_requests where track_id=t.id;
 update public.approval_requests set superseded_at=now() where track_id=t.id and superseded_at is null;
 insert into public.approval_requests(client_id,track_id,request_number,kind,item_id,version_id,item_title,
   item_url,item_updated_at,version_label,scope,consent_text,requested_by)
 values(t.client_id,t.id,seq,t.approval_kind,i.id,i.current_version_id,i.title,i.url,i.updated_at,
   btrim(label),btrim(scope_text),case when t.approval_kind='plan'
     then 'I approve this plan version for the build to proceed.'
     else 'I authorise KOODOS to launch this version, make the DNS changes described below and switch traffic to the new site.' end,
   private.actor_id()) returning id into new_id;
 return new_id;
end;
$$;

create function private.respond_to_approval(target uuid, answer text, comment_text text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.approval_requests; t public.tracks; i public.items; p public.profiles;
begin
 select * into p from public.profiles where id=private.actor_id() and role='client';
 if not found then raise exception 'A client member must respond'; end if;
 if answer not in ('approved','changes_requested') or answer is null or length(coalesce(comment_text,''))>3000
   then raise exception 'Invalid response'; end if;
 select * into a from public.approval_requests where id=target;
 if not found then raise exception 'Approval unavailable'; end if;
 -- Same lock order as content/admin actions. Concurrent responses and replacements serialize.
 perform 1 from public.clients where id=a.client_id and status='active' for update;
 if not found then raise exception 'Workspace unavailable'; end if;
 perform 1 from public.memberships where client_id=a.client_id and profile_id=p.id for share;
 if not found then raise exception 'Membership required'; end if;
 select * into t from public.tracks where id=a.track_id and archived_at is null for update;
 if not found or t.approval_kind is distinct from a.kind or t.recurring then raise exception 'Checkpoint unavailable'; end if;
 select * into i from public.items where id=a.item_id for update;
 select * into a from public.approval_requests where id=target for update;
 if a.decision is not null or a.withdrawn_at is not null or a.superseded_at is not null or a.invalidated_at is not null
   then raise exception 'This request has already closed. Refresh to see the latest request'; end if;
 if i.archived_at is not null or i.published_at is null or i.published_at>now()
   or (i.folder_id is not null and not exists(select 1 from public.folders f where f.id=i.folder_id and f.archived_at is null))
   or i.current_version_id is distinct from a.version_id or i.url is distinct from a.item_url
   or (i.type='link' and i.updated_at is distinct from a.item_updated_at)
   then raise exception 'The deliverable changed. A fresh request is needed'; end if;
 update public.approval_requests set decision=answer,response_comment=btrim(coalesce(comment_text,'')),
   responded_by=p.id,responder_name=coalesce(nullif(btrim(p.full_name),''),p.email),
   responder_email=p.email,responded_at=now() where id=target;
end;
$$;

create function private.withdraw_approval(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.approval_requests;
begin
 if not private.is_admin() then raise exception 'Admin required'; end if;
 select * into a from public.approval_requests where id=target;
 if not found then raise exception 'Approval unavailable'; end if;
 perform 1 from public.clients where id=a.client_id and status='active' for update;
 if not found then raise exception 'Workspace unavailable'; end if;
 perform 1 from public.tracks where id=a.track_id for update;
 update public.approval_requests set withdrawn_at=now() where id=target and withdrawn_at is null and superseded_at is null;
end;
$$;

-- Replacement never carries consent forward, even if an old version is later restored.
create function private.invalidate_approval_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.current_version_id is distinct from old.current_version_id or new.url is distinct from old.url
   or (new.type='link' and new.updated_at is distinct from old.updated_at) then
   update public.approval_requests set invalidated_at=now()
     where item_id=new.id and invalidated_at is null and superseded_at is null;
 end if;
 return new;
end;
$$;
create trigger approval_source_changed after update on public.items for each row execute function private.invalidate_approval_source();

revoke all on function private.request_approval(uuid,uuid,text,text),private.respond_to_approval(uuid,text,text),
 private.withdraw_approval(uuid),private.invalidate_approval_source() from public;
grant execute on function private.request_approval(uuid,uuid,text,text),private.respond_to_approval(uuid,text,text),
 private.withdraw_approval(uuid) to koodos_app;
commit;
