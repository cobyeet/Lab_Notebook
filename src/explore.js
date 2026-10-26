import { escapeHTML as h, renderTextLinks, inlineLinks, statusLabel } from "./model.js";
import {
  KINDS,
  RELATIONS,
  TASK_STATES,
  TEMPLATES,
  relationships,
  suggestions,
  filterEntries,
  graphData,
  layoutGraph,
  resolveTarget,
} from "./knowledge.js";

const options = (values, current = "", all = "") =>
  (all ? `<option value="">${h(all)}</option>` : "") +
  Object.entries(values)
    .map(
      ([v, label]) =>
        `<option value="${h(v)}" ${v === current ? "selected" : ""}>${h(label)}</option>`,
    )
    .join("");
const row = (entry, extra = "") =>
  `<button class="note-row" data-select="${h(entry.id)}"><span><b>${h(entry.title)}</b><small>${h(entry.project)} · ${h(KINDS[entry.kind || "entry"])} · ${h(entry.date)}</small></span>${extra}</button>`;
const empty = (message) => `<p class="explore-empty">${h(message)}</p>`;
const plainText = (value) =>
  inlineLinks(value)
    .map((p) => p.text)
    .join("");
const noteOption = (entries) =>
  entries
    .map(
      (e) =>
        `<option value="${h(e.id)}">${h(e.title)} · ${h(e.project)}</option>`,
    )
    .join("");

