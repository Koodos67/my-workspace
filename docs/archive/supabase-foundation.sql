-- M0 foundation. Apply to a fresh Supabase project.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, full_name text,
 role text not null default 'client' check (role in ('admin','client')),
 created_at timestamptz not null default now(), last_seen_at timestamptz
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), name text not null,
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 accent_color text, logo_path text,
 status text not null default 'active' check (status in ('active','archived')),
 created_at timestamptz not null default now()
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 profile_id uuid not null references public.profiles(id),
 role text not null default 'member' check (role in ('owner','member')),
 invited_at timestamptz not null default now(), first_seen_at timestamptz,
 unique (client_id, profile_id)
);
create index memberships_profile_idx on public.memberships(profile_id, client_id);
create table public.folders (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 parent_id uuid references public.folders(id),
 name text not null, position double precision not null default 1000,
 archived_at timestamptz, created_at timestamptz not null default now(),
 constraint folders_one_level check (parent_id is null),
 unique (id, client_id)
);
create table public.items (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id), folder_id uuid,
 type text not null check (type in ('artifact','link','file')),
 title text not null, description text, position double precision not null default 1000,
 url text, current_version_id uuid, requires_ack boolean not null default false,
 published_at timestamptz, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (folder_id, client_id) references public.folders(id, client_id),
 constraint link_url check ((type = 'link' and url ~ '^https?://') or (type <> 'link' and url is null))
);
create index items_client_folder_idx on public.items(client_id, folder_id, position);
create table public.item_versions (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.items(id),
 storage_path text not null unique, mime_type text not null,
 size_bytes bigint not null check (size_bytes between 0 and 26214400),
 version_note text, created_at timestamptz not null default now(),
 unique (id, item_id)
);
alter table public.items add constraint current_version_belongs_to_item
 foreign key (current_version_id, id) references public.item_versions(id, item_id) deferrable initially deferred;
create table public.acknowledgements (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.items(id),
 profile_id uuid not null references public.profiles(id), typed_name text not null,
 ip inet, user_agent text, created_at timestamptz not null default now(),
 unique(item_id, profile_id)
);
create table public.comments (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.items(id),
 profile_id uuid not null references public.profiles(id),
 body text not null check (length(btrim(body)) between 1 and 10000),
 created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz
);
create table public.events (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 actor_id uuid references public.profiles(id), item_id uuid references public.items(id),
 type text not null, meta jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index events_client_created_idx on public.events(client_id, created_at desc);
create index comments_item_idx on public.comments(item_id, created_at);
create index versions_item_idx on public.item_versions(item_id);

-- Definer helpers avoid recursive RLS. All identities come from auth.uid().
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create function private.is_admin() returns boolean language sql stable security definer
 set search_path = '' as $$
 select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
create function private.can_access_client(target uuid) returns boolean language sql stable security definer
 set search_path = '' as $$
 select private.is_admin() or exists (
  select 1 from public.memberships m join public.clients c on c.id = m.client_id
  where m.profile_id = (select auth.uid()) and m.client_id = target and c.status = 'active'
 );
$$;
create function private.can_read_item(target uuid) returns boolean language sql stable security definer
 set search_path = '' as $$
 select private.is_admin() or exists (
  select 1 from public.items i
  where i.id = target and private.can_access_client(i.client_id)
   and i.published_at is not null and i.published_at <= now() and i.archived_at is null
   and (i.folder_id is null or exists (
    select 1 from public.folders f where f.id = i.folder_id and f.archived_at is null
   ))
 );
$$;
revoke all on function private.is_admin() from public;
revoke all on function private.can_access_client(uuid) from public;
revoke all on function private.can_read_item(uuid) from public;
grant execute on function private.is_admin(), private.can_access_client(uuid), private.can_read_item(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.memberships enable row level security;
alter table public.folders enable row level security;
alter table public.items enable row level security;
alter table public.item_versions enable row level security;
alter table public.acknowledgements enable row level security;
alter table public.comments enable row level security;
alter table public.events enable row level security;

-- No anonymous table access. No role promotion, hard deletes, or audit mutations from user JWTs.
revoke all on public.profiles, public.clients, public.memberships, public.folders, public.items,
 public.item_versions, public.acknowledgements, public.comments, public.events from anon, authenticated;
grant select on public.profiles, public.clients, public.memberships, public.folders, public.items,
 public.item_versions, public.acknowledgements, public.comments, public.events to authenticated;
grant insert, update on public.clients, public.folders, public.items to authenticated;
grant insert on public.item_versions to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or private.is_admin());
create policy clients_read on public.clients for select to authenticated using (private.can_access_client(id));
create policy clients_create on public.clients for insert to authenticated with check (private.is_admin());
create policy clients_edit on public.clients for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy memberships_read on public.memberships for select to authenticated using (private.is_admin() or (profile_id = (select auth.uid()) and private.can_access_client(client_id)));
create policy folders_read on public.folders for select to authenticated using (private.is_admin() or (private.can_access_client(client_id) and archived_at is null));
create policy folders_create on public.folders for insert to authenticated with check (private.is_admin());
create policy folders_edit on public.folders for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy items_read on public.items for select to authenticated using (private.can_read_item(id));
create policy items_create on public.items for insert to authenticated with check (private.is_admin());
create policy items_edit on public.items for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy versions_read on public.item_versions for select to authenticated using (private.can_read_item(item_id));
create policy versions_create on public.item_versions for insert to authenticated with check (private.is_admin());
create policy acknowledgements_read on public.acknowledgements for select to authenticated using (private.can_read_item(item_id));
create policy comments_read on public.comments for select to authenticated using (private.can_read_item(item_id) and (deleted_at is null or private.is_admin()));
create policy events_read on public.events for select to authenticated using (private.is_admin());

-- Auth metadata cannot choose a role. Bootstrap the admin explicitly using SQL.
create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id, email, full_name)
 values(new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
 return new;
end;
$$;
revoke all on function private.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
insert into public.profiles(id, email, full_name)
 select id, coalesce(email, ''), raw_user_meta_data ->> 'full_name' from auth.users
 on conflict (id) do nothing;

create function private.touch_item() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger items_updated before update on public.items for each row execute function private.touch_item();

-- No storage.objects policies yet: access stays closed until the M2 signed-URL route exists.
insert into storage.buckets (id, name, public, file_size_limit)
 values ('artifacts', 'artifacts', false, 26214400)
 on conflict (id) do update set public = false, file_size_limit = 26214400;
commit;
