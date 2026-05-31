# PO-EXIT Sign-off — MACRO-CMDTY-DELTA

- date: 2026-05-31T01:34Z
- verdict: **APPROVE / SHIPPED**
- role: dev-team :07 PO-EXIT (critique-before-approve; raw-verified, no QA-badge rubber-stamp)
- task: Brent/Gold `change%` permanently stuck at `+0.00%` in `get_cycle_bootstrap` MACRO block

## Root cause (re-routed from the original hypothesis)
The opening BATCH zoned this to `apps/macro-indicators/`. dev-macro-indicators diagnose-first correctly
disproved that (no zero rows; 993 history rows, MIN brent 86.33) and zone-handed-off. dev-mcp-server then
found the REAL cause in `apps/mcp-server/`: Yahoo returns the same daily close repeatedly off-market, and the
old prev-close query `WHERE source='yahoo' AND fetched_at < ? ORDER BY fetched_at DESC LIMIT 1` matched a
~1h-old row with the identical price → `computeDelta(x,x)=0` permanently. The macro-indicators handoff
hypothesis was wrong; the diagnose-first / zone-handoff discipline was right.

## Fix
`apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts` — prev-close now uses the previous-calendar-day
latest row: `AND date(fetched_at) < date(?) AND brent_crude_usd > 0` (and `gold_usd_per_oz > 0`). Day-over-day
delta is now always meaningful; the `> 0` guard skips any zero-valued bootstrap rows.

## What I independently verified (RAW — not a QA badge)
1. **Live `get_cycle_bootstrap`**: MACRO = `BRENT 91,12 (+0.00%)` / `GOLD 4.593 (+0.00%)`. This is a
   **verified-honest zero** — prices are genuinely flat (last analysis 2026-05-31 01:15Z, unchanged since
   2026-05-30, weekend market closed), not a stuck delta. I am signing off on verified-honest-0.00%.
2. **Production fix logic**: inspected the diff in `yahooFinance.ts` — the query change is exactly as claimed
   (`fetched_at < ?` → `date(fetched_at) < date(?) AND brent/gold > 0`).
3. **Tests green, not neutered**: ran `bun test DPI-3-commodity-delta.test.ts` myself → 4 pass / 0 fail.
   Assertions are REAL non-zero deltas: change_pct 25.0 / -20.0, change_amt 20 / 500 — no neutering. The
   "unchanged 100→100 → 0" test uses same-day timestamps and correctly asserts honest zero (consistent with
   the new prev-day query).
4. **Git scope clean**: `git show --stat dab1bf86` = exactly 1 file
   (`DPI-3-commodity-delta.test.ts`, 3+/3-) — test-only. `yahooFinance.ts` untouched since e510e5df.

## Ship facts
- Commits: **e510e5df** (prod fix + YF-14/YF-15 regression tests) · **dab1bf86** (test-only cross-day shift) · **fdc17265** (dev notebook)
- Production image: **802d6463e665** (ops rebuilt + force-recreated; healthy, 12-service fleet healthy)
- Fleet suite 10153 pass / 346 fail = pre-existing baseline drift, zero overlap with commodity/delta modules
- Live tool count = **155** (= baseline). dev's "157" was a mis-report, NOT a regression.

## Follow-up (non-blocking)
Confirm a signed **non-zero** Brent/Gold `change%` in `get_cycle_bootstrap` on the next real calendar-day move
(next trading session, ~Monday open). The fix is correct; in-the-wild signed-delta proof only appears when
prices actually move.

## Ledger closed
- `docs/TASKS.md` § Sprint MACRO-CMDTY-DELTA → DONE / SHIPPED
- `docs/signals/DASHBOARD.md` row `cow-20260529T221054-MCP-P4` → RESOLVED
- `docs/pipeline-state.json` → lane idle/closed, WIP 0/2
