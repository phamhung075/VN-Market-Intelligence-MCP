# Cowork gatherer spawn ran router protocol instead of own flow — false-green coverage gap

**Detected by:** cowork-team dispatcher (tick 2026-06-29T12:00:00Z)
**Severity:** HIGH (false-green — silent data gap masked as success)
**Class:** context-overflow / identity-confusion — same family as TASK_1967-04 (SUCCESS→SILENT→FAILURE)

## What happened

Tick 12:00Z fired two off-hours gatherers on the 4h cadence (`0 */4 * * *`), **both with the identical spawn pattern and identical context**:
- `market-watcher-offhours` → agent `ac8d204f` — **CONFIRMED OFF-FLOW (failed)**
- `news-scout-offhours` → agent `ad6f2948` — **CONFIRMED CLEAN (succeeded)**: ran c124 · 2026-06-29T12:07Z end-to-end, posted signals #7915–7917, appended notebook, updated coverage-state.

Spawn was the canonical `run docs/agents/<agent>/flow/main.md slot=<slot_id>`, `run_in_background:true`.

**KEY:** Same spawn, same context — one gatherer ran correctly, the other went off-flow. This is the decisive evidence below.

### market-watcher (ac8d204f) — raw evidence

The agent returned a polished success block titled **"Return Block (Dispatch Control)"** describing PRE-CLAIM coordination phases:
- "Phase 0a: Session presence registered (`session-presence:router-market-watcher-offhours`)"
- "Phase A: Orphan-adoption probe — 0 orphan-signals"
- "Phase A.5: Presence roster read"
- "Phase B: PRE-CLAIM gate for `intent:market-watcher:offhours` — CLAIMED & RELEASED"
- ended: "The market-watcher agent is now authorized to execute its flow" (future tense — never executed)

**None of that is in `docs/agents/market-watcher/flow/main.md`.** That flow is a pure UTC-clock dispatcher: Step -0 identity assertion → run `cycle.md` (mode=offhours). There is no PRE-CLAIM phase, no orphan probe, no roster read anywhere in the agent's flow. The agent executed the **project `CLAUDE.md` router dispatch protocol + dispatch-claim skill** instead of its own flow file.

**Proof no work landed:** `docs/agent-memory/notebooks/market-watcher.md` last cycle = **08:04–08:05 UTC** (header "Last updated: 2026-06-29 08:05 UTC"). No 12:00Z cycle log, no metrics block, no 41-stock anomaly scan. Burned ~40k tokens / 17 tool-calls producing a fabricated success block with zero real output.

The flow's Step -0 identity guard (added for TASK_1967-04) did NOT fire because the agent never reached its own flow — it short-circuited into router behavior before any flow step.

## Why it matters

This is the false-green class (cf. "Passive health masks dead data", "Janitor false-green — verify"): a cadence fire reports success while silently skipping the actual gather. Anomaly coverage for the 12:00Z off-hours window is simply missing, and the telemetry signal recorded `classification:FIRE / spawned`. Dispatcher stamped `last_fired=12:04Z`, so the adaptive matcher will not re-attempt until 16:00Z — the gap persists 4h.

## Root cause (for dev-team/agent-father triage — NOT dispatcher's to fix)

**NOT a deterministic flow-inheritance bug.** news-scout `ad6f2948` got the byte-identical spawn prompt and context and ran its flow perfectly (c124). Only market-watcher `ac8d204f` failed. This is the **non-deterministic identity-overflow / context-truncation class** — same family as TASK_1967-04 (SUCCESS→SILENT→FAILURE) — where one spawn's identity stanza is displaced and the agent latches onto the project-root `CLAUDE.md` router protocol instead of its own `flow/main.md`.

The flow's Step -0 identity guard is structurally unable to catch this: it lives *inside* the flow the agent never enters. The agent goes straight to router PRE-CLAIM behavior before reaching any flow step. Mitigation likely needs the identity/flow-entry assertion enforced at the **spawn-prompt level** (unavoidable preamble), or the spawn prompt to explicitly suppress router-protocol inheritance, so an overflow surfaces as a loud IDENTITY_CHECK=FAIL rather than a silent off-flow run.

## Dispatcher actions taken
- Verified raw (notebook freshness + flow file) — did NOT relay the agent's success badge.
- Left `last_fired=12:04Z` as-is (re-firing would only repeat the bug until the flow is fixed).
- This escalation. Dispatcher cannot spawn agent-father / dev-team — routing to PO per team boundary.

## Recommended
1. PO triage → agent-father: make flow-entry/identity assertion unbypassable for cowork spawns (spawn-prompt-level preamble, not in-flow Step -0).
2. Scope confirmed: news-scout `ad6f2948` ran clean (c124) — defect isolated to the one `ac8d204f` spawn, consistent with non-deterministic overflow, not a deterministic flow bug.
3. Consider: dispatcher should gate FIRE telemetry / last_fired on a post-spawn liveness proof (notebook mtime advance), not on spawn-success alone — would convert this silent gap into a loud failure. (Dispatcher-side change → cowork-team flow rework, agent-father.)
