<!-- size-justification: 340L — full FR/NFR spec for DWF-PHASE1 adaptive cadence; every AC paired with deliberate-violation test idea; blocking issues listed for architect; no code produced here -->

# DWF-PHASE1 — Adaptive Cadence (Heartbeat Consults Cadence Policy)

**Sprint:** DWF-PHASE1
**Author:** ba · 2026-05-31
**Status:** APPROVED (po · 2026-05-31, P1-PO-APPROVE) — hand to architect (P1-ARCH). 3 PO OpenQs resolved in § 8.
**Input:** `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` § Phase 1 + agents-architect Review · `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` · `docs/data/pressure-state.json` · `docs/SPRINT_GOAL.md` § DWF-PHASE1 · `docs/TASKS.md`
**Precondition:** Phase 0 + Phase 2 SHIPPED (DWF-EXIT 2026-05-31). Leader lock + suffix-free per-slot token + published-marker belt are live on `main`. The mandatory 0→2→1 ordering is satisfied.

---

## 1. Purpose

Phase 1 makes the cowork heartbeat cadence-aware. Instead of firing every 15 minutes unconditionally, the dispatcher reads the live `pressure-state.json` to decide the **desired firing cadence per slot** and suppresses slots that are on holiday, off-hours, or whose data is stale and unchanged. The goal is:

- SILENT ticks on off-market/holiday/low-pressure nights become near-free (sub-second probe + exit)
- Market-hours ticks fire more aggressively for `guaranteed` slots when pressure warrants it
- Calendar suppression (`is_trading_day`) replaces the hardcoded `02:00–08:59 UTC` window across all cron strings

**Phase 1 MUST NOT regress Phase 2 safety invariants.** The leader lock, suffix-free per-slot token, and published-marker belt must remain completely intact. Higher market-hours fire rates must not reopen collision windows that Phase 2 closed.

---

## 2. Scope

**IN:**
1. Cadence Policy Engine — pure deterministic function `cadence(policy_id, pressure_state) → interval_minutes`; per-agent `due = now - last_fired >= cadence`
2. `policy_id` and `last_fired` fields added to each slot in `cowork-schedule.json`
3. `cowork-match-slots.js` updated to use `due`-based matching (replacing raw cron-match for eligible slots)
4. Calendar suppression — call `is_trading_day` before any dispatch; suppress all non-`guaranteed` slots on holiday/weekend; log suppression reason
5. Freshness silent-downgrade — gatherer slots (news-scout, market-watcher) suppressed when `pressure-state.json` shows `last_regime=unknown` AND `signal_backlog=0` AND `calendar_status=holiday/weekend`
6. Static cron-string fallback — if `pressure-state.json` is unreadable (stale >30 min, missing, or malformed), revert to today's pre-Phase-1 cron matching; degradation must be explicit in logs
7. `guaranteed=true` floor — a `guaranteed` slot MUST always fire at its cron cadence regardless of cadence policy; the policy may only INCREASE frequency for guaranteed slots, never suppress them
8. `last_fired` write — dispatcher writes `last_fired = now_ISO` into `cowork-schedule.json` for each WON slot after successful spawn, using atomic JSON patch

**OUT (not this phase):**
- Phases 3/4/5 (content-router, workgraph, backpressure governor)
- Shortening the `*/15` CronCreate floor to `*/5`
- Persistent leader daemon
- Any changes to mcp-server code (no new MCP tools in this phase)
- Any changes to individual agent flows (this phase touches dispatcher + schedule only)
- LLM-based cadence classification (forbidden by CLAUDE.md §3 — deterministic-only)

---

## 3. Functional Requirements

### FR-P1-1: Cadence Policy Table (Cadence Policy Engine)

A deterministic policy table is the SSOT for `policy_id → cadence rules`. Each policy maps `(calendar_status, signal_backlog_tier, volatility_tier)` to an `interval_minutes` value.

**Policy table location:** `docs/data/cadence-policy.json`

**Tiers (deterministic — no LLM):**
- `signal_backlog_tier`: `low` (0–2), `medium` (3–9), `high` (≥10)
- `volatility_tier`: `low` = `last_volatility_level` in `["unknown","low"]`; `high` = anything else
- `calendar_status`: read directly from `pressure-state.json` field (pass-through from `is_trading_day`)

