---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T6-MARKET-WATCHER-SLOT-ROUTING
size: M
zone: docs/agents/market-watcher/
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T7, DESIGN-COWORK-FANOUT-T8]
---

## TLDR
Fix market-watcher's dispatch routing to respect the `slot=` parameter passed by the cowork dispatcher, falling back to wall-clock window table only when no slot is present. This unblocks the EOD slot from silently routing to offhours mode when clock drift occurs, ensuring EOD's distinct deliverable (ledger + signal file that Chef's 08:37 UTC dish depends on) never goes missing due to mode misrouting.

## [PM] Planning Context

**Zone:** `docs/agents/market-watcher/` (flow-only, no apps/mcp-server/ touch)

**Acceptance Criteria:**
- [ ] `docs/agents/market-watcher/flow/main.md` Step 2 parses incoming `slot=` parameter from spawn prompt
- [ ] When `slot=market-watcher-eod` → explicitly route to `docs/agents/market-watcher/flow/eod.md`
- [ ] When `slot=market-watcher-offhours` → explicitly route to `docs/agents/market-watcher/flow/cycle.md` with `mode=offhours`
- [ ] When `slot=` is empty/unrecognized → fall back to existing wall-clock window table unchanged
- [ ] Backward-compat verified: manual/ad-hoc invocation without `slot=` parameter still routes via wall-clock table
- [ ] AC T-7 regression test passes: `slot=market-watcher-eod` invoked at wall-clock time outside ±5min window routes to `eod.md`, not `cycle.md`
- [ ] AC T-8 regression test passes: manual invocation without `slot=` param routes via existing wall-clock logic

**Rationale:**
- Addresses root cause F7 from brief: dispatcher passes `slot=` in spawn prompt, but `main.md` was re-deriving mode from clock alone, causing late-firing EOD slot to silently fall through to offhours mode
- This is a market-facing DATA LOSS fix: EOD's distinct ledger + signal-file output (that Chef's 08:37 UTC EOD dish depends on) was going missing whenever EOD slot drifted past ±5min window
- Observed in 2026-07-21 incident: `market-watcher-eod` slot fired ~16:08–16:13Z (outside its 15:55–16:05 window), silently routed to `cycle.md` instead of `eod.md`, and never posted the signal file that alert-commander was waiting for

**Files to read first:**
- `docs/agents/market-watcher/flow/main.md` (current Step 2 logic — wall-clock routing table)
- `docs/agents/cowork-team/flow/spawn-fanout.md` (Step 5: how `slot=` is passed in spawn prompt — confirm it's actually present)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § F7 § 5 (root cause detail + design)

**Files to modify:**
- `docs/agents/market-watcher/flow/main.md` (Step 2: replace wall-clock-only dispatch with `slot=` check first, wall-clock fallback)

**Files to create:**
- None (flow-only fix)

**Dependencies:**
- None (independent of T1–T5)
- Blocks T7 (optional comment clarification in match-slots.md)
- Blocks T8 (QA gate: T7/T8 test cases verify this)

**Knowledge needed:**
- `docs/agents/market-watcher/flow/main.md` architecture (which sub-flows are available, how mode parameter flows through)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § F7 § 5 (root cause & design rationale)
- Brief § Test strategy § T-7 / T-8 (backward-compat regression tests)
