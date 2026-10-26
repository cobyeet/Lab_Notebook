# Lab Notebook

A private-first, portable lab notebook for the daily work behind research. A website for reading; a contribution workspace for writing; a headless interface for agents. No account names, personal paths, fixed project list, or domain-specific configuration is required.

## Start a notebook shared with agents

Requirements: Node.js 22.12+ and Python 3.9+.

```sh
npm ci
npm run build
python3 scripts/notebook.py serve
```

Open the local address printed by the server. The default canonical notebook is `./private-data/notebook.json`, outside the public web root and ignored by Git. For another location:

```sh
python3 scripts/notebook.py --notebook ../notebook-data/notebook.json serve --port 8787
```

The example path above is user configuration, never an application assumption. The service binds only to loopback and is intended for a trusted OS account. It is not a public multi-user service.

## Read and contribute

- **Read:** A horizontal book starting on the right. Scroll left toward older work, use arrow controls, enter a page number, or jump from the contents. Dates use YYYYMMDD in the reader.
- **Contents:** Always page 1; only entries marked as milestones appear. Columns are date, project, title, and first page. Routine entries remain in the book.
- **Contribute:** Add or edit dated entries, retain drafts, record evidence status, provenance, and next steps. Projects are free text. Settings customize the notebook identity.
- **Attachments:** Drop CSVs for paginated tables and images for previews. FIG, MAT, PDF, SVG, and NPZ are preserved as downloadable originals. SVG is deliberately retained as a file, not executed as page markup. Up to 20 MB per file, 100 attachments per entry. CSV previews support 20,000 rows / 100 columns.
- **Stable references:** Permanent links use entry IDs; changing page numbers do not break references. Links resolve within a notebook that actually contains the entry.
- **Backups:** Download or restore a self-contained JSON backup including original attachments. Restore replaces the current notebook after a review dialog. Back up first.

On small screens, the menu at the upper left contains settings and backup tools. Very long page content scrolls vertically within its paper; page turning remains horizontal.

## Daily agent contributions

The repository includes [a daily contribution skill](.agents/skills/lab-notebook-daily/SKILL.md) and [the headless contract](AGENTS.md). Agents working in this repository can discover the skill. Other compatible agents can load its instructions or install the skill with the accompanying repository contract. It is packaged here, not silently installed into a person's global configuration.

At day's end, ask:

> Contribute today's work to my lab notebook using our available conversation context and repository evidence. Include this work I did outside chat: [notes]. Distinguish completed work from provisional observations and include next steps.

The skill prepares a grounded entry, validates it, saves it to the configured private notebook, and verifies the saved ID. It does not have implicit access to other chats, infer all of a person's activity, or authorize publication.

For headless runners and hooks:

```sh
python3 scripts/notebook.py --notebook private-data/notebook.json contribute --input daily-entry.json --dry-run
python3 scripts/notebook.py --notebook private-data/notebook.json contribute --input daily-entry.json --attach figure.png --attach results.csv
```

JSON on stdin is supported with `--input -`. Stable IDs prevent duplicate retries. Revisions require `--replace` and preserve previous versions. The UI checks the local canonical file every 10 seconds when no dialog is open. Atomic writes, locks, and conditional HTTP writes protect against simultaneous edits. A runner invokes this interface; no scheduler or access to private chat history is installed automatically.

## Export matrix

The Export dialog accepts page numbers and ranges such as `1, 3-5` and downloads a ZIP.

| Selection | Delivered now | Requirements / limits |
| --- | --- | --- |
| Vector PDF | Searchable text, vector tables, original raster images | Embedded DejaVu Sans for common scientific Unicode. Extremely large tables may span PDF sheets. Notebook page labels remain attached. |
| Agent handoff | Selected page text/tables, entry IDs, provenance, next steps | Markdown; original attachment binaries are in source/data packages |
| MATLAB data | Genuine MATLAB v4 `.mat` with numerical CSV columns and JSON encoded as UTF-8 bytes | Includes instructions to recover full entry metadata; original attached MAT files preserved |
| MATLAB figures | Original FIG files unchanged, plus a `.m` reconstruction script | Run in MATLAB to generate genuine editable `.fig` and vector PDF plots from numeric CSV. Rendered images cannot recreate original graphics objects. |
| Python figures/data | Original CSV and metadata plus `recreate_figures.py` / `requirements.txt` | Run the script with NumPy and Matplotlib to create SVG/PDF/PNG and NPZ. The website does not run Python. |
| Source archive | Complete parent entries, displayed-page mapping, and original attachments | Includes SHA-256 attachment provenance |

PDF and handoff exports use the selected displayed pages. Source/data/figure exports include the **whole parent entry**, including revision history and unselected continuation pages, to preserve context and source data. The dialog states this explicitly. Review packages before sharing.

Page grouping is deterministic and independent of viewport size; on narrow screens dense pages scroll inside their paper. Page numbers are a view, not immutable scientific identifiers. The first numeric CSV column is used as the plotting x-axis when more than one numeric column exists; a single numeric column is plotted against row index. Generated plots are conveniences and are not substitutes for original analysis figures.

## Static hosting and a future personal website

`npm run build` produces `dist/` with relative asset URLs. Serve that directory at a domain root or a subdirectory such as `/lab-notebook/`. No particular domain or hosting service is required. Notebook names and authors are data, not code.

A static deployment uses IndexedDB in that browser at that origin/path; it does **not** share storage with the local service, another device, or GitHub. Export a JSON backup and restore it to move data. Read and Contribute are UI modes, not authentication roles. Use a private hosting access gate for private site access. Browser storage relies on the device/browser account and is not application-encrypted. Clearing website data can remove it: keep backups.

The local service provides actual shared file persistence for agents and the browser. Remote agent writes require a future authenticated storage adapter; do not publish the loopback service or place the notebook JSON into public static assets. Selective public publishing, remote authenticated writes, and multi-user collaboration are roadmap features rather than present capabilities.

## Development

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
```

The tests cover page ordering, stable links, exact selected text, CSV parsing, source export structure, MAT bytes, idempotency, revision history, concurrent writers, attachment checksums, HTTP conflicts, and origin isolation. API tests need permission to bind a temporary loopback port.

## Useful next additions

1. **Private review → selected public edition:** A separate publish command with a complete preview and explicit allowlist; default publication excludes attachments until individually selected.
2. **Remote storage and agent authentication:** A standard authenticated API, per-notebook scopes, device sync, and revocable agent credentials. Keep the local file adapter available.
3. **Evidence-aware daily inbox:** Stage suggested entries from authorized repository/chat sources, flag missing evidence, and ask for offline work before finalizing a day's record.
4. **Experiment and dataset links:** Deidentified experiment IDs, protocol versions, analysis commits, parameters, and original-data checksums; keep raw participant data in protected storage.
5. **Revision comparison and sign-off:** View amendments, freeze signed entries, and record authorship. Current revision retention is useful history, not a tamper-proof audit trail.
6. **Tasks that carry forward:** Link next steps to later entries and maintain open questions without cluttering the contents.
7. **Reproducibility bundles:** Pair each figure with the exact source table, environment specification, and analysis command; expose verification outcomes separately from the narrative.
8. **Annual volumes and full-text indexing:** Keep large notebooks responsive and preserve stable IDs across volumes.

## License

Application code: MIT. Bundled DejaVu font retains its separate license in `public/fonts/LICENSE.txt`. Other dependencies retain their upstream licenses.
