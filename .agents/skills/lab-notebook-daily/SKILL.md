---
name: lab-notebook-daily
description: Contribute a daily lab notebook entry from available chat context, repository evidence, and user-supplied offline work when asked to update a lab notebook. Supports the portable Lab Notebook CLI and backup-import workflow.
---

Create a faithful daily record in this repository's notebook. Read [the agent interface](../../../AGENTS.md) for commands and schema. Resolve the repository and notebook file from the current workspace, configuration, or the user; never assume a person's home directory, account name, or machine layout.

Collect the day's relevant conversation context, available explicitly authorized chat summaries, repository changes, tests, figures, and offline work supplied by the user. Use the user's local date; ask if a cross-midnight session makes the intended notebook date unclear. You cannot retrieve an entire ChatGPT history unless an available integration provides it. Say which sources were unavailable. Do not claim comprehensive coverage from a single chat.

Keep completed work, observations, interpretation, validation limits, and next steps distinguishable in the entry body. Record repository URLs/commit IDs, artifact identifiers, and test evidence in `sources`. A code change or synthetic test alone is not a verified scientific finding. Do not invent outcomes, infer physiological results from a figure title, or mark verification from an incomplete test. Prefer `unverified`, `observation`, or `in-progress` when evidence is limited. Mark `significant` only for actual milestones such as new repositories, architectural changes, or substantiated major findings.

Combine small related tasks; separate distinct projects when useful. Choose stable entry IDs such as `YYYYMMDD-project-session-key` so retries are idempotent. Existing IDs with different content require an intentional revision with `--replace`; inspect the existing entry first. Avoid embedding raw sensitive subject data, credentials, or local absolute paths. Reference protected data by deidentified dataset ID. Attach only relevant authorized files; originals are preserved.

When the user asks to contribute at the end of the day, that authorizes saving the entry to the configured private notebook. Validate with `contribute --dry-run`, then save with `contribute`. Inspect the saved entry via `read` and report its ID, projects covered, sources considered, and any gaps. No extra conversational approval is required for that authorized private save. Hook invocations alone do not authorize publication, Git pushes, messages, broad chat-history access, or changes to unrelated repositories.

If the agent cannot access the canonical file or local service, produce the entry JSON using the same schema and explain how to import it through the CLI. Do not claim the website was updated. If only a browser-storage notebook exists, work from a user-provided backup, use `--notebook` to update that copy, and return the validated updated backup for explicit restore. Do not create a competing canonical notebook silently.
