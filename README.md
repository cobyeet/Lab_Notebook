# Lab Notebook

A private-first, portable lab notebook for the daily work behind research. A dark, sand-and-amber website for reading; a contribution workspace for writing; a headless interface for agents. No account names, personal paths, fixed project list, or domain-specific configuration is required.

## Make it yours

Download the repository source or clone your own fork, then open a terminal in that folder. Start with the local setup below for a notebook shared with agents. For a browser-only notebook, use `npm ci`, `npm run build`, and `npm run preview`; Python is only needed for the CLI and local file service. Open the printed address rather than opening `index.html` directly.

Each researcher starts with an empty notebook. No research entries, owner recovery keys, or deployment configuration are distributed with the source. Customize the name and author in **Settings**, then add your first entry in **Contribute**. Export a JSON backup after saving it and keep backups outside the software checkout. Explore, reading, writing, and exports work without a cloud account. GitHub and Axi are only needed for contributing software; Supabase is optional for private reader links.

Share a fork or the repository source with other researchers. Keep `private-data/`, downloaded notebook backups, owner recovery files, and your configured `public/notebook-config.json` private. A built `dist/` folder can include that deployment configuration; create a fresh build from your own configuration before hosting it. Shared hosting does not provide shared working storage: use explicit reader publication for a read-only edition.

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

- **Read:** A horizontal book starting on the left. Scroll right toward older work, use arrow controls, enter a page number, or jump from the contents. Dates use YYYYMMDD in the reader. The page controls stay visible; the sidebar scrolls independently to reach its lower tools.
- **Contents:** Always page 1; only entries marked as milestones appear. Columns are date, project, title, and first page. Routine entries remain in the book.
- **Contribute:** Add or edit dated entries, retain drafts, record evidence status, provenance, and next steps. Projects are free text. Settings customize the notebook identity.

Dated entries describe the work recorded on that date. Their labels are **Recorded**, **Unverified**, or **Verified**, not a task completion indicator. Put ongoing work in **Next steps** or tracked tasks so older entries do not need a later completion-label update. Legacy `in-progress` values remain readable and display as Recorded; the stored evidence and original revisions are preserved until an intentional edit.
- **Attachments:** Drop CSVs for paginated tables and images for previews. FIG, MAT, PDF, SVG, and NPZ are preserved as downloadable originals. SVG is deliberately retained as a file, not executed as page markup. Up to 20 MB per file, 100 attachments per entry. CSV previews support 20,000 rows / 100 columns.
- **Stable references:** Permanent links use entry IDs; changing page numbers do not break references. Links resolve within a notebook that actually contains the entry.
- **Clickable references:** Notes, sources, and next steps support `[descriptive text](https://...)` links to code, figures, data, and protocols. Labels stay concise in the reader and clickable in PDF exports; Markdown handoffs preserve the original destinations. Use verified GitHub commit/file links and configured Webdisk URLs. Existing reader access is assumed. Raw HTML, local filesystem links, and executable URL schemes are not interpreted.
- **Backups:** Download or restore a self-contained JSON backup including original attachments. Optional **Automatic backup** keeps encrypted private snapshots outside the browser. Restore replaces the current notebook after a review dialog. Back up first.

On small screens, the menu at the upper left contains settings and backup tools. Very long page content scrolls vertically within its paper; page turning remains horizontal.

### Preserve your notebook when updating the website

Website code and notebook records are stored separately. Keep the same address and browser profile, download a current JSON backup before an update, then reload the live site and download another backup. For a local file notebook, use copies of the canonical JSON before and after. Verify preservation with:

```sh
python3 scripts/notebook.py --notebook private-data/backups/after-update.json verify-preservation private-data/backups/before-update.json
```

The check reads both files without changing them. It validates original attachment checksums and requires all existing entry content, attachments, revisions, drafts, and notebook fields to remain unchanged. Newly added entries are allowed. Missing or changed records, invalid attachments, missing files, and an empty baseline fail with a nonzero exit status. Keep both files when investigating a mismatch; concurrent edits must not be overwritten with an older backup. Intentional schema migrations need a separate, verified preservation plan.

