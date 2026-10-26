-- Owner-only encrypted snapshots, independent of published reader editions.
create schema if not exists ln_private;
revoke all on schema ln_private from public, anon, authenticated;
create table ln_private.backup_vaults (
  id uuid primary key default gen_random_uuid(),
  owner_hash bytea not null unique
);
create table ln_private.backup_snapshots (
  vault_id uuid not null references ln_private.backup_vaults(id) on delete cascade,
  revision bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(vault_id, revision)
);
alter table ln_private.backup_vaults enable row level security;
alter table ln_private.backup_snapshots enable row level security;
revoke all on ln_private.backup_vaults,ln_private.backup_snapshots from public,anon,authenticated;

create function ln_private.check_backup(p_payload jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if p_payload is null or p_payload->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_payload->'iv') is distinct from 'string'
    or p_payload->>'iv' !~ '^[A-Za-z0-9+/]{16}$'
    or jsonb_typeof(p_payload->'ciphertext') is distinct from 'string'
    or length(p_payload->>'ciphertext') not between 24 and 30000000
    or p_payload->>'ciphertext' !~ '^[A-Za-z0-9+/]+={0,2}$'
    or octet_length(p_payload::text)>33554432
    or (select count(*) from jsonb_object_keys(p_payload))<>3 then
    raise exception 'Invalid encrypted backup or backup exceeds size limit' using errcode='22023';
  end if;
end $$;

-- These capability endpoints intentionally use SECURITY DEFINER: no table is exposed,
-- every read/write checks a 256-bit owner token, and readers have no backup capability.
create function public.ln_backup_create(p_owner_token text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare vault uuid; result jsonb;
begin
  if p_owner_token is null or p_owner_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid backup key' using errcode='22023';
  end if;
  perform ln_private.check_backup(p_payload);
  insert into ln_private.backup_vaults(owner_hash) values(sha256(convert_to(p_owner_token,'UTF8')))
    on conflict(owner_hash) do nothing returning id into vault;
  if vault is not null then
    insert into ln_private.backup_snapshots(vault_id,revision,payload) values(vault,1,p_payload);
  else
    select id into vault from ln_private.backup_vaults where owner_hash=sha256(convert_to(p_owner_token,'UTF8'));
  end if;
  select jsonb_build_object('id',vault,'revision',revision,'payload',payload,'created_at',created_at) into result
    from ln_private.backup_snapshots where vault_id=vault order by revision desc limit 1;
  return result;
end $$;

create function public.ln_backup_read(p_id uuid,p_owner_token text,p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from ln_private.backup_vaults where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8'))) then
    raise exception 'Invalid private backup key' using errcode='42501';
  end if;
  select jsonb_build_object('revision',revision,'payload',payload,'created_at',created_at) into result
    from ln_private.backup_snapshots where vault_id=p_id and (p_revision is null or revision=p_revision)
    order by revision desc limit 1;
  return result;
end $$;

create function public.ln_backup_history(p_id uuid,p_owner_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from ln_private.backup_vaults where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8'))) then
    raise exception 'Invalid private backup key' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'created_at',created_at) order by revision desc),'[]'::jsonb)
    from ln_private.backup_snapshots where vault_id=p_id);
end $$;

create function public.ln_backup_write(p_id uuid,p_owner_token text,p_payload jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  perform 1 from ln_private.backup_vaults where id=p_id and owner_hash=sha256(convert_to(p_owner_token,'UTF8')) for update;
  if not found then raise exception 'Invalid private backup key' using errcode='42501'; end if;
  perform ln_private.check_backup(p_payload);
  select max(revision) into current_revision from ln_private.backup_snapshots where vault_id=p_id;
  if p_expected_revision is distinct from current_revision then
    raise exception 'Another browser saved a newer backup. Review it before continuing.' using errcode='40001';
  end if;
  insert into ln_private.backup_snapshots(vault_id,revision,payload) values(p_id,current_revision+1,p_payload);
  delete from ln_private.backup_snapshots where vault_id=p_id and revision<=current_revision-9;
  return current_revision+1;
end $$;

revoke all on all functions in schema ln_private from public,anon,authenticated;
revoke all on function public.ln_backup_create(text,jsonb),public.ln_backup_read(uuid,text,bigint),
  public.ln_backup_history(uuid,text),public.ln_backup_write(uuid,text,jsonb,bigint) from public;
grant execute on function public.ln_backup_create(text,jsonb),public.ln_backup_read(uuid,text,bigint),
  public.ln_backup_history(uuid,text),public.ln_backup_write(uuid,text,jsonb,bigint) to anon,authenticated;
