# Developer — Notebook

**Last updated:** 2026-07-03 | **Cycle:** FIX-AUDITOR-COMMIT-MUTEX-SKIP

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

## Session 2026-07-03 — FIX-AUDITOR-COMMIT-MUTEX-SKIP

**Task:** system-auditor's notebook commit step was non-deterministically SKIPPING the commit-mutex claim (flow-step drift on narrated prose) — 2 observed skips vs paired counterexamples. Consolidates DEFERRED sibling FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC (non-explicit `git add` had swept a peer's in-flight edits into f05795c3).
**Zone:** cross-service/ (scripts/ + docs/agents/) → developer handles directly, no zone match.

**Root-cause fix:** new `scripts/auditor-notebook-commit.sh` — ONE blessed script that internally claims/releases `commit-mutex:main` via a bash `trap ... EXIT` (claim can never be skipped by construction — no code path reaches `git commit` without passing the claim call first) and stages/commits ONLY the explicit paths passed as arguments (never `-A`/`-u`/`.`). Wired `docs/agents/system-auditor/flow/main.md`'s notebook commit step to call it instead of narrating raw git commands.

**Portability gotcha:** first draft used `mapfile -t arr < <(cmd)` — fails on macOS system `/bin/bash` (3.2, no `mapfile` builtin, this host has no bash4+ in PATH). Replaced with a portable `while IFS= read -r ...` loop.

**Live test evidence (no mocks, real gateway):** 4 scenarios verified against a scratch file (`docs/agent-memory/sessions/2026-07-03-auditor-commit-script-scratch-test.md`), each cross-checked via `task_list_held` before/after: (1) success → `[auditor-commit] mutex-paired commit <sha> paths=1`, lock paired claim+release; (2) no-op → `SKIP no-staged-changes`, lock still paired; (3) contended (simulated peer holding the lock) → `SKIP mutex-claim-failed contended ... — retry next tick`, exit 1, edit preserved uncommitted, then succeeded on retry once the peer released; (4) foreign-path guard — a peer file pre-staged in the shared index was detected and `git restore --staged`'d, never touching its content, while only the named own path was committed.

**Commit-mutex API gotcha:** `task_claim` rejects `ttl_seconds < 60` (Zod `too_small`) — script default is 90 (matches `.claude/skills/commit-mutex/SKILL.md`), safely above the floor.