export function createExplorer({
  getNotebook,
  persist,
  onOpen,
  onEdit,
  readOnly,
  canEdit,
  toast,
  noteHref = (id) => "#entry=" + encodeURIComponent(id),
}) {
  let root,
    tab = "map",
    selected = "",
    focus = "",
    depth = 1,
    context = false,
    filters = {},
    boardId = "",
    taskState = "open",
    bookmarksOnly = false,
    viewport = { x: 0, y: 0, w: 1000, h: 640 };
  const notebook = () => getNotebook(),
    entries = () => notebook()?.entries || [];
  const active = () => entries().find((e) => e.id === selected);
  async function mutate(fn) {
    if (readOnly) return;
    const before = structuredClone(notebook());
    try {
      fn();
      await persist();
      draw();
      return true;
    } catch (e) {
      Object.keys(notebook()).forEach((k) => delete notebook()[k]);
      Object.assign(notebook(), before);
      toast(e.message, true);
      draw();
      return false;
    }
  }
  function bookmark(id) {
    mutate(() => {
      notebook().workspace ??= {};
      const ids = notebook().workspace.bookmarks || [];
      notebook().workspace.bookmarks = ids.includes(id)
        ? ids.filter((x) => x !== id)
        : [...ids, id];
    });
  }
  function open(id) {
    if (entries().some((e) => e.id === id)) onOpen(id);
  }
  function preview(entry) {
    if (!entry) return empty("Select a node or page to see its connections.");
    const all = entries(),
      links = relationships(all),
      out = links.filter((l) => l.from === entry.id),
      incoming = links.filter((l) => l.to === entry.id),
      related = suggestions(all, entry).slice(0, 8);
    const group = (label, list, inbound = false) =>
      `<details class="connection-group" open><summary>${label} <span>${list.length}</span></summary>${
        list
          .map((l) => {
            const target = all.find((e) => e.id === (inbound ? l.from : l.to));
            return `<button class="connection-row ${l.category}" data-select="${h(target.id)}"><small>${h(RELATIONS[l.type] || l.type)}${inbound ? " → this page" : ""}</small><b>${h(target.title)}</b>${l.reason ? `<span>${h(l.reason)}</span>` : ""}</button>`;
          })
          .join("") || empty("No links yet.")
      }</details>`;
    return `<div class="preview-heading"><span class="eyebrow">${h(KINDS[entry.kind || "entry"])}</span>${!readOnly ? `<button class="icon-button" data-bookmark="${h(entry.id)}" aria-label="${(notebook().workspace?.bookmarks || []).includes(entry.id) ? "Remove bookmark" : "Bookmark page"}">${(notebook().workspace?.bookmarks || []).includes(entry.id) ? "★" : "☆"}</button>` : ""}</div><h3>${h(entry.title)}</h3><p class="preview-meta">${h(entry.project)} · ${h(entry.date)} · ${h(statusLabel(entry.status))}</p><div class="preview-actions"><button class="button subtle" data-open="${h(entry.id)}">Read page ↗</button><button class="text-button" data-local="${h(entry.id)}">Local map</button><button class="text-button" data-compare="${h(entry.id)}">Compare</button>${canEdit() ? `<button class="text-button" data-edit-note="${h(entry.id)}">Edit</button>` : ""}</div><div class="preview-body">${renderTextLinks(entry.body, all)}</div>${entry.attachments
      .filter((a) => a.kind === "image")
      .slice(0, 1)
      .map(
        (a) =>
          `<img class="preview-figure" src="${a.data}" alt="${h(a.name)}">`,
      )
      .join("")}${
      Object.keys(entry.properties || {}).length || entry.tags?.length
        ? `<details class="connection-group"><summary>Properties & tags</summary><dl>${Object.entries(
            entry.properties || {},
          )
            .map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`)
            .join(
              "",
            )}</dl><p>${(entry.tags || []).map((t) => `<button class="tag" data-tag="${h(t)}">${h(t)}</button>`).join(" ")}</p></details>`
        : ""
    }${entry.next ? `<details class="connection-group"><summary>Next steps</summary><p>${renderTextLinks(entry.next, all)}</p></details>` : ""}${entry.sources ? `<details class="connection-group"><summary>Sources</summary><p>${renderTextLinks(entry.sources, all)}</p></details>` : ""}${group("References", out)}${group("Referenced by", incoming, true)}<details class="connection-group"><summary>Suggested connections <span>${related.length}</span></summary><p class="hint">Shared context and unlinked mentions; these are suggestions, not scientific evidence.</p>${related.map((s) => `<div class="suggestion">${row(s.entry)}<small>${h(s.reasons.join(" · "))}</small>${canEdit() ? `<button class="text-button" data-accept="${h(s.entry.id)}">Add reference</button>` : ""}</div>`).join("") || empty("No suggested connections.")}</details>`;
  }
  function mapMarkup() {
    const g = graphData(entries(), filters, focus, depth, context),
      positions = layoutGraph(g.nodes, g.edges);
    const colors = ["#c89555", "#8aa896", "#91a3c4", "#bd9290", "#b3a792"];
    const kinds = [...new Set(g.nodes.map((e) => e.kind || "entry"))];
    return `<div class="map-controls"><div class="segmented"><button data-scope="all" class="${!focus ? "active" : ""}">Whole notebook</button><button data-scope="local" class="${focus ? "active" : ""}" ${!active() && !focus ? "disabled" : ""}>Around this page</button></div>${focus ? `<label class="inline-label">Depth <select id="graph-depth">${[1, 2, 3].map((n) => `<option ${depth === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>` : ""}<label class="inline-label"><input type="checkbox" id="show-context" ${context ? "checked" : ""}> Shared context</label><div class="zoom-controls"><button data-zoom="in" aria-label="Zoom in">＋</button><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="reset">Fit</button></div></div><div class="graph-surface"><svg id="relationship-map" viewBox="${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}" aria-label="Research relationship network" role="group"><defs><marker id="edge-arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>${g.edges
      .map((l, i) => {
        const a = positions.get(l.from),
          b = positions.get(l.to);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="graph-edge ${l.category}" data-edge="${i}" tabindex="0" role="button" aria-label="${h(RELATIONS[l.type] || "Shared context")}: ${h(l.reason)}" marker-end="url(#edge-arrow)"><title>${h(g.nodes.find((e) => e.id === l.from).title)} → ${h(g.nodes.find((e) => e.id === l.to).title)}: ${h(RELATIONS[l.type] || l.type)}. ${h(l.reason)}</title></line>`;
      })
      .join("")}${g.nodes
      .map((e) => {
        const p = positions.get(e.id);
        return `<g class="graph-node ${selected === e.id ? "selected" : ""}" data-select="${h(e.id)}" tabindex="0" role="button" aria-label="Preview ${h(e.title)}" transform="translate(${p.x} ${p.y})"><circle class="node-hit" r="24" fill="transparent"/><circle r="${selected === e.id ? 13 : 9}" fill="${colors[kinds.indexOf(e.kind || "entry") % colors.length]}"/><text y="29" text-anchor="middle">${h(e.title.length > 30 ? e.title.slice(0, 28) + "…" : e.title)}</text><title>${h(e.title)} · ${h(KINDS[e.kind || "entry"])}</title></g>`;
      })
      .join(
        "",
      )}</svg>${!g.nodes.length ? empty(focus ? "This page is outside the current filters. Clear filters or choose the whole notebook." : "No pages match. Add an entry or clear the filters.") : ""}</div><div class="graph-caption"><span>${g.nodes.length}${g.total > g.nodes.length ? " of " + g.total : ""} pages · ${g.edges.length} connections${g.total > 200 ? " · Refine filters to see more." : ""}</span><span><i class="legend reference"></i> Reference <i class="legend evidence"></i> Evidence <i class="legend context"></i> Shared context</span></div><p class="hint">Select a page to preview it. Select a line for its reason. Scroll to zoom; drag the background to pan.</p><details class="connection-group"><summary>Browse map as a list</summary>${g.nodes.map((e) => row(e)).join("")}</details>`;
  }
  function pagesMarkup() {
    let items = filterEntries(entries(), filters).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    if (bookmarksOnly)
      items = items.filter((e) =>
        (notebook().workspace?.bookmarks || []).includes(e.id),
      );
    return `<div class="list-heading"><span>${items.length} pages</span>${!readOnly ? `<label class="inline-label"><input type="checkbox" id="bookmarks-only" ${bookmarksOnly ? "checked" : ""}> Bookmarks</label>` : ""}${canEdit() ? '<button class="text-button" id="new-research-page">＋ New page</button>' : ""}</div>${items.map((e) => row(e)).join("") || empty("No pages match this view.")}`;
  }
  function tasksMarkup() {
    const list = filterEntries(entries(), filters);
    return `<div class="list-heading"><label class="inline-label">Show <select id="task-state">${options(Object.fromEntries(TASK_STATES.map((s) => [s, s[0].toUpperCase() + s.slice(1)])), taskState, "All outcomes")}</select></label></div>${list.flatMap((e) => (e.tasks || []).filter((t) => !taskState || t.state === taskState).map((t) => `<article class="task-item"><span class="task-state">${h(t.state)}</span><h3>${h(t.text)}</h3><button class="text-button" data-select="${h(e.id)}">${h(e.title)} ↗</button>${t.outcome && entries().some((x) => x.id === t.outcome) ? `<p>Outcome: <button class="text-button" data-select="${h(t.outcome)}">${h(entries().find((x) => x.id === t.outcome).title)}</button></p>` : ""}${t.reason ? `<p>${h(t.reason)}</p>` : ""}${canEdit() ? `<button class="text-button" data-edit-note="${h(e.id)}">Update outcome</button>` : ""}</article>`)).join("") || empty("No tracked next steps in this view. Add them under Connections & research details when contributing.")}<details class="connection-group"><summary>Next steps recorded as prose</summary>${
      list
        .filter((e) => e.next)
        .map(
          (e) =>
            `<article class="task-item">${row(e)}<p>${renderTextLinks(e.next, entries())}</p></article>`,
        )
        .join("") || empty("No prose next steps.")
    }</details>`;
  }
  function boardsMarkup() {
    const boards = filterEntries(entries(), filters).filter(
      (e) => e.kind === "board" || e.board,
    );
    const board = boards.find((e) => e.id === boardId) || boards[0];
    boardId = board?.id || "";
    if (!board)
      return `${canEdit() ? '<button class="button subtle" id="new-board">＋ New planning board</button>' : ""}${empty("No planning boards in this view.")}`;
    const cards = (board.board?.cards || []).filter((c) =>
      entries().some((e) => e.id === c.target),
    );
    const xmax = Math.max(1000, ...cards.map((c) => c.x + 260)),
      ymax = Math.max(600, ...cards.map((c) => c.y + 220));
    return `<div class="map-controls"><label class="inline-label">Board <select id="board-picker">${boards.map((e) => `<option value="${h(e.id)}" ${e.id === boardId ? "selected" : ""}>${h(e.title)}</option>`).join("")}</select></label><button class="text-button" data-select="${h(board.id)}">About this board</button>${canEdit() ? '<button class="text-button" id="new-board">＋ New</button><button class="text-button" id="edit-board">Edit board</button>' : ""}</div><div class="board-viewport"><div class="planning-board" style="width:${xmax}px;height:${ymax}px"><svg class="board-lines" width="${xmax}" height="${ymax}" aria-hidden="true">${(
      board.board?.connections || []
    )
      .map((c) => {
        const a = cards.find((x) => x.id === c.from),
          b = cards.find((x) => x.id === c.to);
        return a && b
          ? `<g><line x1="${a.x + 115}" y1="${a.y + 80}" x2="${b.x + 115}" y2="${b.y + 80}"/><text x="${(a.x + b.x) / 2 + 115}" y="${(a.y + b.y) / 2 + 70}" text-anchor="middle">${h(c.label)}</text></g>`
          : "";
      })
      .join("")}</svg>${cards
      .map((c) => {
        const e = entries().find((e) => e.id === c.target),
          a = e.attachments.find((a) => a.id === c.attachment);
        return `<article class="board-card" style="left:${c.x}px;top:${c.y}px" data-card="${h(c.id)}"><div class="card-handle" ${canEdit() ? 'title="Drag to arrange"' : ""}>${h(KINDS[e.kind || "entry"])}</div><button data-select="${h(e.id)}"><b>${h(e.title)}</b>${a?.kind === "image" ? `<img src="${a.data}" alt="${h(a.name)}">` : `<p>${h(plainText(e.body).slice(0, 160))}${plainText(e.body).length > 160 ? "…" : ""}</p>`}${a && a.kind !== "image" ? `<small>${h(a.name)}</small>` : ""}</button></article>`;
      })
      .join(
        "",
      )}${!cards.length ? empty("This board is empty. Add existing pages or figures in Contribute mode.") : ""}</div></div><p class="hint">${canEdit() ? "Drag cards to arrange. Use Edit board to add pages, figures, and labeled connections." : "Select a card to preview its original page. Scroll the board to explore."}</p>`;
  }
  function draw() {
    if (!root?.isConnected || !notebook()) return;
    if (selected && !active()) selected = "";
    const projects = [...new Set(entries().map((e) => e.project))].sort(),
      tags = [...new Set(entries().flatMap((e) => e.tags || []))].sort();
    root.innerHTML = `<div class="explore-top"><div><div class="eyebrow">FOLLOW THE RESEARCH</div><h2>Explore</h2></div></div><div class="explore-toolbar"><label class="search"><span>⌕</span><input id="explore-search" aria-label="Search research pages" placeholder="Find a question, recording, or result…" value="${h(filters.query || "")}"></label><label class="sr-only" for="explore-project">Project</label><select id="explore-project">${options(Object.fromEntries(projects.map((p) => [p, p])), filters.project, "All projects")}</select><details class="filter-menu"><summary>Filters${Object.entries(filters).filter(([k, v]) => v && !["query", "project"].includes(k)).length ? " •" : ""}</summary><div class="filter-fields"><label>Page type<select data-filter="kind">${options(KINDS, filters.kind, "All types")}</select></label><label>Evidence status<select data-filter="status">${options({ observation: "Recorded", unverified: "Unverified", verified: "Verified" }, filters.status === "in-progress" ? "observation" : filters.status, "All statuses")}</select></label><label>Tag<select data-filter="tag">${options(Object.fromEntries(tags.map((t) => [t, t])), filters.tag, "All tags")}</select></label><label>Recording ID<input data-filter="recording" value="${h(filters.recording || "")}"></label><label>From<input type="date" data-filter="from" value="${h(filters.from || "")}"></label><label>Through<input type="date" data-filter="to" value="${h(filters.to || "")}"></label><label>Relationship<select data-filter="relationship">${options(RELATIONS, filters.relationship, "All relationships")}</select></label><button class="text-button" id="clear-explore-filters">Clear filters</button></div></details>${!readOnly ? `<select id="saved-view" aria-label="Saved views"><option value="">Saved views</option>${(notebook().workspace?.views || []).map((v) => `<option value="${h(v.id)}">${h(v.name)}</option>`).join("")}</select><button class="text-button" id="save-view">Save view</button>` : ""}</div><div class="explore-tabs" role="tablist" aria-label="Explore views">${Object.entries(
      { map: "Map", pages: "Pages", tasks: "Next steps", boards: "Boards" },
    )
      .map(
        ([id, label]) =>
          `<button role="tab" aria-selected="${tab === id}" data-tab="${id}" class="${tab === id ? "active" : ""}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="explore-layout"><section class="explore-content" role="tabpanel">${{ map: mapMarkup, pages: pagesMarkup, tasks: tasksMarkup, boards: boardsMarkup }[tab]()}</section><aside class="note-preview" aria-label="Page preview and connections">${preview(active())}</aside></div>`;
    if (active())
      root
        .querySelector(".note-preview")
        .insertAdjacentHTML(
          "afterbegin",
          `<button class="text-button preview-back" id="back-to-explore">← Back to ${h({ map: "map", pages: "pages", tasks: "next steps", boards: "board" }[tab])}</button>`,
        );
    bind();
  }
  function select(id) {
    selected = id;
    draw();
    if (window.matchMedia("(max-width: 1000px)").matches)
      root
        .querySelector(".note-preview")
        .scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function bind() {
    const back = root.querySelector("#back-to-explore");
    if (back)
      back.onclick = () =>
        root
          .querySelector(".explore-content")
          .scrollIntoView({ behavior: "smooth", block: "start" });
    root.querySelectorAll("[data-select]").forEach((b) => {
      b.onclick = () => select(b.dataset.select);
      if (b.tagName.toLowerCase() === "g")
        b.onkeydown = (e) => {
          if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            select(b.dataset.select);
          }
        };
    });
    root
      .querySelectorAll("[data-open]")
      .forEach((b) => (b.onclick = () => open(b.dataset.open)));
    root.querySelectorAll("[data-local]").forEach(
      (b) =>
        (b.onclick = () => {
          focus = b.dataset.local;
          tab = "map";
          viewport = { x: 0, y: 0, w: 1000, h: 640 };
          draw();
        }),
    );
    root
      .querySelectorAll("[data-compare]")
      .forEach((b) => (b.onclick = () => compare(b.dataset.compare)));
    root
      .querySelectorAll("[data-edit-note]")
      .forEach((b) => (b.onclick = () => onEdit(b.dataset.editNote)));
    root
      .querySelectorAll("[data-bookmark]")
      .forEach((b) => (b.onclick = () => bookmark(b.dataset.bookmark)));
    root.querySelectorAll("[data-accept]").forEach(
      (b) =>
        (b.onclick = () =>
          mutate(() =>
            revise(active(), (e) => {
              e.links ??= [];
              e.links.push({
                id: crypto.randomUUID(),
                target: b.dataset.accept,
                type: "references",
                reason: "Added after reviewing a suggested connection.",
              });
            }),
          )),
    );
    root.querySelectorAll("[data-tag]").forEach(
      (b) =>
        (b.onclick = () => {
          filters.tag = b.dataset.tag;
          draw();
        }),
    );
    root.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          tab = b.dataset.tab;
          draw();
        }),
    );
    const search = root.querySelector("#explore-search");
    search.oninput = () => {
      const pos = search.selectionStart;
      filters.query = search.value;
      draw();
      const s = root.querySelector("#explore-search");
      s.focus();
      s.setSelectionRange(pos, pos);
    };
    root.querySelector("#explore-project").onchange = (e) => {
      filters.project = e.target.value;
      draw();
    };
    root.querySelectorAll("[data-filter]").forEach(
      (b) =>
        (b.onchange = () => {
          filters[b.dataset.filter] = b.value;
          draw();
        }),
    );
    root.querySelector("#clear-explore-filters").onclick = () => {
      filters = {};
      draw();
    };

    if (root.querySelector("#save-view"))
      root.querySelector("#save-view").onclick = saveView;
    if (root.querySelector("#saved-view"))
      root.querySelector("#saved-view").onchange = (e) => {
        const v = notebook().workspace?.views?.find(
          (v) => v.id === e.target.value,
        );
        if (v) {
          filters = structuredClone(v.filters);
          draw();
        }
      };
    if (root.querySelector("#bookmarks-only"))
      root.querySelector("#bookmarks-only").onchange = (e) => {
        bookmarksOnly = e.target.checked;
        draw();
      };
    if (root.querySelector("#task-state"))
      root.querySelector("#task-state").onchange = (e) => {
        taskState = e.target.value;
        draw();
      };
    root.querySelectorAll("[data-scope]").forEach(
      (b) =>
        (b.onclick = () => {
          focus = b.dataset.scope === "all" ? "" : selected || focus;
          viewport = { x: 0, y: 0, w: 1000, h: 640 };
          draw();
        }),
    );
    if (root.querySelector("#graph-depth"))
      root.querySelector("#graph-depth").onchange = (e) => {
        depth = Number(e.target.value);
        draw();
      };
    if (root.querySelector("#show-context"))
      root.querySelector("#show-context").onchange = (e) => {
        context = e.target.checked;
        draw();
      };
    const g = graphData(entries(), filters, focus, depth, context);
    root.querySelectorAll("[data-edge]").forEach((b) => {
      const show = () => {
        const l = g.edges[Number(b.dataset.edge)];
        showDialog(
          `<h2>${h(RELATIONS[l.type] || "Shared context")}</h2><p>${h(entries().find((e) => e.id === l.from)?.title)} → ${h(entries().find((e) => e.id === l.to)?.title)}</p><p>${h(l.reason || "Explicit relationship recorded by the author.")}</p><p class="hint">${l.category === "context" ? "Shared metadata does not establish scientific support." : l.category === "evidence" ? "This relationship records the author’s interpretation. Inspect the linked sources to assess it." : "A reference connects records; it does not imply causation or replication."}</p>`,
        );
      };
      b.onclick = show;
      b.onkeydown = (e) => {
        if (e.key === "Enter") show();
      };
    });
    bindMapNavigation();
    if (root.querySelector("#board-picker"))
      root.querySelector("#board-picker").onchange = (e) => {
        boardId = e.target.value;
        draw();
      };
    if (root.querySelector("#new-board"))
      root.querySelector("#new-board").onclick = () =>
        onEdit(undefined, "board");
    if (root.querySelector("#new-research-page"))
      root.querySelector("#new-research-page").onclick = () =>
        onEdit(undefined, "question");
    if (root.querySelector("#edit-board"))
      root.querySelector("#edit-board").onclick = () => editBoard();
    if (canEdit())
      root.querySelectorAll(".card-handle").forEach((handle) => {
        handle.onpointerdown = (e) => {
          const card = handle.closest("[data-card]"),
            source = entries().find((e) => e.id === boardId),
            item = source.board.cards.find((c) => c.id === card.dataset.card),
            start = { x: e.clientX, y: e.clientY, ox: item.x, oy: item.y };
          handle.setPointerCapture(e.pointerId);
          handle.onpointermove = (ev) => {
            card.style.left =
              Math.max(0, start.ox + ev.clientX - start.x) + "px";
            card.style.top =
              Math.max(0, start.oy + ev.clientY - start.y) + "px";
          };
          handle.onpointerup = () => {
            handle.onpointermove = null;
            handle.onpointerup = null;
            const x = parseFloat(card.style.left),
              y = parseFloat(card.style.top);
            if (x !== item.x || y !== item.y)
              mutate(() =>
                revise(source, (e) => {
                  const c = e.board.cards.find((c) => c.id === item.id);
                  c.x = x;
                  c.y = y;
                }),
              );
          };
          handle.onpointercancel = () => {
            handle.onpointermove = null;
            card.style.left = item.x + "px";
            card.style.top = item.y + "px";
          };
        };
      });
    decorateLinks(root);
  }
  function bindMapNavigation() {
    const svg = root.querySelector("#relationship-map");
    if (!svg) return;
    const apply = () =>
      svg.setAttribute(
        "viewBox",
        `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`,
      );
    const zoom = (factor) => {
      const cx = viewport.x + viewport.w / 2,
        cy = viewport.y + viewport.h / 2;
      viewport.w = Math.max(200, Math.min(4000, viewport.w * factor));
      viewport.h = viewport.w * 0.64;
      viewport.x = cx - viewport.w / 2;
      viewport.y = cy - viewport.h / 2;
      apply();
    };
    root.querySelectorAll("[data-zoom]").forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.zoom === "reset") {
            viewport = { x: 0, y: 0, w: 1000, h: 640 };
            apply();
          } else zoom(b.dataset.zoom === "in" ? 0.8 : 1.25);
        }),
    );
    svg.onwheel = (e) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    svg.onpointerdown = (e) => {
      if (e.target.closest("[data-select],[data-edge]")) return;
      const start = {
        x: e.clientX,
        y: e.clientY,
        vx: viewport.x,
        vy: viewport.y,
      };
      svg.setPointerCapture(e.pointerId);
      svg.onpointermove = (ev) => {
        const scale = viewport.w / svg.getBoundingClientRect().width;
        viewport.x = start.vx - (ev.clientX - start.x) * scale;
        viewport.y = start.vy - (ev.clientY - start.y) * scale;
        apply();
      };
      svg.onpointerup = () => {
        svg.onpointermove = null;
      };
    };
  }
  function revise(entry, fn) {
    const before = structuredClone(entry);
    delete before.revisions;
    fn(entry);
    entry.revisions = [...(entry.revisions || []), before];
    entry.updated = new Date().toISOString();
  }
  function showDialog(content, wide = false) {
    const dialog = document.querySelector("#knowledge-dialog");
    dialog.className = wide ? "knowledge-dialog wide" : "knowledge-dialog";
    dialog.innerHTML = `<div class="dialog-header"><span></span><button class="close" aria-label="Close" data-close>×</button></div>${content}`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
    return dialog;
  }
  function saveView() {
    const dialog = showDialog(
      '<form id="save-view-form"><h2>Save this view</h2><label>Name<input name="name" required maxlength="100" placeholder="e.g. Open recording analyses"></label><div class="dialog-footer"><button type="submit" class="button primary">Save view</button></div></form><div id="manage-views"></div>',
    );
    dialog.querySelector("#manage-views").innerHTML = (
      notebook().workspace?.views || []
    )
      .map(
        (v) =>
          `<div class="uploaded"><span>${h(v.name)}</span><button data-delete-view="${h(v.id)}" aria-label="Delete ${h(v.name)}">×</button></div>`,
      )
      .join("");
    dialog.querySelectorAll("[data-delete-view]").forEach(
      (b) =>
        (b.onclick = async () => {
          const saved = await mutate(() => {
            notebook().workspace.views = notebook().workspace.views.filter(
              (v) => v.id !== b.dataset.deleteView,
            );
          });
          if (saved) dialog.close();
        }),
    );
    dialog.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const saved = await mutate(() => {
        notebook().workspace ??= {};
        notebook().workspace.views ??= [];
        notebook().workspace.views.push({
          id: crypto.randomUUID(),
          name: e.target.elements.name.value.trim(),
          filters: structuredClone(filters),
        });
      });
      if (saved) dialog.close();
    };
  }
  function compare(id) {
    const all = entries(),
      first = all.find((e) => e.id === id) || all[0];
    if (!first) return;
    const dialog = showDialog(
      `<h2>Read side by side</h2><div class="compare-grid">${[0, 1].map((i) => `<section><label>Page ${i + 1}<select data-compare-picker="${i}">${noteOption(all)}</select></label><div data-compare-body="${i}"></div></section>`).join("")}</div>`,
      true,
    );
    const update = (i, id) => {
      const e = all.find((e) => e.id === id);
      dialog.querySelector(`[data-compare-body="${i}"]`).innerHTML =
        `<h3>${h(e.title)}</h3><p class="preview-meta">${h(e.project)} · ${h(e.date)} · ${h(statusLabel(e.status))}</p><div class="preview-body">${renderTextLinks(e.body, all)}</div>${e.attachments
          .filter((a) => a.kind === "image")
          .map(
            (a) =>
              `<figure><img class="preview-figure" src="${a.data}" alt="${h(a.name)}"><figcaption>${h(a.name)}</figcaption></figure>`,
          )
          .join(
            "",
          )}<p>${renderTextLinks(e.sources, all)}</p><p>${renderTextLinks(e.next, all)}</p>`;
      decorateLinks(dialog);
    };
    dialog.querySelectorAll("[data-compare-picker]").forEach((s, i) => {
      s.value =
        i === 0 ? first.id : all.find((e) => e.id !== first.id)?.id || first.id;
      s.onchange = () => update(i, s.value);
      update(i, s.value);
    });
  }
  function quickFind() {
    if (!notebook()) return;
    const dialog = showDialog(
      '<h2>Go to a page</h2><label class="search"><input id="quick-query" placeholder="Search pages or type > for commands" aria-label="Quick find"></label><div id="quick-results"></div>',
    );
    const input = dialog.querySelector("#quick-query"),
      results = dialog.querySelector("#quick-results");
    function update() {
      const q = input.value;
      if (q.startsWith(">")) {
        const commands = [
          [
            "Explore map",
            () => {
              dialog.close();
              api.show("map");
            },
          ],
          [
            "Browse pages",
            () => {
              dialog.close();
              api.show("pages");
            },
          ],
          [
            "Open next steps",
            () => {
              dialog.close();
              api.show("tasks");
            },
          ],
          [
            "Open planning boards",
            () => {
              dialog.close();
              api.show("boards");
            },
          ],
          ...(!readOnly
            ? [
                [
                  "New entry",
                  () => {
                    dialog.close();
                    onEdit();
                  },
                ],
              ]
            : []),
        ].filter(([name]) =>
          name.toLowerCase().includes(q.slice(1).trim().toLowerCase()),
        );
        results.innerHTML = commands
          .map(
            ([name], i) =>
              `<button class="note-row" data-command="${i}">${h(name)}</button>`,
          )
          .join("");
        results
          .querySelectorAll("[data-command]")
          .forEach((b) => (b.onclick = commands[Number(b.dataset.command)][1]));
      } else {
        const all = filterEntries(entries(), { query: q })
          .sort(
            (a, b) =>
              Number((notebook().workspace?.bookmarks || []).includes(b.id)) -
                Number(
                  (notebook().workspace?.bookmarks || []).includes(a.id),
                ) || b.date.localeCompare(a.date),
          )
          .slice(0, 30);
        results.innerHTML =
          all.map((e) => row(e)).join("") || empty("No matching pages.");
        results.querySelectorAll("[data-select]").forEach(
          (b) =>
            (b.onclick = () => {
              dialog.close();
              open(b.dataset.select);
            }),
        );
      }
    }
    input.oninput = update;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        results.querySelector("button")?.click();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        results.querySelector("button")?.focus();
      }
    };
    update();
    input.focus();
  }
  function editBoard() {
    if (!canEdit()) return;
    const source = entries().find((e) => e.id === boardId);
    if (!source) return;
    const board = structuredClone(
      source.board || { cards: [], connections: [] },
    );
    const dialog = showDialog(
      '<h2>Edit planning board</h2><div id="board-edit-content"></div>',
    );
    function renderBoardForm() {
      dialog.querySelector("#board-edit-content").innerHTML =
        `<p class="hint">Cards reference existing pages and original attachments. Arrangement does not alter their contents.</p><form id="board-add-card"><label>Page<select name="target">${noteOption(entries().filter((e) => e.id !== source.id))}</select></label><label>Figure or attachment<select name="attachment"><option value="">Page summary</option></select></label><button class="button subtle">＋ Add card</button></form><div class="board-card-list">${board.cards.map((c) => `<div class="uploaded"><span>${h(entries().find((e) => e.id === c.target)?.title || "Unavailable page")}</span><button data-remove-card="${h(c.id)}" aria-label="Remove card">×</button></div>`).join("")}</div><form id="board-add-line"><div class="editor-meta"><label>From<select name="from">${board.cards.map((c) => `<option value="${h(c.id)}">${h(entries().find((e) => e.id === c.target)?.title || c.target)}</option>`).join("")}</select></label><label>To<select name="to">${board.cards.map((c) => `<option value="${h(c.id)}">${h(entries().find((e) => e.id === c.target)?.title || c.target)}</option>`).join("")}</select></label></div><label>Connection label<input name="label" required maxlength="200" placeholder="e.g. motivates next experiment"></label><button class="text-button">＋ Connect cards</button></form>${board.connections.map((c) => `<div class="uploaded"><span>${h(c.label)}</span><button data-remove-line="${h(c.id)}" aria-label="Remove connection">×</button></div>`).join("")}<div class="dialog-footer"><button class="button primary" id="save-board">Save board</button></div>`;
      const form = dialog.querySelector("#board-add-card");
      const updateAttachments = () => {
        form.elements.attachment.innerHTML =
          '<option value="">Page summary</option>' +
          (
            entries().find((e) => e.id === form.elements.target.value)
              ?.attachments || []
          )
            .map((a) => `<option value="${h(a.id)}">${h(a.name)}</option>`)
            .join("");
      };
      form.elements.target.onchange = updateAttachments;
      updateAttachments();
      form.onsubmit = (e) => {
        e.preventDefault();
        if (!form.elements.target.value) return;
        const index = board.cards.length;
        board.cards.push({
          id: crypto.randomUUID(),
          target: form.elements.target.value,
          x: 40 + (index % 3) * 290,
          y: 40 + Math.floor(index / 3) * 250,
          ...(form.elements.attachment.value
            ? { attachment: form.elements.attachment.value }
            : {}),
        });
        renderBoardForm();
      };
      dialog.querySelector("#board-add-line").onsubmit = (e) => {
        e.preventDefault();
        const f = e.target.elements;
        if (!f.from.value || !f.to.value || f.from.value === f.to.value) return;
        board.connections.push({
          id: crypto.randomUUID(),
          from: f.from.value,
          to: f.to.value,
          label: f.label.value,
        });
        renderBoardForm();
      };
      dialog.querySelectorAll("[data-remove-card]").forEach(
        (b) =>
          (b.onclick = () => {
            board.cards = board.cards.filter(
              (c) => c.id !== b.dataset.removeCard,
            );
            board.connections = board.connections.filter(
              (c) =>
                c.from !== b.dataset.removeCard &&
                c.to !== b.dataset.removeCard,
            );
            renderBoardForm();
          }),
      );
      dialog.querySelectorAll("[data-remove-line]").forEach(
        (b) =>
          (b.onclick = () => {
            board.connections = board.connections.filter(
              (c) => c.id !== b.dataset.removeLine,
            );
            renderBoardForm();
          }),
      );
      dialog.querySelector("#save-board").onclick = async () => {
        if (
          await mutate(() =>
            revise(source, (e) => {
              e.board = board;
            }),
          )
        )
          dialog.close();
      };
    }
    renderBoardForm();
  }
  function decorateLinks(container) {
    container.querySelectorAll("[data-note]").forEach((a) => {
      a.setAttribute("href", noteHref(a.dataset.note));
      const e = entries().find((e) => e.id === a.dataset.note);
      if (e)
        a.title = `${e.title}\n${e.project} · ${e.date}\n${plainText(e.body).slice(0, 350)}`;
      a.onclick = (ev) => {
        ev.preventDefault();
        document.querySelector("#knowledge-dialog")?.close();
        open(a.dataset.note);
      };
    });
  }
  const api = {
    mount(container) {
      root = container;
      draw();
    },
    show(view = "map", id = "", local = false) {
      tab = view;
      if (id) selected = id;
      focus = local ? id : "";
      viewport = { x: 0, y: 0, w: 1000, h: 640 };
      api.onShow?.();
      draw();
    },
    connections(id) {
      filters = {};
      api.show("map", id, true);
    },
    project(value) {
      filters.project = value;
      draw();
    },
    quickFind,
    compare,
    decorateLinks,
    clear() {
      root = null;
      selected = "";
      focus = "";
      filters = {};
      document.querySelector("#knowledge-dialog")?.close();
    },
  };
  return api;
}

