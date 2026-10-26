import "./style.css";
import {
  blankNotebook,
  exampleNotebook,
  paginate,
  parseCSV,
  parseSelection,
  validateNotebook,
  escapeHTML as h,
  renderTextLinks,
} from "./model.js";
import { readNotebook, writeNotebook } from "./storage.js";
import { saveFile, exportBundle } from "./exports.js";
import { cloudSharing } from "./cloud-ui.js";
import { automaticBackups } from './backup-ui.js';
import { createExplorer, researchEditorMarkup, bindResearchEditor } from './explore.js';
const readId = new URL(location.href).searchParams.get("read");
const readOnly = new URL(location.href).searchParams.has("read");
const readToken = new URLSearchParams(location.hash.slice(1)).get('key');
let sharing, backups, cloudConfig, sharedRevision;
function pageHash(id) {return readOnly ? '#key='+encodeURIComponent(readToken||'')+'&entry='+encodeURIComponent(id) : id==='contents'?'#contents':'#entry='+encodeURIComponent(id);}
function writable() {if (readOnly) throw new Error("This shared edition is read-only.");}
let branding = { brandName: "FIELDNOTES", brandSubtitle: "A LAB NOTEBOOK" };
const icons = {
  book: "▤",
  arrow: "↗",
  plus: "＋",
  search: "⌕",
  lock: "◈",
  download: "↓",
  close: "×",
  star: "✦",
};
let notebook,
  server = false,
  etag,
  mode = "read",
  workspaceMode = "book",
  current = 1,
  filter = "",
  query = "",
  pages = [],
  visible = [],
  saveChain = Promise.resolve(),
  draftTimer,
  observer,
  restoreCandidate;
