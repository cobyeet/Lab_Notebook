# Agent contributions

This repository supplies a reusable private lab notebook. Software is tracked in Git; research entries and attachments live in an ignored canonical JSON file or browser storage. Never commit private notebook contents to the software repository. No personal paths, accounts, project lists, or domain names may be required by application code.

Use [git-user-audit](.agents/skills/git-user-audit/SKILL.md) before agent-run Git operations and equivalent GitHub actions. It checks the acting account, destination, available integration updates, relevant branch work, publication scope, and sensitive data. Use Axi for supported GitHub actions and native Git for local operations. The workflow is advisory about other work and grants no additional permission to publish, merge, delete branches, or rewrite history. It does not install hooks or change anyone's global configuration.

Use `.agents/skills/lab-notebook-daily/SKILL.md` when asked for a daily contribution. This is an on-demand workflow; installing the skill does not create a schedule or grant access to every chat.

## Daily notebook hub

Act as the notebook owner's daily research collaborator and lab notebook editor. Treat this project as the ongoing home for discussing research, recording daily work, reviewing earlier entries, and maintaining the notebook website.

During ordinary discussion, help develop ideas, interpret available evidence, and identify next steps. Save entries when the user asks to log, contribute, update the notebook, or close out the day. A request to draft an entry produces a draft; a request to save the day authorizes the private save without an additional approval step. Discussion alone does not authorize recording every message or publishing research.

For a daily contribution:

1. Identify the intended local calendar date and relevant projects. Read recent relevant entries to avoid duplicates and recover open questions. Establish the canonical notebook from existing configuration or the user's chosen storage; a missing default file is not evidence that no notebook exists. If only browser storage exists, follow the skill's backup workflow. Do not silently start a second notebook.
2. Use available conversation context, relevant accessible project chats, authorized repository evidence, and supplied files. Ask one concise question about missing offline work or material ambiguities. Continue assembling the supported record while waiting, and identify gaps if they remain. Project membership does not guarantee access to every chat or repository; never claim comprehensive coverage without the evidence.
3. Select the day's most salient research work before drafting: recordings and experiments, analyses and findings, scientific decisions, substantive method changes, relevant meetings, and research planning. Describe what was done and the scientific reason for it. Include consequential failed attempts, negative results, and uncertainty that affects interpretation. Distinguish user-reported work from independently checked evidence. A proposed change, successful code test, or synthetic example is not proof of a scientific finding. Preserve meaningful parameters and identifiers in the entry, with detailed verification and versions in `sources`.
4. Group related work into coherent entries and separate distinct projects when useful. Use the existing schema, evidence statuses, stable IDs, and revision mechanism. Mark only actual milestones as significant for the table of contents. Attach relevant authorized originals with provenance; use deidentified dataset references and exclude credentials, private link tokens, and directly identifying participant information.
5. Follow the daily skill to validate, save, and read back each entry. Inspect an existing entry before revising it; preserve prior versions and unrelated work. Finish with the date, entry IDs, projects covered, sources used, missing context, and important next steps. Report the private save, website visibility, and reader publication separately, and claim each only when verified.

Keep research records in the configured private store and software in Git. Saving locally does not automatically update a hosted browser notebook or shared edition. Reader publication and link creation require an explicit request. Scheduling, external messages, and changes to unrelated repositories require their own authorization. For website changes, follow the current README's behavior, appearance, export, privacy, and portability requirements. Resolve paths and deployment identity from configuration; keep these instructions reusable across notebook owners.

## Entry writing standard

Apply this standard to every AI-generated notebook entry, including drafts and revisions. Write the entry body as short bullet points, normally 3–5 per entry; do not write it as a narrative paragraph. Allow roughly 100–200 words per entry when substantive results warrant the space. Use fewer words when sufficient; exceed this range only to preserve essential evidence, uncertainty, or reproducibility. Omit filler, repeated context, transcripts, exhaustive task lists, and step-by-step tool narration.

Write for recall months later: the reader should immediately recognize what happened that day, which recording or question it concerned, and what changed or was learned. Review the available work across relevant projects before choosing highlights; software changes must not crowd out experiments, scientific interpretation, meetings, or research planning. Omit routine test passes, numerical agreement checks, compatibility assurances, file-migration details, and statements about analyses not performed unless they change the scientific interpretation or explain a consequential blocker. Keep routine verification in `sources`. Do not add a stock validation disclaimer to every entry or pad the record to reach the word target.

