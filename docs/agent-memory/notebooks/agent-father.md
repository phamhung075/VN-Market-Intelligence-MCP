# Agent Father — Notebook

## Fix (router-direct manual dispatch, P0) 2026-08-05T18:56:00Z FIX-OPS-DEPLOY-SELFREPORT-FABRICATED-FUTURE-TIMESTAMP-NONEXISTENT-IMAGE
- **Root cause (AC-1):** `docs/agents/ops/flow/docker.md` § Post-Rebuild Health
  Verification only checked `docker compose ps` `Up` + `/health`==200 — cannot
  distinguish a real redeploy from a stale no-op swap (a container already
  Up/healthy before dispatch stays Up/green if `up -d --no-deps <svc>` silently
  no-ops). Separately, `docs/protocols/docker-deployment-runbook.md`'s
  `scripts/verify-deploy-sha.sh` Close-Gate already exists and is the
  authoritative check for exactly this class of deploy — but grepped ops's own
  `init.md`/`main.md`/`docker.md` and confirmed zero references to it; that
  gate is wired only for the PO/developer sprint-completion path
  (`po/sprint-signoff.md`, `developer/microservice-main.md`), never for a
  directly-dispatched ops deploy task. Narration-without-evidence was
  structurally easier than an honest partial-failure report.
- **Fix (AC-2):** Added a MANDATORY Deploy-Evidence Capture step to docker.md's
  shared verification section (main.md already delegates every rebuild/restart
  trigger there — one edit point, no duplication): paste literal `date -u` +
  `docker inspect --format StartedAt/RestartCount` + `docker image inspect`
  output before any Pass claim; StartedAt must postdate dispatch; cited hash
  must be confirmed existing. Added the `verify-deploy-sha.sh` pointer for
  code-change deploys. Added `+9L` size-justification header (121L, cap 120).
  Commit `1f15f47b2`.
- **AC-3 explicitly declined** — completing the rag-service redeploy is a
  separate concern (`UNBLOCK-DEPLOY-RAG-SERVICE`/`FIX-RAG-SERVICE-CLEAN-EXIT-
  RESTART-LOOP`) per the router dispatch's own explicit override; needs a real
  ops re-dispatch after this fix lands — not attempted.
- **AC-4 judgment:** extended GENERALLY (every future ops rebuild/restart),
  not scoped to this one incident — the fabrication mechanism is structural
  to the shared gate, not rag-service-specific, and cost of the general fix
  is 2 already-used commands, not new infra.
- **Board flip:** wrote `backlog[]→review[]` (`status:REVIEW`,
  `next_agent:qa`, `commit_sha:1f15f47b2...`) via `orch-apply.sh` myself —
  router explicitly instructed this (holds the task lock, no MCP gateway
  binding reaches this session, router owns independent verification) and my
  own init.md's FU-AGENT-FATHER-ORCH-SCOPE carve-out permits ONE such write
  per task dispatch. Live-verified post-write via `jq` (not self-report).
  **Did NOT commit `orch-state.json`** — that specific action (committing,
  not writing) is excluded from agent-father's `commit_zone` even under a
  direct task instruction, per 5 prior precedents this same sprint
  (S16/S17/S19/S20/S21 below) and per the live evidence found mid-task: a
  concurrent peer write (dev-team supervised-lane sweep promoting
  `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` + claiming
  `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE`, po minting a brand-new row) landed in
  the same file between my read and write — committing now would sweep that
  unrelated, unreviewed peer content under my authorship. Router (file owner,
  already directly monitoring this exact task) should verify/commit via the
  live file directly, not via git log.

## Fix (dev-team Step 3, CI-red P0) 2026-08-05T17:54:35Z FIX-CI-TASKCLAIM-PO-FLOW-OWNER-SESSION-PAYDOWN
- Added `owner_client_session` to `sprint-kickoff.md:44` (`task_claim`) and `sprint-signoff.md`
  `:28`+`:42` (both `task_release`) — the 3 PO-flow sites the row scoped, re-derived param
  names/lines from `coordinationTools.ts:104-110,199-205` (both non-optional `z.string()`), not
  copied from a sibling doc. Substitution instruction mirrors `pm/flow/main.md:127` /
  `commit-mutex/SKILL.md:36`. `scripts/audits/task-claim-owner-session-lint.sh --check` → PASS
  RC=0, 0 new offenders (270 files) on the actual committed working tree.
