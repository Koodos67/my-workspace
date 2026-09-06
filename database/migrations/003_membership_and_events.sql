begin;
grant delete on public.memberships to koodos_app;
create policy memberships_revoke on public.memberships for delete to koodos_app using (private.is_admin());
revoke all on public."user", public."session", public.account, public.verification, public."rateLimit" from public, koodos_app;
create function private.record_sign_in() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.profiles set last_seen_at = now() where id = new."userId";
 update public.memberships set first_seen_at = coalesce(first_seen_at, now()) where profile_id = new."userId";
 insert into public.events(client_id, actor_id, type)
 select m.client_id, new."userId", 'user.signed_in' from public.memberships m
 join public.clients c on c.id=m.client_id where m.profile_id=new."userId" and c.status='active';
 return new;
end;
$$;
revoke all on function private.record_sign_in() from public;
create trigger session_created after insert on public."session" for each row execute function private.record_sign_in();
commit;
