// Optional schema-1 research metadata. Old notebooks need no migration.
export const KINDS = {
  entry: "Daily entry",
  experiment: "Experiment",
  analysis: "Analysis",
  meeting: "Meeting",
  literature: "Literature",
  question: "Research question",
  recording: "Recording",
  method: "Method / protocol",
  figure: "Figure",
  board: "Planning board",
};
export const RELATIONS = {
  references: "References",
  reanalyzes: "Reanalyzes",
  "uses-protocol": "Uses protocol",
  supports: "Supports",
  challenges: "Challenges",
  "follows-up": "Follows up",
  supersedes: "Supersedes",
  resolves: "Resolves",
};
export const TASK_STATES = ["open", "completed", "revised", "abandoned"];
export const TEMPLATES = {
  experiment:
    "- Question and rationale: \n- Recording / conditions / protocol: \n- Observations: \n- Interpretation: ",
  analysis:
    "- Question and comparison: \n- Recording / method / parameters: \n- Result and uncertainty: \n- Interpretation: ",
  meeting:
    "- Research question discussed: \n- Evidence reviewed: \n- Decisions and rationale: ",
  literature:
    "- Question addressed: \n- Study / preparation / sample: \n- Main result reported by the authors: \n- Relevance and limitations: ",
  question:
    "- Research question: \n- Rationale and current hypothesis: \n- Evidence and competing interpretations: \n- Unresolved questions: ",
  recording:
    "- Deidentified recording ID and preparation: \n- Acquisition conditions and protocol: \n- Quality observations and limitations: ",
  method:
    "- Scientific purpose: \n- Procedure and essential parameters: \n- Protocol version and validation source: ",
  figure:
    "- Recording / condition and measurement: \n- Main result and interpretation: \n- Original report / panel / analysis date: ",
};
const fail = (label) => {
  throw new Error(`Invalid ${label}.`);
};
const text = (v, max, label) => {
  if (typeof v !== "string" || v.length > max) fail(label);
};
const array = (v, max, label) => {
  if (!Array.isArray(v) || v.length > max) fail(label);
};
const id = (v, label = "reference ID") => {
  text(v, 100, label);
  if (!/^[A-Za-z0-9_-]+$/.test(v)) fail(label);
};
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
export function validateKnowledge(e) {
  if (e.kind !== undefined && !Object.hasOwn(KINDS, e.kind)) fail("page kind");
  for (const key of ["tags", "aliases"])
    if (e[key] !== undefined) {
      array(e[key], 100, key);
      e[key].forEach((v) => text(v, 200, key));
    }
  if (e.properties !== undefined) {
    if (!object(e.properties) || Object.keys(e.properties).length > 50)
      fail("properties");
    for (const [k, v] of Object.entries(e.properties)) {
      text(k, 100, "property name");
      if (!k.trim() || ["__proto__", "constructor", "prototype"].includes(k))
        fail("property name");
      if (typeof v === "string") text(v, 2000, "property value");
      else if (
        typeof v !== "boolean" &&
        !(typeof v === "number" && Number.isFinite(v))
      )
        fail("property value");
    }
  }
  for (const key of ["links", "tasks"])
    if (e[key] !== undefined) {
      array(e[key], 200, key);
      const seen = new Set();
      for (const item of e[key]) {
        if (!object(item)) fail(key);
        id(item.id);
        if (seen.has(item.id)) fail(`duplicate ${key} ID`);
        seen.add(item.id);
        if (key === "links") {
          id(item.target);
          if (!Object.hasOwn(RELATIONS, item.type)) fail("relationship type");
          text(item.reason || "", 2000, "relationship reason");
        } else {
          text(item.text, 2000, "task text");
          if (!TASK_STATES.includes(item.state)) fail("task state");
          if (item.outcome) id(item.outcome);
          text(item.reason || "", 2000, "task reason");
        }
      }
    }
  if (e.board !== undefined) {
    if (!object(e.board)) fail("board");
    array(e.board.cards, 200, "board cards");
    array(e.board.connections, 400, "board connections");
    const cards = new Set();
    for (const c of e.board.cards) {
      id(c.id);
      id(c.target);
      if (cards.has(c.id)) fail("duplicate board card");
      cards.add(c.id);
      if (c.attachment) id(c.attachment);
      for (const k of ["x", "y"])
        if (!Number.isFinite(c[k]) || Math.abs(c[k]) > 100000)
          fail("board position");
    }
    const connections = new Set();
    for (const c of e.board.connections) {
      id(c.id);
      if (connections.has(c.id)) fail("duplicate board connection");
      connections.add(c.id);
      if (!cards.has(c.from) || !cards.has(c.to)) fail("board connection");
      text(c.label || "", 200, "board label");
    }
  }
}
export function validateWorkspace(w) {
  if (w === undefined) return;
  if (!object(w)) fail("workspace");
  if (w.bookmarks !== undefined) {
    array(w.bookmarks, 10000, "bookmarks");
    w.bookmarks.forEach((v) => id(v));
  }
  if (w.views !== undefined) {
    array(w.views, 100, "saved views");
    const seen = new Set();
    for (const v of w.views) {
      id(v.id);
      if (seen.has(v.id)) fail("duplicate saved view");
      seen.add(v.id);
      text(v.name, 100, "view name");
      if (!object(v.filters)) fail("view filters");
      for (const [k, x] of Object.entries(v.filters)) {
        if (
          ![
            "query",
            "project",
            "kind",
            "status",
            "tag",
            "recording",
            "from",
            "to",
            "relationship",
          ].includes(k)
        )
          fail("view filter");
        text(x, 300, "view filter");
      }
    }
  }
}
export function wikiLinks(value) {
  return [
    ...String(value || "").matchAll(/\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g),
  ].map((m) => ({
    target: m[1].trim(),
    text: (m[2] || m[1]).trim(),
    raw: m[0],
    index: m.index,
  }));
}
export function resolveTarget(entries, target) {
  const exact = entries.find((e) => e.id === target);
  if (exact) return exact;
  const matches = entries.filter(
    (e) => e.title === target || (e.aliases || []).includes(target),
  );
  return matches.length === 1 ? matches[0] : null;
}
export function relationships(entries, { context = false } = {}) {
  const edges = [],
    ids = new Set(entries.map((e) => e.id)),
    seen = new Set();
  const add = (from, to, type, reason, category = "reference") => {
    if (!ids.has(to) || from === to) return;
    const key = [from, to, type].join(":");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, type, reason, category });
  };
  for (const e of entries) {
    for (const l of e.links || [])
      add(
        e.id,
        l.target,
        l.type,
        l.reason || "",
        ["supports", "challenges"].includes(l.type) ? "evidence" : "reference",
      );
    const explicit = new Set((e.links || []).map((l) => l.target));
    for (const l of wikiLinks([e.body, e.sources, e.next].join("\n"))) {
      const t = resolveTarget(entries, l.target);
      if (t && !explicit.has(t.id))
        add(e.id, t.id, "references", "Linked in the entry text.");
    }
    for (const t of e.tasks || [])
      if (t.outcome)
        add(
          e.id,
          t.outcome,
          "resolves",
          `${t.text} (${t.state})${t.reason ? ": " + t.reason : ""}`,
        );
    for (const c of e.board?.cards || [])
      add(e.id, c.target, "references", "Included on this planning board.");
  }
  if (context) {
    const groups = new Map();
    for (const e of entries) {
      const recording = e.properties?.recordingId;
      for (const label of [
        ...(e.tags || []).map((t) => "Tag: " + t),
        ...(recording ? ["Recording: " + recording] : []),
      ]) {
        const group = groups.get(label) || [];
        group.push(e.id);
        groups.set(label, group);
      }
    }
    for (const [label, group] of groups)
      for (const to of group.slice(1))
        add(group[0], to, "shared-context", label, "context");
  }
  return edges;
}
export function suggestions(entries, active) {
  if (!active) return [];
  const connected = new Set(
    relationships(entries)
      .filter((l) => l.from === active.id || l.to === active.id)
      .flatMap((l) => [l.from, l.to]),
  );
  const names = [active.title, ...(active.aliases || [])]
    .filter((s) => s.length >= 4)
    .map((s) => s.toLowerCase());
  return entries
    .filter((e) => e.id !== active.id && !connected.has(e.id))
    .map((entry) => {
      const body = [entry.body, entry.sources, entry.next]
        .join(" ")
        .toLowerCase();
      const reasons = [];
      if (names.some((n) => body.includes(n)))
        reasons.push("Unlinked mention of this page");
      if (
        active.properties?.recordingId &&
        active.properties.recordingId === entry.properties?.recordingId
      )
        reasons.push("Same recording ID");
      const tags = (active.tags || []).filter((t) =>
        (entry.tags || []).includes(t),
      );
      if (tags.length) reasons.push("Shared tags: " + tags.join(", "));
      return { entry, reasons };
    })
    .filter((x) => x.reasons.length)
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        b.entry.date.localeCompare(a.entry.date),
    );
}
export function filterEntries(entries, f = {}) {
  return entries.filter(
    (e) =>
      (!f.project || e.project === f.project) &&
      (!f.kind || (e.kind || "entry") === f.kind) &&
      (!f.status || (e.status === "in-progress" ? "observation" : e.status) === (f.status === "in-progress" ? "observation" : f.status)) &&
      (!f.from || e.date >= f.from) &&
      (!f.to || e.date <= f.to) &&
      (!f.tag || (e.tags || []).includes(f.tag)) &&
      (!f.recording ||
        String(e.properties?.recordingId || "")
          .toLowerCase()
          .includes(f.recording.toLowerCase())) &&
      (!f.query ||
        [
          e.title,
          e.body,
          e.sources,
          e.next,
          e.project,
          e.id,
          ...(e.tags || []),
          ...Object.values(e.properties || {}),
        ]
          .join(" ")
          .toLowerCase()
          .includes(f.query.toLowerCase())),
  );
}
export function graphData(
  entries,
  filters = {},
  focus = "",
  depth = 1,
  context = false,
) {
  const candidates = filterEntries(entries, filters),
    allowed = new Set(candidates.map((e) => e.id));
  let edges = relationships(entries, { context }).filter(
    (l) =>
      allowed.has(l.from) &&
      allowed.has(l.to) &&
      (!filters.relationship || l.type === filters.relationship),
  );
  let nodes = candidates;
  if (focus) {
    const visited = new Set(allowed.has(focus) ? [focus] : []);
    let frontier = new Set(visited);
    for (let i = 0; i < depth; i++) {
      const next = new Set();
      for (const l of edges) {
        if (frontier.has(l.from) && !visited.has(l.to)) next.add(l.to);
        if (frontier.has(l.to) && !visited.has(l.from)) next.add(l.from);
      }
      next.forEach((x) => visited.add(x));
      frontier = next;
    }
    nodes = nodes.filter((e) => visited.has(e.id));
    edges = edges.filter((l) => visited.has(l.from) && visited.has(l.to));
  }
  const total = nodes.length;
  nodes = nodes.slice(0, 200);
  const shown = new Set(nodes.map((e) => e.id));
  return {
    nodes,
    edges: edges.filter((l) => shown.has(l.from) && shown.has(l.to)),
    total,
  };
}
export function layoutGraph(nodes, edges) {
  const points = nodes.map((e, i) => ({
    id: e.id,
    x: 500 + 320 * Math.cos(i * 2.39996) * Math.sqrt((i + 1) / nodes.length),
    y: 320 + 240 * Math.sin(i * 2.39996) * Math.sqrt((i + 1) / nodes.length),
  }));
  const map = new Map(points.map((p) => [p.id, p]));
  for (let step = 0; step < 100; step++) {
    const force = points.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x,
          dy = points[i].y - points[j].y,
          d = Math.max(30, Math.hypot(dx, dy)),
          f = 1500 / (d * d);
        force[i].x += dx * f;
        force[i].y += dy * f;
        force[j].x -= dx * f;
        force[j].y -= dy * f;
      }
    for (const l of edges) {
      const a = map.get(l.from),
        b = map.get(l.to);
      if (!a || !b) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      a.x += dx * 0.008;
      a.y += dy * 0.008;
      b.x -= dx * 0.008;
      b.y -= dy * 0.008;
    }
    points.forEach((p, i) => {
      p.x = Math.max(
        160,
        Math.min(840, p.x + force[i].x + (500 - p.x) * 0.002),
      );
      p.y = Math.max(65, Math.min(565, p.y + force[i].y + (320 - p.y) * 0.002));
    });
  }
  return map;
}
// Used by reader snapshots and Obsidian exports; never follow references outside the selection.
export function selectedKnowledge(entry, ids, entries) {
  const result = {};
  for (const k of ["kind", "tags", "aliases", "properties"])
    if (entry[k] !== undefined) result[k] = structuredClone(entry[k]);
  if (entry.links)
    result.links = entry.links
      .filter((l) => ids.has(l.target))
      .map((l) => ({
        id: l.id,
        target: l.target,
        type: l.type,
        reason: l.reason || "",
      }));
  if (entry.tasks)
    result.tasks = entry.tasks.map((t) => ({
      id: t.id,
      text: t.text,
      state: t.state,
      ...(ids.has(t.outcome) ? { outcome: t.outcome } : {}),
      reason: t.reason || "",
    }));
  if (entry.board) {
    const cards = entry.board.cards
      .filter(
        (c) =>
          ids.has(c.target) &&
          (!c.attachment ||
            entries
              .find((e) => e.id === c.target)
              ?.attachments?.some((a) => a.id === c.attachment)),
      )
      .map((c) => ({
        id: c.id,
        target: c.target,
        x: c.x,
        y: c.y,
        ...(c.attachment ? { attachment: c.attachment } : {}),
      }));
    const cardIds = new Set(cards.map((c) => c.id));
    result.board = {
      cards,
      connections: entry.board.connections
        .filter((c) => cardIds.has(c.from) && cardIds.has(c.to))
        .map((c) => ({
          id: c.id,
          from: c.from,
          to: c.to,
          label: c.label || "",
        })),
    };
  }
  return result;
}
