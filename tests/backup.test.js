import test from 'node:test';
import assert from 'node:assert/strict';
import {blankNotebook} from '../src/model.js';
import {createBackup} from '../src/backup.js';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const sample = () => ({...blankNotebook(), workspace:{bookmarks:['sample']}, entries:[{
  id:'sample', date:'2026-01-23', created:'2026-01-23T12:00:00Z', project:'TEST', title:'Saved experiment',
  body:'Private observation', status:'observation', significant:false, sources:'Source', next:'Review',
  attachments:[{id:'figure',name:'source.txt',kind:'file',data:'data:text/plain;base64,c291cmNl'}],
  revisions:[{body:'Earlier private observation', attachments:[]}]
}], draft:{id:'draft',date:'2026-01-23',created:'2026-01-23T12:00:00Z',project:'TEST',title:'Draft',body:'Unpublished work',status:'in-progress',significant:false,attachments:[]}});
function database() {
  let records=[], token, offline=false, loseResponse=false;
  return {
    get records(){return structuredClone(records);},
    set offline(v){offline=v;}, set loseResponse(v){loseResponse=v;},
    async rpc(name,args) {
      if(offline)throw new Error('Offline');
      if(name==='ln_backup_create') {
        if(!token){token=args.p_owner_token;records=[{id:'00000000-0000-0000-0000-000000000001',revision:1,payload:args.p_payload}];}
        assert.equal(args.p_owner_token,token);return structuredClone(records.at(-1));
      }
      if(args.p_owner_token!==token)throw new Error('Invalid private backup key');
      if(name==='ln_backup_read')return structuredClone(args.p_revision==null?records.at(-1):records.find(r=>r.revision===args.p_revision));
      if(name==='ln_backup_history')return records.map(({revision})=>({revision})).reverse();
      if(name==='ln_backup_write') {
        if(args.p_expected_revision!==records.at(-1).revision)throw new Error('Revision conflict');
        const revision=records.at(-1).revision+1;records.push({revision,payload:args.p_payload});records=records.slice(-10);
        if(loseResponse){loseResponse=false;throw new Error('Response lost');}return revision;
      }
      throw new Error('Unknown RPC');
    },
    corrupt(){records.at(-1).payload.ciphertext='AAAA'+records.at(-1).payload.ciphertext.slice(4);}
  };
}
test('encrypted backup recovers the full notebook, original attachments, drafts, preferences and revisions',async()=>{
  const db=database(),key={token:'a'.repeat(64)}, original=sample(), expected=structuredClone(original);
  const backup=createBackup({rpc:db.rpc,key});await backup.enable(original);
  assert.equal(backup.status,'All changes backed up.');assert.equal(backup.unsettled,false);
  assert.deepEqual(original,expected);
  assert.ok(!JSON.stringify(db.records).includes('Private observation'));
  assert.ok(!JSON.stringify(db.records).includes(key.token));
  const freshBrowser=createBackup({rpc:db.rpc,key:{id:key.id,token:key.token}});
  assert.deepEqual(await freshBrowser.connect(blankNotebook()),expected);
  assert.deepEqual((await freshBrowser.latest()).notebook,expected);
});
test('changed saves upload automatically, identical saves are skipped, and ten recovery snapshots remain',async()=>{
  const db=database(),key={token:'b'.repeat(64)},n=sample();
  const backup=createBackup({rpc:db.rpc,key});await backup.enable(n);
  backup.schedule(n);await backup.flush();assert.equal(db.records.length,1);
  for(let i=0;i<11;i++){n.entries[0].body=`Observation ${i}`;backup.schedule(n);await backup.flush();}
  assert.equal(db.records.length,10);assert.equal((await backup.latest()).notebook.entries[0].body,'Observation 10');
  assert.equal((await backup.review(3)).notebook.entries[0].body,'Observation 1');
});
test('repeated original attachments are stored once while every entry and revision recovers unchanged',async()=>{
  const db=database(),key={token:'a'.repeat(64)},n=sample();
  n.entries[0].attachments[0].data='data:text/plain;base64,'+btoa('original figure bytes'.repeat(1000));
  n.entries[0].revisions=Array.from({length:12},(_,i)=>({...structuredClone(n.entries[0]),revisions:undefined,body:`Revision ${i}`}));
  const expected=JSON.parse(JSON.stringify(n)),backup=createBackup({rpc:db.rpc,key});
  await backup.enable(n);assert.equal(db.records[0].payload.version,2);
  assert.ok(JSON.stringify(db.records[0].payload).length<JSON.stringify(n).length/2);
  assert.deepEqual((await backup.latest()).notebook,expected);
});
test('existing version 1 encrypted snapshots remain recoverable before a compact backup is saved',async()=>{
  const db=database(),key={token:'b'.repeat(64)},n=sample(),iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new TextEncoder();
  const secret=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes.encode(`Lab Notebook backup v1:${key.token}`)),'AES-GCM',false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},secret,bytes.encode(JSON.stringify(n)));
  const payload={version:1,iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(encrypted).toString('base64')};
  key.id=(await db.rpc('ln_backup_create',{p_owner_token:key.token,p_payload:payload})).id;
  const backup=createBackup({rpc:db.rpc,key});assert.deepEqual(await backup.connect(blankNotebook()),n);
  n.entries[0].project='UPDATED';backup.schedule(n);await backup.flush();
  assert.equal(db.records.at(-1).payload.version,2);assert.deepEqual((await backup.review(1)).notebook,sample());
  assert.deepEqual((await backup.latest()).notebook,n);
});
test('offline edits remain pending and retry safely, including a lost successful response',async()=>{
  const db=database(),key={token:'c'.repeat(64)},n=sample();const backup=createBackup({rpc:db.rpc,key});
  await backup.enable(n);db.offline=true;n.entries[0].body='Offline observation';backup.schedule(n);
  await assert.rejects(backup.flush());assert.equal(backup.unsettled,true);assert.match(backup.status,/needs attention/);
  db.offline=false;db.loseResponse=true;await backup.flush();
  assert.equal(backup.unsettled,false);assert.equal(db.records.length,2);
  assert.equal((await backup.latest()).notebook.entries[0].body,'Offline observation');
});
test('a stale browser cannot overwrite newer work or silently replace unrelated local records',async()=>{
  const db=database(),key={token:'d'.repeat(64)},n=sample();const first=createBackup({rpc:db.rpc,key});await first.enable(n);
  const staleKey=structuredClone(key),second=createBackup({rpc:db.rpc,key:staleKey});await second.connect(n);
  n.entries[0].body='Newer work';first.schedule(n);await first.flush();
  const stale=sample();stale.entries[0].body='Stale edit';second.schedule(stale);
  await assert.rejects(second.flush(),/newer work/);assert.equal((await first.latest()).notebook.entries[0].body,'Newer work');
  const reopened=createBackup({rpc:db.rpc,key:staleKey});assert.equal(await reopened.connect(stale),null);
  reopened.schedule(stale);await assert.rejects(reopened.flush(),/different backup/);
});
test('empty storage never overwrites a populated backup while recovery is deferred',async()=>{
  const db=database(),key={token:'e'.repeat(64)},n=sample();const saved=createBackup({rpc:db.rpc,key});await saved.enable(n);
  const returning=createBackup({rpc:db.rpc,key});await returning.connect(blankNotebook(),false);
  returning.schedule(blankNotebook());await assert.rejects(returning.flush(),/different backup/);
  assert.equal(db.records.length,1);assert.deepEqual((await saved.latest()).notebook,n);
});
test('wrong recovery keys and altered ciphertext fail closed without changing saved records',async()=>{
  const db=database(),key={token:'f'.repeat(64)},n=sample();const saved=createBackup({rpc:db.rpc,key});await saved.enable(n);
  const wrong=createBackup({rpc:db.rpc,key:{id:key.id,token:'0'.repeat(64)}});
  assert.equal(await wrong.connect(blankNotebook()),null);assert.match(wrong.status,/Invalid private backup key/);
  db.corrupt();assert.equal(await saved.connect(blankNotebook()),null);assert.match(saved.status,/not connected/);
  assert.equal(db.records.length,1);
});