**Minimum policy set (architect must expand):**

| policy_id | calendar_status | signal_backlog_tier | volatility_tier | interval_minutes |
|---|---|---|---|---|
| `gatherer-standard` | `open` | `low` | `low` | 240 |
| `gatherer-standard` | `open` | `low` | `high` | 60 |
| `gatherer-standard` | `open` | `medium` | `*` | 60 |
| `gatherer-standard` | `open` | `high` | `*` | 30 |
| `gatherer-standard` | `holiday` | `*` | `*` | 480 |
| `gatherer-standard` | `weekend` | `*` | `*` | 480 |
| `gatherer-standard` | `unknown` | `*` | `*` | 240 |
| `chef-intraday` | `open` | `low` | `low` | 120 |
| `chef-intraday` | `open` | `*` | `high` | 60 |
| `chef-intraday` | `holiday` | `*` | `*` | null (suppress) |
| `chef-intraday` | `weekend` | `*` | `*` | null (suppress) |
| `guaranteed-floor` | `*` | `*` | `*` | null (never from policy — cron governs) |

`*` = wildcard (matches any value). First match wins (array order). `interval_minutes: null` = suppress (do not dispatch even if `due`). `guaranteed-floor` is a sentinel: slots with `guaranteed: true` MUST use their cron string as the cadence floor, not this table.

**AC-P1-1-1:** Given pressure `calendar_status="open"`, `signal_backlog=8`, `last_volatility_level="high"`, slot with `policy_id="gatherer-standard"` → `interval_minutes=60`.
- DV test idea: assert the opposite — set `signal_backlog=8, volatility="high"` → expect `interval_minutes=240` → test must go RED.

**AC-P1-1-2:** Given `calendar_status="holiday"`, slot with `policy_id="chef-intraday"` → suppressed (no spawn).
- DV test idea: remove the `holiday` rule from `cadence-policy.json`, re-run → suppression should NOT happen → test must go RED (proving the rule is load-bearing, not a stub).

**AC-P1-1-3:** Policy lookup with no matching rule → falls back to `interval_minutes=240` (safe default, never `null` for an unmatched rule).
- DV test idea: assert unmatched rule returns `null` → test goes RED.

---

### FR-P1-2: `policy_id` and `last_fired` Fields in cowork-schedule.json

Each slot gains two new optional fields:
- `"policy_id": "<policy_name>"` — references a policy in `cadence-policy.json`. If absent or null → slot uses legacy cron matching only (backward-compatible default).
- `"last_fired": "<ISO8601 UTC>"` — written by dispatcher after each successful spawn. Null on first run.

Slots with `guaranteed: true` always retain their cron string as the cadence floor even when `policy_id` is set. The policy can only increase frequency for guaranteed slots, never suppress them.

**AC-P1-2-1:** A slot with `policy_id: null` (or field absent) matches identically to pre-Phase-1 cron matching.
- DV test idea: remove `policy_id` field from a slot, assert it still fires on its cron string → no regression; removing cron string from a non-null-policy slot → test goes RED.

**AC-P1-2-2:** `last_fired` write is atomic (write-to-tmp then rename pattern from Phase 0); a crash mid-write leaves the previous value intact.
- DV test idea: simulate a crash (SIGKILL simulation via test harness) between write and rename → verify stale value not partially overwritten → RED if partial write survives.

---

### FR-P1-3: `cowork-match-slots.js` Due-Based Matching

The slot-matcher script gains a `--mode` switch:
- `--mode=legacy` (default): existing cron-match behavior; backward-compatible with pre-Phase-1
- `--mode=adaptive`: for each slot with `policy_id != null`, computes `due = now_unix - last_fired_unix >= cadence_seconds(policy_id, pressure_state)` and includes the slot in output if `due` is true (or `last_fired` is null for first run); for slots with `policy_id == null`, falls through to cron-match

The dispatcher reads mode from `docs/data/cadence-policy.json` presence; if the file is missing or malformed → `--mode=legacy` (degradation path FR-P1-6).

