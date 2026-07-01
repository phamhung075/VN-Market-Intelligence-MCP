# TOKEN-ECONOMY-TICK-PREFLIGHT — Architecture Brief

**Date:** 2026-07-01 · **Author:** router (analysis session d3292ca4) · **Type:** SPRINT-S, 3 work units
**Problem:** Recurring cron ticks in the interactive router session burn ~80k tokens/hour while idle.

## Measured cost drivers

- Prompt cache TTL is 5 min; crons fire every 15/30 min → **every tick is a full cache miss** over the whole accumulated conversation (~8 tick entries/hour: cowork ×4, dev-team ×2, auditor ×2).
- Cowork **silent tick** (no due slots — ~80% of ticks off-market) still costs ~614 lines of flow re-reads + 8–10 sequential MCP tool round-trips ≈ 10–12k tokens of context growth.
- Dev-team tick reads `main.md` (611L ≈ 8k tok) **before** the SF-1 skip gate — pure waste whenever a peer session holds the singleton.
- Auditor Tier-1 spawns a **full subagent every 30 min** to do what is essentially `docker ps` + 2 health curls (~30–60k tokens per spawn).

Result: session grows ~80k/hour idle → compaction every ~2h → post-compact flow re-reads → repeat.

## Design principle

Every step below is **deterministic — no LLM judgment involved**. Moving it from LLM-narrated
steps into scripts is a quality *upgrade* (see scar: `feedback_cowork_spawn_narrates_not_executes` —
narration ≠ execution). The LLM stays in the loop for all judgment: slot fan-out, drain triage,
anomaly interpretation, planning.

MCP access from shell: the vn-market server is reachable over HTTP (local mcp-server container
:3000, public https://zenmidi.com/vn-market/mcp). Scripts call tools via JSON-RPC curl with
bound-variable payloads (DRAIN-INJECTION-SAFE: never interpolate payload fields into shell lines —
use `jq --arg`/`--argjson` to build request bodies).

---

## WU-1 — `scripts/agents-flow/cowork-tick-preflight.sh` (zone: mcp-server/scripts + flow docs)

One script executes the full deterministic head of the cowork tick and prints ONE compact JSON verdict:

1. Compute TICK (floor UTC minute to 15-min boundary — same formula as `leader-lock.md`).
2. Presence claim `session-presence:<sid>` (heartbeat if already own — pass `$CLAUDE_CODE_SESSION_ID` as arg).
3. Fire-election claim `cron:cowork:<TICK>` (TTL=600). **AF-1 preserved:** on claim call ERROR
   within backstop window (hour ∈ {0,4,8,12,16,20}, minute<15) → verdict `DEFER`; on lost election →
   verdict `LOST_ELECTION` (+ WORK telegram sent by script).
4. `claim_due_scheduled_tasks(sweep_tick)` → due one-shot rows included in verdict (COWORK/DEV rows
   are NOT executed by the script — they need LLM dispatch; script only claims and reports).
5. Blind guard (`jq '.mcpServers|length' .mcp.json`).
6. Slot matcher (`node scripts/agents-flow/cowork-match-slots.js`).
7. **If** slots empty AND no one-shots AND signal_queue has no NEW cowork rows: emit_pressure_state
   (last-known values from `docs/data/pressure-state.json` + `cycle-snapshot-latest.json`), release
   election lock, verdict `SILENT`.
8. Else: verdict `WORK` with `{slots[], one_shots[], signals[]}` — election lock **kept held**;
   LLM continues at flow Step 4.2 and telemetry.md still owns emit+release on the WORK path.

Verdict schema: `{"verdict":"SILENT|WORK|LOST_ELECTION|DEFER|ERROR","tick":"...","drift_min":N,"slots":[...],"one_shots":[...],"new_signals":N,"detail":"..."}`

Flow doc update: `docs/agents/cowork-team/flow/main.md` Steps 0a–0c + 1–4b collapse to
"run preflight script; on SILENT/LOST/DEFER → done; on WORK → continue at Step 4.2".
Update `.claude/skills/cron-cowork-team/SKILL.md` cron prompt if it changes.

**DoD:** silent tick = 1 Bash call + short reply. Two-session election smoke: exactly one winner.
Error path: script failure → verdict ERROR → LLM falls back to full flow (fail-open to the old
path, never silently skips telemetry). Injected-fault test per `feedback_fence_false_green`.

## WU-2 — `scripts/agents-flow/dev-team-preflight.sh` (zone: flow docs + scripts)

Same pattern for dev-team `main.md` PREFLIGHT: START telegram, presence claim/heartbeat, SF-1 claim
(`dev-team-cron-singleton`), fire-election `cron:dev-team:<TICK>` (largest of {07,37} ≤ minute).
Verdict `RUN` (locks held → LLM reads main.md and proceeds) or `SKIP` (peer holds SF-1 → script
sends the WORK skip telegram itself, releases nothing it doesn't own, exits).

Flow doc: PREFLIGHT section of `docs/agents/dev-team/flow/main.md` becomes "run preflight script";
cron prompt in `.claude/skills/cron-detect-loop/SKILL.md` Job 1 updated to invoke script first and
only read main.md on RUN.

**DoD:** skip tick ≤ 2 tool calls (~1k tokens). All lock semantics byte-identical to current flow
(SF-1 TTL=5400, election TTL=600, release-at-end unchanged on RUN path).

## WU-3 — Auditor Tier-1 demoted to shell healthcheck (zone: flow docs + scripts)

`scripts/agents-flow/auditor-tier1-probe.sh`: docker ps health-state sweep, `curl :3000/health`,
`curl :3001/`, disk headroom, container mem creep — thresholds from the existing
`docs/agents/system-auditor/flow/tier1-probe.md`. On ALL-GREEN: write heartbeat line (notebook or
signals log), exit 0 — **no subagent spawned**. On ANY failure: print verdict JSON; the cron LLM
then spawns the system-auditor subagent exactly as today (full flow, signal_queue routing).

Cron prompt in `.claude/skills/cron-detect-loop/SKILL.md` Job 2 updated: run script → spawn only on failure.
Tier-2/Tier-3 **unchanged** (freshness/DB-integrity need judgment).

**DoD:** healthy T1 tick spawns nothing. Failure path proven by injected fault (stop a canary
container in a controlled window or stub a failing curl) — per `feedback_fence_false_green`.
Guard against `feedback_passive_health_masks_dead_data`: script checks last-success-age where
tier1-probe.md already does, not just process-up.

---

## Out of scope (follow-up candidates)

- Strip `<!-- ... -->` changelog comments from flow .md files (~25% of lines) → companion CHANGELOG.
- Move recurring ticks to headless `claude -p` launchd firer (kills the cache-miss-over-full-history
  problem entirely; already wanted for fb-daily per `project_cowork_guaranteed_slot_needs_live_cli_session`).
- MEMORY.md prune — done by router 2026-07-01 (separate, router-owned).

## Expected saving

Fixes 1–3 ≈ **80–85% of idle-hours burn** (silent cowork ticks ~10× cheaper, dev-team skips ~10×
cheaper, 48 auditor subagent spawns/day eliminated), with all mutex/election/injection gates intact.
