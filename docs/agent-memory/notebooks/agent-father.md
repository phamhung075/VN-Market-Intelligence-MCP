# Agent Father — Notebook

## Fix (router-direct dispatch, P2) 2026-08-06T07:39Z FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR + CHORE-TEAM-TOOL-RECHECK-LOCAL-CRON
- **Row 1 (empty-table discriminator):** `docs/agents/system-auditor/audit-dimensions.md` is already at its own 200L hard cap (header says split, not grow) and the `AUDIT_TIER=DATA` check family (`.claude/commands/crons/cron-db-data-integrity.md`) had ZERO registry entry anywhere — new `docs/agents/system-auditor/flow/data-writer-provenance.md` fills both gaps: writer-provenance discriminator (class (a) scheduled-pipeline may stay CRITICAL / (b) test-only-writer INFO ceiling / (c) on-demand-tool-writer INFO-WARN ceiling), a missing-table-vs-empty-table split (fixes the `pdf_documents` rendered-identically finding), a seeded table classification (price_alerts=c, alert_engine_records=b, deep_fetch_stats=a-adjacent unresolved), and an explicit negative-control requirement so class (a) tables (`daily_ohlcv`) can't be silenced. `flow/main.md` gets a 1-line changelog + 1 new `AUDIT_TIER` extraction bullet cross-referencing it — no dispatch rewire (still falls through to the tier-3 default, unchanged behavior).
- **Row 1 out-of-zone:** the actual actuator is inline free text in `.claude/commands/crons/cron-db-data-integrity.md` — outside `commit_zone.allowed`. Flagged via `docs/signals/2026-08-06-fix-auditor-emptytable-writer-discriminator-handoff.json` (left uncommitted for dev-team's drain, same pattern as the prior notebook-compose-actuator handoff) recommending either a direct transcription or, better, a deterministic `scripts/db-empty-table-classify.sh` (developer scope).
- **Row 2 (team-tool-recheck):** historical writer (122 files, 2026-06-13→06-23, ~every 2h) was a cloud-RemoteTrigger-driven LIVE MCP-probe sweep (tool param-name drift, cron/VPS health) — `agent-father` holds no `mcp__gateway__call_tool` grant (confirmed tools line) and cannot reproduce that. Re-established the STATIC subset instead: new `docs/agents/agent-father/flow/team-tool-recheck.md`, wired into `keep.md` as Step 5b, runs on the EXISTING daily `cron-agent-father.md` cadence (`23 14 * * *`, already <30d — no new cron registration, no `.claude/commands/crons/` edit needed). Checks tool-grant vs declared-write-boundary consistency across the 7 boundary-declared cowork agents (per `docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §1), explicitly excluding `fb-market-poster`/`orch-sentinel`/`system-auditor` (different class, reasoned in the flow doc).
- **Row 2 positive control (AC requirement) — RAN LIVE, not just designed:** wrote `docs/agent-memory/health/team-tool-recheck-2026-08-06-0739.md`, first run since 2026-06-23. Correctly flags alert-commander/market-watcher/news-scout CRITICAL (`Bash` granted by commit `610110e16` 2026-07-31 for commit-mutex/coverage-stamp.sh, description text never updated — still reads "No other filesystem writes permitted" unqualified); correctly leaves bctc-analyst/digest-predict/unified-agent/qa-responder CLEAN (no `Bash`). `write_boundary` field confirmed absent from `system-map.json` (0 matches) and no `agent-write-boundary-guard` hook registered in either settings file — mechanical-enforcement status recorded as prose-only.
- **Row 2 out-of-zone:** the live-MCP-probe remainder (tool schema drift, cron/VPS health) flagged via `docs/signals/2026-08-06-chore-team-tool-recheck-livescope-handoff.json` — recommends po assign a gateway-bound owner (system-auditor extension candidate), not a revival of the old ~2h cadence (that granularity was for live-incident response; the now-separated static check doesn't need it).
- **Not implemented (adjacent but distinct, not this task's scope):** `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` closed to `done[]` by architect (brief complete) but its actual mechanism (§4.1 `system-map.json write_boundary` + §4.2 PreToolUse hook) is NOT implemented — confirmed live (0 `write_boundary` keys, no hook file). This is why Row 2's fallback uses the brief's hardcoded 7-agent list instead of reading the (not-yet-existing) authoritative field; noted, not fixed here — out of these two rows' scope.

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
