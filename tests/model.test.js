import test from "node:test";
import assert from "node:assert/strict";
import {
  blankNotebook,
  exampleNotebook,
  paginate,
  parseCSV,
  parseSelection,
  numericTable,
  validateNotebook,
} from "../src/model.js";
import {
  handoff,
  matV4,
  exportBundle,
  exportSettings,
} from "../src/exports.js";
import { unzipSync, strFromU8 } from "fflate";

test("contents first, newest entries first, stable links survive insertion", () => {
  const n = exampleNotebook(),
    before = paginate(n.entries);
  const id = before[2].id;
  n.entries.push({ ...n.entries[0], id: "new", date: "2026-02-01" });
  const after = paginate(n.entries);
  assert.equal(after[0].kind, "contents");
  assert.equal(after[1].entry.id, "new");
  assert.ok(after.some((p) => p.id === id));
});
test("long text and CSV rows continue without data loss", () => {
  const e = exampleNotebook().entries[0];
  e.body = "abc ".repeat(3000);
  e.attachments = [
    {
      id: "t",
      name: "data.csv",
      kind: "table",
      table: {
        headers: ["a", "b"],
        rows: Array.from({ length: 31 }, (_, i) => [String(i), "x"]),
      },
    },
  ];
  const p = paginate([e]).slice(1);
  assert.ok(p.length > 3);
  assert.equal(
    p
      .flatMap((p) => p.blocks)
      .filter((b) => b.kind === "text")
      .map((b) => b.text)
      .join(""),
    e.body,
  );
  assert.equal(
    p
      .flatMap((p) => p.blocks)
      .filter((b) => b.kind === "table")
      .flatMap((b) => b.rows).length,
    31,
  );
});
test("quoted CSV, BOM, Unicode, scientific numeric columns, and ragged errors", () => {
  const table = parseCSV(
    '\uFEFFname,value,time\r\n"α, β",1e-3,0\r\ncontrol,,1',
  );
  assert.equal(table.rows[0][0], "α, β");
  const n = numericTable(table);
  assert.deepEqual(n.headers, ["value", "time"]);
  assert.equal(n.rows[0][0], 0.001);
  assert.ok(Number.isNaN(n.rows[1][0]));
  assert.throws(() => parseCSV("a,b\n1,2,3"));
});
test("page selection rejects malformed, reverse, and outside ranges", () => {
  assert.deepEqual(parseSelection("1, 3-5,3", 5), [1, 3, 4, 5]);
  for (const s of ["", "0", "6", "3-1", "a", "1.5"])
    assert.throws(() => parseSelection(s, 5));
});
test("restore rejects unsafe images and duplicate IDs, reparses CSV, preserves valid drafts only when requested", () => {
  const n = exampleNotebook();
  n.entries[0].attachments = [
    {
      id: "a",
      name: "a.svg",
      kind: "image",
      data: "data:image/svg+xml;base64,PHN2Zz4=",
    },
  ];
  assert.throws(() => validateNotebook(n));
  const d = exampleNotebook();
  d.entries.push({ ...d.entries[0] });
  assert.throws(() => validateNotebook(d));
  const b = blankNotebook();
  b.draft = { ...exampleNotebook().entries[0], title: "", project: "" };
  assert.ok(validateNotebook(structuredClone(b), true).draft);
  assert.equal(validateNotebook(b).draft, null);
});
test("handoff contains exact selected body blocks and a complete contents page", () => {
  const n = exampleNotebook(),
    p = paginate(n.entries);
  const contents = handoff(n, [p[0]]);
  assert.ok(contents.includes(n.entries[0].title));
  assert.ok(!contents.includes(n.entries[1].title));
  const t = handoff(n, [p[2]]);
  assert.ok(t.includes(n.entries[1].title));
  assert.ok(!t.includes(n.entries[0].body));
});
test("MAT v4 has valid little-endian header and column-major doubles", () => {
  const raw = matV4({
      x: [
        [1, 2],
        [3, 4],
      ],
    }),
    v = new DataView(raw.buffer);
  assert.equal(v.getInt32(4, true), 2);
  assert.equal(v.getInt32(8, true), 2);
  assert.equal(v.getFloat64(22, true), 1);
  assert.equal(v.getFloat64(30, true), 3);
  assert.equal(v.getFloat64(38, true), 2);
});
test("export ZIP includes real PDF, MAT data, portable figure scripts, and provenance", async () => {
  const n = exampleNotebook(),
    p = paginate(n.entries);
  const z = unzipSync(
    await exportBundle(n, [p[1]], p, ["pdf", "md", "mat", "python", "fig"]),
  );
  assert.ok(strFromU8(z["notebook.pdf"]).startsWith("%PDF-"));
  assert.ok(z["notebook.mat"].length > 50);
  assert.ok(strFromU8(z["create_matlab_figures.m"]).includes("savefig"));
  assert.ok(
    strFromU8(z["recreate_figures.py"]).includes("np.savez_compressed"),
  );
  assert.equal(JSON.parse(strFromU8(z["notebook.json"])).entries.length, 1);
  assert.ok(z["EXPORT_SCOPE.txt"]);
});

test("export appearance defaults to light, independent of the dark reader", async () => {
  assert.equal(exportSettings().theme, "light");
  assert.deepEqual(
    [exportSettings().figureWidthMm, exportSettings().figureHeightMm],
    [180, 90],
  );
  assert.equal(exportSettings({ figureWidthMm: 88 }).figureHeightMm, 70);
  for (const bad of [
    { theme: "auto" },
    { figureWidthMm: 183 },
    { figureWidthMm: 88, figureHeightMm: 131 },
    { figureHeightMm: 0 },
  ])
    assert.throws(() => exportSettings(bad));
  const n = exampleNotebook(),
    p = paginate(n.entries),
    before = JSON.stringify(n);
  const light = unzipSync(
    await exportBundle(n, [p[1]], p, ["pdf", "mat", "python"]),
  );
  const dark = unzipSync(
    await exportBundle(n, [p[1]], p, ["pdf", "mat", "python"], {
      theme: "dark",
      figureWidthMm: 88,
      figureHeightMm: 70,
    }),
  );
  assert.equal(
    JSON.parse(strFromU8(light["export-settings.json"])).theme,
    "light",
  );
  assert.equal(
    JSON.parse(strFromU8(dark["export-settings.json"])).theme,
    "dark",
  );
  assert.ok(light["fonts/LiberationSans-Regular.ttf"].length > 10000);
  assert.ok(light["fonts/LICENSE.txt"]);
  assert.deepEqual(
    JSON.parse(strFromU8(light["notebook.json"])).entries,
    JSON.parse(strFromU8(dark["notebook.json"])).entries,
  );
  assert.equal(JSON.stringify(n), before);
  assert.notDeepEqual(light["notebook.pdf"], dark["notebook.pdf"]);
});
