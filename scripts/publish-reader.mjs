#!/usr/bin/env node
import fs from 'node:fs/promises';
import {validateNotebook} from '../src/model.js';
import {validateCloudConfig} from '../src/sharing.js';
import {createLiveReader} from '../src/live-reader.js';

try {
  const values=process.argv.slice(2);
  if(values.includes('--help')) {console.log('Publish to an explicitly configured existing reader edition:\nnode scripts/publish-reader.mjs --notebook private-notebook.json --key private-update-key.json --config notebook-config.json');process.exit(0);}
  if(values.length!==6||values.some((v,i)=>i%2===0&&!['--notebook','--key','--config'].includes(v)))throw new Error('Supply --notebook, --key and --config. See --help.');
  const args=Object.fromEntries(Array.from({length:3},(_,i)=>[values[i*2],values[i*2+1]]));
  if(Object.keys(args).length!==3)throw new Error('Each option must appear once.');
  const notebook=validateNotebook(JSON.parse(await fs.readFile(args['--notebook'],'utf8')),true);
  const key=JSON.parse(await fs.readFile(args['--key'],'utf8'));
  const config=validateCloudConfig(JSON.parse(await fs.readFile(args['--config'],'utf8')).cloud);
  if(!config||key.version!==1||key.kind!=='reader-updates'||key.url!==config.url||!/^[a-f0-9-]{36}$/.test(key.id)||!/^[a-f0-9]{64}$/.test(key.token))throw new Error('The private update key does not match the configured database.');
  const rpc=async(name,args)=>{const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(30000)});if(!response.headers.get('content-type')?.includes('json'))throw new Error('Reader service returned HTTP '+response.status);const result=await response.json();if(!response.ok)throw new Error(result.message||'Reader service request failed.');return result;};
  const sync=createLiveReader({rpc,key});await sync.connect(notebook);await sync.flush();
  if(key.enabled===false)throw new Error('Automatic reader updates are paused.');
  const temporary=args['--key']+'.tmp-'+process.pid;
  await fs.writeFile(temporary,JSON.stringify(key,null,2)+'\n',{mode:0o600});await fs.rename(temporary,args['--key']);
  console.log(JSON.stringify({updated:true,status:sync.status,entries:notebook.entries.length,attachments:notebook.entries.reduce((n,e)=>n+e.attachments.length,0)}));
} catch(error) {console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
