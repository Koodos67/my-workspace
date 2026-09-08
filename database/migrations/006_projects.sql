begin;

create table public.projects (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=500),
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 unique(id,client_id)
);
create index projects_client_idx on public.projects(client_id,created_at,id);
insert into public.projects(client_id,name) select id,'Main project' from public.clients;

alter table public.tracks add column project_id uuid;
alter table public.folders add column project_id uuid;
alter table public.items add column project_id uuid;
alter table public.approval_requests add column project_id uuid;
-- Preserve item timestamps and all approval snapshots during the structural backfill.
alter table public.items disable trigger items_updated;
alter table public.items disable trigger approval_source_changed;
update public.tracks t set project_id=p.id from public.projects p where p.client_id=t.client_id;
update public.folders f set project_id=p.id from public.projects p where p.client_id=f.client_id;
update public.items i set project_id=p.id from public.projects p where p.client_id=i.client_id;
update public.approval_requests a set project_id=p.id from public.projects p where p.client_id=a.client_id;
alter table public.items enable trigger items_updated;
alter table public.items enable trigger approval_source_changed;
alter table public.tracks alter column project_id set not null;
alter table public.tracks add constraint tracks_project_client_fk foreign key(project_id,client_id) references public.projects(id,client_id);
create index tracks_project_idx on public.tracks(project_id);
alter table public.folders alter column project_id set not null;
alter table public.folders add constraint folders_project_client_fk foreign key(project_id,client_id) references public.projects(id,client_id);
create index folders_project_idx on public.folders(project_id);
alter table public.items alter column project_id set not null;
alter table public.items add constraint items_project_client_fk foreign key(project_id,client_id) references public.projects(id,client_id);
create index items_project_idx on public.items(project_id);
alter table public.approval_requests alter column project_id set not null;
alter table public.approval_requests add constraint approval_requests_project_client_fk foreign key(project_id,client_id) references public.projects(id,client_id);
create index approval_requests_project_idx on public.approval_requests(project_id);

alter table public.tracks add unique(id,project_id);
alter table public.folders add unique(id,project_id);
alter table public.items add unique(id,project_id);
alter table public.folders add constraint folder_track_project_fk foreign key(track_id,project_id) references public.tracks(id,project_id);
alter table public.items add constraint item_folder_project_fk foreign key(folder_id,project_id) references public.folders(id,project_id);
alter table public.approval_requests add constraint approval_track_project_fk foreign key(track_id,project_id) references public.tracks(id,project_id);
alter table public.approval_requests add constraint approval_item_project_fk foreign key(item_id,project_id) references public.items(id,project_id);

-- Keep one initial project for new clients, including legacy callers during deployment.
create function private.seed_client_project() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.projects(client_id,name) values(new.id,'Main project');
 return new;
end;
$$;
revoke all on function private.seed_client_project() from public;
create trigger client_project_created after insert on public.clients for each row execute function private.seed_client_project();

-- Old single-project callers stay compatible; ambiguous inserts fail closed.
create function private.assign_project() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id) then
   raise exception 'Project ownership cannot be changed';
 end if;
 if new.project_id is null then
   select p.id into new.project_id from public.projects p where p.client_id=new.client_id
     and p.archived_at is null and (select count(*) from public.projects q where q.client_id=new.client_id and q.archived_at is null)=1;
 end if;
 if new.project_id is null then raise exception 'Choose a project'; end if;
 if not exists(select 1 from public.projects p join public.clients c on c.id=p.client_id where p.id=new.project_id and p.client_id=new.client_id and p.archived_at is null and c.status='active') then
   raise exception 'Project unavailable';
 end if;
 return new;
end;
$$;
revoke all on function private.assign_project() from public;
create trigger tracks_project_guard before insert or update on public.tracks for each row execute function private.assign_project();
create trigger folders_project_guard before insert or update on public.folders for each row execute function private.assign_project();
create trigger items_project_guard before insert or update on public.items for each row execute function private.assign_project();

create function private.can_access_project(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from public.projects p where p.id=target
   and p.archived_at is null and private.can_access_client(p.client_id));
