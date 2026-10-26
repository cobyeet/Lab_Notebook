-- Optional research fields on explicitly selected entries. No new grants or tables.
-- Drafts, revisions, workspace preferences and unselected references remain excluded.
create function public.ln_research_metadata(e jsonb, p_entries jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb='{}'; k text; v jsonb; item jsonb; arr jsonb; cards jsonb='[]'; lines jsonb='[]';
begin
  if e ? 'kind' then
    if jsonb_typeof(e->'kind') is distinct from 'string' or e->>'kind' not in ('entry','experiment','analysis','meeting','literature','question','recording','method','figure','board') then raise exception 'Invalid page kind'; end if;
    result=result||jsonb_build_object('kind',e->'kind');
  end if;
  foreach k in array array['tags','aliases'] loop
    if e ? k then
      if jsonb_typeof(e->k)<>'array' or jsonb_array_length(e->k)>100 then raise exception 'Invalid research list'; end if;
      if exists(select 1 from jsonb_array_elements(e->k) x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>200) then raise exception 'Invalid research list'; end if;
      result=result||jsonb_build_object(k,e->k);
    end if;
  end loop;
  if e ? 'properties' then
    if jsonb_typeof(e->'properties')<>'object' then raise exception 'Invalid properties'; end if;
    if (select count(*) from jsonb_object_keys(e->'properties'))>50 then raise exception 'Invalid properties'; end if;
    for k,v in select * from jsonb_each(e->'properties') loop
      if length(btrim(k))=0 or length(k)>100 or k in ('__proto__','constructor','prototype') or jsonb_typeof(v) not in ('string','number','boolean') or (jsonb_typeof(v)='string' and length(v#>>'{}')>2000) then raise exception 'Invalid property'; end if;
    end loop;
    result=result||jsonb_build_object('properties',e->'properties');
  end if;
  if e ? 'links' then
    if jsonb_typeof(e->'links')<>'array' or jsonb_array_length(e->'links')>200 then raise exception 'Invalid relationships'; end if;
    arr='[]';
    for item in select * from jsonb_array_elements(e->'links') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or coalesce(item->>'target','') !~ '^[A-Za-z0-9_-]{1,100}$'
        or jsonb_typeof(item->'type') is distinct from 'string' or item->>'type' not in ('references','reanalyzes','uses-protocol','supports','challenges','follows-up','supersedes','resolves')
        or (item ? 'reason' and (jsonb_typeof(item->'reason') is distinct from 'string' or length(item->>'reason')>2000)) then raise exception 'Invalid relationship'; end if;
      if exists(select 1 from jsonb_array_elements(p_entries) t where t->>'id'=item->>'target') then
        arr=arr||jsonb_build_array(jsonb_build_object('id',item->'id','target',item->'target','type',item->'type','reason',coalesce(item->'reason','""'::jsonb)));
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(e->'links') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate relationship ID'; end if;
    result=result||jsonb_build_object('links',arr);
  end if;
  if e ? 'tasks' then
    if jsonb_typeof(e->'tasks')<>'array' or jsonb_array_length(e->'tasks')>200 then raise exception 'Invalid tasks'; end if;
    arr='[]';
    for item in select * from jsonb_array_elements(e->'tasks') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(item->'text') is distinct from 'string' or length(item->>'text')>2000
        or jsonb_typeof(item->'state') is distinct from 'string' or item->>'state' not in ('open','completed','revised','abandoned')
        or (coalesce(item->>'outcome','')<>'' and item->>'outcome' !~ '^[A-Za-z0-9_-]{1,100}$')
        or (item ? 'reason' and (jsonb_typeof(item->'reason') is distinct from 'string' or length(item->>'reason')>2000)) then raise exception 'Invalid task'; end if;
      v=jsonb_build_object('id',item->'id','text',item->'text','state',item->'state','reason',coalesce(item->'reason','""'::jsonb));
      if exists(select 1 from jsonb_array_elements(p_entries) t where t->>'id'=item->>'outcome') then v=v||jsonb_build_object('outcome',item->'outcome'); end if;
      arr=arr||jsonb_build_array(v);
    end loop;
    if exists(select 1 from jsonb_array_elements(e->'tasks') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate task ID'; end if;
    result=result||jsonb_build_object('tasks',arr);
  end if;
  if e ? 'board' then
    if jsonb_typeof(e->'board'->'cards') is distinct from 'array' or jsonb_typeof(e->'board'->'connections') is distinct from 'array' then raise exception 'Invalid board'; end if;
    if jsonb_array_length(e->'board'->'cards')>200 or jsonb_array_length(e->'board'->'connections')>400 then raise exception 'Invalid board'; end if;
    for item in select * from jsonb_array_elements(e->'board'->'cards') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or coalesce(item->>'target','') !~ '^[A-Za-z0-9_-]{1,100}$'
        or jsonb_typeof(item->'x') is distinct from 'number' or jsonb_typeof(item->'y') is distinct from 'number'
        or abs((item->>'x')::numeric)>100000 or abs((item->>'y')::numeric)>100000
        or (item ? 'attachment' and coalesce(item->>'attachment','') !~ '^[A-Za-z0-9_-]{1,100}$') then raise exception 'Invalid board card'; end if;
      if exists(select 1 from jsonb_array_elements(p_entries) t where t->>'id'=item->>'target'
        and (not (item ? 'attachment') or exists(select 1 from jsonb_array_elements(t->'attachments') a where a->>'id'=item->>'attachment'))) then
        cards=cards||jsonb_build_array(jsonb_build_object('id',item->'id','target',item->'target','x',item->'x','y',item->'y')||case when item ? 'attachment' then jsonb_build_object('attachment',item->'attachment') else '{}'::jsonb end);
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(e->'board'->'cards') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate board card'; end if;
    for item in select * from jsonb_array_elements(e->'board'->'connections') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$'
        or not exists(select 1 from jsonb_array_elements(e->'board'->'cards') c where c->>'id'=item->>'from')
        or not exists(select 1 from jsonb_array_elements(e->'board'->'cards') c where c->>'id'=item->>'to')
        or (item ? 'label' and (jsonb_typeof(item->'label') is distinct from 'string' or length(item->>'label')>200)) then raise exception 'Invalid board connection'; end if;
      if exists(select 1 from jsonb_array_elements(cards) c where c->>'id'=item->>'from') and exists(select 1 from jsonb_array_elements(cards) c where c->>'id'=item->>'to') then
        lines=lines||jsonb_build_array(jsonb_build_object('id',item->'id','from',item->'from','to',item->'to','label',coalesce(item->'label','""'::jsonb)));
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(e->'board'->'connections') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate board connection'; end if;
    result=result||jsonb_build_object('board',jsonb_build_object('cards',cards,'connections',lines));
  end if;
  return result;
end $$;
revoke all on function public.ln_research_metadata(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.ln_clean_edition(p_content jsonb) returns jsonb
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
        from jsonb_array_elements(e->'attachments') a)) || public.ln_research_metadata(e, p_content->'entries')), '[]'::jsonb)
    into published_entries from jsonb_array_elements(p_content->'entries') e;
  clean=jsonb_build_object('schema',1,'title',p_content->'title','subtitle',coalesce(p_content->'subtitle','""'::jsonb),
    'author',coalesce(p_content->'author','""'::jsonb),'draft',null,'entries',published_entries);
  if p_content ? 'brandName' then clean=clean||jsonb_build_object('brandName',p_content->'brandName'); end if;
  if p_content ? 'brandSubtitle' then clean=clean||jsonb_build_object('brandSubtitle',p_content->'brandSubtitle'); end if;
  return clean;
end $$;
revoke all on function public.ln_clean_edition(jsonb) from public,anon,authenticated;

-- Keep the optional email-auth publisher on the same selection sanitizer.
create or replace function public.ln_publish_notebook(p_notebook_id uuid,p_content jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare clean jsonb; new_revision bigint;
begin
  if not exists(select 1 from public.ln_notebooks where id=p_notebook_id and owner_id=(select auth.uid())) then
    raise exception 'Only the notebook owner may publish' using errcode='42501';
  end if;
  clean=public.ln_clean_edition(p_content);
  update public.ln_publications set content=clean,revision=revision+1,updated_at=now()
    where notebook_id=p_notebook_id and revision=p_expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'Shared edition changed; refresh before publishing' using errcode='40001'; end if;
  update public.ln_notebooks set title=p_content->>'title' where id=p_notebook_id;
  return new_revision;
end $$;
revoke all on function public.ln_publish_notebook(uuid,jsonb,bigint) from public,anon;
grant execute on function public.ln_publish_notebook(uuid,jsonb,bigint) to authenticated;
