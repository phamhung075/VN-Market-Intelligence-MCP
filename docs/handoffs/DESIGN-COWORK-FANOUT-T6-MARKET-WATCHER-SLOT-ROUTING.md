---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T6-MARKET-WATCHER-SLOT-ROUTING
type: TASK
size: M
zone: docs/agents/market-watcher/
priority: P1
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T7-MATCH-SLOTS-CLARIFY]
order: tier1-first
---

## TLDR

market-watcher's main.md flow currently re-derives which sub-flow to run (eod vs offhours vs prepost vs market) from wall-clock time, silently discarding the `slot=` parameter the dispatcher already passes. When the EOD slot fires late (outside its ±5min window), it falls through to the offhours sub-flow, losing eod.md's distinct ledger + signal-file deliverables that Chef's 08:37Z EOD dish depends on. Fix: route by slot identity first, wall-clock table as fallback only for ad-hoc (no slot) invocations.

## [PM] Planning Context

**Zone:** docs/agents/market-watcher/

**Root Cause (Brief §7):** The R3 incident where market-watcher EOD slot did not fire for 4 days (17th, 20th, 21st EOD gap) with independent corroboration from price_anomaly_v1 file's own market_context.note. When the EOD slot *does* fire late, main.md's Step 2 wall-clock routing silently routes it away from eod.md (the correct sub-flow per the slot identity) to offhours.md (a generic fallback). This is worse than duplicate compute — it is a missing artifact (EOD-specific ledger + signal output) that downstream dependencies (Chef market-analyst) cannot recover from.

**Acceptance Criteria:**
- [ ] main.md Step 2 checks `$SLOT_ID` parameter (if present) BEFORE consulting wall-clock time
  - `if $SLOT_ID == "market-watcher-eod" → docs/agents/market-watcher/flow/eod.md` (unconditional, regardless of drift)
  - `elif $SLOT_ID == "market-watcher-offhours" → docs/agents/market-watcher/flow/cycle.md mode=offhours` (unconditional)
  - `elif $SLOT_ID is empty/unrecognized → existing wall-clock window table (unchanged — ad-hoc/manual only)`
- [ ] A late-firing `market-watcher-eod` (dispatched for slot eod, but running outside the ±5min historical window) always reaches eod.md
- [ ] Test T-7 (brief §7): `market-watcher-eod` invoked at wall-clock time far outside historical ±5min window routes to eod.md, not cycle.md
- [ ] Test T-8 (brief §7): no `slot=` param (manual/ad-hoc invocation) → wall-clock table governs unchanged (backward-compat)
- [ ] cycle.md's existing c47 off-hours duplicate guard (F8 in brief) remains the final content-keyed defense for any residual overlap (same closing prices, within-session) — no change to that guard needed
- [ ] Commit message includes: `AC: T6 — market-watcher slot= routing root-cause fix`

**Files to read first:**
- `docs/agents/market-watcher/flow/main.md:1-20` (Step 2, current wall-clock routing)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:134-147` (§5: Root-cause fix, design rationale)
- `docs/agents/market-watcher/flow/cycle.md:1-50` (understand c47 duplicate guard, ensure no breakage)
- `docs/agents/market-watcher/flow/eod.md:1-50` (understand expected deliverables and when they should run)

**Files to modify:**
- `docs/agents/market-watcher/flow/main.md:2-14` (Step 2: add slot= parameter parsing, conditional routing)

**Files to create:** none

**Dependencies:** none — this task is independent, ships first per PO order.

**Knowledge needed:** 
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (brief context, §5-§6)
- Brief background: late-firing eod slot loses eod.md's ledger + signal-file deliverables; Chef 08:37Z dish depends on these

**Why this order (PO sequencing):**
T6 is the only strand that is market-facing DATA LOSS (a missing artifact for downstream Chef) rather than detection latency. No dependency on T1–T5 (producer/consumer ordering logic). Must ship first/separately because T3 (the only apps/mcp-server touch that blocks T4, which blocks the rest) is sequenced behind qa full-suite, making T1-T5 unable to complete promptly. T6 is doc-only and unblocked now.

---

## Implementation Notes

- The `slot=` parameter is already passed by `docs/agents/cowork-team/flow/spawn-fanout.md:120` in the dispatch prompt: `run docs/agents/market-watcher/flow/main.md slot=<slot_id>`. Confirm this is present and available in the prompt context.
- main.md Step -1 or Step 0 will need to parse this parameter (same pattern already used elsewhere for `period=`, `digest-predict` handling).
- Wall-clock windows (e.g., "if now is 15:55-16:05 UTC, route to eod.md") only apply when no `slot=` is provided (ad-hoc/manual invocation — the backward-compat case). This keeps the existing behavior unchanged for non-dispatched flows.
- The intent is NOT to fix how the dispatcher *selects* which slot to fire (that is cowork-team's job, and step 4b WARN behavior is intentionally unchanged per brief §5). This task is purely about a receiving flow correctly routing by its own dispatched identity rather than re-deriving from ambient time.

---

## Test Coverage (from Brief §7)

- **T-7:** `slot=market-watcher-eod` invoked at wall-clock time far outside historical ±5min window → routes to eod.md, not cycle.md (regression for F7/the incident's exact failure)
- **T-8:** no `slot=` param (manual/ad-hoc invocation) → existing wall-clock table governs unchanged (backward-compat)
- QA will validate both in the tier-4 T8 test sprint.

---

## Signal Reference

This row was filed after the 2026-07-21T16:00Z tick where:
- dispatch: news-scout-offhours, market-watcher-offhours, market-watcher-eod, alert-commander-critical (all parallel)
- market-watcher-eod fired ~16:08-16:13Z (outside its own 15:55-16:05 window)
- main.md Step 2 wall-clock check failed to match (current time 16:08, not in 15:55-16:05)
- eod cycle **silently fell through to offhours** instead of routing by its own slot identity
- eod.md's distinct ledger + signal file were never written
- Chef's 08:37Z EOD dish that depends on this output found nothing
- Independent corroboration: `docs/signals/dev-team-20260721T181610Z-signals-inbox-undeliverable-floor.json` recorded the same selloff was detected by price_anomaly_v1 producer (2026-07-21T16:13Z file), and its own market_context.note reads: "First EOD pass since 2026-07-17 — slot did not fire for 4 days (17th, 20th, 21st EOD gap; 18-19 weekend)."
