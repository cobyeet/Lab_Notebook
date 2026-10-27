import {validateNotebook} from './model.js';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const bytes = new TextEncoder();
const base64 = data => {
  let text = '';
  for (let i = 0; i < data.length; i += 32768) text += String.fromCharCode(...data.subarray(i, i + 32768));
  return btoa(text);
};
const unbase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const fingerprint = async text => base64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(text))));

// The database receives ciphertext only. The private recovery key never belongs in a reader link.
export function createBackup({rpc, key, remember = () => {}, onStatus = () => {}}) {
  let revision, savedHash, blocked = false, pending, running, timer;
  let status = 'Automatic backup not connected.';
  const report = text => {status = text; onStatus(text);};
  const secret = async () => crypto.subtle.importKey('raw',
    await crypto.subtle.digest('SHA-256', bytes.encode(`Lab Notebook backup v1:${key.token}`)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const args = () => ({p_id: key.id, p_owner_token: key.token});
  async function unpack(record) {
    if (!record) return null;
    if (![1, 2].includes(record.payload?.version)) throw new Error('Unsupported encrypted backup.');
    const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unbase64(record.payload.iv)}, await secret(), unbase64(record.payload.ciphertext));
    const decoded = JSON.parse(new TextDecoder().decode(clear));
    if (record.payload.version === 2) {
      if (!Array.isArray(decoded.attachmentData)) throw new Error('Invalid encrypted attachment index.');
      for (const entry of [...decoded.notebook.entries, ...(decoded.notebook.draft ? [decoded.notebook.draft] : [])]) {
        for (const saved of [entry, ...(entry.revisions || [])]) for (const attachment of saved.attachments || []) {
          if (!Number.isInteger(attachment.data) || typeof decoded.attachmentData[attachment.data] !== 'string') throw new Error('Invalid encrypted attachment reference.');
          attachment.data = decoded.attachmentData[attachment.data];
        }
      }
    }
    const notebook = validateNotebook(record.payload.version === 2 ? decoded.notebook : decoded, true);
    return {...record, notebook, hash: await fingerprint(JSON.stringify(notebook))};
  }
  async function latest() {return unpack(await rpc('ln_backup_read', {...args(), p_revision: null}));}
  async function connect(notebook, allowEmptyRecovery = true) {
    try {
      const remote = await latest();
      if (!remote) throw new Error('No private backup was found for this recovery key.');
      revision = remote.revision; savedHash = remote.hash;
      const hash = await fingerprint(JSON.stringify(notebook));
      if (hash === savedHash) {blocked = false; key.hash = hash; remember(); report('All changes backed up.');}
      else if (allowEmptyRecovery && !notebook.entries.length && !notebook.draft) {
        blocked = false; key.hash = savedHash; remember(); report('Notebook recovered from private backup.'); return remote.notebook;
      } else if (notebook.entries.length || notebook.draft) {
        if (key.hash === savedHash) {blocked = false; schedule(notebook);}
        else {blocked = true; report('A different backup exists. Review it before backing up this browser.');}
      }
      else {blocked = true; report('A different backup exists. Review it before backing up this browser.');}
    } catch (e) {blocked = true; report(`Backup not connected: ${e.message}`);}
    return null;
  }
  async function write(notebook) {
    const text = JSON.stringify(validateNotebook(structuredClone(notebook), true));
    if (bytes.encode(text).length > MAX_BACKUP_BYTES) throw new Error('Private backup exceeds 20 MB. Download a JSON backup and reduce attachment size.');
    const hash = await fingerprint(text);
    if (hash === savedHash) {report('All changes backed up.'); return;}
    // Revision history often repeats the same original figures. Store their bytes once
    // inside the encrypted envelope, then restore every complete record on recovery.
    const packed = JSON.parse(text), attachmentData = [], indexes = new Map();
    for (const entry of [...packed.entries, ...(packed.draft ? [packed.draft] : [])]) {
      for (const saved of [entry, ...(entry.revisions || [])]) for (const attachment of saved.attachments || []) {
        if (typeof attachment.data !== 'string') throw new Error('Invalid saved attachment data.');
        if (!indexes.has(attachment.data)) {indexes.set(attachment.data, attachmentData.length); attachmentData.push(attachment.data);}
        attachment.data = indexes.get(attachment.data);
      }
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await secret(), bytes.encode(JSON.stringify({notebook: packed, attachmentData})));
    const payload = {version: 2, iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted))};
    report('Backing up changes…');
    try {
      if (!key.id) {
        const result = await rpc('ln_backup_create', {p_owner_token: key.token, p_payload: payload});
        key.id = result.id; revision = result.revision;
        remember();
        const existing = await unpack(result);
        if (existing.hash !== hash) {blocked = true; throw new Error('An existing backup was found. Review it before backing up this browser.');}
      } else revision = await rpc('ln_backup_write', {...args(), p_payload: payload, p_expected_revision: revision});
    } catch (e) {
      // A response can be lost after a successful write. Reconcile before retrying.
      if (key.id) {
        const remote = await latest();
        if (remote?.hash === hash) revision = remote.revision;
        else if (remote && remote.revision !== revision) {blocked = true; throw new Error('Another browser backed up newer work. Review the latest backup before continuing.');}
        else throw e;
      } else throw e;
    }
    savedHash = hash; key.hash = hash; remember(); report('All changes backed up.');
  }
  function schedule(notebook) {
    pending = structuredClone(notebook); clearTimeout(timer);
    report(blocked ? status : 'Changes waiting for private backup…');
    if (!blocked) timer = setTimeout(() => {flush().catch(() => {});}, 1500);
  }
  async function flush() {
    clearTimeout(timer);
    if (running) {await running; if (!pending) return;}
    if (blocked) throw new Error(status);
    if (!pending) return;
    const snapshot = pending; pending = null;
    running = write(snapshot).catch(e => {pending ??= snapshot; report(`Backup needs attention: ${e.message}`); throw e;}).finally(() => {running = null;});
    await running;
    if (pending) return flush();
  }
  return {
    connect, schedule, flush, latest,
    async enable(notebook) {blocked = false; pending = structuredClone(notebook); await flush();},
    async review(rev) {return unpack(await rpc('ln_backup_read', {...args(), p_revision: rev}));},
    async history() {return rpc('ln_backup_history', args());},
    accept(record) {revision = record.revision; savedHash = record.hash; key.hash = savedHash; blocked = false; pending = null; remember(); report('All changes backed up.');},
    get status() {return status;},
    get unsettled() {return !!(pending || running);},
  };
}
