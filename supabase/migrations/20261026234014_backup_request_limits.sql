-- Full attachment snapshots can exceed anon's default three-second RPC budget.
-- Scope this bounded allowance to backup transfers; leave role/global limits intact.
alter function public.ln_backup_create(text,jsonb) set statement_timeout='15s';
alter function public.ln_backup_read(uuid,text,bigint) set statement_timeout='15s';
alter function public.ln_backup_write(uuid,text,jsonb,bigint) set statement_timeout='15s';
notify pgrst,'reload schema';
