import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {blankNotebook} from '../src/model.js';
import {readerEdition} from '../src/sharing.js';
import {createLiveReader,preserveReaderContent} from '../src/live-reader.js';

const entry = id => ({id,date:'2026-01-23',created:'2026-01-23T12:00:00Z',project:'TEST',title:id,body:'Saved research',status:'observation',significant:false,sources:'Source',next:'Review',attachments:[{id:'original',name:'original.txt',kind:'file',data:'data:text/plain;base64,aGk='}]});
const sample = () => ({...blankNotebook(),entries:[entry('first')],draft:null});
function database(notebook) {
  let content=readerEdition(notebook,notebook.entries.map(e=>e.id)),revision=1,enabled=true,offline=false,loseResponse=false;
  return {
    get content(){return structuredClone(content);},get revision(){return revision;},
    set offline(value){offline=value;},set loseResponse(value){loseResponse=value;},
    editElsewhere(){content.entries[0].body='Newer remote work';revision++;},
    async rpc(name,args) {
      if(offline)throw new Error('Offline');
      if(name==='ln_live_read')return structuredClone({content,revision,enabled});
      if(name==='ln_live_toggle'){enabled=args.p_enabled;return;}
      if(name==='ln_live_publish') {
        if(!enabled)throw new Error('Paused');
        if(args.p_expected_revision!==revision)throw new Error('Reader edition changed');
        content=preserveReaderContent(content,args.p_content);revision++;
        if(loseResponse){loseResponse=false;throw new Error('Response lost');}
        return revision;
      }
      throw new Error('Unknown RPC');
    },
  };
}
test('saved future entries and original attachments update the same edition without publishing private drafts or history',async()=>{
  const n=sample(),db=database(n),key={id:'edition',token:'private'},sync=createLiveReader({rpc:db.rpc,key});
  await sync.connect(n);assert.match(sync.status,/up to date/);assert.equal(db.revision,1);
  n.entries.push(entry('second'));n.entries[0].attachments.push({id:'new-file',name:'new.txt',kind:'file',data:'data:text/plain;base64,bmV3'});
  n.entries[0].revisions=[{body:'Private history'}];n.draft={body:'Private unsaved draft'};
  const before=structuredClone(n);sync.schedule(n);await sync.flush();
  assert.deepEqual(n,before);assert.equal(db.revision,2);assert.equal(db.content.entries.length,2);
  assert.equal(db.content.entries[0].attachments.length,2);assert.equal(db.content.draft,null);
  assert.ok(!JSON.stringify(db.content).includes('Private'));assert.equal(sync.unsettled,false);
});
test('offline saves retry, and lost publication responses reconcile without a duplicate update',async()=>{
  const n=sample(),db=database(n),key={id:'edition',token:'private'},sync=createLiveReader({rpc:db.rpc,key});
  await sync.connect(n);db.offline=true;n.entries.push(entry('second'));sync.schedule(n);
  await assert.rejects(sync.flush());assert.equal(sync.unsettled,true);
  db.offline=false;db.loseResponse=true;await sync.retry(n);assert.equal(db.revision,2);assert.equal(db.content.entries.length,2);
  sync.schedule(n);await sync.flush();assert.equal(db.revision,2);
});
test('stale browsers and unknown conflicting restores stop without overwriting newer reader work',async()=>{
  const n=sample(),db=database(n),key={id:'edition',token:'private'},sync=createLiveReader({rpc:db.rpc,key});
  await sync.connect(n);const oldKey=structuredClone(key);db.editElsewhere();n.entries[0].body='Older browser edit';sync.schedule(n);
  await assert.rejects(sync.flush(),/changed elsewhere/);assert.equal(db.content.entries[0].body,'Newer remote work');
  const reopened=createLiveReader({rpc:db.rpc,key:oldKey});await reopened.connect(n);reopened.schedule(n);
  await assert.rejects(reopened.flush(),/changed elsewhere/);assert.equal(db.revision,2);
});
test('local omissions never remove reader entries or original attachments, and empty recovery stores cannot publish',async()=>{
  const n=sample();n.entries.push(entry('second'));const db=database(n),sync=createLiveReader({rpc:db.rpc,key:{id:'edition',token:'private'}});
  await sync.connect(n);n.entries.pop();n.entries[0].attachments=[];sync.schedule(n);await sync.flush();
  assert.equal(db.content.entries.length,2);assert.equal(db.content.entries[0].attachments.length,1);
  await sync.connect(blankNotebook());sync.schedule(blankNotebook());await assert.rejects(sync.flush(),/restore your existing notebook/i);
  assert.equal(db.content.entries.length,2);
});
test('changed original bytes are rejected, and pausing keeps the reader edition unchanged',async()=>{
  const n=sample(),db=database(n),key={id:'edition',token:'private'},sync=createLiveReader({rpc:db.rpc,key});await sync.connect(n);
  n.entries[0].attachments[0].data='data:text/plain;base64,bmV3';sync.schedule(n);await assert.rejects(sync.flush(),/original reader attachment changed/);
  assert.equal(db.content.entries[0].attachments[0].data,'data:text/plain;base64,aGk=');
  n.entries[0].attachments[0].data='data:text/plain;base64,aGk=';await sync.pause(false);assert.equal(key.enabled,false);
  n.entries.push(entry('second'));sync.schedule(n);await assert.rejects(sync.flush(),/paused/);assert.equal(db.revision,1);
  await sync.pause(true);await sync.retry(n);assert.equal(key.enabled,true);assert.equal(db.content.entries.length,2);
});
test('Postgres protects automatic publication capabilities, existing records, original bytes, conflicts and the unchanged reader link',async()=>{
  const db=new PGlite(),owner='a'.repeat(64),reader='b'.repeat(64),publisher='c'.repeat(64),n=sample();
  try {
    await db.exec('create role anon;create role authenticated;grant usage on schema public to anon,authenticated;create schema ln_private;revoke all on schema ln_private from public,anon,authenticated;');
    await db.exec(await readFile(new URL('../supabase/migrations/202610260002_reader_links.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261027003116_live_reader_updates.sql',import.meta.url),'utf8'));
    await db.exec('set role anon');
    const id=(await db.query('select public.ln_link_create($1,$2) id',[owner,n.title])).rows[0].id;
    await db.query('select public.ln_link_publish($1,$2,$3,0)',[id,owner,n]);
    const link=(await db.query("select public.ln_link_issue($1,$2,$3,'PI') id",[id,owner,reader])).rows[0].id;
    assert.equal((await db.query('select public.ln_link_revision($1,$2) r',[id,reader])).rows[0].r,1);
    await assert.rejects(db.query('select public.ln_link_revision($1,$2)',[id,publisher]),/unavailable or has been revoked/);
    await assert.rejects(db.query('select public.ln_live_configure($1,$2,$3)',[id,reader,publisher]),/Invalid owner key/);
    await assert.rejects(db.query('select public.ln_live_configure($1,$2,$3)',[id,owner,reader]),/separate private update key/);
    await db.query('select public.ln_live_configure($1,$2,$3)',[id,owner,publisher]);
    for(const role of ['anon','authenticated']) {
      await db.exec('reset role;set role '+role);
      await assert.rejects(db.query('select * from ln_private.live_publications'),/permission denied/);
      await assert.rejects(db.query('select public.ln_live_read($1,$2)',[id,reader]),/Invalid reader update key/);
      await assert.rejects(db.query('select public.ln_live_publish($1,$2,$3,1)',[id,reader,n]),/Invalid or paused/);
      await assert.rejects(db.query('select public.ln_link_manage($1,$2)',[id,publisher]),/Invalid owner key/);
      await assert.rejects(db.query("select public.ln_link_issue($1,$2,$3,'No')",[id,publisher,'d'.repeat(64)]),/Invalid owner key/);
      await assert.rejects(db.query('select public.ln_link_revoke($1,$2,$3)',[id,publisher,link]),/Invalid owner key/);
    }
    n.entries.push(entry('second'));n.draft={body:'private draft'};n.entries[0].revisions=[{body:'private history'}];
    assert.equal((await db.query('select public.ln_live_publish($1,$2,$3,1) revision',[id,publisher,n])).rows[0].revision,2);
    const shared=(await db.query('select public.ln_link_read($1,$2) result',[id,reader])).rows[0].result;
    assert.equal(shared.content.entries.length,2);assert.ok(!JSON.stringify(shared.content).includes('private'));
    await assert.rejects(db.query('select public.ln_live_publish($1,$2,$3,1)',[id,publisher,n]),/changed/);
    n.entries.pop();n.entries[0].attachments=[];n.entries[0].body='Intentional revision';
    await db.query('select public.ln_live_publish($1,$2,$3,2)',[id,publisher,n]);
    let current=(await db.query('select public.ln_live_read($1,$2) result',[id,publisher])).rows[0].result;
    assert.equal(current.content.entries.length,2);assert.equal(current.content.entries[0].attachments.length,1);
    const changed=structuredClone(current.content);changed.entries[0].attachments[0].data='data:text/plain;base64,bmV3';
    await assert.rejects(db.query('select public.ln_live_publish($1,$2,$3,3)',[id,publisher,changed]),/original reader attachment changed/);
    await db.query('select public.ln_live_toggle($1,$2,false)',[id,publisher]);
    await assert.rejects(db.query('select public.ln_live_publish($1,$2,$3,3)',[id,publisher,n]),/paused/);
    await db.query('select public.ln_live_toggle($1,$2,true)',[id,publisher]);
    assert.equal((await db.query('select public.ln_live_publish($1,$2,$3,3) r',[id,publisher,current.content])).rows[0].r,3);
    const final=(await db.query('select public.ln_link_read($1,$2) result',[id,reader])).rows[0].result;assert.deepEqual(final.content,current.content);
    assert.equal((await db.query('select public.ln_link_revision($1,$2) r',[id,reader])).rows[0].r,3);
    await db.query('select public.ln_link_revoke($1,$2,$3)',[id,owner,link]);
    await assert.rejects(db.query('select public.ln_link_revision($1,$2)',[id,reader]),/unavailable or has been revoked/);
  } finally {await db.close();}
});