- Did NOT commit AC2 (baseline trim, drop `docs/agents/po/flow/**` from
  `task-claim-owner-session-baseline.json`) or AC5 (lint FAIL message distinguishes
  line-moved-grandfathered from genuinely-new call sites, implemented + 2 new tests added,
  9/9 suite green): both files sit in `scripts/`/`docs/data/`, outside `commit_zone.allowed`
  even though the row's own scope note names them — same precedent as this file's TE-T02 entry
  today (S1-S20/TE-T12/TE-T14/TE-T21). Built + fully verified locally, then reverted
  (`git checkout --`) to keep the commit zone-clean; exact diff supplied in RETURN for a
  developer to land in one commit.
- Confirmed live (not assumed) that `mcp__gateway__call_tool` / `mcp__gateway__list_servers` /
  `mcp__gateway__search_tools` / bare `mcp__vn-market__task_release` all error "No such tool
  available" — matches `commit-mutex/SKILL.md`'s own documented statement that agent-father has
  "no gateway binding — mutex physically unreachable" (not a bug, the designed architecture).
  Could not self-`task_release` `task:FIX-CI-TASKCLAIM-PO-FLOW-OWNER-SESSION-PAYDOWN`; router/
  dev-team holds gateway access and releases on my behalf, per the dispatch note.
- Sibling row `FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS` (review[]/next_agent
  =qa) untouched — its own PO scope-fence note already states `sprint-kickoff.md:44` is not its
  defect; did not add/alter any field on it.

## Fix (dev-team dispatch, TOKEN-ECONOMY-AUDIT) 2026-08-05T16:59:18Z TE-T02
- `docs/agents/dev-team/flow/main.md` 1087L/128,392B → 888L/118,924B (-9,609B, ~2.4k tok). 2 of the
  row's 3 relocations landed, byte-verified verbatim (WU-2 guarantee) via sed-extract + diff before
  AND after write, never hand-retyped: (a) Step 0-PREFLIGHT-FALLBACK (ERROR-verdict-only,
  L109-219) → new `preflight-fallback.md`, pointer left at the `jump:preflight-fallback` anchor;
  (b) Step 0a-B's per-signal orphan-adoption loop (L309-410) → new `orphan-adoption.md`, the 8-line
  `task_list_held` probe (N_MAX + call_tool + comment) kept inline per the row's own note so the
  common no-orphan-signals tick pays zero extra read. Both new files follow the existing
  drain-signals.md/ci-health-probe.md convention (size-justification header, `**Parent flow:**`
  pointer, `→ Run sub-flow:` line in main.md). Fixed 2 small staleness items in the same commit:
  JUMP-TO table ERROR row wording ("unchanged" → "relocated to its own sub-flow file"); confirmed
  main.md carries NO self-referential absolute-line-number comments (grepped `~L[0-9]`/`L[0-9]{2,4}`
  before editing — none), so no internal citations needed fixing.
