# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FIX-VPS-SSC-INSIDER-502

## Session 2026-07-29 — FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1 — REVIEW

**Task:** BOUNDED-1 auto-pickup, P2, cross-service/. A Tier-1 DEGRADED cycle (06:08:22Z) wrote `docs/data/auditor-tier1-last-healthy.json` despite `main.md:748-755` explicitly gating that write out of Tier-1 — no authorizing step anywhere in the flow produced it, collapsing the file from `{last_healthy_at, checks{6 keys}}` to bare `{last_healthy_at}` and falsely advancing a "healthy" marker on a non-healthy cycle. A prose prohibition alone had already been tried and failed (2nd violation).

**Actions taken:** New `scripts/git-hooks/pre-commit` `_check_auditor_heartbeat_shapes` — runs unconditionally BEFORE the pre-existing sweep-guard mode dispatch, never `GIT_SWEEP_GUARD_MODE`-gated: rejects (commit BLOCKED, loud stderr) any staged tier-1 write that isn't the exact `{last_healthy_at, checks:{6 keys, all "PASS"}}` shape, and any staged tier-2/3 write carrying a `checks` key at all. New `CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER` in `docs/policies/dev-standards.md`, cited from both writers (`auditor-tier1-probe.sh` header, `main.md` § Tier-2/3 Heartbeat Write — which now also states the resolved semantic split explicitly). Live file repaired by actually running the authorized writer (`bash scripts/agents-flow/auditor-tier1-probe.sh`) — genuine ALL_GREEN, not hand-edited.