$$;
revoke all on function private.can_access_project(uuid) from public;
grant execute on function private.can_access_project(uuid) to koodos_app;
alter table public.projects enable row level security;
revoke all on public.projects from public,koodos_app;
grant select,insert,update on public.projects to koodos_app;
create policy projects_read on public.projects for select to koodos_app using(private.can_access_project(id));
create policy projects_create on public.projects for insert to koodos_app with check(private.is_admin());
create policy projects_edit on public.projects for update to koodos_app using(private.is_admin()) with check(private.is_admin());
alter policy tracks_read on public.tracks using(private.is_admin() or (private.can_access_project(project_id) and archived_at is null));
alter policy folders_read on public.folders using(private.is_admin() or (private.can_access_project(project_id) and archived_at is null));
alter policy approvals_read on public.approval_requests using(private.is_admin() or (private.can_access_project(project_id)
 and exists(select 1 from public.tracks t where t.id=track_id and t.archived_at is null)));
create or replace function private.can_read_item(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from public.items i where i.id=target
   and private.can_access_project(i.project_id) and i.published_at<=now() and i.archived_at is null
   and (i.folder_id is null or exists(select 1 from public.folders f where f.id=i.folder_id and f.archived_at is null)));
$$;
create or replace function private.request_approval(target_track uuid, target_item uuid, label text, scope_text text)
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
 perform 1 from public.projects where id=t.project_id and archived_at is null for update;
 if not found then raise exception 'Project unavailable'; end if;
 select * into i from public.items where id=target_item and client_id=t.client_id and project_id=t.project_id for update;
 if not found or i.archived_at is not null or i.published_at is null or i.published_at>now()
   or (i.folder_id is not null and not exists(select 1 from public.folders f where f.id=i.folder_id and f.archived_at is null))
   then raise exception 'Choose a published deliverable in this workspace'; end if;
 if (t.approval_kind='plan' and i.type='link') or (i.type<>'link' and i.current_version_id is null)
   then raise exception 'Plan approval needs an uploaded, versioned document'; end if;
 if length(btrim(label)) not between 1 and 120 or length(btrim(scope_text)) not between 1 and 3000
   then raise exception 'Add a version label and scope'; end if;
 select coalesce(max(request_number),0)+1 into seq from public.approval_requests where track_id=t.id;
 update public.approval_requests set superseded_at=now() where track_id=t.id and superseded_at is null;
 insert into public.approval_requests(client_id,project_id,track_id,request_number,kind,item_id,version_id,item_title,
   item_url,item_updated_at,version_label,scope,consent_text,requested_by)
 values(t.client_id,t.project_id,t.id,seq,t.approval_kind,i.id,i.current_version_id,i.title,i.url,i.updated_at,
   btrim(label),btrim(scope_text),case when t.approval_kind='plan'
     then 'I approve this plan version for the build to proceed.'
     else 'I authorise KOODOS to launch this version, make the DNS changes described below and switch traffic to the new site.' end,
   private.actor_id()) returning id into new_id;
 return new_id;
end;
$$;

create or replace function private.respond_to_approval(target uuid, answer text, comment_text text)
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
 perform 1 from public.projects where id=a.project_id and archived_at is null for update;
 if not found then raise exception 'Project unavailable'; end if;
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

create or replace function private.withdraw_approval(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.approval_requests;
begin
 if not private.is_admin() then raise exception 'Admin required'; end if;
 select * into a from public.approval_requests where id=target;
 if not found then raise exception 'Approval unavailable'; end if;
 perform 1 from public.clients where id=a.client_id and status='active' for update;
 if not found then raise exception 'Workspace unavailable'; end if;
 perform 1 from public.projects where id=a.project_id and archived_at is null for update;
 if not found then raise exception 'Project unavailable'; end if;
 perform 1 from public.tracks where id=a.track_id for update;
 update public.approval_requests set withdrawn_at=now() where id=target and withdrawn_at is null and superseded_at is null;
end;
$$;


commit;