- (c) BOUNDED-1 Promote bullet's 8 gate-history paragraphs + NON-CODE/DESIGN gap note (~10.6KB) —
  the row's own note says relocate into `scripts/devteam-backlog-promote-bounded1.jq`'s header, NOT
  a new .md file. Initially DID write that file (verified: jq still parsed, existing
  `test-devteam-bounded1-*.sh` suite re-run showed only PRE-EXISTING unrelated failures — same
  `$archive`-undefined compile error and missing `effective_*`/`is_epic_wrapper` defs on the
  ORIGINAL file too, confirmed via `git stash`; not caused by this edit) — then REVERTED it
  (`git checkout --`) on finding my own repeated precedent (S1-S20, TE-T12/TE-T14/TE-T21, this
  file's own prior entries) that `scripts/` sits outside `commit_zone.allowed` even when a dispatch
  prompt explicitly names it. Restored main.md's BOUNDED-1 section byte-identical to original
  (diff-verified clean) rather than leave a shrink with no landed destination — would have
  temporarily DELETED content the row's own CRITICAL CONSTRAINT says must only ever be RELOCATED.
  Exact ready-to-apply patch (both halves, main.md shrink text + jq header addition, byte-verified)
  supplied in RETURN for a developer to land in one commit; ~70k tok/day of the row's ~200k/day
  estimate still pending on that.
- Could not `task_claim`/`task_release` `task:TE-T02` myself — no MCP gateway tool grant reaches
  this session (`call_tool`/`mcp__gateway__call_tool` both errored "No such tool available"; agent-
  father's `tools_packages: [bootstrap]` per its own init.md). Did not touch
  `docs/data/orch/orch-state.json` (`commit_zone.excluded`, same precedent as TE-T12/TE-T14/TE-T21)
  — router/dev-team holds gateway access and must release the lock + route the board row.
- Verified post-edit: code-fence count even (36), all 12 `jump:` anchors present, jq syntax check
  on the (reverted, original) `scripts/devteam-backlog-promote-bounded1.jq` still passes.

## Keep (maintenance, router-dispatched, scheduled daily) 2026-08-05T12:57:56Z
- Pre-Check gate (CADRAT-3): `git diff --name-only HEAD~3..HEAD` matched zero `.claude/agents/*.md`
  or `docs/agents/*/flow/*.md` paths (last 3 commits touched notebooks + signal files only) →
  correctly SKIPPED Steps 1-2 orphan+roster scan, fell through to Steps 3-5 with empty
  scan-orphans output (0 ORPHAN/MISSING/UNREGISTERED/PHANTOM).
- Top-5 sweep ran against all 42 `docs/agents/*/init.md` (the real full agent-definition files —
  `.claude/agents/*.md` are thin bootstrap pointers only, confirmed 0/42 carry fail-loud-
  protocol/boundary_rules inline by design). Checks 1/3/4 (fail-loud-protocol, boundary_rules,
  flow-path resolves + Error Boundary present in flow main.md) PASS fleet-wide except
  `semble-search` (fails #1+#3) — NOT auto-fixed: it's a Task-tool utility subagent (haiku
  model, wraps `semble` CLI) outside the guide's two agent families (Cowork/Dev Team), so
  bolting on full-lifecycle sections may be architecturally wrong, not a genuine gap. Escalated
  to PO: bring into compliance vs. document as an explicit guide exception (utility/tool-wrapper
  class) — guide currently has zero carve-out for this shape.
- Check #5 (version >90d stale): 13/42 flagged — architect/ba/code-janitor/cowork-refactory-
  expert/fixer/idea-forge/ops/pm/po/qa-responder/qa (2026-04-26, 101d) + dev-mcp-server/
  dev-pdf-extractor (2026-05-06, 91d). Did not blind-stamp: spot-read 2 of the 13 in full
  (po, architect — confirmed every cross-referenced path in tools_package/flow.default/
  knowledge.always_load actually resolves) plus reconfirmed all 13 already pass Checks
  #1/#3/#4 before bumping `version:` → `2026-08-05` on all 13, the documented mechanical
  auto-fix (sweep-fixes.md Step 4). Guide itself defines no `version` field semantics (grepped
  guide + all 6 guide-*.md parts, zero hits) — treated the bump as "confirmed still-compliant
  as of this date", not a fabricated content claim.
- Step 5 stale-notebook report (info only, no action): 4/46 notebooks >30d —
  semble-search/market-analyst/idea-forge (94d), qa-responder (69d).
- FYI-only per dispatch note (NOT actioned — keep.md has no backlog-scan step, so this wasn't
  "reached" this cycle): `FIX-AUDITOR-A30-PROBE-SH-MISSES-RAG-SERVICE-CONTAINER` (P1,
  next_agent=agent-father) — `docs/agents/system-auditor/probe.sh`'s A-30 mem-creep deep-probe
  is scoped to `MCP_CONTAINER` only (derived line ~123, deep-probe block ~138-159), no
  rag-service loop; live-verified the gap myself by reading the script. Left untouched per the
  explicit "not a directive to go out of your way this cycle" instruction — surfacing in RETURN
  for developer/architect.
