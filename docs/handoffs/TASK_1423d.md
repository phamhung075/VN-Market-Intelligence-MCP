# TASK-1423d — Surface [Thien Thoi] Section in get_macro_snapshot

**Sprint:** 1423 — Trần Ngọc Báu Macro Framework (Phase 1)
**Created:** 2026-04-29
**Status:** done
**Agent:** developer
**Estimate:** ~2h

---

## Context

`get_macro_snapshot` already fetches DXY but does NOT display it. This task wires
together the outputs of 1423a (US10Y), 1423b (Fed Funds Rate), and 1423c (Carry
Trade Signal) into a new `[Thien Thoi]` output section. This is a text-format and
data-assembly change — no new DB tables or infrastructure needed.

## Hard Dependency

**Must not start until TASK-1423a, TASK-1423b, and TASK-1423c are merged.**

## Scope

### Files to Modify

**`apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`**

Extend `formatMacroSnapshot` to add a new output block:

```
[Global Macro Inputs — Thien Thoi]
  DXY:            104.2 (+0.3% vs 30d avg) — USD STRENGTHENING → EM pressure
  US 10Y Yield:   4.52% — RISK-OFF threshold (>4.5%) — PE compression signal
  Fed Funds Rate: 5.33% (FRED)
  VND Carry Spread: +1.17% (VND 5.5% - Fed 4.33%) — NEUTRAL
  Global Liquidity: TIGHTENING
```

**Signal threshold rules (hard-coded — these are domain constants):**

DXY label:
- DXY > 30d mean by +2% → `USD STRENGTHENING → EM pressure`
- DXY < 30d mean by -2% → `USD WEAKENING → EM tailwind`
- Otherwise → `USD STABLE`

US 10Y label:
- > 4.5% → `RISK-OFF threshold — PE compression signal`
- < 4.0% → `RISK-ON — equity multiple expansion`
- Otherwise → `NEUTRAL`

Carry spread label: use `computeCarryTradeSignal().regime` string directly.

Global Liquidity label (simple majority vote across 3 signals):
- Count TIGHTENING signals: DXY strengthening + 10Y > 4.5% + carry FII_OUTFLOW_RISK
- Count EASING signals: DXY weakening + 10Y < 4.0% + carry HOT_MONEY_INFLOW
- Majority → `TIGHTENING` / `EASING` / `NEUTRAL`

**Zero-safe display:** if DXY = 0, display `DXY: unavailable`. If US10Y = 0, display
`US 10Y Yield: unavailable`. If carry input rates are 0, show carry as `unavailable`.
Never display `0%` as if it were a real value.

**Data reads required inside `formatMacroSnapshot` (or its caller):**
1. `commodity.dxy` — already in struct (just not displayed)
2. `commodity.us10yYield` — new field from TASK-1423a
3. `tracked_indicators WHERE indicator='fed_funds_rate'` — new read, one DB query
4. `sbv_rates.max_deposit_rate_pct` (latest) — already available in `rates` struct
5. Call `computeCarryTradeSignal(vndRate, fedRate)` from `domain/services/macro/carryTradeSignal.ts`

**Backward compatibility:** `MacroSnapshotResponse` type does NOT change. The new
section is built from data already available in the existing struct plus one additional
`tracked_indicators` query. No test fixture changes required for existing tests.

**Verify before implementing:** check whether any existing `macroTools` tests use
full-text equality (`toBe`) on the full snapshot output string. If any do, add the
new `[Thien Thoi]` section to those expected strings. Tests using `toContain` are
unaffected.

## Acceptance Criteria

1. `get_macro_snapshot` output contains a `[Global Macro Inputs — Thien Thoi]` block
2. Block shows non-zero DXY, US10Y, Fed Funds Rate, Carry Spread, Global Liquidity
   (or `unavailable` when data is missing — never `0%`)
3. DXY trend label computed correctly vs 30d mean
4. Global Liquidity label is majority-voted from the 3 sub-signals
5. All existing macro snapshot tests continue to pass
6. New snapshot test: given known input values, verify the `[Thien Thoi]` block
   renders correctly for each regime combination (TIGHTENING / EASING / NEUTRAL)

## Test File

`apps/mcp-server/src/__tests__/1423d-thien-thoi-snapshot.test.ts`

## Dependencies

- TASK-1423a (us10yYield field in CommoditySnapshot)
- TASK-1423b (fed_funds_rate row in tracked_indicators)
- TASK-1423c (computeCarryTradeSignal function)

## Blocks

Nothing in Sprint 1423 — this is the integration task.

---

## RETURN

DONE: Extended `formatMacroSnapshot` in `macroTools.ts` to prepend a `[Global Macro Inputs — Thien Thoi]` block — DXY with USD trend label (vs 30d mean), US 10Y Yield, Fed Funds Rate (FRED or est. fallback), VND Carry Spread + regime via `computeCarryTradeSignal()`, and Global Liquidity (majority-voted TIGHTENING/EASING/NEUTRAL); DB queries for `fed_funds_rate` and DXY 30d mean are guarded with try/catch so any DB failure degrades to block omission; zero values render as "unavailable" never "0%"; 10 new tests (6 pure unit + 4 integration) all pass; 16 existing 089-tool-macro tests still pass.
NEXT: qa | verify TASK-1423d acceptance criteria — full [Thien Thoi] block renders
HANDOFF: docs/handoffs/TASK_1423d.md
PIPELINE: continue
