begin;

create table public.tracks (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 name text not null check (length(btrim(name)) between 1 and 120),
 summary text not null default '' check (length(summary) <= 500),
 deliverable text not null default '' check (length(deliverable) <= 120),
 position double precision not null default 1000,
 recurring boolean not null default false,
 status text not null default 'not_started'
   check (status in ('not_started','in_progress','waiting_on_client','on_hold','done')),
 status_note text not null default '' check (length(status_note) <= 500),
 status_changed_at timestamptz not null default now(),
 note_updated_at timestamptz,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 unique (id, client_id)
);
create index tracks_client_position_idx on public.tracks(client_id, position);
alter table public.folders add column track_id uuid;
alter table public.folders add constraint folder_track_belongs_to_client
 foreign key (track_id, client_id) references public.tracks(id, client_id);
create index folders_track_idx on public.folders(track_id, client_id);

alter table public.tracks enable row level security;
revoke all on public.tracks from public, koodos_app;
grant select, insert, update on public.tracks to koodos_app;
create policy tracks_read on public.tracks for select to koodos_app
 using (private.is_admin() or (private.can_access_client(client_id) and archived_at is null));
create policy tracks_create on public.tracks for insert to koodos_app with check (private.is_admin());
create policy tracks_edit on public.tracks for update to koodos_app
 using (private.is_admin()) with check (private.is_admin());

create function private.touch_track() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.status is distinct from old.status then new.status_changed_at = now();
 else new.status_changed_at = old.status_changed_at; end if;
 if new.status_note is distinct from old.status_note then new.note_updated_at = now();
 else new.note_updated_at = old.note_updated_at; end if;
 return new;
end;
$$;
revoke all on function private.touch_track() from public;
create trigger tracks_updated before update on public.tracks for each row execute function private.touch_track();

-- Backfill existing workspaces without guessing progress or changing their filing.
-- This migration is immutable; future clients use DEFAULT_TRACKS in src/lib/tracks.ts.
insert into public.tracks(client_id, name, summary, deliverable, position, recurring)
select c.id, d.name, d.summary, d.deliverable, d.position, d.recurring
from public.clients c cross join (values
 ('Discovery', 'A working session on the business, the buyers and the constraints', 'Written brief', 1000, false),
 ('Research', 'Market, competitor and search analysis; content gap and citation audit', 'Research pack', 2000, false),
 ('Plan', 'Sitemap, content model, design direction, stack recommendation', 'Plan for approval', 3000, false),
 ('Build', 'Design and development against the approved plan', 'Staging site', 4000, false),
 ('Review', 'One structured round of changes, tracked in writing', 'Change log', 5000, false),
 ('Launch', 'Migration, redirects, analytics, handover documentation', 'Live site and keys', 6000, false),
 ('Operate', 'Monitoring, fixes, measurement — and content, if you want it', 'Quarterly report', 7000, true)
) as d(name, summary, deliverable, position, recurring);
commit;