**Semantic judgment call (AC4):** the family's one filename says "healthy" but tier-2/3 really means "an audit completed" (fires every cycle regardless of verdict — `auditor-signal-loop-P1`, load-bearing for the SKIP-SPAWN freshness gate). Re-gating tier-2/3 on green was rejected — would starve the heartbeat on a persistently-tracked DEGRADED cycle and recreate the exact spawn-storm that P1 fix closed. Renaming the files/field was rejected — would break `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL`'s already-planned OH-3.5 reads of these exact paths (sibling row, sequenced with this one). Kept both filenames/fields; made shape (bare vs `checks{}`) the enforced structural signal distinguishing the two semantics. `suppress_heartbeat` NOT ported to Tier-1; `AUDIT_TIER` 2/3 gate at `main.md:750` NOT dropped (both explicitly rejected directions per the sibling row's `.why_the_obvious_fixes_are_wrong`).

**Verification:** New `scripts/git-hooks/pre-commit-auditor-heartbeat.test.sh` — RED (3/6 fail pre-guard) → GREEN (6/6). No regressions: pre-existing `pre-commit.test.sh` 6/6, `auditor-tier1-probe.test.sh` 141/141, both scripts otherwise byte-identical to before. `bash -n` syntax-clean on the hook. Shell/JSON/MD only — no `apps/mcp-server/` TS touched, `bun tsc`/`bun test` not applicable. Graphify: no Skill-tool path available to this spawned agent (same structural constraint as 2 prior sessions today) — flagged in `docs/WORK.md`, not silently skipped.

**Board:** `task_board.in_progress[FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1]` → `review` (`next_agent:po`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** PASS — Q1 clean (every line traces to one of the 6 acceptance criteria), Q2 single-use `_check_auditor_heartbeat_shapes` justified by direct precedent (`write_signal`/sweep-guard dispatch already single-purpose in the same file), Q3 senior-test clean (flat jq predicates, no indirection), Q4 ratio <50% overhead.

**Commits:** `612ee0954` (guard+docs+test), `06f15af0d` (live file repair, separate — data vs code convention).

Zone health: no drift detected.

## Session 2026-07-29 — FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE — REVIEW

**Task:** BOUNDED-1 auto-pickup, docs/data/orch/. detail_ref didn't resolve (no `items[]` entry) — worked from board row's inline fields + own investigation.

**Findings:** `sprint_goal.entries[]`/`task_board.active_sprints[]` eviction verified genuinely 0 — all 18/8 entries non-terminal (active/PLANNING/OPEN, no TERMINAL_SET alias drift), cross-checked against task_board lanes + cold `archive/*.json` closed_sprints/closed_sprint_goals for stale-active evidence — none found. No code change needed; existing predicate already correct.

**Actions taken:** `decision_journal[]` had zero eviction story (architect finding state-data-files-P7). Extended `scripts/orch-cold-evict.sh` with an age-ranked pass (keep 10 newest by parsed `.ts` desc, evict rank≥10 if ts null or >14d old — mirrors `done[]`). Entries have no stable unique id (task_id repeats across decisions) so hot removal is INDEX-keyed and cold-append is content-deduped, not id-set-keyed like every other lane. Confirmed zero live readers of `.decision_journal` (2 write sites only) — safe to age-evict independent of parent-sprint liveness.

**Verification:** new TEST 8 in `orch-cold-evict-tests.sh` (6 assertions: rank-gate, age-gate independent of rank, null-ts eviction, non-contiguous-index correctness, idempotent re-run). Full suite before/after: 27/35 both times (8 pre-existing unrelated failures, flagged not fixed) + 6/6 new T8 green. Live-applied under commit-mutex: `orch-state.json` 2,478,170→2,404,145 bytes (decision_journal 49→10). Conservation guard indifferent as expected (681/133 unchanged).

**Honest gap:** <150KB target NOT reached by this task alone (flagged up front — task_board lanes dominate remaining ~2.4MB). Deferred: P7's optional `orch-validate.mjs` >50 WARNING, `task_board._closed_signals_20260614` legacy-key cleanup — both out of stated scope.

**Board:** `task_board.in_progress[FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE]` → `review` (`next_agent:router`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Commit:** `b3d9a04eb` (script+test+orch-state.json+archive+decision-journal, single commit, explicit pathspec).

Zone health: no drift detected.

## Session 2026-07-29 — FIX-VPS-SSC-INSIDER-502 — REVIEW (CLOSED-NO-FIX)

**Task:** BOUNDED-1 auto-pickup, `vps-scripts/` (no system-map.json zone — Tier-3 generic dispatch). Decoupled from BA-PREDICTION-EVIDENCE-REVIVAL/TASK-EVIDENCE-HOP1-MCP; decoupling reason: "VPS upstream root-cause diagnosis deferred (requires live SSH, external portal may be down)".

**Findings:** Live-diagnosed WITHOUT VPS SSH — direct HTTP reproduction sufficed. VPS proxy `/proxy/ssc-insider` → 502 "Upstream HTTP 503 from congbothongtin.ssc.gov.vn/...jspx" (3x consistent). Direct sandbox curl to the SAME upstream → 503 "No server is available to handle this request" on every path incl. domain root — identical from non-VN egress AND VN egress (VPS), ruling out geo-block/VPS misconfig. Parent `ssc.gov.vn` healthy (302 nginx); its WebCenter app tier (`/webcenter/portal/ubck`) times out entirely — same app tier `congbothongtin` runs on. Confirmed genuine external SSC outage, no code defect.

**Actions taken:** Added in-code comment at `vps-scripts/vps-proxy-server.js`'s `SSC_INSIDER_UPSTREAM` documenting root cause + explicit "do not add retry" rationale (git-verified precedent: `B-05-FU-SSC-503-RETRY`/commit `a817b5139` already tried+reverted a 503-retry on this exact SSC domain for the sibling BCTC path — caused a 17-day queue freeze because the retry blew the caller's timeout budget; same mismatch applies here vs `sscInsider.ts`'s `withDeadline(30_000)`). Updated `docs/architecture-briefs/2026-07-01-BA-PREDICTION-EVIDENCE-REVIVAL.md` + `docs/WORK.md` with the closure. No functional code change — deliberately did NOT add retry.

**Verification:** `node --check` clean on the touched file (comment-only; no runtime-testable harness exists for this standalone Node script per repo convention). No `bun test`/`tsc` delta possible — zero `apps/mcp-server/src/` files touched. Committed directly to `main`, no task branch (matches `branch:null` CLOSED-NO-FIX precedent, e.g. `9e69d12bb`). Graphify skipped — no Skill-tool grant on this spawned agent, flagged in WORK.md.

**Board:** `task_board.in_progress[FIX-VPS-SSC-INSIDER-502]` → `review` (`next_agent:qa`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** N/A-clean — comment/doc-only change, no logic/feature/abstraction added (Q1-Q4 all trivially NO).

Zone health: no drift detected.
