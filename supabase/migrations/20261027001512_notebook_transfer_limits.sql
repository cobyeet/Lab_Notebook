-- Complete reader editions contain original figures; allow a bounded transfer budget.
alter function public.ln_link_read(uuid,text) set statement_timeout='15s';
alter function public.ln_link_manage(uuid,text) set statement_timeout='15s';
alter function public.ln_link_publish(uuid,text,jsonb,bigint) set statement_timeout='15s';

-- Version 2 stores repeated attachment bytes once inside the encrypted envelope.
-- Retain version 1 recovery, private tables, token checks, and the existing size bound.
create or replace function ln_private.check_backup(p_payload jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if p_payload is null or not (p_payload->'version' in ('1'::jsonb,'2'::jsonb))
    or p_payload->'version' is null
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
notify pgrst,'reload schema';
