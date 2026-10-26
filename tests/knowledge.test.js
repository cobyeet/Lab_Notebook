import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { unzipSync, strFromU8 } from "fflate";
import {
  blankNotebook,
  validateNotebook,
  renderTextLinks,
  paginate,
  statusLabel,
} from "../src/model.js";
import {
  relationships,
  graphData,
  filterEntries,
  resolveTarget,
  suggestions,
  layoutGraph,
} from "../src/knowledge.js";
import { readerEdition } from "../src/sharing.js";
import { exportBundle } from "../src/exports.js";

test('dated records and legacy progress labels share a view without rewriting their evidence or history', () => {
  const n = fixture();
  n.entries[0].status = 'in-progress';
  n.entries[0].revisions = [{status:'unverified',body:'Earlier interpretation'}];
  n.entries[1].status = 'verified';
  const before = structuredClone(n);
  assert.equal(statusLabel(n.entries[0].status),'Recorded');
  assert.equal(filterEntries(n.entries,{status:'observation'}).length,5);
  assert.deepEqual(filterEntries(n.entries,{status:'in-progress'}),filterEntries(n.entries,{status:'observation'}));
  assert.equal(filterEntries(n.entries,{status:'verified'}).length,1);
  validateNotebook(n,true);
  assert.deepEqual(n,before);
});

function fixture() {
  const n = blankNotebook();
  const entry = (id, title, kind = "entry") => ({
    id,
    title,
    kind,
    date: "2026-10-26",
    created: "2026-10-26T10:00:00Z",
    project: "Example",
    body: "- Synthetic research note.",
    status: "observation",
    significant: false,
    sources: "",
    next: "",
    attachments: [],
  });
  n.entries = [
    entry("q", "Question", "question"),
    entry("a", "Analysis", "analysis"),
    entry("r", "Recording", "recording"),
    entry("later", "Follow-up", "experiment"),
    entry("b", "Board", "board"),
    entry("unselected", "Excluded page"),
  ];
  const [q, a, r, later, b] = n.entries;
  a.body = "- Compared [[r|source recording]] to address [[q|the question]].";
  a.links = [
    {
      id: "l1",
      target: q.id,
      type: "supports",
      reason: "Interpretation with uncertainty.",
    },
    {
      id: "l2",
      target: "unselected",
      type: "references",
      reason: "excluded relationship reason",
    },
  ];
  a.tags = ["timing", "slow waves"];
  a.properties = { recordingId: "R-001", sampleCount: 2, reviewed: false };
  r.properties = { recordingId: "R-001" };
  q.aliases = ["Timing question"];
  later.body = "- Follow-up for the Timing question.";
  later.links = [
    {
      id: "l3",
      target: a.id,
      type: "follows-up",
      reason: "Control an alternative explanation.",
    },
  ];
  a.tasks = [
    {
      id: "task1",
      text: "Assess artifacts",
      state: "completed",
      outcome: "later",
      reason: "Recorded follow-up.",
    },
    {
      id: "task2",
      text: "Review timing",
      state: "open",
      outcome: "unselected",
    },
  ];
  b.board = {
    cards: [
      { id: "c1", target: "q", x: 10, y: 20 },
      { id: "c2", target: "a", x: 300, y: 20 },
      { id: "c3", target: "unselected", x: 600, y: 20 },
    ],
    connections: [
      { id: "bc1", from: "c1", to: "c2", label: "motivates" },
      { id: "bc2", from: "c2", to: "c3", label: "excluded board label" },
    ],
  };
  return n;
}

test("internal links use stable IDs, escape labels and preserve complete pagination tokens", () => {
  const n = fixture();
  n.entries[2].title = "Renamed recording";
  assert.match(
    renderTextLinks("[[r|<img onerror=bad>]]", n.entries),
    /data-note="r"/,
  );
  assert.ok(
    !renderTextLinks("[[r|<img onerror=bad>]]", n.entries).includes("<img"),
  );
  assert.match(
    renderTextLinks("[[missing|Unavailable]]", n.entries),
    /unresolved-link/,
  );
  assert.equal(resolveTarget(n.entries, "Timing question").id, "q");
  n.entries.push({ ...n.entries[0], id: "duplicate", title: "Question" });
  assert.equal(resolveTarget(n.entries, "Question"), null);
  n.entries[1].body =
    "x".repeat(1090) + "[[r|source recording]]" + "y".repeat(50);
  const text = paginate([n.entries[1]])
    .flatMap((p) => p.blocks || [])
    .filter((b) => b.kind === "text")
    .map((b) => b.text);
  assert.equal(text.join(""), n.entries[1].body);
  assert.equal(
    text.filter((t) => t.includes("[[r|source recording]]")).length,
    1,
  );
});

