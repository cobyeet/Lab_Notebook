import {escapeHTML as h} from './model.js';
import {connectCloud, cloudResult} from './sharing.js';
import {saveFile} from './exports.js';
import {createBackup} from './backup.js';

export async function automaticBackups({config, getNotebook, onRestore}) {
  const client = await connectCloud(config);
  const storageKey = config ? `lab-notebook-backup:${config.url}` : '';
  let key, backup, dialog;
  let state = 'Automatic backup is off. Keep a downloaded backup.';
  try {key = JSON.parse(localStorage.getItem(storageKey));} catch {}
  const remember = () => localStorage.setItem(storageKey, JSON.stringify(key));
  const report = text => {state = text; const el = document.querySelector('#backup-state'); if (el) el.textContent = text;};
  const rpc = async (name, args) => cloudResult(await client.rpc(name, args));
  const attach = () => {backup = createBackup({rpc, key, remember, onStatus: report});};
  if (key) attach();
  const saveKey = () => saveFile('lab-notebook-backup-key.json', JSON.stringify({version:1, url:config.url, id:key.id, token:key.token}, null, 2), 'application/json');
  const run = fn => async event => {
    const button = event.currentTarget; button.disabled = true;
    try {await fn(event);} catch (e) {document.querySelector('#backup-message').textContent = e.message;}
    finally {button.disabled = false;}
  };
  async function open() {
    dialog ??= document.createElement('dialog'); if (!dialog.isConnected) document.body.append(dialog);
    dialog.className = 'sharing-dialog';
    dialog.innerHTML = `<div class="dialog-header"><h2>Private automatic backup</h2><button class="close" aria-label="Close private backup">×</button></div><p>Keep your complete notebook, original attachments, drafts, and revisions in an encrypted backup. This does not publish anything to readers.</p><p><b>${h(state)}</b></p><div id="backup-controls"></div><p id="backup-message" role="status"></p>`;
    dialog.querySelector('.close').onclick = () => dialog.close(); if (!dialog.open) dialog.showModal();
    const controls = dialog.querySelector('#backup-controls');
    if (!client) {controls.textContent = 'Private cloud backup is not configured. Keep downloaded JSON backups outside this browser.'; return;}
    if (!key?.id) {
      controls.innerHTML = `<p>Download and keep your private recovery key outside the browser. Use it here after clearing browser data or switching browsers. Anyone with this key can recover your full notebook; never share it with your PI.</p><button class="button primary" id="backup-enable">Enable automatic backup</button><hr><label>Recover an existing private backup<input type="file" id="backup-key-import" accept=".json,application/json"></label>`;
      document.querySelector('#backup-enable').onclick = run(async () => {
        if (!getNotebook().entries.length && !getNotebook().draft) throw new Error('Restore or write your existing notebook before enabling backup. An empty notebook will not replace a backup.');
        key ??= {version:1, url:config.url, token:Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('')};
        remember(); attach(); await backup.enable(getNotebook()); saveKey(); await open();
        document.querySelector('#backup-message').textContent = 'Backup verified. Keep the downloaded private recovery key outside your browser.';
      });
      document.querySelector('#backup-key-import').onchange = run(async event => {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 10000) throw new Error('Invalid backup recovery key file.');
        const candidate = JSON.parse(await file.text());
        if (candidate.version !== 1 || candidate.url !== config.url || !/^[a-f0-9-]{36}$/.test(candidate.id) || !/^[a-f0-9]{64}$/.test(candidate.token)) throw new Error('This is not a private backup key for this database.');
        const trial = createBackup({rpc, key:candidate}); const remote = await trial.latest();
        if (!remote) throw new Error('No private backup was found.');
        key = candidate; remember(); attach();
        // Never replace unrelated local work without the normal restore review.
        await backup.connect(getNotebook(), false); await open();
      });
      return;
    }
    controls.innerHTML = `<p>Changes are backed up automatically while this notebook is open and online. Keep the recovery key in a safe folder or password manager. The ten most recent snapshots are retained.</p><button class="button subtle" id="backup-now">Back up now</button> <button class="button subtle" id="backup-save-key">Download recovery key</button><hr><label>Recover a snapshot<select id="backup-snapshot"></select></label><button class="button subtle" id="backup-recover">Review and restore</button> <button class="button subtle" id="backup-download">Download snapshot</button><p class="sharing-note">Restoring replaces this browser’s notebook only after review. A newer backup from another browser is never overwritten automatically.</p>`;
    const history = await backup.history();
    const select = document.querySelector('#backup-snapshot');
    select.innerHTML = history.map(row=>`<option value="${row.revision}">Snapshot ${row.revision} · ${h(new Date(row.created_at).toLocaleString())}</option>`).join('');
    document.querySelector('#backup-save-key').onclick = saveKey;
    document.querySelector('#backup-now').onclick = run(async () => {await backup.connect(getNotebook(), false); backup.schedule(getNotebook()); await backup.flush(); await open();});
    document.querySelector('#backup-download').onclick = run(async () => {const r = await backup.review(Number(select.value)); saveFile(`lab-notebook-snapshot-${r.revision}.json`, JSON.stringify(r.notebook, null, 2), 'application/json');});
    document.querySelector('#backup-recover').onclick = run(async () => {const r = await backup.review(Number(select.value)); const latest = await backup.latest(); dialog.close(); await onRestore(r.notebook, async () => {const current = await backup.latest(); if (current.revision !== latest.revision) throw new Error('Another browser saved a newer snapshot. Review it before restoring.'); backup.accept(latest);});});
  }
  window.addEventListener('online', () => {if (backup) backup.connect(getNotebook(), false).then(()=>backup.flush()).catch(()=>{});});
  setInterval(() => {if (backup?.unsettled) backup.flush().catch(()=>{});}, 30000);
  window.addEventListener('beforeunload', event => {if (backup?.unsettled) {event.preventDefault(); event.returnValue = '';}});
  return {
    open,
    async initialize(notebook, allowEmptyRecovery) {if (!backup || !key?.id) return null; return backup.connect(notebook, allowEmptyRecovery);},
    changed(notebook) {if (backup && key?.id) backup.schedule(notebook);},
    get status() {return state;},
  };
}
