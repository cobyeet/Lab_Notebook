# Checks for committing, publishing and integrating

Use the exact content the requested operation would record or expose. These
checks do not authorize staging, committing, pushing or changing another repo.
Apply the ownership/relevance filter from [the skill](../SKILL.md) throughout.
Use the [scaling rules](scaling.md) to reuse exact-input evidence and deduplicate
work. Scope/budget limits never authorize publishing content not actually checked.

## Commit scope

- Establish the task's intended files/hunks and existing index state before
  staging. Preserve pre-existing staged and unstaged work, including collaborator
  edits in a shared checkout. Do not stage everything merely for convenience.
- Before committing/amending, inspect the index snapshot and staged diff, not
  just the working-tree files. Check additions, deletions, renames, binary files,
  executable/symlink changes, submodule refs and Git LFS pointers when present.
  Check partially staged files at the hunk level and run the applicable diff
  whitespace check. Stage only authorized paths/hunks; do not automatically
  unstage someone else's work to make the index look clean.
- Compare the staged content with the actual task. Resolve accidental unrelated
  hunks before committing; ask only about specific consequential ambiguity that
  cannot be resolved from the request. Do not seek a blanket approval after the
  user already authorized the commit and its scope is clear.
- Before pushing, resolve the exact source ref(s), destination repository/ref(s)
  and proposed updates, including tags or multiple refs if requested. Inspect
  all outgoing commits and the aggregate change, not only the latest commit or
  the current working tree. Identify unintended WIP or unrelated unpublished
  commits that this push would include. Never silently push extra refs.
- Compare the branch's work with its actual intended base and existing remote
  target. Commits already published at the destination or inherited from an
  agreed base are not accidental scope solely because another researcher
  authored them. Unexpected newly included changes need content/scope review;
  their author's identity alone is not a blocker.
- When the intended update cannot be established from local objects, query
  read-only hosting comparisons or mark the limitation. Do not guess an empty
  outgoing range or rewrite/split commits automatically to resolve uncertainty.

## Sensitive data and generated artifacts

- Before committing, inspect staged file paths, relevant staged content and
  blobs. Before pushing, inspect commits/blobs newly published to the destination
  across every proposed ref, including earlier outgoing commits where a sensitive
  value was later removed. A clean final diff does not clear outgoing history.
- Bound publication checks using verified destination refs/reachability. Do not
  rescan unrelated researchers' branches or old history already present at the
  destination merely because it is reachable from the integration base. For a
  new branch, use known destination history rather than assuming all ancestors
  are new. If destination reachability cannot be verified, use conservative
  candidate coverage and disclose it; resolve a material safety gap before push.
- Check for credentials/private keys, token-bearing URLs, secret configuration,
  participant identifiers and linkage tables, identifiable clinical exports,
  raw/processed recordings, sorter/case outputs, local paths/configuration that
  expose restricted information, and unintended large generated artifacts.
  Check applicable repository policies and ignore/LFS rules; ignored files can
  still be tracked/staged and LFS does not make restricted data acceptable.
- Use a configured local secret scanner when available and targeted inspection
  for domain data that a token scanner would miss. Inspect binary type/size and
  provenance as appropriate; do not decode an entire recording to review Git.
  If a scanner or content is unavailable, report the actual coverage without
  claiming the data was comprehensively scanned. Do not upload candidate content
  to external scanning services or install/configure new services automatically.
- Verify likely false positives using context: public examples, clearly synthetic
  fixtures and documented allowed artifacts are not secrets or patient records
  merely because of a filename extension or date-like string. Do not approve
  real data solely because it is under `tests/` or the repository is private.
- Report a finding by safe file location and category with values redacted; even
  a filename may need redaction. Never quote credentials or participant details
  into chat, logs, commit messages or PRs. Pause the affected commit/push for
  confirmed or high-confidence restricted content and explain the narrow remedy.
  Preserve originals; do not delete data, edit ignore rules, bypass scanners,
  rotate credentials or rewrite published history as an automatic audit fix.

## Cross-repository compatibility

Start with the actual staged change or outgoing commit range. Read relevant
governing source/contracts only when this change crosses a public boundary.
Documentation/skill-only edits and private implementation details normally need
no sibling-code audit; record that no shared runtime contract changed.

When deploying notebook software, also complete the live-update preservation
gate in the repository AGENTS.md. Keep validated private before/after backups,
run `verify-preservation`, and inspect the real live reader after reload. A
successful Git push, build, or Site deployment does not verify notebook data.
Never stage the private backups or use an empty browser store as the baseline
for a notebook known to contain records.

| Contract owner | Boundary to check when changed | Relevant consumers |
|---|---|---|
| Notebook model | Schema version, entry IDs, fields, limits, drafts, revisions, attachment bytes and checksums | Browser storage/restore, Python CLI/API, exports, agents |
| Local service | Routes, ETag / If-Match, validation, loopback/Host/Origin checks, static-root isolation | Browser workspace and authorized agent runners |
| Reader projection | Selected-entry allowlist, attachment selection, relationship filtering, capability checks, SQL migrations | Client publication, hosted reader editions, exports |
| Export formats | Selected pages versus parent entries, original attachments, stable links, provenance, format versions | PDF/Markdown readers, Obsidian, MATLAB/Python consumers |

For another repository, identify its actual contracts and consumers instead of
assuming the notebook interfaces apply. No owner-specific paths, accounts, or
sibling checkouts are prerequisites for this workflow.

- Trace actual affected producers and consumers; repository proximity or the
  general dependency graph alone does not establish a breaking change. Read
  existing AGENTS and the relevant canonical contract rather than duplicating a
  schema or assuming every latest checkout uses the same version.
- Compare against the dependency/base revision intended for this branch or its
  deployment, using saved provenance, manifests, source locks or documented
  requirements. Prefer committed revision evidence when available. A dirty
  sibling checkout or another researcher's unfinished feature branch is not the
  compatibility baseline. Do not audit its branch health or request its merge.
- Check changed public signatures, required fields, feature names/order, schema
  versions, analysis-key defaults, array shapes, units, clocks, masks and
  serialization semantics as relevant. For an additive change, check whether
  consumers tolerate extra fields instead of assuming it is automatically safe.
- Use focused existing tests or synthetic fixtures when needed. Distinguish
  source review from executed compatibility tests. Do not run clinical-data
  pipelines, migrate/rewrite cases, rerun frozen analyses, edit sibling repos or
  refresh reviewed hashes just to obtain a passing result.
- Classify the result as compatible, coordinated dependency change required,
  demonstrated breaking change, or unknown with the exact missing evidence.
  Name only affected interfaces/repos, the evidence/revision checked, and any
  needed paired change or deployment order. Keep unrelated researcher work quiet.
- A known breaking change requires resolution or a concrete coordinated plan
  before shared/default/release integration. Committing or pushing authorized
  WIP to the user's feature branch can proceed with the material finding stated
  when that branch does not itself deploy/release to the affected consumers;
  it is not a compatibility endorsement. Check actual branch automation when
  relevant. Unknown compatibility alone does not block unrelated local work.
- Do not fix cross-repository findings by automatically merging, deleting,
  switching or rewriting any branch. A recommendation does not authorize the
  associated code, data, release or Git changes.
