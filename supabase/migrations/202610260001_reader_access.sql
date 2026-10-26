-- Private shared editions. Authenticated owners manage; approved, verified emails read.
create table public.ln_notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index ln_notebooks_owner on public.ln_notebooks(owner_id);
create table public.ln_readers (
  notebook_id uuid not null references public.ln_notebooks(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320 and position('@' in email) > 1),
  role text not null default 'reader' check (role = 'reader'),
  created_at timestamptz not null default now(),
  primary key (notebook_id,email)
);
create index ln_readers_email on public.ln_readers(email);
create table public.ln_publications (
  notebook_id uuid primary key references public.ln_notebooks(id) on delete cascade,
  content jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ln_notebooks enable row level security;
alter table public.ln_readers enable row level security;
alter table public.ln_publications enable row level security;
revoke all on public.ln_notebooks,public.ln_readers,public.ln_publications from anon,authenticated;
grant select on public.ln_notebooks,public.ln_publications to authenticated;
grant select,insert,delete on public.ln_readers to authenticated;

create function public.ln_can_read(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ln_notebooks n where n.id=p_id and n.owner_id=(select auth.uid()))
    or exists(select 1 from public.ln_readers r join auth.users u on u.id=(select auth.uid())
      where r.notebook_id=p_id and r.email=lower(u.email) and u.email_confirmed_at is not null)
$$;
revoke all on function public.ln_can_read(uuid) from public,anon;
grant execute on function public.ln_can_read(uuid) to authenticated;
create policy ln_owner_notebook on public.ln_notebooks for select to authenticated using (owner_id=(select auth.uid()));
create policy ln_owner_readers_select on public.ln_readers for select to authenticated using (
  exists(select 1 from public.ln_notebooks n where n.id=notebook_id and n.owner_id=(select auth.uid())));
create policy ln_owner_readers_insert on public.ln_readers for insert to authenticated with check (
  exists(select 1 from public.ln_notebooks n where n.id=notebook_id and n.owner_id=(select auth.uid())));
create policy ln_owner_readers_delete on public.ln_readers for delete to authenticated using (
  exists(select 1 from public.ln_notebooks n where n.id=notebook_id and n.owner_id=(select auth.uid())));
create policy ln_approved_read on public.ln_publications for select to authenticated using (public.ln_can_read(notebook_id));

create function public.ln_accessible_notebooks()
returns table(notebook_id uuid,title text,access_role text,published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id,n.title,case when n.owner_id=(select auth.uid()) then 'owner' else 'reader' end,p.updated_at
  from public.ln_notebooks n join public.ln_publications p on p.notebook_id=n.id
  where (select auth.uid()) is not null and public.ln_can_read(n.id) order by n.created_at
$$;
revoke all on function public.ln_accessible_notebooks() from public,anon;
grant execute on function public.ln_accessible_notebooks() to authenticated;

create function public.ln_create_notebook(p_title text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not exists(select 1 from auth.users where id=(select auth.uid()) and email_confirmed_at is not null) then
    raise exception 'Verified email sign-in required' using errcode='42501';
  end if;
  insert into public.ln_notebooks(owner_id,title) values((select auth.uid()),p_title) returning id into new_id;
  insert into public.ln_publications(notebook_id,content) values(new_id,
    jsonb_build_object('schema',1,'title',p_title,'subtitle','','author','','draft',null,'entries','[]'::jsonb));
  return new_id;
end $$;
revoke all on function public.ln_create_notebook(text) from public,anon;
grant execute on function public.ln_create_notebook(text) to authenticated;

-- Whitelist published fields on the server too. Drafts, revision history and unknown metadata never reach readers.
create function public.ln_publish_notebook(p_notebook_id uuid,p_content jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare clean jsonb; published_entries jsonb; new_revision bigint;
begin
  if not exists(select 1 from public.ln_notebooks where id=p_notebook_id and owner_id=(select auth.uid())) then
    raise exception 'Only the notebook owner may publish' using errcode='42501';
  end if;
  if p_content is null or p_content->'schema' is distinct from '1'::jsonb
    or jsonb_typeof(p_content->'entries') is distinct from 'array'
    or jsonb_typeof(p_content->'title') is distinct from 'string'
    or length(btrim(p_content->>'title')) not between 1 and 200
    or octet_length(p_content::text)>10485760 then
    raise exception 'Invalid shared notebook or publication exceeds 10 MB' using errcode='22023';
  end if;
  if jsonb_array_length(p_content->'entries')>10000 or exists (
    select 1 from jsonb_array_elements(p_content->'entries') e
    where jsonb_typeof(e) is distinct from 'object'
      or jsonb_typeof(e->'attachments') is distinct from 'array'
  ) then raise exception 'Invalid entry collection' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e->'id','date',e->'date','created',e->'created','title',e->'title','project',e->'project',
    'body',e->'body','status',e->'status','significant',e->'significant','sources',coalesce(e->'sources','""'::jsonb),
    'next',coalesce(e->'next','""'::jsonb),'attachments',
      (select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','name',a->'name','kind',a->'kind','data',a->'data')
        || case when a ? 'sha256' then jsonb_build_object('sha256',a->'sha256') else '{}'::jsonb end
        || case when a->>'kind'='table' then jsonb_build_object('table',
          jsonb_build_object('headers',a->'table'->'headers','rows',a->'table'->'rows')) else '{}'::jsonb end), '[]'::jsonb)
        from jsonb_array_elements(e->'attachments') a))), '[]'::jsonb)
    into published_entries from jsonb_array_elements(p_content->'entries') e;
  clean=jsonb_build_object('schema',1,'title',p_content->'title','subtitle',coalesce(p_content->'subtitle','""'::jsonb),
    'author',coalesce(p_content->'author','""'::jsonb),'draft',null,'entries',published_entries);
  if p_content ? 'brandName' then clean=clean||jsonb_build_object('brandName',p_content->'brandName'); end if;
  if p_content ? 'brandSubtitle' then clean=clean||jsonb_build_object('brandSubtitle',p_content->'brandSubtitle'); end if;
  update public.ln_publications set content=clean,revision=revision+1,updated_at=now()
    where notebook_id=p_notebook_id and revision=p_expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'Shared edition changed; refresh before publishing' using errcode='40001'; end if;
  update public.ln_notebooks set title=p_content->>'title' where id=p_notebook_id;
  return new_revision;
end $$;
revoke all on function public.ln_publish_notebook(uuid,jsonb,bigint) from public,anon;
grant execute on function public.ln_publish_notebook(uuid,jsonb,bigint) to authenticated;