test('Postgres backup endpoints enforce capabilities, private tables, revision conflicts and retention',async()=>{
  const db=new PGlite(),owner='a'.repeat(64),reader='b'.repeat(64);
  const payload={version:1,iv:'AAAAAAAAAAAAAAAA',ciphertext:'A'.repeat(32)};
  try {
    await db.exec('create role anon; create role authenticated; grant usage on schema public to anon,authenticated;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261026233329_private_automatic_backups.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261026233851_optimize_backup_payload_validation.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261026234014_backup_request_limits.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261027001512_notebook_transfer_limits.sql',import.meta.url),'utf8').then(sql=>sql.slice(sql.indexOf('-- Version 2'))));
    await db.query('select ln_private.check_backup($1)',[{...payload,ciphertext:'A'.repeat(10*1024*1024)}]);
    await db.query('select ln_private.check_backup($1)',[{...payload,version:2}]);
    await assert.rejects(db.query('select ln_private.check_backup($1)',[{...payload,version:3}]),/Invalid encrypted backup/);
    await db.exec('set role anon');
    const initial=(await db.query('select public.ln_backup_create($1,$2) result',[owner,payload])).rows[0].result;
    const id=initial.id;
    assert.equal(initial.revision,1);
    assert.deepEqual((await db.query('select public.ln_backup_create($1,$2) result',[owner,payload])).rows[0].result,initial);
    for(const role of ['anon','authenticated']) {
      await db.exec('reset role; set role '+role);
      for(const table of ['backup_vaults','backup_snapshots'])await assert.rejects(db.query(`select * from ln_private.${table}`),/permission denied/);
      await assert.rejects(db.query('select public.ln_backup_read($1,$2,null)',[id,reader]),/Invalid private backup key/);
      await assert.rejects(db.query('select public.ln_backup_history($1,$2)',[id,reader]),/Invalid private backup key/);
      await assert.rejects(db.query('select public.ln_backup_write($1,$2,$3,1)',[id,reader,payload]),/Invalid private backup key/);
      await assert.rejects(db.query('select ln_private.check_backup($1)',[payload]),/permission denied/);
    }
    await assert.rejects(db.query('select public.ln_backup_write($1,$2,$3,1)',[id,owner,{...payload,cleartext:'secret'}]),/Invalid encrypted backup/);
    await assert.rejects(db.query('select public.ln_backup_write($1,$2,$3,1)',[id,owner,{version:1,iv:null,ciphertext:null}]),/Invalid encrypted backup/);
    assert.equal((await db.query('select public.ln_backup_write($1,$2,$3,1) r',[id,owner,payload])).rows[0].r,2);
    await assert.rejects(db.query('select public.ln_backup_write($1,$2,$3,1)',[id,owner,payload]),/newer backup/);
    await assert.rejects(db.query('select public.ln_backup_write($1,$2,$3,null)',[id,owner,payload]),/newer backup/);
    for(let i=2;i<13;i++)await db.query('select public.ln_backup_write($1,$2,$3,$4)',[id,owner,payload,i]);
    const history=(await db.query('select public.ln_backup_history($1,$2) result',[id,owner])).rows[0].result;
    assert.equal(history.length,10);assert.equal(history[0].revision,13);assert.equal(history.at(-1).revision,4);
    const current=(await db.query('select public.ln_backup_read($1,$2,null) result',[id,owner])).rows[0].result;
    assert.deepEqual(current.payload,payload);
  } finally {await db.close();}
});
