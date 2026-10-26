import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {exampleNotebook} from '../src/model.js';
import {readerEdition, normalizeReaderEmail, requireOwner, validateCloudConfig} from '../src/sharing.js';

test('shared editions contain only explicit entries and current public fields', () => {
  const n = exampleNotebook();
  n.draft = {body:'private draft'};
  n.entries[0].revisions = [{body:'earlier confidential text'}];
  n.entries[0].privateNotes = 'not for readers';
  const edition = readerEdition(n, [n.entries[0].id]);
  assert.equal(edition.entries.length,1);
  assert.equal(edition.draft,null);
  assert.equal(JSON.stringify(edition).includes('confidential'),false);
  assert.equal(edition.entries[0].privateNotes,undefined);
  assert.throws(()=>readerEdition(n,['missing']),/no longer exists/);
  assert.equal(readerEdition(n,[]).entries.length,0);
  assert.equal(normalizeReaderEmail(' PI@Example.ORG '),'pi@example.org');
  assert.throws(()=>normalizeReaderEmail('bad-email'));
  assert.throws(()=>requireOwner('reader'),/read-only/);
  assert.throws(()=>validateCloudConfig({url:'https://example.supabase.co',publishableKey:'sb_secret_example'}),/secret/);
  const token = `header.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64')}.signature`;
  assert.throws(()=>validateCloudConfig({url:'https://example.supabase.co',publishableKey:token}),/service-role/);
});