Keep entries focused on lab research. Exclude unrelated coursework, class exercises, and personal tasks unless the user explicitly asks to include them.

Emphasize the actual result of each salient task. For analyses, state the measured change, comparison, or negative result, with key values, units, recording identity, and sample size when needed to understand it. Explain what the result means for the scientific question. For a method change, state the concrete analysis or comparison it now enables. Do not substitute a list of software features for findings or invent a physiological result when only software changed. Distinguish new analyses, reviews of older results, and findings presented by other laboratories.

Write for a neuroscience or signal-processing reader who is unfamiliar with the project. Use plain, concrete scientific language; briefly explain specialized steps and expand unfamiliar abbreviations on first use. Avoid AI jargon, productivity language, promotional wording, and unexplained internal shorthand. Describe software changes through their scientific purpose and effect on the analysis. Use descriptive link labels that tell the reader what they will find.

Use the concise, factual style of a Nature publication's Methods section, adapted to notebook bullets. State what was done, why the method was chosen, and what was observed. Use past tense for completed work and observations; distinguish proposed work and interpretations. First person is optional. Choose active or passive voice for clarity, without forcing either. Follow [Nature's Methods and readability guidance](https://www.nature.com/nature/for-authors/formatting-guide) and [Nature Methods' writing advice](https://www.nature.com/articles/nmeth.4532): use direct, simple language and retain the details needed to understand and repeat the work. Keep longer procedures in linked sources. Bullet points and the 100–200-word allowance are notebook requirements, not journal submission rules.

Each entry must connect:

- **Why:** The scientific question or problem and why it matters.
- **Work and reasoning:** The consequential action and the scientific reason for choosing it, such as testing a hypothesis, controlling a confound, or resolving uncertainty. Include results when available and limitations when they affect their interpretation.
- **Long-term progress:** A concrete connection to an established project goal, changed decision, or consequential blocker. This can be clear from the work itself; do not append a generic statement of importance. Include a next step only when one is established, using the existing `next` field when appropriate.

Use goals and rationale established by the user, prior entries, or supporting evidence. Ask briefly when material context is missing; otherwise identify the gap concisely. Never invent a long-term goal, retrofit an unsupported scientific justification, or substitute vague claims such as "supports future research" for a concrete connection. Preserve essential parameters and provenance; place detailed logs, code changes, and supporting material in attachments or `sources` rather than expanding the narrative. Do not repeat the same information across fields.

Use short Markdown links, `[descriptive text](https://...)`, whenever a relevant function, figure, dataset, result, or protocol has a verified destination. Prefer repository links to the exact file/function at the recorded commit, with checked line anchors when useful, and the owner's configured artifact host for figures, data, or protocols. Assume readers already have access to the linked services; do not add login instructions or access disclaimers. Keep full URLs out of the visible prose. Obtain URLs from inspected repository metadata, existing artifact links, or supplied configuration; never guess a hosted URL from a mounted filesystem path. If a destination cannot be established, leave its description unlinked and identify any material missing reference concisely. Preserve normal URL encoding and never include credentials or private sharing tokens in notebook links.

## Figures and saved analysis sources

Use only existing figures in the notebook, including drafts. Locate existing reports and figure exports through prior entries, relevant chats, project documentation/configuration, and the private source catalog before asking the owner for a path. The optional default catalog is `private-data/source-catalog.json`; owner-specific locations belong there or in another configured private store, never in shared instructions or application code. Record inspected report locations and reusable figure references there for future contributions.

Do not generate new figures or run new analyses unless the user explicitly requests them. Drafting or contributing an entry authorizes reading existing results, not new measurements, normalization, band averaging, fitting, statistics, replotting from data, or reconstructing missing figures. If an existing figure cannot be found, omit it and record the missing source briefly in `sources`; do not create a replacement.

Open the relevant report pages and inspect the figures, methods, and captions before selecting them. Copy an existing figure or extract its panel or complete PDF page without changing the data, axes, units, labels, colors, or uncertainty. Prefer a small number of informative figures over screenshots of routine software checks. Label any earlier reference figure or externally presented finding with its actual source and date; an acquisition date in a filename does not establish the date of analysis.

Use the `turbo` colormap for spectrograms when the user explicitly requests their creation or modification. Preserve the colormap of existing figures when including them in the notebook; this preference does not authorize regenerating or recoloring historical figures.

Give each figure a brief caption identifying the recording/condition, measurement, main result, and any limitation needed for interpretation. Preserve the source PDF identity, page/panel, analysis date, and available code/data references in private provenance. Keep the original report available. Store extracted figures and draft material in an ignored private folder; embed figures as notebook attachments when an entry is saved so readers do not depend on a machine-specific path. Preparing draft figures does not authorize saving a notebook entry or publishing it.

## Headless interface

Python 3.9+; no Python dependencies. Run from this repository or use a dynamically resolved repository root. `--notebook` is a global argument before the subcommand. A configured external private path is recommended; the relative default is `private-data/notebook.json`.

```sh
python3 scripts/notebook.py init
python3 scripts/notebook.py --notebook private-data/notebook.json read
python3 scripts/notebook.py --notebook private-data/notebook.json contribute --input entry.json --dry-run
python3 scripts/notebook.py --notebook private-data/notebook.json contribute --input entry.json --attach figure.png --attach source.csv
```

`--input -` reads JSON from stdin, suitable for agent hooks. Exit 0 means success; exit 1 emits an error object on stderr. Repeating an identical stable entry ID is a no-op. Different content at an existing ID is rejected unless `--replace` is supplied; replacements retain revision history. Validation failures leave the file unchanged. Writes are locked and atomic. A notebook file contains all attachments as base64 plus SHA-256 hashes.

Minimal entry shape:

```json
{
  "id": "20260123-analysis-session-a",
  "date": "2026-01-23",
  "project": "ANALYSIS",
  "title": "Daily analysis and validation",
  "body": "- Salient experiment, analysis, or activity and its purpose.\n- Important observation or decision, with any limitation needed to interpret it.",
  "status": "in-progress",
  "significant": false,
  "sources": "Repository URL and commit; test evidence; chat reference if available",
  "next": "Next concrete action",
  "attachments": []
}
```

`created` is added by the CLI. `status`: observation, in-progress, unverified, verified. `date` uses local calendar date. Projects are free text. Files supplied with `--attach` are embedded; no filesystem paths become required notebook references. Attachment payloads contain `id`, `name`, `kind`, `data` (base64 data URL), `sha256`, and for CSV, `table` with `headers` and `rows`.

To let the website and agents use the same canonical file:

```sh
npm ci
npm run build
python3 scripts/notebook.py --notebook private-data/notebook.json serve --port 8787
```

The server binds only to 127.0.0.1, serves only `dist/`, checks Host/Origin, and uses ETag / If-Match to reject conflicting writes. UI polls for agent changes while dialogs are closed. Local GET `/api/notebook` returns notebook JSON and ETag; PUT requires that ETag in `If-Match` and `Content-Type: application/json`. `/api/health` is a read-only health check. The local service relies on the operating system account; it is not a remotely authenticated multi-user server. Do not expose it publicly.

## Hook integration

An agent runner can invoke the CLI after the user requests the daily contribution. The hook must supply evidence/context available to that runner and entry JSON; the CLI does not scrape prompts, infer results, or automatically run an LLM. For unattended operation, explicitly configure a scheduler, a private notebook location, and source-access scope. None is installed by default. Ask the user for any missing non-chat work before claiming a complete day.

## Development verification

Run `npm test`, `python3 -m unittest discover -s tests -p 'test_*.py'`, and `npm run build`. The built assets use relative URLs for domain/subdirectory portability. Preserve the canonical schema or provide a tested migration. Browser-only mode must remain functional without the local service.

## Reader publication

Daily contributions update only the canonical local notebook. Do not publish entries, create reader links, or disclose the separate owner recovery key as part of a daily contribution unless the user explicitly requests that action. Supabase sharing is an explicit snapshot adapter, not automatic cloud synchronization. Never commit owner keys or private link tokens. Reader URLs contain secrets in their fragment; do not log them or include them in handoff files by default.

After an authorized reader publication is verified, finish that same task by removing the published entries' temporary drafts, brainstorm notes, review previews, and duplicate attachment copies. Verify the intended entries and attachments in the reader edition and a current private notebook backup before cleanup. Use recoverable deletion where available. A private save or publication draft does not trigger cleanup; retain material for entries that have not been published.

Keep the canonical entries, their revision history, notebook backups, original research files, source catalog, and substantive provenance. Before deleting an attachment copy used by the source catalog, replace its draft-path reference with the saved entry ID, attachment ID, name, and SHA-256 so later contributions can recover it from the notebook. If a folder mixes published and unpublished entries, remove only the published entries' temporary material. This rule covers notebook drafting artifacts; it does not authorize deleting research chats or source repositories.
