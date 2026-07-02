# Developer — Notebook

**Last updated:** 2026-07-02 | **Cycle:** FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT

## Session 2026-06-14 — FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY (doc-only)

**Task:** Codify `docker builder prune -f` as unconditional final step in `docs/agents/ops/flow/docker.md`.

**Root cause:** 3rd recurrence (2026-05-27, 2026-06-07, 2026-06-14) of host disk-full from Docker build-cache accumulation. A ≥2/day rule existed in memory but was never in the flow. Third occurrence ENOSPC-blocked a QA agent at 97% / 6.7 Gi free; recovery reclaimed 18.62 GB.

**Fix — 4 locations in docs/agents/ops/flow/docker.md:**
1. FORBIDDEN § "Rebuild after code change" one-liner: appended `&& docker builder prune -f`.
2. Docker Commands § REBUILD mcp-server comment: appended `&& docker builder prune -f` after `sleep 5`.
3. New § WHY: Builder Prune Is Mandatory After Every Rebuild: 3 recurrences, safety properties, generic_mandate (host-wide, never scope to mcp-server only).
4. Post-Rebuild Health Verification § Final step: prune block AFTER health checks pass, BEFORE notebook write; abolished ≥2/day heuristic.

**Pattern:** Undocumented recurring-cost rules must be codified as mandatory unconditional steps — memory-reliant heuristics always recur.

## Session 2026-06-07 — FIX-CI-LINT-STACK (cross-service CI fix)

**Task:** Bump golangci-lint-action v6.1.1 -> v7.0.0 at 6 sites; delete kinh-dich-ts-lint job.

**Learning:** golangci-lint-action v7 supports v2 schema only and requires explicit `version: v2.0` input (shown in action README). v6 installed v1 binary which rejected v2 config with exit-3. The stale TS lint job (kinh-dich rebooted TS->Go 2026-05-24) had no eslint.config so would never pass — dead CI debt.

**Pattern:** CI schema version mismatch (linter binary vs config version) always shows as exit-3 with "you are using a configuration file for version X with version Y". Verify action major version tracks linter major version.

## Session 2026-06-21 — FIX-FB-GATE-SECTOR-NAME-VALIDATOR (AUDIT-FB-GATE-PROSE-HARDENING)

**Task:** Add Check-E (sector/company-name validator) to `scripts/fb-data-integrity-gate.sh` + fix line-344 `[[: 0\n0: syntax error`.
**Zone:** scripts/ (cross-service gate) → developer handles directly.

**Bug found (line-344):** `grep -c` exits 1 on 0 matches → `|| echo "0"` fires alongside grep's stdout "0" → `floor_zero="0\n0"` → `[[ "$floor_zero" -gt 0 ]]` syntax error. Fix: `|| true` + `grep -m1 '^[0-9]' || echo "0"` to normalise to scalar. Both occurrences (lines 343+353) fixed.

**Check-E design:** SSOT-driven (reads docs/data/system-map.json .project.watchlist). Two sub-checks:
- E1 parenthesised-label contradiction: regex `TICKER (label)` / `(label) TICKER` within 60-char parens; maps SSOT English sector strings to canonical families; derives Vietnamese sector keywords per family; guards against own-sector-keyword false-positives (VRE "Retail REIT" correctly NOT flagged for "retail" kw).
- E2 company-alias mismatch: curated known-fabrication aliases (VNM→Nestlé, SAB→Heineken).

**Learning:** Proximity-window sector matching (120 chars) is too aggressive for Vietnamese financial prose where multiple sectors are discussed in the same paragraph. Tight parenthesised-label matching (pattern `TICKER (...)`) targets the fabrication signal without false-positives.

**Commit:** eceee94a

## Session 2026-07-02 — FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT

**Task:** sprint_goal.entries over cap (26/15) — 8 terminal sprints stranded by non-canonical status drift.
**Zone:** multi (scripts/ + apps/mcp-server/ + orch SSOT) → developer handles directly (generic lead).

**Root cause (deeper than dispatched):** `.sprint_goal.entries[]` and `.task_board.active_sprints[]` are TWO SEPARATE arrays. `scripts/orch-cold-evict.sh`'s TERMINAL_SPRINT_STATUSES predicate had NEVER touched `.sprint_goal.entries[]` at all (zero grep hits pre-fix) — only canonicalizing the 8 tokens would not have made the eviction script actually drop them.

**AC-1 (mechanical):** `scripts/fix-sprint-goal-status-drift-evict-normalize.jq` — generic alias-map normalizer (CLOSED/COMPLETE/COMPLETED→DONE, done→DONE, done_verified→DONE_VERIFIED, CANCELED→CANCELLED), applied via `jq -f ... | orch-apply.sh`. Then extended `scripts/orch-cold-evict.sh` (new `rm_sprint_goal`/`new_cold_sprint_goal_set` maps, cold target `.closed_sprint_goals[]`) and ran it live: `.sprint_goal.entries` 26→18, 8 items moved to `docs/data/orch/archive/2026-07.json` with canonical status preserved.

**AC-2 (durable):** `checkSprintGoalStatusCanonical()` added to `orchStateSchema.ts` (same alias map, exported) + wired as Stage 1d hard-fail in `scripts/orch-validate.mjs` (which `orch-apply.sh` already calls) — any future write with a drifted terminal-status token is rejected (exit 2) before it touches the live file. Also extended `docs/agents/dev-team/flow/post-cycle.md` Step 4.2 bloat-trigger to count `.sprint_goal.entries[]` terminal entries (previously only checked active_sprints/done/done_verified — the gap that let this reach 26 unnoticed). Server-side (orchStateStore.ts) parity rides the next user-approved mcp-server rebuild — not done here per hard constraint (no docker build/exec).

**Proof (fixtures only, never live SSOT):** `bun scripts/orch-validate.mjs <fixture-with-CLOSED>` → exit 2, Stage 1d message. `cat <fixture> | ORCH_APPLY_LIVE_FILE_OVERRIDE=<fixture> bash scripts/orch-apply.sh` → exit 1, fixture file byte-unchanged. Full cold-evict end-to-end dry-run against a scratch copy (env-var override) before touching live data.

**Tests:** `apps/mcp-server/src/__tests__/TASK-FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT.test.ts` (5 tests, RED→GREEN), `bun tsc --noEmit` clean, full suite 14132 pass (pre-existing unrelated 54 fail/4 errors — CI-RED-RECONCILE backlog, confirmed unrelated by running the orchStateSchema-scoped subset alone: 108/108 pass).