test('Postgres enforces owner writes, verified reader access, revocation and snapshot filtering', async () => {
  const db = new PGlite();
  const ids = ['owner','reader','outsider','unconfirmed'].map((_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`);
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202610260001_reader_access.sql',import.meta.url),'utf8'));
    for(const file of ['202610260002_reader_links.sql','20261026223159_research_connections.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    for (const [i,name] of ['owner','reader','outsider','unconfirmed'].entries())
      await db.query('insert into auth.users values ($1,$2,$3)', [ids[i],`${name}@example.org`,i===3?null:'2026-01-01T00:00:00Z']);
    async function as(index,fn) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[index===null?'':ids[index]]);
      await db.exec(index===null?'set role anon':'set role authenticated');
      return fn();
    }
    let notebookId;
    await as(0, async()=>{
      notebookId=(await db.query("select public.ln_create_notebook('Test notebook') id")).rows[0].id;
      await db.query('insert into public.ln_readers(notebook_id,email) values ($1,$2),($1,$3)',[notebookId,'reader@example.org','unconfirmed@example.org']);
    });
    const n = exampleNotebook(); n.draft = {body:'secret draft'}; n.extra='private top level';
    n.entries[0].revisions=[{body:'private history'}]; n.entries[0].extra='private entry';
    n.entries[0].properties={recordingId:'R-001'};n.entries[0].tags=['timing'];
    n.entries[0].attachments=[{id:'attachment',name:'source.txt',kind:'file',data:'data:text/plain;base64,aGk=',extra:'private attachment'}];
    await as(0, async()=>{
      assert.equal((await db.query('select public.ln_publish_notebook($1,$2,0) revision',[notebookId,n])).rows[0].revision,1);
      await assert.rejects(db.query('select public.ln_publish_notebook($1,$2,0)',[notebookId,n]),/changed/);
      await assert.rejects(db.query('select public.ln_publish_notebook($1,$2,1)',[notebookId,{}]),/Invalid/);
    });
    await as(1, async()=>{
      const publications=(await db.query('select content from public.ln_publications')).rows;
      assert.equal(publications.length,1);
      assert.equal(JSON.stringify(publications).includes('private'),false);
      assert.equal(publications[0].content.draft,null);
      assert.equal(publications[0].content.entries[0].properties.recordingId,'R-001');
      assert.equal((await db.query('select * from public.ln_readers')).rows.length,0);
      assert.equal((await db.query('select * from public.ln_accessible_notebooks()')).rows[0].access_role,'reader');
      await assert.rejects(db.query('select public.ln_publish_notebook($1,$2,1)',[notebookId,n]),/Only the notebook owner/);
      await assert.rejects(db.query('insert into public.ln_readers(notebook_id,email) values ($1,$2)',[notebookId,'outsider@example.org']),/row-level security/);
      assert.equal((await db.query('delete from public.ln_readers returning *')).rows.length,0);
      await assert.rejects(db.query('update public.ln_publications set content=$1',[n]),/permission denied/);
    });
    for (const index of [2,3]) await as(index,async()=>{
      assert.equal((await db.query('select * from public.ln_publications')).rows.length,0);
      assert.equal((await db.query('select * from public.ln_accessible_notebooks()')).rows.length,0);
    });
    await as(3,async()=>assert.rejects(db.query("select public.ln_create_notebook('No')"),/Verified email/));
    await as(null,async()=>{
      await assert.rejects(db.query('select * from public.ln_publications'),/permission denied/);
      await assert.rejects(db.query('select * from public.ln_accessible_notebooks()'),/permission denied/);
    });
    await as(0,async()=>db.query('delete from public.ln_readers where notebook_id=$1 and email=$2',[notebookId,'reader@example.org']));
    await as(1,async()=>assert.equal((await db.query('select * from public.ln_publications')).rows.length,0));
  } finally {await db.close();}
});

test('private links work without login and cannot publish, manage, enumerate, or survive revocation', async () => {
  const db=new PGlite();
  const owner='a'.repeat(64),reader='b'.repeat(64),other='c'.repeat(64);
  try {
    await db.exec('create role anon; create role authenticated; grant usage on schema public to anon,authenticated;');
    await db.exec(await readFile(new URL('../supabase/migrations/202610260002_reader_links.sql',import.meta.url),'utf8'));
    await db.exec('set role anon');
    const id=(await db.query("select public.ln_link_create($1,'Link test') id",[owner])).rows[0].id;
    const n=exampleNotebook();n.draft={body:'private draft'};n.entries[0].revisions=[{body:'private history'}];
    n.entries[0].attachments=[{id:'source',name:'source.txt',kind:'file',data:'data:text/plain;base64,aGk=',extra:'private metadata'}];
    await db.query('select public.ln_link_publish($1,$2,$3,0)',[id,owner,n]);
    const link=(await db.query("select public.ln_link_issue($1,$2,$3,'PI') id",[id,owner,reader])).rows[0].id;
    const result=(await db.query('select public.ln_link_read($1,$2) result',[id,reader])).rows[0].result;
    assert.equal(result.content.entries.length,3);
    assert.equal(result.revision,1);
    assert.equal(JSON.stringify(result).includes('private'),false);
    for(const table of ['ln_link_notebooks','ln_reader_links']) await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
    await assert.rejects(db.query('select public.ln_link_read($1,$2)',[id,other]),/unavailable/);
    await assert.rejects(db.query('select public.ln_link_read($1,$2)',[id,owner]),/unavailable/);
    await assert.rejects(db.query('select public.ln_link_manage($1,$2)',[id,reader]),/Invalid owner/);
    await assert.rejects(db.query('select public.ln_link_publish($1,$2,$3,1)',[id,reader,n]),/Invalid owner/);
    await assert.rejects(db.query('select public.ln_link_publish($1,$2,$3,0)',[id,owner,n]),/changed/);
    await assert.rejects(db.query('select public.ln_link_publish($1,$2,$3,1)',[id,owner,{}]),/Invalid/);
    await assert.rejects(db.query("select public.ln_link_issue($1,$2,$3,'Attacker')",[id,reader,other]),/Invalid owner/);
    await assert.rejects(db.query('select public.ln_link_revoke($1,$2,$3)',[id,reader,link]),/Invalid owner/);
    await db.query('select public.ln_link_revoke($1,$2,$3)',[id,owner,link]);
    await assert.rejects(db.query('select public.ln_link_read($1,$2)',[id,reader]),/revoked/);
    const state=(await db.query('select public.ln_link_manage($1,$2) result',[id,owner])).rows[0].result;
    assert.ok(state.links[0].revoked_at);
    assert.equal(JSON.stringify(state).includes(owner),false);
    assert.equal(JSON.stringify(state).includes(reader),false);
  } finally {await db.close();}
});
