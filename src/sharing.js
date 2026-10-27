import {validateNotebook} from './model.js';
import {selectedKnowledge} from './knowledge.js';
export const MAX_PUBLICATION_BYTES=10*1024*1024;
export function readerEdition(notebook,ids,includeAttachments=true){
  const selected=new Set(ids),available=notebook.entries.filter(e=>selected.has(e.id)).map(e=>({...e,attachments:includeAttachments?e.attachments:[]})),entries=available.map(e=>({
    id:e.id,date:e.date,created:e.created,title:e.title,project:e.project,body:e.body,
    status:e.status,significant:e.significant,sources:e.sources||'',next:e.next||'',
    ...selectedKnowledge(e,selected,available),
    attachments:includeAttachments?e.attachments.map(a=>({id:a.id,name:a.name,kind:a.kind,data:a.data,
      ...(a.sha256?{sha256:a.sha256}:{}),...(a.kind==='table'?{table:a.table}:{})})):[]
  }));
  if(entries.length!==selected.size)throw new Error('A selected entry no longer exists. Refresh the selection.');
  const edition={schema:1,title:notebook.title,subtitle:notebook.subtitle||'',author:notebook.author||'',draft:null,entries};
  for(const key of ['brandName','brandSubtitle'])if(notebook[key]!==undefined)edition[key]=notebook[key];
  if(new TextEncoder().encode(JSON.stringify(edition)).length>MAX_PUBLICATION_BYTES)throw new Error('This shared edition exceeds 10 MB. Select fewer entries or omit attachments.');
  return validateNotebook(edition);
}
export function normalizeReaderEmail(value){const email=String(value).trim().toLowerCase();if(email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a complete email address.');return email;}
export function requireOwner(role){if(role!=='owner')throw new Error('This shared edition is read-only.');}
export function validateCloudConfig(config){
  if(!config)return null;
  if(typeof config.url!=='string'||!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/?$/.test(config.url)||typeof config.publishableKey!=='string')throw new Error('Invalid cloud configuration.');
  const key=config.publishableKey;
  if(key.startsWith('sb_secret_'))throw new Error('A secret API key must never be used in the browser.');
  if(!key.startsWith('sb_publishable_')){let payload;try{payload=JSON.parse(atob(key.split('.')[1]));}catch{}if(payload?.role!=='anon')throw new Error('Use a Supabase publishable key, never a service-role key.');}
  return {url:config.url.replace(/\/$/,''),publishableKey:key};
}
export async function connectCloud(config){
  const safe=validateCloudConfig(config);if(!safe)return null;
  const {createClient}=await import('@supabase/supabase-js');
  return createClient(safe.url,safe.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function cloudResult(result){if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code});return result.data;}
