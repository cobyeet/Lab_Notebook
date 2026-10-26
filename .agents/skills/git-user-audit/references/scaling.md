# Scaling the audit for large, active repositories

These rules bound additional audit overhead; they do not narrow a full diff,
history examination or repository-wide audit that the user actually requested.
Keep safety checks for the concrete operation separate from background backlog
discovery. Cache reuse is an agent workflow rule, not an installed cache service.

## Discover candidates first

- At audit entry, the preliminary main check uses one exact live base-ref query
  in the active repository and a comparison only when needed. Reuse verified
  repository/default-branch metadata; resolve it once if unavailable. No fetch,
  full main history, CI query or all-contributor inventory is needed for a notice.
  Return only comparison metadata when using a hosting comparison; do not page
  through its commits/files merely to determine whether main has missing commits.
  Include this probe in the roughly ten-second background discovery budget below;
  if unavailable, disclose that once and continue unaffected local work.
- Resolve the acting account and repository once per task when still applicable;
  recheck when credentials/account context changes and before a remote mutation.
  Use supported Axi author/repository filters for the user's open PRs. Request
  only fields needed for branch association, state, head/base identity and activity.
  Avoid the all-contributor dashboard, repository-wide PR downloads and CI logs
  for routine branch auditing. Read current CLI help before choosing query flags.
- Combine that with one compact local ref/upstream inventory and previously
  confirmed associations. Inspect branch-exclusive history only for plausible
  own-work candidates whose attribution needs it, and only as far as necessary.
  Do not run full `log --all`, per-branch full-history scans or all-pairs branch
  comparisons. A commit author or a username-like ref remains supporting evidence,
  not proof of ownership.
- Remote branches without a PR or ownership mapping cannot always be attributed
  cheaply or reliably. Keep that coverage limitation explicit rather than scanning
  every contributor's history or asking the user to classify unrelated branches.
  A deeper discovery pass is appropriate when requested or when evidence points
  to specific missing user work; do not silently call the bounded pass exhaustive.
- By default, background own-branch discovery gets at most three result pages
  of up to 100 entries each per refresh and a roughly ten-second response budget.
  Stop sooner when complete. Retain any cursor in task context and mark partial
  coverage if a budget is reached; expand when requested or needed for a concrete
  target. This is a soft workflow budget, not a promise that a pending tool call
  can be interrupted. Do not launch an expensive query to satisfy a local diff.
- These discovery budgets never clear unexamined outgoing content or waive target
  checks. Spend the needed work on the actual commit/push/integration, with brief
  progress updates for a large outgoing change. Do not present a capped security
  scan as complete or a missing comparison as compatibility evidence.
- Honor rate limits and retry guidance. Do not repeatedly poll unchanged metadata;
  after a transient read failure, make at most one justified retry in this task
  before recording the limitation. Continue unaffected local work. An uncertain
  mutation requires result verification before any retry.

## Reuse exact evidence and invalidate narrowly

- Keep cache evidence in task context, or an already permitted local cache outside
  tracked files if necessary. Do not add a tracked audit ledger, store credentials
  or sensitive content, create scheduled jobs, install hooks or change Git config.
- Scope metadata by common repository identity, hosting account, host, remote
  destination and branch/PR identity. Record query time, head/base OIDs and coverage.
  Keep separate entries when a ref name exists in different forks/remotes.
- Cache the main probe for at most ten minutes with the verified integration
  repository/remote/base and query time. Key its comparison to the live base OID
  and active HEAD OID; changing HEAD invalidates only that comparison. Share the
  probe across linked worktrees, compare each active HEAD separately, and retain
  the last-notified base OID/recommendation per active branch to suppress repeats.
  Missing or failed remote evidence is not a current-main verdict. Refresh the
  live target for a requested pull/integration even within the cache window.
- The ten-minute own-branch inventory window is an upper bound. A change to the
  user's current head invalidates that branch's status/comparison, not every
  candidate. A change to an unrelated contributor branch does not restart the
  audit. A push-target/base change invalidates the relevant comparison and range.
  Reused branch names need new head/PR evidence; old merge/ownership conclusions
  do not automatically carry over.
- Key a staged-content check to the exact index snapshot and relevant parent,
  task scope and policy/scanner version. A working-file-only edit does not change
  the checked index; newly staged hunks do. Key outgoing scope to all proposed
  source/destination refs and OIDs plus the verified destination context.
- Deduplicate sensitive-content checks by blob OID plus scanner/policy version
  and context needed to classify the file. A cached negative verdict applies
  only to content/categories actually checked. Unscanned, partial or unavailable
  coverage never becomes a passing verdict through caching. Reassess path/type
  and provenance when the same bytes appear in a new context.
- Key compatibility evidence to affected interface changes, the intended producer
  and consumer revisions and relevant contract hashes. Recheck when those inputs
  change; wall-clock freshness alone is insufficient. Dirty sibling code is still
  not the dependency baseline.

## Keep expensive work proportional to the proposed change

- Use metadata/path summaries first, then the exact staged or outgoing changes.
  Reuse the local snapshot collected for an operation sequence while its inputs
  remain valid. Do not crawl ignored data/output directories or fully enumerate
  untracked directory contents merely to summarize repository health.
- For outgoing history, batch changed/new blob inspection across the relevant
  commits and deduplicate OIDs; do not rescan every complete tree at every commit.
  Include sensitive content introduced and later removed, and relevant merge
  history. Large/binary files still need type/size/provenance checks. Use a local
  streaming scanner if available instead of dumping large payloads into chat.
  Preserve any unscanned-content limitation and pause a materially unsafe write.
- Inspect only contracts touched by this change and their actual consumers.
  Reuse matching compatibility evidence; do not audit unrelated repositories'
  branches or run every test suite to approve a private implementation change.
- Immediately before a push or shared integration, re-read the relevant source
  and index state where applicable, recheck the acting account and live target,
  and verify the reviewed scope still matches the proposed update. If an external
  target moves, recompute only affected results. Stop on a real conflict or
  non-fast-forward condition; do not force-push or enter an endless retry loop.
  Where the requested workflow permits, push the reviewed immutable source OID
  to the explicit destination rather than resolving a moving local branch later.
  Use a supported expected-head guard for a requested hosted merge when available.
  Do not add force flags or claim a tool provides a guard it does not support.
  A preflight is not an atomic remote lock; heed the Git/server result and verify
  the resulting remote head before reporting success.
