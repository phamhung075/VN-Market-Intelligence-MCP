# Agent Father — Notebook

## Fix (router-direct dispatch, P1) 2026-08-06T07:11:10Z FIX-SYSAUDITOR-NOTEBOOK-COMPOSE-ACTUATOR
- **Scope call:** brief (docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-blindspot.md) named fixes A-E "for agent-father", but A/B/C/D's actual actuators/hooks live under `scripts/` — outside `commit_zone.allowed` (same precedent as TE-T02/TE-T12/TE-T14/TE-T21, `c72b5ca34`). Split each fix into its in-zone doc/spec half (done below) vs out-of-zone code half (flagged via signal).
- **E (done):** `.claude/skills/notebook-write/SKILL.md` AC-3 Step 2 collapsed the Edit(whole-file `old_string`)/Write conflict to Write-only, matching `docs/agents/system-auditor/flow/main.md`. First cut breached cap (201L/12138B vs 200L/12000B — live `context_bloat_breach` signal fired, routed-to-po); trimmed rationale prose instead of adding a justification header — final 198L/11926B, both under cap, signal left for po as the accurate record.
- **A interim (done, NOT a replacement for the real fix):** `main.md` Step 1a now runs a real bash `PRE_HEADINGS`/`PRE_COUNT` snapshot (not narrated); new BLOCKING Step 2a computes `EXPECTED_DROPS` from `PRE_COUNT` alone — never the compose step's own self-report — and `git checkout --`-reverts on mismatch before any commit is attempted. Would have caught the `0fcc6a5d2` shape (heading vanished, 80->81L, zero drops required). `scripts/notebook-compose.sh` script actuator itself flagged to developer.
- **D doc half (done):** `docs/agents/tools/package/system-auditor.md` Bash row now names `auditor-notebook-commit.sh` the ONE authorized git write and explicitly FORBIDS raw git add/commit on the notebook path; matching callout added at `main.md`'s Commit step, citing the 3-second bare-commit-then-retry sweep-guard evidence.
- **B/C (pure `scripts/git-hooks/pre-commit` + env-var config, not mine):** ran the corpus replay live (`scripts/audits/verify-notebook-immutability-gate.sh`) as due diligence before recommending: 33 reject(s)/13 files fleet-wide, INCLUDING 3/8 of `system-auditor.md`'s own last commits — the skill's stated "reads 0" bar for `GIT_NOTEBOOK_IMMUTABILITY_MODE=reject` is not met even scoped to this one file. Recommended NOT flipping yet.
- **Handoff:** `docs/signals/2026-08-06-fix-system-auditor-notebook-compose-actuator-handoff.json` → po — full spec for `scripts/notebook-compose.sh` (A), the pre-commit blind-spot fix (B), the C replay evidence above, and D's runtime-enforcement/recurring-bug-ticket ask (`prior_warns=7`, already past the 2+ recurring-bug threshold).

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
