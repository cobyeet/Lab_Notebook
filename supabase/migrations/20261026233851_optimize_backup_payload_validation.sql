-- Ciphertext is opaque; scanning megabytes with a regex exceeds API statement limits.
-- Bound its size and envelope here. AES-GCM authenticates the payload on recovery.
create or replace function ln_private.check_backup(p_payload jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if p_payload is null or p_payload->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_payload->'iv') is distinct from 'string'
    or p_payload->>'iv' !~ '^[A-Za-z0-9+/]{16}$'
    or jsonb_typeof(p_payload->'ciphertext') is distinct from 'string'
    or length(p_payload->>'ciphertext') not between 24 and 30000000
    or octet_length(p_payload::text)>33554432
    or (select count(*) from jsonb_object_keys(p_payload))<>3 then
    raise exception 'Invalid encrypted backup or backup exceeds size limit' using errcode='22023';
  end if;
end $$;
revoke all on function ln_private.check_backup(jsonb) from public,anon,authenticated;
