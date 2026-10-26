import Papa from "papaparse";
export const SCHEMA = 1;
export const blankNotebook = () => ({
  schema: SCHEMA,
  title: "Lab Notebook",
  subtitle: "An ongoing record of research",
  author: "",
  entries: [],
  draft: null,
});
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function parseCSV(text) {
  const result = Papa.parse(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length) throw new Error(`CSV: ${result.errors[0].message}`);
  if (result.data.length < 2 || !result.data[0].length)
    throw new Error("CSV needs a header row and at least one data row.");
  const [headers, ...rows] = result.data;
  if (rows.some((row) => row.length !== headers.length))
    throw new Error(
      "CSV rows must have the same number of cells as the header.",
    );
  if (headers.length > 100 || rows.length > 20000)
    throw new Error(
      "Preview supports up to 100 columns and 20,000 rows. Attach larger datasets as .mat or .npz.",
    );
  return { headers, rows };
}
export function numericTable(table) {
  const indexes = table.headers
    .map((_, i) => i)
    .filter(
      (i) =>
        table.rows.some((r) => r[i].trim() !== "") &&
        table.rows.every(
          (r) => r[i].trim() === "" || Number.isFinite(Number(r[i])),
        ),
    );
  return {
    headers: indexes.map((i) => table.headers[i]),
    rows: table.rows.map((row) =>
      indexes.map((i) => (row[i].trim() === "" ? NaN : Number(row[i]))),
    ),
  };
}
export function sortedEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.created.localeCompare(a.created) ||
      a.id.localeCompare(b.id),
  );
}
// Page numbers are a view; permanent links use stable entry IDs and segment numbers.
export function paginate(entries) {
  const pages = [{ kind: "contents", number: 1, id: "contents" }];
  for (const entry of sortedEntries(entries)) {
    const text = entry.body || "";
    const blocks = [];
    for (const paragraph of text.split(/\n\s*\n/)) {
      for (let i = 0; i < paragraph.length; i += 1100)
        blocks.push({ kind: "text", text: paragraph.slice(i, i + 1100) });
    }
    for (const attachment of entry.attachments) {
      if (attachment.kind === "table") {
        for (let i = 0; i < attachment.table.rows.length; i += 12)
          blocks.push({
            kind: "table",
            attachment,
            rows: attachment.table.rows.slice(i, i + 12),
            offset: i,
          });
      } else blocks.push({ kind: "attachment", attachment });
    }
    let segment = 0,
      page,
      weight = 0;
    const addPage = () => {
      page = {
        kind: "entry",
        entry,
        blocks: [],
        number: pages.length + 1,
        id: `${entry.id}:${segment++}`,
        continuation: segment > 1,
      };
      pages.push(page);
      weight = 0;
    };
    addPage();
    for (const block of blocks) {
      const w = block.kind === "text" ? block.text.length : 700;
      if (weight + w > 1850 && page.blocks.length) addPage();
      page.blocks.push(block);
      weight += w;
    }
  }
  return pages;
}
export function parseSelection(value, total) {
  if (!value.trim()) throw new Error("Enter page numbers or a range.");
  const selected = new Set();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use pages such as 1, 3-5.");
    const first = Number(match[1]),
      last = Number(match[2] || match[1]);
    if (first < 1 || last > total || last < first)
      throw new Error(`Choose pages between 1 and ${total}.`);
    for (let n = first; n <= last; n++) selected.add(n);
  }
  return [...selected].sort((a, b) => a - b);
}
function string(value, max, label) {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`Invalid ${label}.`);
  return value;
}
export function validateNotebook(value, preserveDraft = false) {
  if (
    !value ||
    value.schema !== SCHEMA ||
    !Array.isArray(value.entries) ||
    value.entries.length > 10000
  )
    throw new Error("Unsupported notebook backup.");
  string(value.title, 200, "title");
  string(value.subtitle ?? "", 500, "subtitle");
  string(value.author ?? "", 200, "author");
  const ids = new Set();
  for (const e of value.entries) {
    string(e.id, 100, "entry ID");
    if (!/^[a-zA-Z0-9_-]+$/.test(e.id) || ids.has(e.id))
      throw new Error("Duplicate or invalid entry ID.");
    ids.add(e.id);
    string(e.date, 10, "date");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      new Date(e.date + "T12:00:00Z").toISOString().slice(0, 10) !== e.date
    )
      throw new Error("Invalid entry date.");
    string(e.title, 300, "entry title");
    string(e.project, 100, "project");
    string(e.body, 1000000, "entry text");
    string(e.created, 100, "creation time");
    if (
      !["observation", "in-progress", "verified", "unverified"].includes(
        e.status,
      )
    )
      throw new Error("Invalid evidence status.");
    if (
      typeof e.significant !== "boolean" ||
      !Array.isArray(e.attachments) ||
      e.attachments.length > 100
    )
      throw new Error("Invalid entry metadata.");
    string(e.sources ?? "", 20000, "sources");
    string(e.next ?? "", 20000, "next steps");
    for (const a of e.attachments) {
      string(a.id, 100, "attachment ID");
      string(a.name, 250, "filename");
      string(a.data, 30000000, "attachment data");
      if (
        !["image", "table", "file"].includes(a.kind) ||
        !/^data:[a-zA-Z0-9.+/-]*;base64,[A-Za-z0-9+/=]*$/.test(a.data)
      )
        throw new Error("Invalid attachment.");
      if (
        a.kind === "image" &&
        !/^data:image\/(png|jpeg|webp|gif);base64,/.test(a.data)
      )
        throw new Error("Unsupported image.");
      if (a.kind === "table")
        a.table = parseCSV(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Uint8Array.from(atob(a.data.split(",")[1]), (c) => c.charCodeAt(0)),
          ),
        );
    }
  }
  // A restored backup cannot inject a second unvalidated draft.
  if (preserveDraft && value.draft) {
    const d = value.draft;
    validateNotebook({
      ...value,
      entries: [
        { ...d, title: d.title || "Draft", project: d.project || "Unassigned" },
      ],
      draft: null,
    });
  } else value.draft = null;
  return value;
}
export function exampleNotebook() {
  const n = blankNotebook();
  n.entries = [
    {
      id: "example-analysis",
      date: "2026-01-23",
      created: "2026-01-23T17:00:00Z",
      project: "ANALYSIS",
      title: "From an observation to a reproducible result",
      status: "in-progress",
      significant: true,
      body: "EXAMPLE NOTEBOOK · Illustrative content, not a record of completed research.\n\nQuestion\nDoes the updated analysis preserve the distinction between individual observations and independent experimental units?\n\nWork completed\nCompared the new output against the reference implementation. Recorded the analysis settings and kept the original inputs unchanged.\n\nInterpretation\nThe initial checks look consistent. A complete dataset rerun is still needed before treating this as a verified finding.",
      sources:
        "Add a repository URL, commit ID, dataset identifier, or experiment protocol here.",
      next: "Run the full validation dataset. Attach the resulting figure and source data.",
      attachments: [],
    },
    {
      id: "example-method",
      date: "2026-01-22",
      created: "2026-01-22T17:00:00Z",
      project: "METHODS",
      title: "A clearer record of the daily experiment",
      status: "observation",
      significant: false,
      body: "EXAMPLE NOTEBOOK\n\nCapture the question, what you did, what happened, and what comes next. Small observations belong here even when they do not appear in the contents.\n\nDrop a CSV into a new entry to turn it into a readable table. Keep the original MATLAB figure or numerical data beside its visual preview.",
      sources: "",
      next: "",
      attachments: [],
    },
    {
      id: "example-milestone",
      date: "2026-01-21",
      created: "2026-01-21T17:00:00Z",
      project: "INFRASTRUCTURE",
      title: "A portable home for the work",
      status: "observation",
      significant: true,
      body: "EXAMPLE NOTEBOOK\n\nMilestone\nEstablished a notebook that can travel with the research. Entries have permanent identifiers, while page numbers update as new work is added.\n\nOnly significant work belongs in the table of contents. Every daily entry remains readable in the book.",
      sources: "",
      next: "",
      attachments: [],
    },
  ];
  return n;
}
