import {readerEdition} from './sharing.js';

const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
  JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
))), byte => byte.toString(16).padStart(2, '0')).join('');

// Automatic publication never removes an existing reader entry or original file.
export function preserveReaderContent(previous, incoming) {
  const old = new Map(previous.entries.map(e => [e.id, e]));
  const entries = incoming.entries.map(entry => {
    const earlier = old.get(entry.id), originals = new Map((earlier?.attachments || []).map(a => [a.id, a]));
    for (const a of entry.attachments) if (originals.has(a.id) && originals.get(a.id).data !== a.data) throw new Error('An original reader attachment changed. Keep it and attach the replacement with a new ID.');
    return {...entry, attachments: [...entry.attachments, ...(earlier?.attachments || []).filter(a => !entry.attachments.some(next => next.id === a.id))]};
  });
  entries.push(...previous.entries.filter(e => !incoming.entries.some(next => next.id === e.id)));
  return readerEdition({...incoming, entries}, entries.map(e => e.id), true);
}

export function createLiveReader({rpc, key, remember = () => {}, onStatus = () => {}}) {
  let publication, savedHash, pending, running, timer, blocked = true;
  let status = 'Reader updates not connected.';
  const report = text => {status = text; onStatus(text);};
  const args = () => ({p_id: key.id, p_publisher_token: key.token});
  const latest = () => rpc('ln_live_read', args());
  async function connect(notebook) {
    if (running) await running.catch(() => {});
    try {
      publication = await latest(); savedHash = await hash(publication.content);
      key.enabled=publication.enabled;remember();
      if (!publication.enabled) {blocked = true; report('Automatic reader updates are paused.'); return;}
      if (!notebook.entries.length) {blocked = true; report('Reader updates paused: restore your existing notebook first.'); return;}
      const edition = readerEdition(notebook, notebook.entries.map(e => e.id), true);
      const appendOnly = (await Promise.all(edition.entries.map(async e => {const old=publication.content.entries.find(saved=>saved.id===e.id);return !old || await hash(e)===await hash(old);}))).every(Boolean);
      if (await hash(preserveReaderContent(publication.content, edition)) === savedHash) {
        blocked = false; key.hash = savedHash; remember(); report('Reader edition is up to date.');
      } else if (key.hash === savedHash || appendOnly) {
        blocked = false; schedule(notebook);
      } else {blocked = true; report('Reader edition changed elsewhere. Review it before updating this browser.');}
    } catch (e) {blocked = true; report(`Reader updates need attention: ${e.message}`);}
  }
  async function write(notebook) {
    if (!notebook.entries.length) throw new Error('Restore your existing notebook before updating readers.');
    const edition = preserveReaderContent(publication.content, readerEdition(notebook, notebook.entries.map(e => e.id), true));
    const expectedHash = await hash(edition);
    if (expectedHash === savedHash) {report('Reader edition is up to date.'); return;}
    report('Updating reader edition…');
    try {
      const revision = await rpc('ln_live_publish', {...args(), p_content: edition, p_expected_revision: publication.revision});
      publication = {...publication, content: edition, revision};
    } catch (e) {
      const remote = await latest();
      if (await hash(remote.content) === expectedHash) publication = remote;
      else if (remote.revision !== publication.revision) {blocked = true; throw new Error('Reader edition changed elsewhere. Review it before updating this browser.');}
      else throw e;
    }
    savedHash = expectedHash; key.hash = savedHash; remember(); report('Reader edition is up to date.');
  }
  function schedule(notebook) {
    pending = structuredClone(notebook); clearTimeout(timer);
    if (!blocked) {report('Saved changes waiting for reader update…'); timer = setTimeout(() => {flush().catch(() => {});}, 1500);}
  }
  async function flush() {
    clearTimeout(timer);
    if (running) {await running; if (!pending) return;}
    if (blocked) throw new Error(status);
    if (!pending) return;
    const snapshot = pending; pending = null;
    running = write(snapshot).catch(e => {pending ??= snapshot; report(`Reader updates need attention: ${e.message}`); throw e;}).finally(() => {running = null;});
    await running; if (pending) return flush();
  }
  return {
    connect, schedule, flush,
    async retry(notebook) {if (running) return; await connect(notebook); await flush();},
    async pause(enabled) {await rpc('ln_live_toggle', {...args(), p_enabled: enabled}); key.enabled=enabled;remember();blocked = !enabled; if (!enabled) {clearTimeout(timer); report('Automatic reader updates are paused.');}},
    get status() {return status;},
    get unsettled() {return !!(pending || running);},
  };
}