export function researchEditorMarkup(d, entries) {
  return `<div class="editor-meta"><label>Page type<select name="kind">${options(KINDS, d.kind || "entry")}</select></label><label>Start from a template<select id="entry-template"><option value="">Choose a template…</option>${options(Object.fromEntries(Object.keys(TEMPLATES).map((k) => [k, KINDS[k]])))}</select></label></div><details class="research-editor"><summary>Connections & research details</summary><p class="hint">Type [[ in Notes to link a page. Optional properties help find related work.</p><label>Tags (comma-separated)<input name="tags" value="${h((d.tags || []).join(", "))}" placeholder="e.g. slow waves, baseline"></label><label>Aliases (one per line)<textarea name="aliases" rows="2">${h((d.aliases || []).join("\n"))}</textarea></label><div id="property-editor"></div><button type="button" class="text-button" id="add-property">＋ Property</button><h3>Relationships</h3><div id="relationship-editor"></div><button type="button" class="text-button" id="add-relationship">＋ Relationship</button><h3>Tracked next steps</h3><div id="task-editor"></div><button type="button" class="text-button" id="add-task">＋ Next step</button><datalist id="research-targets">${entries
    .filter((e) => e.id !== d.id)
    .map((e) => `<option value="${h(e.id)}">${h(e.title)}</option>`)
    .join("")}</datalist></details>`;
}
export function bindResearchEditor(dialog, d, entries, onInput) {
  const formDraft = d.researchDraft;
  const propertyRows = Array.isArray(formDraft?.properties)
    ? structuredClone(formDraft.properties)
    : Object.entries(d.properties || {}).map(([key, value]) => ({
        key,
        value,
        type: typeof value,
      }));
  const links = structuredClone(
      Array.isArray(formDraft?.links) ? formDraft.links : d.links || [],
    ),
    tasks = structuredClone(
      Array.isArray(formDraft?.tasks) ? formDraft.tasks : d.tasks || [],
    );
  const targetOptions = (current) =>
    options(
      Object.fromEntries(
        entries
          .filter((e) => e.id !== d.id)
          .map((e) => [e.id, e.title + " · " + e.project]),
      ),
      current,
      "Choose a page…",
    ) +
    (current && !entries.some((e) => e.id === current)
      ? `<option value="${h(current)}" selected>Unavailable page</option>`
      : "");
  function renderRows() {
    dialog.querySelector("#property-editor").innerHTML =
      propertyRows
        .map(
          (p, i) =>
            `<div class="research-row" data-property-row="${i}"><label>Name<input data-field="key" value="${h(p.key)}" list="common-properties" maxlength="100"></label><label>Value${p.type === "boolean" ? `<select data-field="value">${options({ true: "True", false: "False" }, String(p.value))}</select>` : `<input data-field="value" type="${p.type === "number" ? "number" : "text"}" ${p.type === "number" ? 'step="any"' : ""} value="${h(p.value)}" maxlength="2000">`}</label><label>Type<select data-field="type">${options({ string: "Text", number: "Number", boolean: "True / false" }, p.type)}</select></label><button type="button" data-remove-property="${i}" aria-label="Remove property">×</button></div>`,
        )
        .join("") +
      '<datalist id="common-properties"><option>recordingId</option><option>species</option><option>intervention</option><option>analysisMethod</option><option>protocolVersion</option></datalist>';
    dialog.querySelector("#relationship-editor").innerHTML = links
      .map(
        (l, i) =>
          `<div class="research-item" data-link-row="${i}"><div class="research-row"><label>Relationship<select data-field="type">${options(RELATIONS, l.type)}</select></label><label>Target page<select data-field="target">${targetOptions(l.target)}</select></label><button type="button" data-remove-relationship="${i}" aria-label="Remove relationship">×</button></div><label>Reason / supporting evidence<input data-field="reason" value="${h(l.reason || "")}" maxlength="2000" placeholder="Why are these records connected?"></label></div>`,
      )
      .join("");
    dialog.querySelector("#task-editor").innerHTML = tasks
      .map(
        (t, i) =>
          `<div class="research-item" data-task-row="${i}"><div class="research-row"><label>Next step<input data-field="text" value="${h(t.text)}" maxlength="2000"></label><label>State<select data-field="state">${options(Object.fromEntries(TASK_STATES.map((s) => [s, s])), t.state)}</select></label><button type="button" data-remove-task="${i}" aria-label="Remove next step">×</button></div><label>Outcome page (optional)<select data-field="outcome">${targetOptions(t.outcome || "")}</select></label><label>Decision / outcome reason<input data-field="reason" value="${h(t.reason || "")}" maxlength="2000"></label></div>`,
      )
      .join("");
    for (const [attr, list] of [
      ["property", propertyRows],
      ["relationship", links],
      ["task", tasks],
    ])
      dialog.querySelectorAll(`[data-remove-${attr}]`).forEach(
        (b) =>
          (b.onclick = () => {
            readRows();
            list.splice(Number(b.getAttribute(`data-remove-${attr}`)), 1);
            renderRows();
            onInput();
          }),
      );
    dialog.querySelectorAll('[data-property-row] [data-field="type"]').forEach(
      (input) =>
        (input.onchange = () => {
          readRows();
          const p =
            propertyRows[
              Number(input.closest("[data-property-row]").dataset.propertyRow)
            ];
          if (
            p.type === "boolean" &&
            !["true", "false"].includes(String(p.value))
          )
            p.value = "false";
          renderRows();
          onInput();
        }),
    );
  }
  function readRows() {
    for (const [selector, list] of [
      ["property", propertyRows],
      ["link", links],
      ["task", tasks],
    ])
      dialog.querySelectorAll(`[data-${selector}-row]`).forEach((row) =>
        row.querySelectorAll("[data-field]").forEach((input) => {
          list[Number(row.getAttribute(`data-${selector}-row`))][
            input.dataset.field
          ] = input.value;
        }),
      );
  }
  renderRows();
  dialog.querySelector("#add-property").onclick = () => {
    readRows();
    propertyRows.push({ key: "", value: "", type: "string" });
    renderRows();
    onInput();
  };
  dialog.querySelector("#add-relationship").onclick = () => {
    readRows();
    links.push({
      id: crypto.randomUUID(),
      type: "references",
      target: "",
      reason: "",
    });
    renderRows();
    onInput();
  };
  dialog.querySelector("#add-task").onclick = () => {
    readRows();
    tasks.push({
      id: crypto.randomUUID(),
      text: "",
      state: "open",
      outcome: "",
      reason: "",
    });
    renderRows();
    onInput();
  };
  dialog.querySelector("#entry-template").onchange = (e) => {
    const key = e.target.value;
    if (!key) return;
    const notes = dialog.querySelector("[name=body]");
    if (notes.value.trim()) {
      e.target.value = "";
      return;
    }
    notes.value = TEMPLATES[key];
    dialog.querySelector("[name=kind]").value = key;
    onInput();
  };
  // The popup stores stable IDs, so renaming a page cannot break new links.
  const notes = dialog.querySelector("[name=body]"),
    popup = document.createElement("div");
  popup.className = "wiki-picker";
  popup.hidden = true;
  notes.closest("label").after(popup);
  notes.addEventListener("input", () => {
    const prefix = notes.value.slice(0, notes.selectionStart),
      match = prefix.match(/\[\[([^\]\n]*)$/);
    popup.hidden = !match;
    if (!match) return;
    const found = filterEntries(entries, { query: match[1] })
      .filter((e) => e.id !== d.id)
      .slice(0, 8);
    popup.innerHTML =
      found
        .map(
          (e) =>
            `<button type="button" data-wiki="${h(e.id)}"><b>${h(e.title)}</b><small>${h(e.project)}</small></button>`,
        )
        .join("") || "<span>No matching pages.</span>";
    popup.querySelectorAll("[data-wiki]").forEach(
      (b) =>
        (b.onclick = () => {
          const target = entries.find((e) => e.id === b.dataset.wiki),
            end = notes.selectionStart,
            start = end - match[0].length;
          notes.setRangeText(
            `[[${target.id}|${target.title.replace(/[\]\n|]/g, " ")}]]`,
            start,
            end,
            "end",
          );
          popup.hidden = true;
          notes.focus();
          onInput();
        }),
    );
  });
  notes.addEventListener("keydown", (e) => {
    if (!popup.hidden && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      popup.hidden = true;
    } else if (!popup.hidden && e.key === "ArrowDown") {
      e.preventDefault();
      popup.querySelector("button")?.focus();
    }
  });
  return (strict = false) => {
    readRows();
    const validId = (v) => /^[A-Za-z0-9_-]{1,100}$/.test(v);
    const target = (v) => resolveTarget(entries, v)?.id || v.trim();
    const validNumber = (p) =>
      p.type !== "number" ||
      (String(p.value).trim() !== "" && Number.isFinite(Number(p.value)));
    if (strict) {
      if (propertyRows.some((p) => !p.key.trim() && String(p.value).trim()))
        throw new Error("Give each property a name.");
      if (propertyRows.some((p) => p.key.trim() && !validNumber(p)))
        throw new Error("Enter a finite numeric property value.");
      const names = propertyRows.map((p) => p.key.trim()).filter(Boolean);
      if (new Set(names).size !== names.length)
        throw new Error("Property names must be unique.");
      if (
        links.some(
          (l) =>
            (l.target.trim() || l.reason.trim()) && !validId(target(l.target)),
        )
      )
        throw new Error("Choose a valid target page for each relationship.");
      if (
        tasks.some(
          (t) => !t.text.trim() && (t.reason.trim() || t.outcome.trim()),
        )
      )
        throw new Error("Describe each tracked next step.");
      if (tasks.some((t) => t.outcome.trim() && !validId(target(t.outcome))))
        throw new Error("Choose a valid outcome page.");
    }
    if (strict) delete d.researchDraft;
    else
      d.researchDraft = {
        properties: structuredClone(propertyRows),
        links: structuredClone(links),
        tasks: structuredClone(tasks),
      };
    d.kind = dialog.querySelector("[name=kind]").value;
    d.tags = dialog
      .querySelector("[name=tags]")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    d.aliases = dialog
      .querySelector("[name=aliases]")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    d.properties = Object.fromEntries(
      propertyRows
        .filter((p) => p.key.trim() && validNumber(p))
        .map((p) => [
          p.key.trim(),
          p.type === "number"
            ? Number(p.value)
            : p.type === "boolean"
              ? p.value === "true"
              : p.value,
        ]),
    );
    d.links = links
      .filter((l) => validId(target(l.target)))
      .map((l) => ({
        ...l,
        target: resolveTarget(entries, l.target)?.id || l.target.trim(),
      }));
    d.tasks = tasks
      .filter((t) => t.text.trim())
      .map((t) => ({
        ...t,
        outcome: validId(target(t.outcome)) ? target(t.outcome) : "",
      }));
    return {
      kind: d.kind,
      tags: d.tags,
      aliases: d.aliases,
      properties: d.properties,
      links: d.links,
      tasks: d.tasks,
      ...(!strict ? { researchDraft: d.researchDraft } : {}),
    };
  };
}
