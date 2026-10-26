# Agent contributions

This repository supplies a reusable private lab notebook. Software is tracked in Git; research entries and attachments live in an ignored canonical JSON file or browser storage. Never commit private notebook contents to the software repository. No personal paths, accounts, project lists, or domain names may be required by application code.

Use `.agents/skills/lab-notebook-daily/SKILL.md` when asked for a daily contribution. This is an on-demand workflow; installing the skill does not create a schedule or grant access to every chat.

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
  "body": "Objective\n...\n\nWork completed\n...\n\nObservations\n...\n\nValidation limits\n...",
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
