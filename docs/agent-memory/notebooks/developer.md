# Developer — Notebook

**Last updated:** 2026-07-02 | **Cycle:** TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1

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

## Session 2026-07-02 — TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1 (cowork silent-path preflight)

**Task:** New `scripts/agents-flow/mcp-call.sh` (shared JSON-RPC-over-curl MCP helper) + `scripts/agents-flow/cowork-tick-preflight.sh` (deterministic Steps 1-8, verdicts SILENT/WORK/LOST_ELECTION/DEFER/ERROR) — first script-level MCP tool callers in this repo.
**Zone:** root (docs/agents/cowork-team/flow + .claude/skills + scripts/agents-flow) — no apps/ touch.

**Live-verified MCP-from-shell contract:** POST http://localhost:3000/mcp is STATELESS (no `initialize` handshake needed). Response is SSE-framed (`event: message`/`data: {...}`), tool errors surface as `.result.isError==true` + plain-text message, NOT a JSON-RPC `.error` field. HTTP 200 in both success and tool-error cases.

**Bash gotcha found+fixed:** `"${var:-{}}"` (parameter-expansion default of a literal `{}`) silently corrupts to `{}}` due to bash's brace-parsing ambiguity — confirmed with a minimal repro. Fix: two-step default (`"${var:-}"` then `[ -z ] && var='{}'`), never collapse to one expansion when the default itself contains `{}`.

**Brief-vs-live-schema deviations (documented, not blocking):** brief pseudocode referenced `route_to` (real field is `to`), `.pressure_mode` in pressure-state.json (field doesn't exist — 9-key schema confirmed from `emitPressureStateTool.ts`), and a `zone` field on scheduled-task rows (doesn't exist on `ScheduledTaskRow`). Implemented against the real, source-verified schema each time; full rationale in `docs/agent-memory/decisions/sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-developer.md`.

**Testing pattern for MCP-calling bash scripts:** source the script under test (guarded by `[[ BASH_SOURCE == 0 ]]` so sourcing doesn't auto-exec), then override `mcp_call()` as a stub dispatching on tool name — avoids all real side-effecting calls (`claim_due_scheduled_tasks`/`emit_pressure_state`). CAUTION: assertions on stub call-count/order must go through a FILE (not a plain var) if the function-under-test is invoked via `$(...)` command substitution — that's a subshell, plain-var writes inside it are lost. 20/20 tests pass.

**Deleted:** `scripts/agents-flow/cowork-tick-autosilent.sh` (R5 — dead code, zero doc references, bypassed commit-mutex via raw `git -c user.name=...`).