**AC-P1-3-1:** Slot with `last_fired=null` and `policy_id` set → always included in adaptive output (first-run semantics).
- DV test idea: assert a slot with `last_fired` set to `now` (zero elapsed) IS included → test goes RED (proving last_fired actually gates).

**AC-P1-3-2:** Slot with `last_fired=T-50min`, `cadence=60`, `calendar_status=open` → NOT included (50 < 60).
- DV test idea: assert it IS included → RED.

**AC-P1-3-3:** Slot with `last_fired=T-65min`, `cadence=60`, `calendar_status=open` → IS included.
- DV test idea: assert it is NOT included → RED.

**AC-P1-3-4:** Script output format unchanged: `{"slots": [...], "drift_min": N}`. New fields in each slot entry: `due_reason: "cadence|cron|first_run"` and `cadence_minutes: <N>` for observability. No existing field removed or renamed.
- DV test idea: strip `due_reason` from output schema → assert downstream jq parsing fails gracefully → RED if silent failure.

---

### FR-P1-4: Calendar Suppression via `is_trading_day`

Before dispatching any slot, the dispatcher calls `is_trading_day` (via gateway) once per tick (NOT per slot — single call, result shared). Suppression rules:

- `session_status = "holiday"` or `"weekend"`: suppress ALL non-`guaranteed` slots. Log each suppressed slot.
- `session_status = "unknown"`: no suppression (conservative — do not suppress on uncertainty).
- `session_status = "open"` or `"half_day"`: no calendar suppression.

**Interaction with Phase 2:** calendar suppression happens AFTER the leader lock is won and AFTER per-work-item claims (Step 4.6). A slot that loses the leader lock is not the dispatcher's concern. A slot suppressed by calendar suppression must still release its per-work-item claim (`task_release`) so a peer session is not permanently blocked.

**AC-P1-4-1:** On `holiday`, exactly zero non-guaranteed slots spawn; guaranteed slots still spawn on their cron schedule.
- DV test idea: force `calendar_status="holiday"`, assert a guaranteed slot (`chef-morning`) DOES NOT spawn → RED (guaranteed must fire).

**AC-P1-4-2:** On `unknown`, all slots proceed normally (no suppression on uncertainty).
- DV test idea: assert `unknown` suppresses a gatherer slot → RED.

**AC-P1-4-3:** Suppressed slots release their per-work-item `task_claim` token before exit. No starvation window remains open for a suppressed slot.
- DV test idea: suppress a slot, then attempt a second claim with a new session → assert `claimed=true` → RED if still locked.

**AC-P1-4-4:** `is_trading_day` call failure (tool error or gateway timeout) → calendar_status treated as `"unknown"` (no suppression); tick proceeds normally; one WORK-channel warning logged.
- DV test idea: mock gateway to return error → assert dispatch proceeds and slots are not suppressed → RED if suppression happens on tool failure.

---

### FR-P1-5: Freshness Silent-Downgrade for Gatherer Slots

Gatherer slots (`news-scout-offhours`, `market-watcher-offhours`, `news-scout-sentiment`, `market-watcher-eod`) are silently downgraded (skipped, no spawn, no error) when ALL three conditions hold:
1. `pressure-state.json` `last_regime = "unknown"`
2. `pressure-state.json` `signal_backlog = 0`
3. `calendar_status` in `["holiday", "weekend"]`

This condition encodes "nothing has changed and market is closed — no value in running gatherers."

This downgrade is ADVISORY and applies only to non-guaranteed gatherers. It does NOT apply to `guaranteed=true` slots. It does NOT apply when `calendar_status = "open"` or `"half_day"` or `"unknown"`.

**AC-P1-5-1:** All three conditions true → gatherer slots not spawned; telemetry writes `downgraded: ["slot_id"]`.
- DV test idea: set signal_backlog=1 (only two conditions true) → assert gatherers ARE spawned → RED if three-condition gate not enforced.

**AC-P1-5-2:** Downgraded slots release their per-work-item token (same as FR-P1-4 AC-P1-4-3).
- DV test idea: same as AC-P1-4-3 pattern above.