An empty notebook in a different browser or at a new address is a separate workspace. Use **Restore existing notebook** with the verified backup after protecting any work already in that workspace. An empty contents page can also mean that no entries are marked as milestones; **Read entries** and **Explore** still show the saved entries. Agent-run deployments must follow the [live-update preservation gate](AGENTS.md#preserve-the-notebook-during-live-software-updates).

## Explore research while reading

**Explore** sits alongside the chronological notebook and works in Read mode, including read-only reader editions. It has four views: **Map**, **Pages**, **Next steps**, and **Boards**. A page's **Connections** button opens its local map. Select a node or page to preview its contents, references, backlinks, and suggested connections; **Read page** returns to its dated notebook page. **Compare** opens two pages side by side. **Quick find** (`Cmd/Ctrl+K`) opens pages; type `>` for navigation commands. Internal links show a short preview on hover.

- **Map:** Explore the whole notebook or expand one to three connections around a page. Filter by project, date, type, evidence status, tag, recording ID, or relationship. Select a line to read its reason. Scroll to zoom and drag the background to pan; keyboard users can use the zoom buttons and node controls or the equivalent page list. Maps show at most 200 pages at once and disclose the total; refine filters for larger notebooks.
- **Scientific relationships:** Record references, reanalyses, protocol use, support, challenges, follow-ups, supersession, and resolved questions. Evidence connections use amber lines; references use blue-gray; optional shared context uses dashed lines. Shared tags or recording IDs never establish scientific support. Unlinked mentions and shared metadata appear as suggestions and become references only when explicitly added in Contribute mode.
- **Research pages:** Use persistent question, recording, method/protocol, or figure pages to collect evolving understanding and link dated work. Experiment, analysis, meeting, and literature templates provide concise prompts. Notes, sources, and next steps accept `[[entry-id|readable label]]`; typing `[[` in Notes offers a picker. New links use stable IDs. Unique titles and aliases also resolve; ambiguous or unavailable references remain plain marked text.
- **Properties and views:** Optional tags, aliases, and text/number/boolean properties live under **Connections & research details** in the editor. Use `recordingId`, `species`, `intervention`, `analysisMethod`, and `protocolVersion`, or your own property names. Bookmarks and named filter views are private notebook preferences and are included in backups.
- **Next steps:** Track open, completed, revised, and abandoned work with an optional outcome page and decision reason. Existing prose next steps remain available. Outcomes link back to the original work; changes retain entry revisions.
- **Boards:** Planning boards arrange references to existing pages and original figure attachments, with labeled connections. Read mode lets readers browse cards and inspect originals. In Contribute mode, create a Planning board page, use **Edit board** to add cards/connections, and drag card headers to arrange them. Board edits retain revisions; original pages and images are unchanged.
- **Obsidian export:** In Export, select **Obsidian vault** to download complete selected parent entries as Markdown with YAML properties, stable links, original attachments, checksums, and JSON Canvas planning boards. The export does not automatically include linked unselected pages. It excludes drafts, prior revisions, bookmarks, and saved views. Open the exported `Obsidian` folder as a vault; edits there do not synchronize back automatically.

These are optional additions to schema 1. Existing notebooks continue to work without conversion. The local CLI/API, browser storage, JSON backups, and restores preserve the same metadata. Agents can supply `kind`, `tags`, `aliases`, scalar `properties`, `links` (`id`, `target`, `type`, `reason`), and `tasks` (`id`, `text`, `state`, optional `outcome`, `reason`) on an entry. A `board` contains `cards` (`id`, `target`, optional `attachment`, `x`, `y`) and `connections` (`id`, `from`, `to`, `label`). Targets are stable entry IDs; cards and outcomes can only reveal pages present in the current notebook or edition.

For hosted reader editions, apply all migrations, including `20261026223159_research_connections.sql`, before publishing these fields. Publishing a selected page includes its research properties, relationships, tracked steps, and board layout; only links/cards to other explicitly selected pages survive. Figure cards also require the original attachment to be selected through **Include original attachments and data**. Workspace preferences and revision history stay private. Existing deployed editions remain unchanged until explicitly republished. No migration is required for local or browser-only notebooks.

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

## Branding and appearance

The reader uses a charcoal, amber, and sand palette inspired by a lab identity. Lab names remain configuration: copy `public/notebook-config.example.json` to the ignored `public/notebook-config.json` and edit its two text fields for a deployment. Notebook settings can override them per notebook. No personal filesystem paths or lab accounts are required. The small hourglass motif is a code-drawn decorative mark, not an extracted copy of any supplied poster.

The website stays dark. Every new Export dialog starts in **Light · publication default**, independently of the reader. **Dark · presentation** changes generated notebook PDFs and figure scripts. CSV/MAT/NPZ values and original attachments are theme-neutral and remain unchanged. The export package records appearance and physical figure dimensions in `export-settings.json`.

## Export matrix

The Export dialog accepts page numbers and ranges such as `1, 3-5` and downloads a ZIP.

| Selection | Delivered now | Requirements / limits |
| --- | --- | --- |
| Vector PDF | Searchable text, vector tables, original raster images | Embedded DejaVu Sans for common scientific Unicode. Extremely large tables may span PDF sheets. Notebook page labels remain attached. |
| Agent handoff | Selected page text/tables, entry IDs, provenance, next steps | Markdown; original attachment binaries are in source/data packages |
| Obsidian vault | Complete selected parent entries, YAML properties, links, original attachments, JSON Canvas boards | Selection-limited export; edits in Obsidian do not sync back automatically |
| MATLAB data | Genuine MATLAB v4 `.mat` with numerical CSV columns and JSON encoded as UTF-8 bytes | Includes instructions to recover full entry metadata; original attached MAT files preserved |
| MATLAB figures | Original FIG files unchanged, plus a `.m` reconstruction script | Run in MATLAB when you choose to generate genuine editable `.fig`, vector PDF, and 300 dpi PNG plots from numeric CSV. The website never starts MATLAB or requests a license. Rendered images cannot recreate original graphics objects. |
| Python figures/data | Original CSV and metadata plus `recreate_figures.py` / `requirements.txt` | Run the script with NumPy and Matplotlib to create SVG/PDF/PNG and NPZ. Outputs are grouped under `python_exports_light/` or `python_exports_dark/`. The website does not run Python. |
| Source archive | Complete parent entries, displayed-page mapping, and original attachments | Includes SHA-256 attachment provenance |

PDF and handoff exports use the selected displayed pages. Source/data/figure exports include the **whole parent entry**, including revision history and unselected continuation pages, to preserve context and source data. The dialog states this explicitly. Review packages before sharing.

Page grouping is deterministic and independent of viewport size; on narrow screens dense pages scroll inside their paper. Page numbers are a view, not immutable scientific identifiers. The first numeric CSV column is used as the plotting x-axis when more than one numeric column exists; a single numeric column is plotted against row index. Generated plots are conveniences and are not substitutes for original analysis figures.

### Publication figure preset

The supplied **NRJs-guide-to-preparing-final-artwork.pdf** defines the original-research profile used here: **88 mm single-column or 180 mm double-column width**, **5–7 pt sans-serif text**, RGB artwork, editable vector line art, and raster images at least 300 dpi at final size. The dialog offers these widths plus a figure height. Conservative maximum heights are 130 mm for single-column and 185 mm for double-column figures, matching the guide's longest-caption category. Other caption categories allow taller figures; this first preset stays within the conservative bounds.

Generated CSV plots use 6 pt ticks/legends, 7 pt axis labels/title, 0.6 pt axes, 0.8 pt traces, and a colorblind-friendly light palette. Python prefers installed Arial/Helvetica, bundles an open-source Liberation Sans fallback, embeds TrueType fonts in PDF, and preserves SVG text. MATLAB prefers installed Arial/Helvetica and records its selected font; its reconstruction script requires a separately available MATLAB session and is never executed by the website. The chosen line widths are implementation defaults, not quoted requirements from the supplied guide.

Vector output preserves physical page dimensions rather than cropping with tight bounding boxes. PNGs are rendered at 300 dpi from the generated vector plot. Each runtime writes a figure manifest with dimensions, theme, and font. These generated figure presets are separate from the readable A4 notebook PDF. Dark output is a presentation alternative.

Original files stay in the source package without recoloring, resampling, or automatic claims of journal compliance. Existing raster artwork, arbitrary attached FIGs, and figures with long labels still need source-level review. The software cannot recover editable data from a flattened image or guarantee every journal production requirement automatically. The poster and artwork guide themselves are not redistributed in the reusable repository.

## Static hosting and a future personal website

`npm run build` produces `dist/` with relative asset URLs. Serve that directory at a domain root or a subdirectory such as `/lab-notebook/`. No particular domain or hosting service is required. Notebook names and authors are data, not code.

A static deployment uses IndexedDB in that browser at that origin/path. Read and Contribute are interface modes. Browser storage relies on the device/browser account and is not application-encrypted. It does not share working storage with the local service or GitHub.

With your configured Supabase project and the `private_automatic_backups` migration, open **Automatic backup → Enable automatic backup** once. The complete notebook, including original attachment bytes, drafts, revisions, and preferences, is encrypted in the browser with AES-GCM before upload. The database stores ciphertext and a hash of a random 256-bit recovery token. Reader links cannot open these backups. Ten recent snapshots are retained; the full notebook JSON limit is 20 MB. Keep independent downloaded backups for longer retention.

**Keep the downloaded private backup recovery key outside the browser**, preferably in a password manager or backed-up folder. Clearing browser data removes the local copy of that key, too. In another browser, open **Automatic backup → Recover an existing private backup**, select the key file, then review and restore the snapshot. If the key remains in the browser but notebook storage is empty, a verified cloud snapshot is recovered automatically. Never send the backup key or reader-management owner key to a PI; share only a read-only reader link.

Changes queue after each local save while the site is open; online retries run every 30 seconds and when connectivity returns. The sidebar reports pending or failed uploads. Wait for **All changes backed up** before clearing browser data or closing a browser with pending work. An offline change cannot be backed up until the site reconnects. Another browser's newer snapshot blocks a stale upload instead of being overwritten; review or download both versions before resolving the difference. Private backups do not publish or update a reader edition.

The local service provides shared file persistence for agents and the browser. Do not expose the loopback service publicly. Private cloud backups support recovery, not automatic merging of concurrent edits across browsers.

## Private reader links

The optional Supabase adapter publishes explicitly selected snapshots. Readers open a revocable link without a ChatGPT account, email service, or sign-in. Each link sees the same selected edition and permits reading/exporting, never publishing or editing. Anyone holding a link can use it, so treat it as private. Create a separate labeled link for each person to revoke them independently.

1. Create your own Supabase project and apply the migrations in `supabase/migrations/` in filename order. The first migration provides an optional email-auth schema; the current website uses the separate capability-link adapter in the second migration. Email delivery is not required.
2. Add your API URL and **publishable** key to the ignored `public/notebook-config.json`, following the example below. Build and deploy normally. Never use a secret/service-role key in client files.
3. Open **Reader links → Set up reader links**. The browser generates a random owner key and downloads a recovery file. Keep it private; it controls publishing and revocation. It is separate from notebook-data backups.
4. Select saved entries, optionally include attachments, and click **Publish selected entries**. Nothing is selected initially. Drafts, earlier revisions, and unknown metadata are removed in both the client and database. Limit: 10 MB per shared edition. Publication replaces the previous shared snapshot, with an optimistic revision check.
5. Create a labeled reader link and send it to your reader. New local work remains private until you explicitly publish again. **Revoke** blocks subsequent reads; an open reader checks every 10 seconds and clears denied content. Copies someone already downloaded cannot be recalled.

```json
{
  "brandName": "Your lab",
  "brandSubtitle": "RESEARCH NOTEBOOK",
  "cloud": {
    "url": "https://YOUR-PROJECT.supabase.co",
    "publishableKey": "sb_publishable_YOUR_KEY"
  }
}
```

The reusable repository contains no project identity or credentials. Without cloud configuration the local notebook still works. Keep the configured public file in your deployment, outside software Git history if preferred. Changing hosting origins requires restoring the notebook backup and owner recovery file in the new browser storage location. Restoring an older owner-key backup still manages the same edition; old reader URLs are hashed on the server and cannot be recovered from the database, so issue a replacement link if its local copy was lost.

The database denies direct table access. Narrow functions check distinct random 256-bit owner and reader capabilities; only SHA-256 hashes are stored. Reader keys remain in the URL fragment, which is excluded from HTTP navigation requests, and travel only in HTTPS API request bodies. The reader route never loads or saves the local working notebook. Owner functions deliberately use `SECURITY DEFINER`, an empty search path, and explicit token checks; Supabase's [public function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) flags their intentional API execution grants. The [RLS without policies notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) reflects the deliberate denial of all direct table access. Tests verify permissions under actual PostgreSQL roles. Public creation of empty editions is available to adopters of this simple adapter; production deployments with broad traffic may add creation quotas or an authenticated owner bootstrap.

Shared entries and included attachments live in your Supabase project's PostgreSQL database, in the region you selected. This adapter embeds attachments with the edition; it does not use a public Storage bucket or commit research entries to GitHub. Your local canonical notebook and its backups remain independent.

## Development

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
```

The tests cover page ordering, stable links, exact selected text, CSV parsing, source export structure, MAT bytes, idempotency, revision history, concurrent writers, attachment checksums, HTTP conflicts, origin isolation, private snapshot filtering, reader denial of writes, wrong-key denial, and link revocation. PostgreSQL permission tests use an isolated PGlite database. API tests need permission to bind a temporary loopback port. GitHub Actions runs these checks and a production build on Linux and Windows. Dependencies are pinned in the manifest and lockfile; use `npm ci` for a reproducible installation.

### Software contributions and Git audit

The repository bundles the [Git user audit workflow](.agents/skills/git-user-audit/SKILL.md), its [scaling rules](.agents/skills/git-user-audit/references/scaling.md), and [write checks](.agents/skills/git-user-audit/references/write-checks.md). [AGENTS.md](AGENTS.md) routes compatible agents to it. Other agents can read the same instructions directly; no global skill installation is required.

The workflow checks the current account and destination, available integration updates, relevant own-branch work, exact staged/outgoing changes, private data, and affected notebook interfaces. It does not automatically pull, merge, delete branches, install hooks, or grant permission to publish. Supported GitHub actions use `npx -y gh-axi`; local status, diffs, commits, and pushes use native Git. Axi needs Node.js and an authenticated GitHub CLI (`gh auth login`), uses that existing login, and requires no global Axi installation. Start with `npx -y gh-axi --help`.

For a contribution, work on a branch in your fork, keep research data and credentials out of the change, run the checks above, and open a pull request explaining the behavior and validation. Changes to notebook fields must preserve schema-1 backups or include a tested migration across the browser, Python CLI/API, exports, and reader projection. Run `npm audit` when preparing a release. Never publish real research fixtures merely to demonstrate a passing test.

## Useful next additions

1. **More publishing controls:** Distinct editions per audience, optional expiry dates, and a preview of changes since the last publication. Current private links share one explicit edition; attachments are omitted by default.
2. **Remote storage and agent authentication:** A standard authenticated API, per-notebook scopes, device sync, and revocable agent credentials. Keep the local file adapter available.
3. **Evidence-aware daily inbox:** Stage suggested entries from authorized repository/chat sources, flag missing evidence, and ask for offline work before finalizing a day's record.
4. **Experiment and dataset links:** Deidentified experiment IDs, protocol versions, analysis commits, parameters, and original-data checksums; keep raw participant data in protected storage.
5. **Revision comparison and sign-off:** View amendments, freeze signed entries, and record authorship. Current revision retention is useful history, not a tamper-proof audit trail.
6. **Research overview:** Summaries of unresolved questions and changing interpretations, grounded in explicitly linked entries.
7. **Reproducibility bundles:** Pair each figure with the exact source table, environment specification, and analysis command; expose verification outcomes separately from the narrative.
8. **Annual volumes and full-text indexing:** Keep large notebooks responsive and preserve stable IDs across volumes.

## License

Application code: MIT. Bundled DejaVu and Liberation fonts retain their separate licenses in `public/fonts/LICENSE.txt` and `public/fonts/LICENSE-LIBERATION.txt`. Other dependencies retain their upstream licenses.