let captureResearch;
const explorer = createExplorer({getNotebook:()=>notebook,persist,onOpen:openNote,onEdit:openEditor,readOnly,canEdit:()=>!readOnly&&mode==='contribute',toast,noteHref:pageHash});
explorer.onShow = () => {workspaceMode='explore';render();};
const $ = (s) => document.querySelector(s);
const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
async function load() {
  try {
    const response = await fetch("./notebook-config.json");
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const config = await response.json();
      cloudConfig = config.cloud;
      for (const key of ["brandName", "brandSubtitle"])
        if (typeof config[key] === "string" && config[key].length <= 100)
          branding[key] = config[key];
    }
  } catch {}
  sharing = await cloudSharing({config:cloudConfig, readId, readToken, getNotebook:()=>notebook});
  if (readOnly) {
    await loadShared();
    setInterval(() => loadShared(true), 10000);
    return;
  }
  let r;
  try {
    r = await fetch("./api/notebook", { cache: "no-store" });
  } catch {}
  if (r?.headers.get("content-type")?.includes("application/json")) {
    if (!r.ok)
      throw new Error(
        "The notebook service could not read its canonical file. Fix the service before continuing.",
      );
    notebook = validateNotebook(await r.json(), true);
    etag = r.headers.get("etag");
    server = true;
  }
  notebook ??= (await readNotebook()) ?? blankNotebook();
  backups = await automaticBackups({config:cloudConfig, getNotebook:()=>notebook, onRestore:(candidate, beforeSave)=>restore(null,candidate,beforeSave)});
  const recovered = await backups.initialize(notebook, !server);
  if (recovered) {await writeNotebook(recovered); notebook = recovered;}
  render();
  navigateHash();
  if (server) setInterval(refresh, 10000);
  if (new URL(location.href).searchParams.has('sharing')) await sharing.open();
}
async function loadShared(quiet = false) {
  if (!readOnly || (quiet && !notebook)) return;
  try {
    const result = await sharing.read();
    if (!notebook || sharedRevision !== result.revision) {
      notebook = result.notebook;
      sharedRevision = result.revision;
      mode = 'read';
      render();
      navigateHash();
    }
  } catch (e) {
    explorer.clear();
    notebook = null; sharedRevision = undefined; pages = []; visible = [];
    observer?.disconnect();
    // Clear shared data and any export dialogs immediately after denied access.
    sharing.gate(e.message);
  }
}
async function persist() {
  writable();
  validateNotebook(structuredClone(notebook),true);
  const snapshot = structuredClone(notebook);
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      if (server) {
        const r = await fetch("./api/notebook", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "If-Match": etag },
          body: JSON.stringify(snapshot),
        });
        if (!r.ok)
          throw new Error(
            r.status === 412
              ? "An agent or another tab updated the notebook. Download a backup of your work, then reload before saving."
              : "Could not save to the notebook service.",
          );
        etag = r.headers.get("etag");
      } else await writeNotebook(snapshot);
      backups?.changed(snapshot);
    });
  return saveChain;
}
async function refresh() {
  if (document.querySelector("dialog[open]")) return;
  try {
    await saveChain;
    const r = await fetch("./api/notebook", { cache: "no-store" });
    if (r.ok && r.headers.get("etag") !== etag) {
      notebook = validateNotebook(await r.json(), true);
      etag = r.headers.get("etag");
      backups?.changed(notebook);
      render();
      toast("Notebook updated by an agent or another session.");
    }
  } catch {}
}
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = error ? "visible error" : "visible";
  setTimeout(() => (el.className = ""), 6500);
}
function statusLabel(value) {
  return (
    {
      "in-progress": "In progress",
      unverified: "Unverified",
      verified: "Verified",
      observation: "Observation",
    }[value] || "Observation"
  );
}
function rebuild() {
  pages = paginate(notebook.entries);
  visible = pages.filter(
    (p) =>
      p.kind === "contents" ||
      ((!filter || p.entry.project === filter) &&
        (!query ||
          [p.entry.title, p.entry.body, p.entry.project, p.entry.date]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()))),
  );
}
function render() {
  rebuild();
  const projects = [...new Set(notebook.entries.map((e) => e.project))].sort();
  $("#app").innerHTML =
    `<div class="app-shell"><aside class="sidebar"><a class="brand" href="${h(pageHash('contents'))}" aria-label="Go to contents"><span class="brand-icon"><svg viewBox="0 0 28 34" aria-hidden="true"><path d="M3 2h22M3 32h22M6 3c0 8 16 10 16 14S6 23 6 31M22 3c0 8-16 10-16 14s16 6 16 14M9 7h10M11 27h6"/></svg></span><span class="brand-wordmark">${h(notebook.brandName ?? branding.brandName)}<small>${h(notebook.brandSubtitle ?? branding.brandSubtitle)}</small></span></a><div class="workspace-label">${readOnly ? "SHARED NOTEBOOK" : "YOUR WORKSPACE"}</div><button class="side-link selected" id="contents-link"><span>▤</span> Notebook <span class="count">${notebook.entries.length}</span></button>${readOnly ? "" : '<button class="side-link" id="new-side"><span>＋</span> New entry</button>'}<div class="project-heading">PROJECTS<button id="clear-filter" title="Show all projects">All</button></div><div class="projects">${projects.length ? projects.map((p, i) => `<button class="project ${filter === p ? "active" : ""}" data-project="${h(p)}"><i style="--dot:${["#648d78", "#b49a6a", "#788aab", "#ac7e72"][i % 4]}"></i>${h(p)}<span>${notebook.entries.filter((e) => e.project === p).length}</span></button>`).join("") : '<p class="side-muted">Projects appear as you write.</p>'}</div><div class="sidebar-bottom"><div class="storage-card"><span class="privacy-dot"></span><b>${readOnly ? "Read-only edition" : "Private by default"}</b><p>${readOnly ? "Only entries selected by the owner appear here. This private link can be revoked by the owner." : server ? "Saved to your local notebook service. Agents can contribute." : "Saved in this browser. Download a backup to keep a portable copy."}</p><span class="storage-label">${readOnly ? "PRIVATE READER" : server ? "LOCAL SERVICE CONNECTED" : "BROWSER STORAGE"}</span></div>${readOnly ? '' : `<button class="side-link" id="backup"><span>↓</span> Back up notebook</button><button class="side-link" id="restore"><span>↑</span> Restore backup</button><button class="side-link" id="settings"><span>⚙</span> Notebook settings</button><button class="side-link" id="share"><span>↗</span> Reader links</button>`}</div></aside><main><header class="topbar"><button id="mobile-menu" aria-label="Open notebook menu">☰</button><div class="breadcrumbs">Workspace <span>/</span> <b>Notebook</b></div><div class="top-actions">${readOnly ? '<span class="reader-badge">Read only</span>' : `<div class="mode-switch" aria-label="Notebook mode"><button id="read-mode" class="${mode === "read" ? "active" : ""}">Read</button><button id="contribute-mode" class="${!readOnly && mode === "contribute" ? "active" : ""}">Contribute</button></div>`}<button class="button subtle" id="export">${icons.download} Export</button></div></header><section class="notebook-heading"><div><div class="eyebrow">THE RESEARCH, AS IT HAPPENS</div><h1>${h(notebook.title)}</h1><p>${h(notebook.subtitle)}</p></div>${readOnly ? "" : '<button class="button primary" id="new-entry">＋ New entry</button>'}</section><div class="book-toolbar"><div class="book-label"><span class="green-dot"></span>${filter ? h(filter) : "All projects"}<span class="divider"></span><span>${query ? `${visible.length - 1} matching pages` : `${notebook.entries.length} ${notebook.entries.length === 1 ? "entry" : "entries"} · ${pages.length} ${pages.length === 1 ? "page" : "pages"}`}</span></div><label class="search">${icons.search}<input id="search" placeholder="Find in notebook…" value="${h(query)}" aria-label="Search notebook"></label></div><div class="reading-room"><div class="book-track" id="book" tabindex="0" aria-label="Notebook pages. Scroll left for older entries.">${workspaceMode==='book'?visible.map(renderPage).join(""):''}</div></div><footer class="reader-footer"><span class="scroll-hint">← Scroll left to turn the page <span>·</span> Newest entries first</span><div class="page-navigation"><button id="older" aria-label="Older page">←</button><label>Page <input id="page-number" type="number" min="1" max="${pages.length}" value="${current}" aria-label="Go to page"> of <span>${pages.length}</span></label><button id="newer" aria-label="Newer page">→</button></div><button class="text-button" id="to-contents">Back to contents ↗</button></footer></main></div><div id="toast" role="status"></div><dialog id="editor"></dialog><dialog id="export-dialog"></dialog><dialog id="settings-dialog"></dialog><dialog id="restore-dialog"></dialog><input type="file" id="restore-input" accept=".json,application/json" hidden>`;
  bind();
  if (!readOnly) {
    $('.storage-card p').id = 'backup-state';
    $('.storage-card p').textContent = backups.status;
    const backupButton = document.createElement('button');
    backupButton.className = 'side-link'; backupButton.innerHTML = '<span>◈</span> Automatic backup';
    backupButton.onclick = () => backups.open().catch(e=>toast(e.message,true));
    $('#backup').before(backupButton);
    const recoverButton = document.createElement('button');
    recoverButton.className = 'text-button'; recoverButton.textContent = 'Recover private backup ↗';
    recoverButton.onclick = backupButton.onclick;
    document.querySelector('[data-restore]')?.after(recoverButton);
  }
  const notebookButton = $('#contents-link');
  notebookButton.classList.toggle('selected',workspaceMode==='book');
  const exploreButton=document.createElement('button');exploreButton.className='side-link'+(workspaceMode==='explore'?' selected':'');exploreButton.id='explore-link';exploreButton.innerHTML='<span>◎</span> Explore';exploreButton.onclick=()=>{workspaceMode='explore';render();};notebookButton.after(exploreButton);
  const quickButton=document.createElement('button');quickButton.className='text-button quick-find-button';quickButton.textContent='⌕ Quick find';quickButton.setAttribute('aria-label','Quick find');quickButton.title='Quick find (Cmd/Ctrl K)';quickButton.onclick=()=>explorer.quickFind();$('.top-actions').prepend(quickButton);
  const knowledgeDialog=document.createElement('dialog');knowledgeDialog.id='knowledge-dialog';$('#app').append(knowledgeDialog);
  explorer.decorateLinks($('#app'));
  if(workspaceMode==='explore'){
    observer?.disconnect();
    for(const s of ['.notebook-heading','.book-toolbar','.reading-room','.reader-footer'])$(s).hidden=true;
    $('.breadcrumbs b').textContent='Explore';
    const container=document.createElement('section');container.className='explore-workspace';$('main').append(container);explorer.mount(container);
    return;
  }
  const intended = visible.find((p) => p.number === current) || visible[0],
    book = $("#book"),
    paper = $("#page-" + intended.number);
  book.scrollLeft =
    -visible.indexOf(intended) *
    (paper.getBoundingClientRect().width +
      parseFloat(getComputedStyle(book).gap));
  observe();
}
function renderPage(p) {
  if (p.kind === "contents")
    return `<article class="paper contents-paper" data-page="1" id="page-1"><div class="paper-topline"><span>${h(notebook.author || notebook.brandName || branding.brandName)}</span><span>VOLUME 01</span></div><div class="contents-kicker">A RECORD OF QUESTIONS & DISCOVERIES</div><h2>Table of<br><em>contents.</em></h2><p class="paper-intro">The milestones that move the work forward.<br>Every observation has a place in the pages that follow.</p><div class="toc"><div class="toc-head"><span>DATE</span><span>PROJECT</span><span>ITEM</span><span>PAGE</span></div>${
      pages
        .filter((p) => p.entry?.significant && !p.continuation)
        .map(
          (p) =>
            `<button class="toc-row" data-go="${p.number}"><span class="date">${p.entry.date.replaceAll("-", "")}</span><span class="toc-project">${h(p.entry.project)}</span><span class="toc-title">${h(p.entry.title)}</span><span class="toc-page">${String(p.number).padStart(2, "0")} ↗</span></button>`,
        )
        .join("") ||
      (notebook.entries.length ? `<div class="empty-state"><div class="empty-symbol">✧</div><h3>No milestones yet.</h3><p>Your ${notebook.entries.length} saved ${notebook.entries.length===1?'entry is':'entries are'} in the notebook. Use the page arrows or Explore to read them.</p><button class="button subtle" data-go="2">Read entries ↗</button></div>` : readOnly ? '<div class="empty-state"><div class="empty-symbol">✧</div><h3>No entries in this edition yet.</h3></div>' : `<div class="empty-state"><div class="empty-symbol">✧</div><h3>Start or restore your notebook.</h3><p>Already have a notebook? Restore your backup or return to the browser and address where you last used it.</p><button class="button primary" data-new>Write the first entry ↗</button><button class="text-button" data-restore>Restore existing notebook ↗</button><button class="text-button" id="load-example">Explore an example notebook</button></div>`)
    }</div><div class="contents-note"><span>✦</span><p>Only milestones appear here. The full notebook includes the everyday work that makes them possible.</p></div><div class="paper-footer"><span>PRIVATE RESEARCH NOTEBOOK</span><span>01</span></div></article>`;
  const e = p.entry;
  return `<article class="paper entry-paper" data-page="${p.number}" id="page-${p.number}"><div class="paper-topline"><span>${h(e.project)}</span><span>${e.date.replaceAll("-", "")}</span></div><div class="entry-meta"><span class="status ${h(e.status)}">${h(statusLabel(e.status))}</span>${e.significant ? '<span class="milestone">✦ MILESTONE</span>' : ""}${p.continuation ? "<span>CONTINUED</span>" : ""}</div><h2>${h(e.title)}</h2><div class="entry-body">${p.blocks
    .map((b) => {
      if (b.kind === "text")
        return `<p>${renderTextLinks(b.text,notebook.entries)}</p>`;
      const a = b.attachment;
      if (b.kind === "table")
        return `<figure class="data-figure"><figcaption>${h(a.name)} <span>ROWS ${b.offset + 1}–${b.offset + b.rows.length}</span></figcaption><div class="table-scroll"><table><thead><tr>${a.table.headers.map((c) => `<th>${h(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></figure>`;
      if (a.kind === "image")
        return `<figure class="image-figure"><img src="${a.data}" alt="${h(a.name)}"><figcaption>${h(a.name)}</figcaption></figure>`;
      return `<button class="attachment-file" data-download="${h(a.id)}" data-entry="${h(e.id)}">↓ ${h(a.name)} <span>Original source file</span></button>`;
    })
    .join(
      "",
    )}</div>${!p.continuation && (e.sources || e.next) ? `<div class="entry-notes">${e.sources ? `<div><b>SOURCES & PROVENANCE</b><p>${renderTextLinks(e.sources,notebook.entries)}</p></div>` : ""}${e.next ? `<div><b>NEXT STEPS</b><p>${renderTextLinks(e.next,notebook.entries)}</p></div>` : ""}</div>` : ""}<div class="entry-tools"><button class="text-button" data-connections="${h(e.id)}">Connections ◎</button><button class="text-button" data-link="${h(p.id)}">Copy permanent link ↗</button>${!readOnly && mode === "contribute" ? `<button class="text-button" data-edit="${h(e.id)}">Edit entry ✎</button>` : ""}</div><div class="paper-footer"><span>${h(e.project)} / ${e.date}</span><span>${String(p.number).padStart(2, "0")}</span></div></article>`;
}
function go(n, smooth = true) {
  if(workspaceMode!=='book'){workspaceMode='book';current=n;render();}
  const target = visible.find((p) => p.number === n);
  if (!target) {
    filter = "";
    query = "";
    current = n;
    render();
    requestAnimationFrame(() => go(n));
    return;
  }
  current = n;
  const book = $("#book"),
    paper = $("#page-" + n);
  if (paper)
    book.scrollTo({
      left:
        -visible.indexOf(target) *
        (paper.getBoundingClientRect().width +
          parseFloat(getComputedStyle(book).gap)),
      behavior: smooth ? "smooth" : "instant",
    });
  $("#page-number").value = n;
  history.replaceState(
    null,
    "",
    pageHash(n === 1 ? "contents" : target.id),
  );
}
function navigateHash() {
  const key = readOnly ? new URLSearchParams(location.hash.slice(1)).get("entry") : decodeURIComponent(location.hash.replace(/^#entry=/, ""));
  const target = pages.find((p) => p.id === key);
  if (target) go(target.number, false);
  else go(Math.min(current, pages.length), false);
}
function openNote(id) {
  const page=pages.find(p=>p.entry?.id===id);
  if(page)go(page.number);
}
function observe() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (items) => {
      for (const item of items)
        if (item.isIntersecting) {
          current = Number(item.target.dataset.page);
          $("#page-number").value = current;
        }
    },
    { root: $("#book"), threshold: 0.6 },
  );
  document.querySelectorAll(".paper").forEach((p) => observer.observe(p));
}
function bind() {
  $("#mobile-menu").onclick = () =>
    $(".sidebar").classList.toggle("mobile-open");
  if ($("#read-mode")) $("#read-mode").onclick = () => {
    mode = "read";
    render();
  };
  if ($("#contribute-mode")) $("#contribute-mode").onclick = () => {
    writable();
    mode = "contribute";
    render();
  };
  for (const s of ["#new-side", "#new-entry"])
    if ($(s)) $(s).onclick = () => openEditor();
  document
    .querySelectorAll("[data-new]")
    .forEach((b) => (b.onclick = () => openEditor()));
  for (const s of ["#contents-link", "#to-contents"])
    $(s).onclick = () => go(1);
  document.querySelectorAll('[data-connections]').forEach(b=>b.onclick=()=>explorer.connections(b.dataset.connections));
  $("#older").onclick = () =>
    go(
      visible[
        Math.min(
          visible.length - 1,
          visible.findIndex((p) => p.number === current) + 1,
        )
      ].number,
    );
  $("#newer").onclick = () =>
    go(
      visible[Math.max(0, visible.findIndex((p) => p.number === current) - 1)]
        .number,
    );
  $("#page-number").onchange = (e) => {
    const n = Number(e.target.value);
    if (n >= 1 && n <= pages.length) go(n);
    else e.target.value = current;
  };
  $("#search").oninput = (e) => {
    query = e.target.value;
    const pos = e.target.selectionStart;
    rebuild();
    current = visible.find((p) => p.entry)?.number || 1;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  };
  $("#clear-filter").onclick = () => {
    filter = "";
    if(workspaceMode==='explore')explorer.project('');
    render();
  };
  document.querySelectorAll("[data-project]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.project;
        if(workspaceMode==='explore')explorer.project(filter);
        current = 1;
        render();
      }),
  );
  document
    .querySelectorAll("[data-go]")
    .forEach((b) => (b.onclick = () => go(Number(b.dataset.go))));
  document
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => openEditor(b.dataset.edit)));
  document.querySelectorAll("[data-link]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(
            location.href.split("#")[0] +
              pageHash(b.dataset.link),
          );
          toast("Permanent link copied.");
        } catch {
          toast("Copy the entry URL from the address bar.");
          go(pages.find((p) => p.id === b.dataset.link).number);
        }
      }),
  );
  document.querySelectorAll("[data-download]").forEach(
    (b) =>
      (b.onclick = () => {
        const a = notebook.entries
          .find((e) => e.id === b.dataset.entry)
          .attachments.find((a) => a.id === b.dataset.download);
        saveFile(
          a.name,
          Uint8Array.from(atob(a.data.split(",")[1]), (c) => c.charCodeAt(0)),
        );
      }),
  );
  $("#book").onwheel = (e) => {
    const paper = e.target.closest(".paper");
    if (paper && paper.scrollHeight > paper.clientHeight + 2) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      $("#book").scrollLeft -= e.deltaY;
    }
  };
  $("#book").onkeydown = (e) => {
    if (e.key === "ArrowLeft") {
      $("#older").click();
      e.preventDefault();
    }
    if (e.key === "ArrowRight") {
      $("#newer").click();
      e.preventDefault();
    }
  };
  if ($("#backup")) $("#backup").onclick = () => {
    saveFile(
      "lab-notebook-backup.json",
      JSON.stringify(notebook, null, 2),
      "application/json",
    );
    toast("Backup downloaded. Keep this file somewhere safe.");
  };
  if ($("#restore")) $("#restore").onclick = () => $("#restore-input").click();
  document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>$("#restore-input").click());
  $("#restore-input").onchange = restore;
  if ($("#settings")) $("#settings").onclick = settings;
  if ($("#share")) $("#share").onclick = () => sharing.open();
  $("#export").onclick = openExport;
  if ($("#load-example"))
    $("#load-example").onclick = async () => {
      if(notebook.entries.length || notebook.draft){toast('An example can only be opened in an empty notebook with no draft.',true);return;}
      const before = notebook;
      notebook = exampleNotebook();
      try {
        await persist();
        render();
        toast("Example content loaded. Restore a backup to replace it.");
      } catch (e) {
        notebook = before;
        toast(e.message, true);
      }
    };
}
function draftValue() {
  return {
    id: crypto.randomUUID(),
    date: localDate(),
    project: "",
    title: "",
    body: "",
    sources: "",
    next: "",
    status: "observation",
    significant: false,
    attachments: [],
    created: new Date().toISOString(),
  };
}
function openEditor(id, kind) {
  writable();
  if (mode !== "contribute") {
    mode = "contribute";
    render();
  }
  const source = id ? notebook.entries.find((e) => e.id === id) : null;
  if (source) {
    if (notebook.draft && notebook.draft.id !== id) {
      toast(
        "Finish or discard the existing draft before editing another entry.",
        true,
      );
      return;
    }
    notebook.draft ??= structuredClone(source);
  } else notebook.draft ??= draftValue();
  const d = notebook.draft;
  if(!source&&kind)d.kind=kind;
  if(d.kind==='board')d.board??={cards:[],connections:[]};
  const dialog = $("#editor");
  dialog.innerHTML = `<form id="entry-form"><div class="dialog-header"><div><div class="eyebrow">CONTRIBUTE</div><h2>${source ? "Edit an entry" : "Capture today’s work"}</h2></div><button type="button" class="close" data-close aria-label="Close editor">×</button></div><div class="editor-meta"><label>Date<input required type="date" name="date" value="${h(d.date)}"></label><label>Project<input required name="project" maxlength="100" placeholder="Project name" value="${h(d.project)}" list="project-list"><datalist id="project-list">${[...new Set(notebook.entries.map((e) => e.project))].map((p) => `<option value="${h(p)}">`).join("")}</datalist></label></div><label>Entry title<input required name="title" maxlength="300" placeholder="What moved forward?" value="${h(d.title)}"></label><label>Notes<textarea name="body" rows="9" placeholder="Question / objective&#10;&#10;Work completed&#10;&#10;Observations and interpretation">${h(d.body)}</textarea></label><div class="dropzone" id="dropzone"><span>＋</span><b>Drop figures, images, or data here</b><small>CSV → tables · PNG, JPG, GIF, WebP → previews<br>FIG, MAT, PDF, SVG, NPZ → preserved originals · 20 MB per file</small><button class="text-button" type="button" id="browse">or browse files</button><input type="file" id="attachments" multiple hidden accept=".csv,.png,.jpg,.jpeg,.gif,.webp,.fig,.mat,.pdf,.svg,.npz"></div><div id="attachment-list"></div><div class="editor-meta"><label>Evidence status<select name="status">${["observation", "in-progress", "unverified", "verified"].map((v) => `<option value="${v}" ${v === d.status ? "selected" : ""}>${statusLabel(v)}</option>`).join("")}</select></label><label class="checkbox"><input type="checkbox" name="significant" ${d.significant ? "checked" : ""}>✦ Add to table of contents</label></div><label>Sources & provenance<textarea name="sources" rows="2" placeholder="Repository / commit, dataset ID, protocol, or chat reference">${h(d.sources)}</textarea></label><label>Next steps<textarea name="next" rows="2" placeholder="What should happen next?">${h(d.next)}</textarea></label><div class="dialog-footer"><span id="draft-state">Draft kept when you close</span><button type="button" id="discard" class="text-button">Discard draft</button><button class="button primary" type="submit">Save entry ↗</button></div></form>`;
  const titleLabel=dialog.querySelector('[name=title]').closest('label');
  titleLabel.insertAdjacentHTML('afterend',researchEditorMarkup(d,notebook.entries));
  captureResearch=bindResearchEditor(dialog,d,notebook.entries,()=>{captureDraft();clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,600);});
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("cancel", () => flushDraft(), { once: true });
  $("#entry-form").oninput = () => {
    captureDraft();
    clearTimeout(draftTimer);
    $("#draft-state").textContent = "Saving draft…";
    draftTimer = setTimeout(flushDraft, 600);
  };
  dialog.querySelector("[data-close]").onclick = () => {
    captureDraft();
    flushDraft();
    dialog.close();
  };
  $("#discard").onclick = async () => {
    clearTimeout(draftTimer);
    const before=notebook.draft;
    notebook.draft = null;
    try {
      await persist();
      dialog.close();
      toast("Draft discarded.");
    } catch (e) {
      notebook.draft=before;
      toast(e.message, true);
    }
  };
  $("#entry-form").onsubmit = async (e) => {
    e.preventDefault();
    clearTimeout(draftTimer);
    try {captureDraft(true);} catch(err){toast(err.message,true);return;}
    const entry = structuredClone(notebook.draft);
    if (!entry.title.trim() || !entry.project.trim()) {
      toast("Add a project and title.", true);
      return;
    }
    entry.updated = new Date().toISOString();
    const index = notebook.entries.findIndex((x) => x.id === entry.id);
    const before = structuredClone(notebook);
    if (index >= 0) {
      entry.revisions = [
        ...(notebook.entries[index].revisions || []),
        { ...notebook.entries[index], revisions: undefined },
      ];
      notebook.entries[index] = entry;
    } else notebook.entries.push(entry);
    notebook.draft = null;
    try {
      await persist();
      dialog.close();
      current = 1;
      render();
      const p = pages.find((p) => p.entry?.id === entry.id);
      go(p.number);
      toast("Entry saved.");
    } catch (err) {
      notebook = before;
      toast(err.message, true);
    }
  };
  $("#browse").onclick = () => $("#attachments").click();
  $("#attachments").onchange = (e) => addFiles(e.target.files);
  $("#dropzone").ondragover = (e) => {
    e.preventDefault();
    $("#dropzone").classList.add("dragging");
  };
  $("#dropzone").ondragleave = () =>
    $("#dropzone").classList.remove("dragging");
  $("#dropzone").ondrop = (e) => {
    e.preventDefault();
    $("#dropzone").classList.remove("dragging");
    addFiles(e.dataTransfer.files);
  };
  showAttachments();
  dialog.showModal();
}
function captureDraft(strict=false) {
  const form = $("#entry-form");
  if (!form || !notebook.draft) return;
  for (const name of [
    "date",
    "project",
    "title",
    "body",
    "sources",
    "next",
    "status",
  ])
    notebook.draft[name] = form.elements[name].value;
  notebook.draft.significant = form.elements.significant.checked;
  const research=captureResearch?.(strict);
  if(research)Object.assign(notebook.draft,research);
  if(strict)delete notebook.draft.researchDraft;
}
async function flushDraft() {
  try {
    await persist();
    if ($("#draft-state"))
      $("#draft-state").textContent = server
        ? "Draft saved to local service"
        : "Draft saved in this browser";
  } catch (e) {
    if ($("#draft-state")) $("#draft-state").textContent = "Draft not saved";
    toast(e.message, true);
  }
}
async function addFiles(fileList) {
  for (const f of fileList) {
    try {
      if (f.size > 20 * 1024 * 1024)
        throw new Error(`${f.name}: maximum size is 20 MB.`);
      if (notebook.draft.attachments.length >= 100)
        throw new Error("Maximum 100 attachments per entry.");
      const ext = f.name.split(".").pop().toLowerCase();
      if (
        ![
          "csv",
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "fig",
          "mat",
          "pdf",
          "svg",
          "npz",
        ].includes(ext)
      )
        throw new Error(`${f.name}: unsupported format.`);
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      const kind =
        ext === "csv"
          ? "table"
          : ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
            ? "image"
            : "file";
      const a = {
        id: crypto.randomUUID(),
        name: f.name,
        data,
        kind,
        sha256: Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await f.arrayBuffer()),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      };
      if (kind === "table") a.table = parseCSV(await f.text());
      if (kind === "image") {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error("Image could not be decoded."));
          img.src = data;
        });
      }
      notebook.draft.attachments.push(a);
    } catch (e) {
      toast(e.message, true);
    }
  }
  showAttachments();
  await flushDraft();
}
function showAttachments() {
  $("#attachment-list").innerHTML = notebook.draft.attachments
    .map(
      (a) =>
        `<div class="uploaded">${a.kind === "image" ? `<img src="${a.data}" alt="">` : "<span>▤</span>"}<div><b>${h(a.name)}</b><small>${a.kind === "table" ? `${a.table.rows.length} rows · ${a.table.headers.length} columns` : "Original retained · SHA-256 recorded"}</small></div><button type="button" data-remove="${h(a.id)}" aria-label="Remove ${h(a.name)}">×</button></div>`,
    )
    .join("");
  document.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        notebook.draft.attachments = notebook.draft.attachments.filter(
          (a) => a.id !== b.dataset.remove,
        );
        showAttachments();
        flushDraft();
      }),
  );
}
function openExport() {
  const dialog = $("#export-dialog");
  dialog.innerHTML = `<form id="export-form"><div class="dialog-header"><div><div class="eyebrow">TAKE THE WORK WITH YOU</div><h2>Export notebook pages</h2></div><button class="close" type="button" data-close aria-label="Close export">×</button></div><label>Pages<input name="pages" value="${current}" placeholder="e.g. 1, 3-5" required></label><div class="quick-pages"><button type="button" id="all-pages">All pages</button><button type="button" id="current-page">Current page</button></div><div class="export-preset"><div class="editor-meta"><label>Export appearance<select name="theme"><option value="light" selected>Light · publication default</option><option value="dark">Dark · presentation</option></select></label><label>Figure width<select name="figureWidthMm"><option value="88">88 mm · single column</option><option value="180" selected>180 mm · double column</option></select></label></div><label>Figure height (mm)<input type="number" name="figureHeightMm" min="40" max="185" value="90" required></label><p class="preset-caption">Generated CSV figures: 5–7 pt sans-serif text, RGB, editable vector PDF, and 300 dpi PNG. Original artwork is retained; its lettering and resolution require source-level review. Notebook PDF pages stay A4.</p></div><div class="export-options">${[
    [
      "pdf",
      "Vector PDF",
      ".pdf · searchable text, vector tables; images keep source resolution",
    ],
    [
      "md",
      "Agent handoff",
      ".md · selected page text, provenance, and next steps",
    ],
    ["mat", "MATLAB data", ".mat · numeric tables + full entry metadata"],
    [
      "fig",
      "MATLAB figures",
      ".fig originals + .m script to generate CSV figures in MATLAB",
    ],
    [
      "python",
      "Python figures & data",
      ".py + CSV · run to create SVG, PDF, PNG, and NPZ",
    ],
    [
      "obsidian",
      "Obsidian vault",
      "Markdown pages, properties, internal links, planning canvases, and original attachments",
    ],
    [
      "source",
      "Source archive",
      "Complete parent entries, original attachments, and metadata",
    ],
  ]
    .map(
      ([key, title, desc]) =>
        `<label class="export-option"><input type="checkbox" name="format" value="${key}" ${key === "pdf" || key === "md" ? "checked" : ""}><span><b>${title}</b><small>${desc}</small></span></label>`,
    )
    .join(
      "",
    )}</div><p class="export-note">PDF and handoff follow the selected pages. ${readOnly ? "Data and figure packages include complete parent entries and attachments from this shared edition." : "Data and figure packages include complete parent entries, attachments, and revision history. Review the full package before sharing."} Obsidian includes complete selected parent entries and originals; linked unselected pages, drafts, and earlier revisions are excluded.</p><div class="dialog-footer"><span id="export-state">Download as one ZIP file</span><button class="button primary" type="submit">↓ Export selected pages</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  $("#all-pages").onclick = () =>
    ($("#export-form").elements.pages.value = `1-${pages.length}`);
  $("#current-page").onclick = () =>
    ($("#export-form").elements.pages.value = current);
  $("#export-form").elements.figureWidthMm.onchange = (e) => {
    const form = $("#export-form"),
      single = e.target.value === "88";
    form.elements.figureHeightMm.max = single ? 130 : 185;
    form.elements.figureHeightMm.value = single ? 70 : 90;
  };
  $("#export-form").onsubmit = async (e) => {
    e.preventDefault();
    const submit = e.submitter;
    try {
      const numbers = parseSelection(
          e.target.elements.pages.value,
          pages.length,
        ),
        formats = [...e.target.querySelectorAll("[name=format]:checked")].map(
          (el) => el.value,
        );
      if (!formats.length)
        throw new Error("Select at least one export format.");
      submit.disabled = true;
      $("#export-state").textContent = "Preparing exports…";
      const data = await exportBundle(
        notebook,
        pages.filter((p) => numbers.includes(p.number)),
        pages,
        formats,
        {
          theme: e.target.elements.theme.value,
          figureWidthMm: Number(e.target.elements.figureWidthMm.value),
          figureHeightMm: Number(e.target.elements.figureHeightMm.value),
        },
      );
      saveFile(
        `lab-notebook-export-${e.target.elements.theme.value}.zip`,
        data,
        "application/zip",
      );
      dialog.close();
      toast("Export downloaded.");
    } catch (err) {
      toast(err.message, true);
      $("#export-state").textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  };
  dialog.showModal();
}
function settings() {
  writable();
  const dialog = $("#settings-dialog");
  dialog.innerHTML = `<form id="settings-form"><div class="dialog-header"><h2>Make it your notebook</h2><button type="button" class="close" data-close aria-label="Close settings">×</button></div><div class="editor-meta"><label>Lab / brand name<input name="brandName" maxlength="100" value="${h(notebook.brandName ?? branding.brandName)}"></label><label>Brand subtitle<input name="brandSubtitle" maxlength="100" value="${h(notebook.brandSubtitle ?? branding.brandSubtitle)}"></label></div><label>Notebook title<input name="title" required maxlength="200" value="${h(notebook.title)}"></label><label>Subtitle<input name="subtitle" maxlength="500" value="${h(notebook.subtitle)}"></label><label>Researcher or lab<input name="author" maxlength="200" value="${h(notebook.author)}" placeholder="Optional"></label><p class="export-note">${server ? "The local service and headless CLI share the same notebook file." : "This notebook lives in browser storage on this device and website address. Back up regularly. Use Reader links to publish selected entries through revocable read-only links."} Publishing selected entries will be a separate, explicit step.</p><div class="dialog-footer"><span>Portable by design</span><button class="button primary">Save settings</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  $("#settings-form").onsubmit = async (e) => {
    e.preventDefault();
    const before = structuredClone(notebook);
    for (const key of [
      "title",
      "subtitle",
      "author",
      "brandName",
      "brandSubtitle",
    ])
      notebook[key] = e.target.elements[key].value;
    try {
      await persist();
      dialog.close();
      render();
      toast("Settings saved.");
    } catch (err) {
      notebook = before;
      toast(err.message, true);
    }
  };
  dialog.showModal();
}
async function restore(e, candidate, beforeSave) {
  writable();
  try {
    const f = e?.target.files[0];
    if (!candidate && !f) return;
    if (f?.size > 200 * 1024 * 1024) throw new Error("Backup exceeds 200 MB.");
    restoreCandidate = validateNotebook(candidate || JSON.parse(await f.text()), true);
    const dialog = $("#restore-dialog");
    dialog.innerHTML = `<div class="dialog-header"><h2>Restore this notebook?</h2><button class="close" data-close aria-label="Close restore">×</button></div><p><b>${h(restoreCandidate.title)}</b><br>${restoreCandidate.entries.length} entries. This replaces the current notebook on this storage location.</p><p>Download a backup of your current notebook first.</p><div class="dialog-footer"><button class="button subtle" id="backup-first">Back up current notebook</button><button class="button primary" id="confirm-restore">Restore notebook</button></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    $("#backup-first").onclick = () => $("#backup").click();
    $("#confirm-restore").onclick = async () => {
      const before = notebook;
      notebook = restoreCandidate;
      try {
        await beforeSave?.();
        await persist();
        dialog.close();
        filter = "";
        query = "";
        current = 1;
        history.replaceState(null, "", "#contents");
        render();
        toast("Notebook restored.");
      } catch (err) {
        notebook = before;
        toast(err.message, true);
      }
    };
    dialog.showModal();
  } catch (err) {
    toast(err.message, true);
  }
  if (e) e.target.value = "";
}
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&notebook&&!document.querySelector('dialog[open]')){e.preventDefault();explorer.quickFind();}
});
window.addEventListener("hashchange", () => {if (notebook) navigateHash();});
load().catch((e) => {
  $("#app").innerHTML =
    `<div class="startup-error"><h1>Notebook storage is unavailable</h1><p>${h(e.message)}</p><p>Enable browser storage, or use the local notebook service.</p></div>`;
});