---

### FR-P1-6: Static-Cron Fallback on Pressure-State Unavailability

If `docs/data/pressure-state.json` is:
- Missing
- Malformed (fails JSON parse)
- Stale: `emitted_at` is more than 30 minutes before current UTC (one missed tick + 15 min buffer)
- `stale_warning: true` (self-reported by emitter)

Then the dispatcher MUST fall back to legacy cron matching (`--mode=legacy`) for ALL slots. No cadence policy evaluation. No calendar suppression (conservative). Log: `"[cowork] WARN: pressure-state.json unavailable — cadence fallback to legacy cron (reason: <stale|missing|malformed>)"`. One WORK-channel warning if stale or malformed (not on every tick — suppress repeated warnings for same staleness epoch).

**This is the degradation contract from the architecture brief:** "PressureState unreadable → static cron fallback. The system is never worse than today."

**AC-P1-6-1:** With `pressure-state.json` absent → all slots match via legacy cron exactly as they did pre-Phase-1. Zero behavioral difference from today.
- DV test idea: delete `pressure-state.json`, assert `chef-morning` fires at 05:15 on its cron string → RED if Phase 1 logic intercepts it.

**AC-P1-6-2:** With `emitted_at` 35 minutes old → fallback triggered, legacy cron used.
- DV test idea: set `emitted_at` to 29 minutes ago → assert adaptive mode is active (not fallback) → RED if 29-minute-old state triggers fallback.

**AC-P1-6-3:** `stale_warning: true` in pressure-state → fallback triggered even if `emitted_at` is recent.
- DV test idea: set `stale_warning: false` + old `emitted_at` → assert fallback due to age not stale_warning → RED if stale_warning check is the only gate.

---

### FR-P1-7: `last_fired` Write After Successful Spawn

After Step 5 (fan-out) completes for a slot, the dispatcher writes `last_fired = <now_ISO>` into the slot's record in `docs/data/cowork-schedule.json`, using an atomic write (read → modify in memory → write .tmp → rename). Only written for slots in `WON_SLOTS` (not suppressed, not held-by-other). Failed spawns do NOT update `last_fired` (prevents cadence drift from failed dispatch).

**AC-P1-7-1:** After a successful WON_SLOTS spawn, the slot's `last_fired` in `cowork-schedule.json` equals the dispatch timestamp (within 1 second).
- DV test idea: assert `last_fired` is NOT updated → RED after a successful spawn.

**AC-P1-7-2:** A spawn failure (agent tool returns error) does NOT update `last_fired` for that slot.
- DV test idea: mock spawn failure, assert `last_fired` IS updated → RED.

**AC-P1-7-3:** `last_fired` write failure (file write error) is non-fatal: logs error, does NOT block or roll back the spawn. Slot fires correctly; next tick may fire again (conservative: under-suppress, never over-suppress).
- DV test idea: assert write failure aborts the spawn → RED.

---

## 4. Non-Functional Requirements

**NFR-P1-1 — Phase 2 safety invariants remain intact.**
Leader lock (Step 0b), suffix-free per-work-item token (Step 4.6, `cowork-slot:<slot_id>`), and published-marker belt (Step 5) must not be modified, removed, or bypassed. Phase 1 changes are additive to the dispatch body — they operate between "leader won" and "fan-out". Higher fire rates from the cadence policy must not bypass the per-work-item claim step.

**NFR-P1-2 — Cadence policy is deterministic; no LLM classification.**
`cadence(policy_id, pressure_state)` is a pure look-up function — same inputs always produce the same output. No Claude API call, no scoring model, no "best effort" routing. CLAUDE.md §3 forbids non-deterministic dispatch.

**NFR-P1-3 — Degradation is never worse than today.**
Every unavailability path (pressure-state missing, tool failure, JSON malformed) falls back to legacy cron behavior. The system must never suppress a slot that legacy cron would have fired.

**NFR-P1-4 — `guaranteed=true` slots cannot be suppressed by the cadence policy.**
Calendar suppression and freshness downgrade may only suppress non-guaranteed slots. A guaranteed slot fires on its cron schedule regardless of policy output.

