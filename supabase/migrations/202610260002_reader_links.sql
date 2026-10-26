-- Revocable capability links. Tokens are random 256-bit values; only hashes live in the database.
-- These tables are separate from the optional email-auth adapter in the first migration.
create table public.ln_link_notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_hash bytea not null unique,
  content jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.ln_reader_links (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.ln_link_notebooks(id) on delete cascade,
  token_hash bytea not null unique,
  label text not null check (length(btrim(label)) between 1 and 100),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index ln_reader_links_notebook on public.ln_reader_links(notebook_id);
alter table public.ln_link_notebooks enable row level security;
alter table public.ln_reader_links enable row level security;
revoke all on public.ln_link_notebooks,public.ln_reader_links from public,anon,authenticated;

create function public.ln_clean_edition(p_content jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare clean jsonb; published_entries jsonb;
begin
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
  return clean;
end $$;
revoke all on function public.ln_clean_edition(jsonb) from public,anon,authenticated;

create function public.ln_link_create(p_owner_token text,p_title text) returns uuid
language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
  if p_owner_token is null or p_owner_token !~ '^[a-f0-9]{64}$' or p_title is null
    or length(btrim(p_title)) not between 1 and 200 then
    raise exception 'Invalid sharing key or title' using errcode='22023';
  end if;
  insert into public.ln_link_notebooks(owner_hash,content)
    values(sha256(convert_to(p_owner_token,'UTF8')),jsonb_build_object('schema',1,'title',p_title,'subtitle','','author','','draft',null,'entries','[]'::jsonb))
    returning id into new_id;
  return new_id;
end $$;

create function public.ln_link_manage(p_id uuid,p_owner_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.ln_link_notebooks;
begin
  select * into n from public.ln_link_notebooks where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8'));
  if n.id is null then raise exception 'Invalid owner key' using errcode='42501'; end if;
  return jsonb_build_object('content',n.content,'revision',n.revision,'updated_at',n.updated_at,'links',
    (select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'revoked_at',revoked_at) order by created_at),'[]'::jsonb)
      from public.ln_reader_links where notebook_id=p_id));
end $$;

create function public.ln_link_publish(p_id uuid,p_owner_token text,p_content jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare new_revision bigint; clean jsonb;
begin
  if not exists(select 1 from public.ln_link_notebooks where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8'))) then
    raise exception 'Invalid owner key' using errcode='42501';
  end if;
  clean=public.ln_clean_edition(p_content);
  update public.ln_link_notebooks set content=clean,revision=revision+1,updated_at=now()
    where id=p_id and revision=p_expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'Shared edition changed; refresh before publishing' using errcode='40001'; end if;
  return new_revision;
end $$;

create function public.ln_link_issue(p_id uuid,p_owner_token text,p_reader_token text,p_label text)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
  if not exists(select 1 from public.ln_link_notebooks where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8'))) then
    raise exception 'Invalid owner key' using errcode='42501';
  end if;
  if p_reader_token is null or p_reader_token !~ '^[a-f0-9]{64}$' or p_reader_token=p_owner_token then
    raise exception 'Invalid reader key' using errcode='22023';
  end if;
  insert into public.ln_reader_links(notebook_id,token_hash,label)
    values(p_id,sha256(convert_to(p_reader_token,'UTF8')),p_label) returning id into new_id;
  return new_id;
end $$;

create function public.ln_link_revoke(p_id uuid,p_owner_token text,p_link_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.ln_link_notebooks where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8'))) then
    raise exception 'Invalid owner key' using errcode='42501';
  end if;
  update public.ln_reader_links set revoked_at=now() where id=p_link_id and notebook_id=p_id and revoked_at is null;
end $$;

create function public.ln_link_read(p_id uuid,p_reader_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('content',n.content,'revision',n.revision,'updated_at',n.updated_at) into result
    from public.ln_link_notebooks n join public.ln_reader_links l on l.notebook_id=n.id
    where n.id=p_id and l.token_hash=sha256(convert_to(p_reader_token,'UTF8')) and l.revoked_at is null;
  if result is null then raise exception 'This reader link is unavailable or has been revoked. Ask the owner for a new link.' using errcode='42501'; end if;
  return result;
end $$;

revoke all on function public.ln_link_create(text,text),public.ln_link_manage(uuid,text),
  public.ln_link_publish(uuid,text,jsonb,bigint),public.ln_link_issue(uuid,text,text,text),
  public.ln_link_revoke(uuid,text,uuid),public.ln_link_read(uuid,text) from public;
grant execute on function public.ln_link_create(text,text),public.ln_link_manage(uuid,text),
  public.ln_link_publish(uuid,text,jsonb,bigint),public.ln_link_issue(uuid,text,text,text),
  public.ln_link_revoke(uuid,text,uuid),public.ln_link_read(uuid,text) to anon,authenticated;
