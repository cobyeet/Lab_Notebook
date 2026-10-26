import { strToU8 } from "fflate";
import { wikiLinks, resolveTarget, selectedKnowledge } from "./knowledge.js";

const filename = (value) =>
  value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 100) || "attachment";
const display = (value) => String(value).replace(/[\]\n|]/g, " ");
const attachmentPath = (entry, a) =>
  `Attachments/${entry.id}/${filename(a.id)}-${filename(a.name)}`;
export function obsidianFiles(notebook, entries) {
  const files = {},
    ids = new Set(entries.map((e) => e.id));
  const convert = (value) => {
    let result = "",
      start = 0;
    for (const l of wikiLinks(value)) {
      result += String(value).slice(start, l.index);
      const target = resolveTarget(notebook.entries, l.target);
      result +=
        target && ids.has(target.id)
          ? `[[${target.id}|${display(l.text)}]]`
          : l.text;
      start = l.index + l.raw.length;
    }
    return result + String(value || "").slice(start);
  };
  const manifest = {
    schema: 1,
    title: notebook.title,
    entries: [],
    scope:
      "Selected complete parent entries. Referenced unselected entries are not included. The canonical notebook remains authoritative.",
  };
  for (const e of entries) {
    const metadata = selectedKnowledge(e, ids, entries);
    const props = {
      id: e.id,
      title: e.title,
      date: e.date,
      project: e.project,
      kind: e.kind || "entry",
      evidence: e.status,
      tags: (e.tags || [])
        .map((t) => {
          const tag = t.replace(/^#+/, "").trim().replace(/\s+/g, "-");
          return /^\d+$/.test(tag) ? "tag-" + tag : tag;
        })
        .filter(Boolean),
      notebook_tags: e.tags || [],
      aliases: e.aliases || [],
      created: e.created,
    };
    for (const [key, value] of Object.entries(e.properties || {}))
      props["research_" + key] = value;
    const lines = [
      "---",
      ...Object.entries(props).map(
        ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`,
      ),
      "---",
      "",
      `# ${e.title}`,
      "",
      convert(e.body),
      "",
    ];
    if (metadata.links?.length)
      lines.push(
        "## Relationships",
        "",
        ...metadata.links.map(
          (l) =>
            `- ${l.type}: [[${l.target}|${display(entries.find((e) => e.id === l.target).title)}]]${l.reason ? " — " + convert(l.reason) : ""}`,
        ),
        "",
      );
    if (e.next) lines.push("## Next steps", "", convert(e.next), "");
    if (metadata.tasks?.length)
      lines.push(
        "## Tracked next steps",
        "",
        ...metadata.tasks.map(
          (t) =>
            `- [${t.state === "open" ? " " : "x"}] ${convert(t.text)} (${t.state})${t.outcome ? ` → [[${t.outcome}|${display(entries.find((e) => e.id === t.outcome).title)}]]` : ""}${t.reason ? " — " + convert(t.reason) : ""}`,
        ),
        "",
      );
    if (e.sources)
      lines.push("## Sources and provenance", "", convert(e.sources), "");
    if (e.attachments.length) lines.push("## Original attachments", "");
    for (const a of e.attachments) {
      const path = attachmentPath(e, a);
      files[`Obsidian/${path}`] = Uint8Array.from(
        atob(a.data.split(",")[1]),
        (c) => c.charCodeAt(0),
      );
      lines.push(
        `${a.kind === "image" ? "!" : ""}[${a.name.replace(/[\]\n]/g, " ")}](../${path.split("/").map(encodeURIComponent).join("/")})`,
        a.sha256 ? `SHA-256: ${a.sha256}` : "",
        "",
      );
    }
    if (metadata.board) {
      const nodes = metadata.board.cards.map((c) => {
        const target = entries.find((e) => e.id === c.target),
          a = target.attachments.find((a) => a.id === c.attachment);
        return {
          id: c.id,
          type: "file",
          file: a ? attachmentPath(target, a) : `Pages/${c.target}.md`,
          x: c.x,
          y: c.y,
          width: 300,
          height: 220,
        };
      });
      files[`Obsidian/Boards/${e.id}.canvas`] = strToU8(
        JSON.stringify(
          {
            nodes,
            edges: metadata.board.connections.map((c) => ({
              id: c.id,
              fromNode: c.from,
              fromSide: "right",
              toNode: c.to,
              toSide: "left",
              label: c.label,
            })),
          },
          null,
          2,
        ),
      );
      lines.push(`[[Boards/${e.id}.canvas|Open planning canvas]]`, "");
    }
    files[`Obsidian/Pages/${e.id}.md`] = strToU8(lines.join("\n"));
    manifest.entries.push({
      id: e.id,
      ...metadata,
      attachments: e.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        path: attachmentPath(e, a),
        sha256: a.sha256 || null,
      })),
    });
  }
  files["Obsidian/notebook-manifest.json"] = strToU8(
    JSON.stringify(manifest, null, 2),
  );
  files["Obsidian/README.md"] = strToU8(
    `# ${notebook.title}\n\nOpen this folder as an Obsidian vault. Pages use stable entry IDs as filenames; readable link labels preserve their titles. YAML properties include project, evidence status, tags, aliases, and research properties. Original attachments are copied unchanged. Planning boards use the open JSON Canvas format.\n\nOnly selected complete parent entries are included. Links to unselected pages are rendered as text. Earlier revisions, drafts, bookmarks, and saved views are excluded. The notebook JSON remains the authoritative research record; edits here are not synchronized back automatically. See notebook-manifest.json for relationship metadata and original attachment checksums.\n`,
  );
  return files;
}
