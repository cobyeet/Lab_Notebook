import {escapeHTML as h, validateNotebook} from './model.js';
import {connectCloud, cloudResult, readerEdition} from './sharing.js';
import {saveFile} from './exports.js';

// Local owner keys and revocable reader keys are distinct capabilities.
export async function cloudSharing({config, readId, readToken, getNotebook}) {
  const client = await connectCloud(config);
  const storageKey = config ? `lab-notebook-owner:${config.url}` : '';
  let owner, publication, dialog;
  try {owner = JSON.parse(localStorage.getItem(storageKey));} catch {}
  const rpc = async (name,args) => cloudResult(await client.rpc(name,args));
  const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
  const remember = () => localStorage.setItem(storageKey,JSON.stringify(owner));
  const ownerArgs = () => ({p_id:owner.id,p_owner_token:owner.token});
  const message = (text,error=false) => {const el=document.querySelector('#cloud-state'); if(el){el.textContent=text;el.classList.toggle('error',error);}};
  const run = fn => async event => {
    event?.preventDefault(); const button=event?.submitter||event?.currentTarget;
    if(button?.tagName==='BUTTON')button.disabled=true;
    try {await fn(event);}catch(e){message(e.message,true);}
    finally {if(button?.tagName==='BUTTON')button.disabled=false;}
  };
  const readerURL = key => {const url=new URL(location.href);url.search='';url.searchParams.set('read',owner.id);url.hash=`key=${key}&entry=contents`;return url.href;};
  async function read() {
    if(!client)throw new Error('Reader sharing is not configured on this website.');
    if(!readId||!readToken)throw new Error('This reader link is incomplete. Ask the owner for the full link.');
    const result=await rpc('ln_link_read',{p_id:readId,p_reader_token:readToken});
    return {notebook:validateNotebook(result.content),revision:result.revision};
  }
  function gate(error) {
    document.querySelector('#app').innerHTML=`<div class="access-gate"><div class="eyebrow">PRIVATE READER ACCESS</div><h1>A place for the work.</h1><p>${h(error)}</p><p>Open a complete reader link from the notebook owner. No account or sign-in is needed.</p></div>`;
  }
  async function open() {
    dialog??=document.createElement('dialog');if(!dialog.isConnected)document.body.append(dialog);
    dialog.className='sharing-dialog';
    dialog.innerHTML=`<div class="dialog-header"><div><div class="eyebrow">SHARE THE WORK</div><h2>Reader links</h2></div><button type="button" class="close" id="cloud-close" aria-label="Close reader links">×</button></div><div id="cloud-body"></div><p id="cloud-state" role="status"></p>`;
    document.querySelector('#cloud-close').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
    const body=document.querySelector('#cloud-body');
    if(!client){body.innerHTML='<p>Connect your own Supabase project to enable private reader links. Your working notebook remains local.</p>';return;}
    if(!owner){
      body.innerHTML=`<p>Share selected entries through private, read-only links. Readers need no account. Anyone with a link can read its shared edition; you can revoke each link here.</p><p>Only the entries you choose become readable to readers. Encrypted automatic backups are separate.</p><button class="button primary" id="cloud-create">Set up reader links</button><hr><label>Already set up on another browser?<input id="cloud-import" type="file" accept=".json,application/json"></label><p class="sharing-note">Restore your private owner key to manage an existing shared edition.</p>`;
      document.querySelector('#cloud-create').onclick=run(async()=>{
        const key=token();const id=await rpc('ln_link_create',{p_owner_token:key,p_title:getNotebook().title});
        owner={version:1,url:config.url,id,token:key,links:{}};
        // Download a recovery copy before relying on browser storage.
        saveOwner();remember();await open();message('Sharing is ready. Keep the downloaded owner key private and safe.');
      });
      document.querySelector('#cloud-import').onchange=run(async e=>{
        const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('Invalid owner key file.');
        const data=JSON.parse(await file.text());
        if(data.version!==1||data.url!==config.url||!/^\w{8}-[\w-]{27}$/.test(data.id)||!/^[a-f0-9]{64}$/.test(data.token))throw new Error('This owner key does not match this website’s database.');
        await rpc('ln_link_manage',{p_id:data.id,p_owner_token:data.token});
        owner={version:1,url:config.url,id:data.id,token:data.token,links:data.links||{}};remember();await open();
      });return;
    }
    try{await ownerPanel();}catch(e){body.innerHTML='<p>The owner key could not open this shared edition. Your local notebook is still available.</p><button class="button subtle" id="cloud-forget">Use a different owner key</button>';document.querySelector('#cloud-forget').onclick=()=>{owner=null;localStorage.removeItem(storageKey);open();};message(e.message,true);}
  }
  function saveOwner(){saveFile('lab-notebook-owner-key.json',JSON.stringify(owner,null,2),'application/json');}
  async function ownerPanel() {
    publication=await rpc('ln_link_manage',ownerArgs());
    const selected=new Set(publication.content.entries.map(e=>e.id));
    document.querySelector('#cloud-body').innerHTML=`<p class="sharing-note">Publish a copy of selected entries to your private Supabase database. Drafts and earlier revisions are excluded. Future local changes stay private until you publish again.</p><form id="cloud-publish"><fieldset class="share-entries"><legend>Entries for readers</legend>${getNotebook().entries.length?getNotebook().entries.map(e=>`<label class="checkbox"><input type="checkbox" name="entry" value="${h(e.id)}" ${selected.has(e.id)?'checked':''}><span><b>${h(e.title)}</b><small>${h(e.date)} · ${h(e.project)}</small></span></label>`).join(''):'<p>Save an entry before publishing.</p>'}</fieldset><label class="checkbox"><input type="checkbox" name="attachments">Include original attachments and data</label><p class="sharing-note">${publication.content.entries.length} entries currently shared · revision ${publication.revision}. Publishing replaces this copy. Clearing every selection publishes an empty edition.</p><button class="button primary">Publish selected entries</button></form><hr><h3>Read-only links</h3><p>Anyone with a link can read and export this edition. They cannot edit it. Create a separate link for each person so you can revoke them independently.</p><div class="approved-readers">${publication.links.map(l=>`<div><span>${h(l.label)}${l.revoked_at?' · revoked':''}</span>${l.revoked_at?'':`<span>${owner.links?.[l.id]?`<button class="text-button" data-copy="${h(l.id)}">Copy link</button>`:''}<button class="text-button" data-revoke="${h(l.id)}">Revoke</button></span>`}</div>`).join('')||'<p>No reader links yet.</p>'}</div><form id="cloud-issue" class="reader-approve"><label>Link label<input name="label" maxlength="100" required placeholder="e.g. PI"></label><button class="button subtle">Create reader link</button></form><div id="new-reader-link"></div><hr><button class="button subtle" id="cloud-owner-backup">Back up owner key</button><p class="sharing-note">Keep this key private: it controls publishing and revocation. Restore it through Reader links on another browser. Notebook backups contain research entries; the owner key is a separate recovery file.</p>`;
    document.querySelector('#cloud-publish').onsubmit=run(async e=>{
      const ids=[...e.target.querySelectorAll('[name=entry]:checked')].map(el=>el.value);
      const edition=readerEdition(getNotebook(),ids,e.target.elements.attachments.checked);
      await rpc('ln_link_publish',{...ownerArgs(),p_content:edition,p_expected_revision:publication.revision});
      await ownerPanel();message(`Published ${ids.length} selected ${ids.length===1?'entry':'entries'}.`);
    });
    document.querySelector('#cloud-issue').onsubmit=run(async e=>{
      const key=token();const id=await rpc('ln_link_issue',{...ownerArgs(),p_reader_token:key,p_label:e.target.elements.label.value.trim()});
      owner.links??={};owner.links[id]=key;remember();await ownerPanel();showLink(id);message('Reader link created. Copy it to share.');
    });
    document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=run(async()=>{showLink(b.dataset.copy);await copyLink();}));
    document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=run(async()=>{
      await rpc('ln_link_revoke',{...ownerArgs(),p_link_id:b.dataset.revoke});
      if(owner.links)delete owner.links[b.dataset.revoke];remember();await ownerPanel();message('Reader link revoked.');
    }));
    document.querySelector('#cloud-owner-backup').onclick=saveOwner;
  }
  function showLink(id){document.querySelector('#new-reader-link').innerHTML=`<label>Private reader link<input id="cloud-link" readonly value="${h(readerURL(owner.links[id]))}"></label><button class="button subtle" id="cloud-copy">Copy reader link</button>`;document.querySelector('#cloud-copy').onclick=run(copyLink);}
  async function copyLink(){const input=document.querySelector('#cloud-link');try{await navigator.clipboard.writeText(input.value);message('Reader link copied.');}catch{input.focus();input.select();message('Select and copy the reader link above.');}}
  return {read,gate,open};
}
