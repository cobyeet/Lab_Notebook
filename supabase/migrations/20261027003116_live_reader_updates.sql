-- Optional publication capability, separate from owner management and reader access.
-- Poll the capability and revision without returning all original attachments again.
create function public.ln_link_revision(p_id uuid,p_reader_token text) returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
  select n.revision into result from public.ln_link_notebooks n join public.ln_reader_links l on l.notebook_id=n.id
    where n.id=p_id and l.token_hash=sha256(convert_to(p_reader_token,'UTF8')) and l.revoked_at is null;
  if result is null then raise exception 'This reader link is unavailable or has been revoked. Ask the owner for a new link.' using errcode='42501'; end if;
  return result;
end $$;
revoke all on function public.ln_link_revision(uuid,text) from public;
grant execute on function public.ln_link_revision(uuid,text) to anon,authenticated;

create table ln_private.live_publications (
  notebook_id uuid primary key references public.ln_link_notebooks(id) on delete cascade,
  publisher_hash bytea not null unique,
  enabled boolean not null default false
);
alter table ln_private.live_publications enable row level security;
revoke all on ln_private.live_publications from public,anon,authenticated;

create function public.ln_live_configure(p_id uuid,p_owner_token text,p_publisher_token text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.ln_link_notebooks where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8')) for update;
  if not found then raise exception 'Invalid owner key' using errcode='42501'; end if;
  if p_publisher_token is null or p_publisher_token !~ '^[a-f0-9]{64}$' or p_publisher_token=p_owner_token
    or exists(select 1 from public.ln_reader_links where token_hash=sha256(convert_to(p_publisher_token,'UTF8'))) then
    raise exception 'Use a separate private update key' using errcode='22023';
  end if;
  insert into ln_private.live_publications(notebook_id,publisher_hash,enabled)
    values(p_id,sha256(convert_to(p_publisher_token,'UTF8')),true)
    on conflict(notebook_id) do update set publisher_hash=excluded.publisher_hash,enabled=true;
end $$;

create function public.ln_live_read(p_id uuid,p_publisher_token text) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='15s' as $$
declare result jsonb;
begin
  select jsonb_build_object('content',n.content,'revision',n.revision,'enabled',l.enabled) into result
    from public.ln_link_notebooks n join ln_private.live_publications l on l.notebook_id=n.id
    where n.id=p_id and l.publisher_hash=sha256(convert_to(p_publisher_token,'UTF8'));
  if result is null then raise exception 'Invalid reader update key' using errcode='42501'; end if;
  return result;
end $$;

create function public.ln_live_toggle(p_id uuid,p_publisher_token text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.ln_link_notebooks n join ln_private.live_publications l on l.notebook_id=n.id
    where n.id=p_id and l.publisher_hash=sha256(convert_to(p_publisher_token,'UTF8')) for update of n;
  if not found then raise exception 'Invalid reader update key' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Choose whether updates are enabled'; end if;
  update ln_private.live_publications set enabled=p_enabled where notebook_id=p_id;
end $$;

create function public.ln_live_publish(p_id uuid,p_publisher_token text,p_content jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' set statement_timeout='15s' as $$
declare current_row public.ln_link_notebooks; incoming jsonb; merged jsonb; entries jsonb;
begin
  select n.* into current_row from public.ln_link_notebooks n join ln_private.live_publications l on l.notebook_id=n.id
    where n.id=p_id and l.publisher_hash=sha256(convert_to(p_publisher_token,'UTF8')) and l.enabled for update of n;
  if current_row.id is null then raise exception 'Invalid or paused reader update key' using errcode='42501'; end if;
  if p_expected_revision is distinct from current_row.revision then raise exception 'Reader edition changed; refresh before updating' using errcode='40001'; end if;
  incoming=public.ln_clean_edition(p_content);
  if exists(select 1 from jsonb_array_elements(incoming->'entries') e where coalesce(e->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$')
    or exists(select 1 from jsonb_array_elements(incoming->'entries') e group by e->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(incoming->'entries') e cross join lateral jsonb_array_elements(e->'attachments') a
      where coalesce(a->>'id','')='')
    or exists(select 1 from jsonb_array_elements(incoming->'entries') e cross join lateral jsonb_array_elements(e->'attachments') a
      group by e->>'id',a->>'id' having count(*)>1) then raise exception 'Invalid or duplicate entry or attachment ID'; end if;
  if exists(select 1 from jsonb_array_elements(incoming->'entries') e
    join jsonb_array_elements(current_row.content->'entries') old on e->>'id'=old->>'id'
    cross join lateral jsonb_array_elements(e->'attachments') a
    join lateral jsonb_array_elements(old->'attachments') original on a->>'id'=original->>'id'
    where a->'data' is distinct from original->'data') then
    raise exception 'An original reader attachment changed; attach the replacement with a new ID';
  end if;
  select coalesce(jsonb_agg(jsonb_set(e,'{attachments}',
    (select coalesce(jsonb_agg(a order by source,position),'[]'::jsonb) from (
      select a,0 source,position from jsonb_array_elements(e->'attachments') with ordinality t(a,position)
      union all select a,1 source,position from jsonb_array_elements(coalesce(old->'attachments','[]'::jsonb)) with ordinality t(a,position)
        where not exists(select 1 from jsonb_array_elements(e->'attachments') next where next->>'id'=a->>'id')
    ) files)) order by position),'[]'::jsonb) into entries
    from jsonb_array_elements(incoming->'entries') with ordinality t(e,position)
    left join jsonb_array_elements(current_row.content->'entries') old on old->>'id'=e->>'id';
  entries=entries||(select coalesce(jsonb_agg(e order by position),'[]'::jsonb)
    from jsonb_array_elements(current_row.content->'entries') with ordinality t(e,position)
    where not exists(select 1 from jsonb_array_elements(incoming->'entries') next where next->>'id'=e->>'id'));
  merged=public.ln_clean_edition(jsonb_set(incoming,'{entries}',entries));
  if merged is not distinct from current_row.content then return current_row.revision; end if;
  update public.ln_link_notebooks set content=merged,revision=revision+1,updated_at=now() where id=p_id returning revision into current_row.revision;
  return current_row.revision;
end $$;

revoke all on function public.ln_live_configure(uuid,text,text),public.ln_live_read(uuid,text),public.ln_live_toggle(uuid,text,boolean),public.ln_live_publish(uuid,text,jsonb,bigint) from public;
grant execute on function public.ln_live_configure(uuid,text,text),public.ln_live_read(uuid,text),public.ln_live_toggle(uuid,text,boolean),public.ln_live_publish(uuid,text,jsonb,bigint) to anon,authenticated;
notify pgrst,'reload schema';