**NFR-P1-5 — No new mcp-server code or new MCP tools.**
Phase 1 is a cross-service change only: `cowork-match-slots.js`, `cowork-team/flow/main.md`, `cowork-schedule.json`, and the new `cadence-policy.json`. Zone: `cross-service` only. Zone `apps/mcp-server/` is untouched.

**NFR-P1-6 — `last_fired` write is atomic; no partial state.**
Uses write-to-tmp-then-rename pattern (same as `pressure-state.json` emitter from Phase 0, FR-P0-4). Partial write on crash must not corrupt the schedule JSON.

**NFR-P1-7 — Staleness self-check on every tick.**
On each tick, before reading `pressure-state.json` for policy decisions, check `emitted_at` + `stale_warning` fields. Staleness detection is mandatory — not optional observability.

**NFR-P1-8 — No per-slot MCP calls in the cadence decision path.**
The cadence decision (is this slot due?) must be computable from local files only (`pressure-state.json`, `cadence-policy.json`, slot's `last_fired`). No MCP round-trip per slot. The `is_trading_day` call (once per tick, FR-P1-4) is the only network touch in the pre-dispatch phase.

---

## 5. DDD Layer Assignments

| Deliverable | Layer | Files |
|---|---|---|
| `cadence-policy.json` — policy look-up table | Infrastructure (policy config) | `docs/data/cadence-policy.json` |
| `policy_id` + `last_fired` fields in schedule | Infrastructure (config) | `docs/data/cowork-schedule.json` |
| `cowork-match-slots.js` adaptive mode | Application (orchestration logic) | `.claude/scripts/cowork-match-slots.js` |
| Cadence suppression + fallback logic | Application (orchestration) | `docs/agents/cowork-team/flow/main.md` Steps 4.3–4.5 (new) |
| `last_fired` write step | Application (state tracking) | `docs/agents/cowork-team/flow/main.md` Step 5b (new) |
| Calendar suppression call | Application (orchestration) | `docs/agents/cowork-team/flow/main.md` Step 4.2 (new) |
| Test suite `DWF-phase1-cadence.test.ts` | Tests | `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` |

Note: the test file lives in `apps/mcp-server/src/__tests__/` following existing convention, but tests only the cadence-policy look-up logic (JSON parsing + rule evaluation) — NOT mcp-server code. Architect may redirect to a standalone test runner if preferred.

---

## 6. Edge Cases and VN-Specific Notes

**EC-1 — Tết multi-day holiday run.**
`is_trading_day` returns `holiday` for multiple consecutive days (e.g. Tết 5-day block). Guaranteed slots (chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit) still fire. Non-guaranteed slots (bctc-analyst-slot-*, gatherers) are suppressed for the entire block. The `last_fired` from before the holiday block is preserved — when market reopens, `due` computation correctly resumes from the last real fire.

**EC-2 — Partial/half-day session.**
`session_status = "half_day"` treats the session as `open` for suppression purposes. No special cadence reduction for half-day (conservative). Architect may add a `half_day` column to `cadence-policy.json` in Phase 1+.

**EC-3 — `last_fired` null on first run after Phase 1 ships.**
All existing slots have `last_fired: null` at deploy time. The matcher must treat `last_fired=null` as "always due" (first-run semantics). This prevents a silent blackout on first post-deploy tick.

**EC-4 — Clock skew between CLI session and pressure-state emitter.**
The emitter runs inside the same CLI session that reads it. Clock skew is bounded by the session's local system clock. No cross-machine time sync risk. Staleness check against the same clock source that emitted the file.

**EC-5 — `cowork-schedule.json` write conflict with agent-father edits.**
`cowork-schedule.json` can be edited by agent-father (slot additions/removals). The `last_fired` write is a targeted JSON patch (read → modify slot.last_fired → write). If agent-father is simultaneously modifying the file (rare), the last-write-wins clobber may lose either the `last_fired` update or the agent-father's structural change. Mitigation: log the write timestamp; architect to decide whether a file-lock or version-check approach is needed (not a Phase 1 blocker — last-write-wins is acceptable for `last_fired` staleness margin).

**EC-6 — `chef-intraday` null-suppress during market hours under high pressure.**
Phase 1 must NOT suppress `chef-intraday` when `calendar_status="open"` regardless of policy output. The `null` suppress for `chef-intraday` is ONLY valid for holiday/weekend. The policy table must be validated to not suppress market-hours slots during `open` sessions — architect must audit policy rules before ship.

---

## 7. Blocking Issues for Architect

**BLOCKER-1 (PHASE-2 REGRESSION RISK): Cadence policy + higher fire rate must not bypass the per-work-item claim step.**

The leader lock (Step 0b) and per-work-item token (Step 4.6) are safety primitives from Phase 2. Phase 1 must insert its logic (calendar check, cadence due-check, freshness downgrade) BETWEEN "leader won" and "per-work-item claim" — never AFTER the per-work-item claim, and never as an escape hatch that bypasses Step 4.6. Architect must define the exact insertion points in `cowork-team/flow/main.md` with a step-by-step layout and verify that a higher-fire-rate scenario exercises the same claim path.

Specific risk: if calendar suppression runs AFTER per-work-item claim (not before), a suppressed slot that already claimed a `cowork-slot:<slot_id>` lock and then exits without releasing would block the slot for 180 seconds. Suppression must happen BEFORE Step 4.6, or each suppression path must explicitly call `task_release` (AC-P1-4-3).

**Decision required:** does calendar suppression happen before or after per-work-item claims in the flow? BA recommendation: BEFORE claim (avoid unnecessary claim acquisition). Architect to confirm and encode in the technical blueprint.

**BLOCKER-2 (POLICY TABLE COMPLETENESS): Every enabled slot must have a `policy_id` assignment or a documented fallback.**

There are 14 enabled slots in `cowork-schedule.json`. Each either gets a `policy_id` pointing to a defined policy in `cadence-policy.json`, or retains `policy_id: null` (legacy cron fallback). If any slot has a `policy_id` that references a missing policy, the adaptive matcher must treat it as `null` (not as an error that blocks dispatch). Architect must define the full `policy_id` assignment for all 14 slots in the technical blueprint.

**BLOCKER-3 (LAST_FIRED WRITE CONTENTION): Parallel fan-out writes `last_fired` for multiple slots simultaneously.**

Step 5 fans out all WON_SLOTS in parallel. If multiple slots win and the `last_fired` write uses read → modify → write per slot (serial), the writes must be serialized or the update must be done as a single batched JSON patch (update all won-slot `last_fired` values in one read-modify-write). A naive parallel implementation would cause lost-update: slot A reads the file, slot B reads the file, A writes (slot A's last_fired updated), B writes (overwriting A's update with a copy that has no slot A last_fired change).

**Decision required:** single batched write after fan-out (recommended, simpler) vs per-slot serial write vs accept-the-race (the lost-update only delays by one dispatch cycle — acceptable risk?). Architect to decide.

**BLOCKER-4 (TEST FILE ZONE): `DWF-phase1-cadence.test.ts` location.**

The cadence policy evaluation is pure JSON look-up logic — no DB, no MCP calls. If architect routes it to `apps/mcp-server/src/__tests__/`, the test can import a JS/TS cadence evaluator module from `apps/mcp-server/src/` (or a shared utilities path). If the evaluator lives entirely in `.claude/scripts/cowork-match-slots.js` (a Node.js script), the test would need a different harness (e.g. Jest/bun running against the script directly). Architect to decide where the evaluator module lives and which test harness applies.

---

## 8. Open Questions (PO-level)

**OQ-P1-1 (policy aggressiveness): How often should `chef-intraday` fire during high-volatility market hours?**
The brief implies market-hours `*/15` ticks should fire more slots under high pressure. The minimum policy table above proposes `chef-intraday` at 60 min under high-volatility open sessions. Is 60 min too conservative? Too aggressive (spawns 7–8 `unified-agent` sessions per market-hours block)? PO to confirm the target fire rate before architect locks the policy table.

> **PO DECISION (2026-05-31): CONFIRM 60 min.** Keep `chef-intraday open/high = 60 min`. Rationale: a `unified-agent` chef session is heavy (full convergence scan); the VN market-hours window is ~02:00–08:59 UTC (~7h), so 60 min = ~7 fires/day at peak volatility — already a 4x increase over today's effective ~1/block reality and well above the SILENT baseline. The 16GB host memory panic ([project_host_memory_panic]) is the binding constraint, not market coverage: more frequent chef sessions multiply concurrent `unified-agent` load. 60 min keeps peak concurrency bounded while still giving aggressive coverage when it matters. Do NOT tighten to 30/45 in Phase 1 — that risks reopening the swap-exhaustion failure mode and the Phase 2 collision windows under sustained high fire-rate. If observability later shows headroom (`host_headroom_mb` populated + stable), architect may revisit in Phase 1+. Floor: `open/low/low = 120 min` stands. **Architect must keep `chef-intraday` `open` sessions un-suppressible (EC-6) — 60 min is a frequency, never a suppression.**

**OQ-P1-2 (staleness threshold): Is 30-minute staleness the right fallback trigger?**
FR-P1-6 proposes 30-minute staleness as the threshold for degrading to legacy cron. This equals one missed tick + 15-minute buffer. If the pressure-state emitter misses two consecutive ticks (30 minutes), the system falls back. PO/operator to confirm this is acceptable — a tighter threshold (15 min = one missed tick) would be more conservative.

> **PO DECISION (2026-05-31): TIGHTEN to 15 min — but with a single-tick grace so we don't false-fallback on a normal tick boundary.** Set the staleness threshold to **20 minutes** (one `*/15` interval + 5-min jitter/clock-skew buffer), NOT 30. Rationale: the whole degradation contract (NFR-P1-3) is "never worse than today" — falling back to legacy cron is the SAFE direction, so we should trigger it eagerly, not lazily. A 30-min threshold means the emitter can be dead for two full ticks while the dispatcher keeps trusting a stale pressure vector and (e.g.) keeps suppressing slots that should fire. 20 min catches a single missed tick without false-tripping on the expected ~1 tick of emitter latency (EC-4: same-session clock, so 5 min jitter is generous). This is more conservative than the BA's 30 and avoids the hard 15-min knife-edge that would false-fallback on normal `*/15` boundary alignment. **Update FR-P1-6 + AC-P1-6-2/6-3 to use 20 min** (AC-P1-6-2: 25-min-old → fallback; 18-min-old → adaptive still active). Architect to encode 20 min and adjust the two boundary ACs accordingly.

**OQ-P1-3 (bctc-analyst slots): Should bctc-analyst-slot-1..4 use cadence policy or remain static?**
The four `bctc-analyst` slots fire at 15:00, 18:00, 21:00, 00:00 UTC daily — all confirmed off-market. They are currently `guaranteed: false`. Phase 1 could suppress them on holiday/weekend via calendar suppression (saving off-holiday spawns). PO to confirm: is bctc analysis during VN holidays acceptable or should it be suppressed?

> **PO DECISION (2026-05-31): SUPPRESS on holiday, but NOT on weekend.** bctc-analyst slots 1–4 stay `guaranteed: false` and are caught by calendar suppression — but only for `session_status = "holiday"`, not `"weekend"`. Rationale: (1) BCTC (financial-statement) analysis is fundamentally **filing-driven, not session-driven** — issuers do not file on VN public holidays (offices closed), so a holiday-day bctc run re-chews the same corpus with zero new input and only burns host memory / Claude budget. Suppressing it is pure waste-elimination, no coverage loss. (2) **Weekends are different** — companies routinely file late Friday / over the weekend, and our extraction backlog (PDF OCR pipeline) genuinely benefits from weekend catch-up runs when the analysis fleet is otherwise idle and host headroom is highest. So weekend bctc runs have real value; holiday runs do not. This splits cleanly from the BA's "holiday/weekend" lumping: **architect must make calendar suppression for bctc-analyst-slot-1..4 trigger on `holiday` ONLY, not `weekend`.** Concretely: give these 4 slots a dedicated policy (e.g. `bctc-offmarket`) where `holiday → null (suppress)`, `weekend → 1440 (fire once/day, normal)`, `open/half_day/unknown → cron (legacy)`. This is a refinement to the FR-P1-4 blanket "holiday OR weekend suppresses all non-guaranteed" rule — architect to reconcile: the gatherer freshness-downgrade (FR-P1-5) still uses holiday+weekend, but bctc calendar suppression is holiday-only. Note for EC-1 (Tết): a 5-day Tết block fully suppresses bctc slots — correct, no filings during Tết.

---

## 9. Acceptance Criteria Summary (BLOCKING)

All BLOCKING ACs require a deliberate-violation proof (RED before, GREEN after).

| AC ID | Description | DV Proof Type |
|---|---|---|
| AC-P1-1-1 | Policy look-up returns correct interval for known pressure vector | Assert wrong interval → RED |
| AC-P1-1-2 | holiday+chef-intraday policy → null (suppress) | Remove rule → no suppression → RED |
| AC-P1-2-1 | null policy_id → legacy cron match (no regression) | Remove cron string from null-policy slot → RED |
| AC-P1-3-1 | last_fired=null → always due (first-run) | Assert first-run not included → RED |
| AC-P1-3-3 | last_fired T-65min, cadence=60 → due=true | Assert not due → RED |
| AC-P1-4-1 | holiday → guaranteed slot still spawns | Assert guaranteed slot suppressed → RED |
| AC-P1-4-3 | Suppressed slot releases per-work-item token | Assert token held after suppression → RED |
| AC-P1-5-1 | Three-condition downgrade gate enforced | Set signal_backlog=1 → gatherer fires → RED |
| AC-P1-6-1 | Missing pressure-state → legacy cron fallback, no behavioral change | Assert Phase 1 intercepts missing-file path → RED |
| AC-P1-7-1 | last_fired written after successful spawn | Assert not written → RED |
| AC-P1-7-2 | Spawn failure → last_fired NOT written | Assert written on failure → RED |
| NFR-P1-1 | Phase 2 invariants: leader lock + suffix-free token + published marker intact | Remove leader-lock step, assert dispatch still occurs → RED |

---

## 10. RETURN

```
DONE: BA spec complete — docs/REQ_DYN-WF-PHASE1.md
NEXT: architect | run brownfield analysis, resolve BLOCKER-1..4, produce technical blueprint
HANDOFF: docs/REQ_DYN-WF-PHASE1.md
BLOCKERS:
  BLOCKER-1 (REGRESSION RISK): Insertion point of calendar suppression relative to per-work-item claim — must be before claim or must explicitly release on suppression path
  BLOCKER-2 (POLICY COMPLETENESS): all 14 enabled slots need policy_id assignment or documented null fallback
  BLOCKER-3 (WRITE CONTENTION): last_fired write must be single batched patch after fan-out, not per-slot parallel
  BLOCKER-4 (TEST ZONE): cadence evaluator module location + test harness decision
OPEN_QUESTIONS_PO: ALL RESOLVED (po 2026-05-31 — see § 8 for full rationale)
  OQ-P1-1: RESOLVED — chef-intraday open/high = 60 min CONFIRMED (host-memory bound; never suppress on open)
  OQ-P1-2: RESOLVED — staleness threshold set to 20 min (NOT 30; one tick + 5min jitter); update FR-P1-6 + AC-P1-6-2/6-3
  OQ-P1-3: RESOLVED — bctc-analyst-slot-1..4 SUPPRESS on holiday ONLY, FIRE on weekend (filing-driven); needs dedicated bctc-offmarket policy
PO CRITIQUE (NFR-P1-1 confirmed): spec preserves Phase 2 invariants — § 2 IN-scope is additive between leader-won and fan-out; BLOCKER-1 correctly flags the per-work-item-claim insertion-point risk; NFR-P1-1/P1-5 keep leader-lock, suffix-free cowork-slot:<slot_id> token, and published-marker belt untouched (zone cross-service only, apps/mcp-server/ off-limits). APPROVED.
PIPELINE: continue (architect P1-ARCH — resolve BLOCKER-1..4 + encode OQ-P1-2 20min + OQ-P1-3 bctc-offmarket policy)
```
