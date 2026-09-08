begin;

-- The comments table has existed since 002 with a read policy and no way to write to it.
-- This opens it, following the approvals pattern exactly: the runtime role keeps SELECT only,
-- and narrow security-definer functions perform every validated mutation with the identity
-- taken from private.actor_id(). A submitted profile id is never trusted.

-- Reading already works through comments_read (002): private.can_read_item(item_id), with
-- deleted rows visible to admins. Only writes are added here.

-- A client member can only read their own row in profiles, so joining to it for an author name
-- would leave every other participant anonymous to them. The name and role are therefore
-- snapshotted onto the comment when it is posted, exactly as approvals snapshot the responder.
-- A later rename does not rewrite old comments; the thread records who said it at the time.
alter table public.comments add column if not exists author_name text;
alter table public.comments add column if not exists author_role text;
update public.comments c set
 author_name=coalesce(nullif(btrim(p.full_name),''), p.email),
 author_role=p.role
 from public.profiles p where p.id=c.profile_id and c.author_name is null;
alter table public.comments alter column author_name set not null;
alter table public.comments alter column author_role set not null;
alter table public.comments add constraint comments_author_role_check
 check (author_role in ('admin','client'));

create index if not exists comments_item_live_idx
 on public.comments(item_id, created_at) where deleted_at is null;

-- Commenting is allowed only on work the client can actually see. An admin cannot leave a note
-- on a draft that would appear to the client the moment it is published, and a comment cannot
-- be added to archived content, an archived folder or project, or an inactive client.
create function private.can_comment_on_item(target uuid) returns boolean language sql stable
 security definer set search_path='' as $$
 select exists(select 1 from public.items i
   join public.projects p on p.id=i.project_id
   join public.clients c on c.id=i.client_id
   where i.id=target and i.archived_at is null
    and i.published_at is not null and i.published_at<=now()
    and p.archived_at is null and c.status='active'
    and private.can_access_client(i.client_id)
    and (i.folder_id is null or exists(
      select 1 from public.folders f where f.id=i.folder_id and f.archived_at is null)));
$$;
revoke all on function private.can_comment_on_item(uuid) from public;
grant execute on function private.can_comment_on_item(uuid) to koodos_app;

create function private.post_comment(target_item uuid, body_text text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.items; p public.profiles; new_id uuid;
begin
 select * into p from public.profiles where id=private.actor_id();
 if not found then raise exception 'Sign in to comment'; end if;
 if body_text is null or length(btrim(body_text)) < 1 or length(btrim(body_text)) > 10000
   then raise exception 'Write a comment of up to 10000 characters'; end if;
 select * into i from public.items where id=target_item;
 if not found then raise exception 'Item unavailable'; end if;
 -- Same lock order as the content and approval actions: client, then project, then the row.
 perform 1 from public.clients where id=i.client_id and status='active' for update;
 if not found then raise exception 'Workspace unavailable'; end if;
 perform 1 from public.projects where id=i.project_id and archived_at is null for update;
 if not found then raise exception 'Project unavailable'; end if;
 perform 1 from public.items where id=target_item for update;
 if not private.can_comment_on_item(target_item)
   then raise exception 'Comments open once this item is shared with the client'; end if;
 insert into public.comments(item_id, profile_id, body, author_name, author_role)
  values(target_item, p.id, btrim(body_text),
    coalesce(nullif(btrim(p.full_name),''), p.email), p.role)
  returning id into new_id;
 return new_id;
end;
$$;

create function private.edit_comment(target uuid, body_text text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.comments;
begin
 if body_text is null or length(btrim(body_text)) < 1 or length(btrim(body_text)) > 10000
   then raise exception 'Write a comment of up to 10000 characters'; end if;
 select * into c from public.comments where id=target for update;
 -- Authors edit their own words. An admin may remove a comment but never rewrite one.
 if not found or c.deleted_at is not null or c.profile_id is distinct from private.actor_id()
   then raise exception 'Comment unavailable'; end if;
 if not private.can_comment_on_item(c.item_id) then raise exception 'Comment unavailable'; end if;
 update public.comments set body=btrim(body_text), edited_at=now() where id=target;
end;
$$;

create function private.delete_comment(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.comments;
begin
 select * into c from public.comments where id=target for update;
 if not found or c.deleted_at is not null then raise exception 'Comment unavailable'; end if;
 -- The author withdraws their own comment; an admin can also remove one for moderation.
 if c.profile_id is distinct from private.actor_id() and not private.is_admin()
   then raise exception 'Comment unavailable'; end if;
 if not private.can_read_item(c.item_id) then raise exception 'Comment unavailable'; end if;
 update public.comments set deleted_at=now() where id=target;
end;
$$;

revoke all on function private.post_comment(uuid,text), private.edit_comment(uuid,text),
 private.delete_comment(uuid) from public;
grant execute on function private.post_comment(uuid,text), private.edit_comment(uuid,text),
 private.delete_comment(uuid) to koodos_app;

commit;