test("local graph follows references and outcomes, filters explicitly, and separates evidence from context", () => {
  const n = fixture(),
    links = relationships(n.entries);
  assert.equal(links.filter((l) => l.from === "a" && l.to === "q").length, 1);
  assert.equal(
    links.find((l) => l.from === "a" && l.to === "q").category,
    "evidence",
  );
  assert.ok(!links.some((l) => l.category === "context"));
  assert.ok(
    relationships(n.entries, { context: true }).some(
      (l) => l.category === "context",
    ),
  );
  const local = graphData(n.entries, {}, "r", 1);
  assert.deepEqual(new Set(local.nodes.map((e) => e.id)), new Set(["r", "a"]));
  assert.ok(graphData(n.entries, {}, "r", 2).nodes.some((e) => e.id === "q"));
  assert.equal(
    graphData(n.entries, { kind: "question" }, "a", 2).nodes.length,
    0,
  );
  assert.ok(
    graphData(n.entries, { relationship: "supports" }).edges.every(
      (l) => l.type === "supports",
    ),
  );
  assert.equal(
    filterEntries(n.entries, {
      recording: "r-001",
      kind: "analysis",
      tag: "timing",
    }).length,
    1,
  );
  assert.ok(
    suggestions(n.entries, n.entries[0]).some(
      (s) =>
        s.entry.id === "later" &&
        s.reasons.includes("Unlinked mention of this page"),
    ),
  );
  for (const p of layoutGraph(local.nodes, local.edges).values())
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test("schema-1 metadata is optional and malformed references, boards and settings are rejected", () => {
  assert.ok(validateNotebook(blankNotebook()));
  assert.ok(validateNotebook(fixture()));
  for (const change of [
    (n) => (n.entries[0].kind = "unknown"),
    (n) => (n.entries[0].properties = { bad: { secret: "nested" } }),
    (n) => (n.entries[1].links[0].type = "causes"),
    (n) => (n.entries[1].tasks[0].state = "maybe"),
    (n) => (n.entries[4].board.cards[0].x = Infinity),
    (n) => (n.entries[4].board.connections[0].from = "missing"),
    (n) =>
      (n.workspace = {
        views: [{ id: "v", name: "test", filters: { unknown: "x" } }],
      }),
  ]) {
    const n = fixture();
    change(n);
    assert.throws(() => validateNotebook(n));
  }
});

test("reader selection trims external graph references and original figure cards when attachments are omitted", () => {
  const n = fixture();
  n.workspace = { bookmarks: ["unselected"], views: [] };
  n.entries[1].revisions = [{ body: "private history" }];
  n.entries[4].board.cards[0].privateNotes = "private card metadata";
  n.entries[1].attachments = [
    {
      id: "image",
      name: "image.png",
      kind: "image",
      data: "data:image/png;base64,aGk=",
    },
  ];
  n.entries[4].board.cards.push({
    id: "figure",
    target: "a",
    attachment: "image",
    x: 10,
    y: 200,
  });
  const ids = ["q", "a", "r", "later", "b"],
    edition = readerEdition(n, ids, false);
  assert.equal(edition.workspace, undefined);
  assert.equal(edition.entries[1].links.length, 1);
  assert.equal(edition.entries[1].tasks[1].outcome, undefined);
  assert.equal(edition.entries[4].board.cards.length, 2);
  assert.equal(edition.entries[4].board.connections.length, 1);
  assert.ok(!JSON.stringify(edition).includes("excluded"));
  assert.ok(!JSON.stringify(edition).includes("private"));
});

test("Obsidian export has stable links, safe frontmatter, original bytes and selection-limited canvases", async () => {
  const n = fixture();
  n.entries[0].title = 'Question: "timing"\nwith newline';
  const raw = new TextEncoder().encode("original attachment bytes"),
    digest = createHash("sha256").update(raw).digest("hex");
  n.entries[1].attachments = [
    {
      id: "original",
      name: "source.pdf",
      kind: "file",
      data:
        "data:application/pdf;base64," + Buffer.from(raw).toString("base64"),
      sha256: digest,
    },
  ];
  n.draft = { body: "private draft" };
  const pages = paginate(n.entries),
    chosen = pages.filter((p) => p.entry && p.entry.id !== "unselected");
  const files = unzipSync(await exportBundle(n, chosen, pages, ["obsidian"]));
  const note = strFromU8(files["Obsidian/Pages/a.md"]);
  assert.ok(note.includes("[[r|source recording]]"));
  assert.ok(note.includes('"research_sampleCount": 2'));
  assert.ok(note.includes('"tags": ["timing","slow-waves"]'));
  assert.ok(note.includes('"notebook_tags": ["timing","slow waves"]'));
  assert.ok(
    strFromU8(files["Obsidian/Pages/q.md"]).includes("\\nwith newline"),
  );
  assert.deepEqual(files["Obsidian/Attachments/a/original-source.pdf"], raw);
  assert.ok(
    strFromU8(files["Obsidian/notebook-manifest.json"]).includes(digest),
  );
  const canvas = JSON.parse(strFromU8(files["Obsidian/Boards/b.canvas"]));
  assert.equal(canvas.nodes.length, 2);
  assert.equal(canvas.edges.length, 1);
  assert.equal(files["Obsidian/Pages/unselected.md"], undefined);
  assert.ok(
    !Object.values(files).map(strFromU8).join("").includes("private draft"),
  );
});

test("PDF exports resolve internal labels and link only to pages included in that PDF", async () => {
  const n = fixture(),
    pages = paginate(n.entries);
  const files = unzipSync(await exportBundle(n, pages, pages, ["pdf"])),
    pdf = strFromU8(files["notebook.pdf"]);
  assert.ok(pdf.includes("/Dest ["));
  assert.ok(!pdf.includes("[[r|"));
  const selected = pages.filter((p) => p.entry?.id === "a");
  const partial = strFromU8(
    unzipSync(await exportBundle(n, selected, pages, ["pdf"]))["notebook.pdf"],
  );
  assert.ok(!partial.includes("/Dest ["));
  assert.ok(!partial.includes("[[r|"));
});

test("database publication preserves whitelisted research fields and enforces selection and access", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; grant usage on schema public to anon,authenticated;",
    );
    for (const name of [
      "202610260002_reader_links.sql",
      "20261026223159_research_connections.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.exec("set role anon");
    const owner = "a".repeat(64),
      reader = "b".repeat(64),
      id = (
        await db.query("select public.ln_link_create($1,'Test') id", [owner])
      ).rows[0].id;
    const n = fixture();
    n.entries = n.entries.filter((e) => e.id !== "unselected");
    n.workspace = { bookmarks: ["unselected"] };
    n.entries[1].revisions = [{ body: "private history" }];
    n.entries[1].links[0].privateNotes = "private nested";
    await db.query("select public.ln_link_publish($1,$2,$3,0)", [id, owner, n]);
    await db.query("select public.ln_link_issue($1,$2,$3,'Test reader')", [
      id,
      owner,
      reader,
    ]);
    const result = (
      await db.query("select public.ln_link_read($1,$2) result", [id, reader])
    ).rows[0].result.content;
    assert.equal(result.entries[1].kind, "analysis");
    assert.equal(result.entries[1].properties.sampleCount, 2);
    assert.equal(result.entries[1].links.length, 1);
    assert.equal(result.entries[1].tasks[1].outcome, undefined);
    assert.equal(result.entries[4].board.cards.length, 2);
    assert.equal(result.entries[4].board.connections.length, 1);
    assert.ok(!JSON.stringify(result).includes("private"));
    assert.ok(!JSON.stringify(result).includes("excluded"));
    assert.ok(validateNotebook(result));
    await assert.rejects(
      db.query("select public.ln_research_metadata($1,$2)", [{}, []]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.ln_link_publish($1,$2,$3,1)", [id, reader, n]),
      /owner/,
    );
    n.entries[0].properties = { nested: { secret: "bad" } };
    await assert.rejects(
      db.query("select public.ln_link_publish($1,$2,$3,1)", [id, owner, n]),
      /Invalid property/,
    );
  } finally {
    await db.close();
  }
});
