# dev-stock-price — Notebook

Zone: `apps/stock-price/` | Stack: Go 1.22 (CGO — mattn/go-sqlite3) | DB: stock_price.db (write WAL) + market.db (read-only WAL)

## Session 2026-05-24 — P1-E Edit-Rerun Handler + Env Audit DONE

### What shipped (P1-E)

Modified `apps/stock-price/dashboard/index.html` — replaced placeholder alert() with full rerun panel.

**All 6 ACs PASS:**
- AC-1: "Edit & Rerun" panel — paste-apply NDJSON handler updates scenario status dots live
- AC-2: `CGO_ENABLED=0` shown explicitly in command block before `go run` invocation (file:// safe, no exec())
- AC-3: env audit note in panel; `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` verified empty in dev env
- AC-4: `grep -rn "mattn/go-sqlite3" primitive/ module/ cmd/sandbox/` = 0 actual imports (exit 1)
- AC-5: edited price-quote-normalizer-golden.json rawPrice 85000→70000 + expectedOutput.price→70000; sandbox pass=9/9 exit 0; restored golden
- AC-6: sandbox -tier=primitive pass=9/9 exit=0; -tier=module pass=2/2 exit=0 (G12 DoD gate satisfied)

**Sandbox output (G12 final gate):**
```
primitive: total=9 pass=9 fail=0 status=OK exit 0
module:    total=2 pass=2 fail=0 status=OK exit 0
```

**Commit:** `8c8edbf1` — `feat(stock-price): P1-E edit-rerun handler + zero-creds env audit (G7/G8)`

**Signal:** `docs/signals/dev-stock-price-p1-e-done-<UTC>.json`

**Key design decisions:**
- Rerun panel is file:// safe: no fetch(), no WebSocket, no exec() — user runs sandbox command in terminal, pastes NDJSON output into textarea
- NDJSON parser handles both JSON log lines (`{"msg":"PASS","scenario":"..."}`) and summary line (`total=N pass=N fail=N status=X`)
- Reset-to-NOT-RUN button satisfies G8 honest-cold-start contract
- Escape key priority: rerun panel closes first, then scenario modal (layered z-index 200 vs 100)

**State for P1-F/P1-G:**
- G7 trust contract implemented (edit → rerun → paste → dashboard live)
- G8 advanced (honest red/green contract demonstrated + reset-to-not-run)
- All 9+2 scenarios remain GREEN
- P1-G (QA close-gate) is next sequenced task

## Session 2026-05-24 — P1-D Dashboard DONE

**Commit:** `7329180b` — `feat(stock-price): P1-D G6 trust dashboard (3-panel, file://, honest NOT-RUN)`

**Signal:** `docs/signals/dev-stock-price-p1-d-done-<UTC>.json`

3-panel self-contained file:// dashboard: Level 1 Primitives (9 scenarios), Level 2 Module (2 scenarios), Level 3 Microservice info. G8 NOT-RUN honest cold start. All data embedded inline, zero CDN, zero fetch.

## Session 2026-05-24 — P1-C price_resolution module DONE

**Commit:** `e98179f9` — `feat(stock-price): P1-C price_resolution module + Fence-B`

Module stub: `pkg/module/price_resolution/` — composes 3 primitives via TierFetcher port. 8 unit tests. Fence-B clean (zero infra imports). Sandbox 11/11 PASS (9 primitive + 2 module).

**FetchedAt rebinding pattern:** scenario "now" used to compute age; rebind FetchedAt relative to real wall-clock so ClassifyStaleness produces expected label deterministically.

## Session 2026-05-24 — P1-B1/B2/B3 + P1-A Primitives + Sandbox DONE

**Commits:**
- P1-A: `afe3468b` — sandbox runner (CGO_ENABLED=0, flag parser, discovery)
- P1-B1: `69afa2ab` — price-quote-normalizer primitive + R-CGO gate CLEAR
- P1-B2: tierfallback-selector primitive (Fence-A clean)
- P1-B3: price-staleness-classifier primitive (Fence-A clean)

All 3 primitives: stdlib-only (no CGO, no infra). R-CGO gate: CLEAR (CGO_ENABLED=0 build exit 0, grep=0 imports). Sandbox 9/9 PASS.

## Session 2026-05-22 — 1971-STOCKPRICE-SCAN-ORDER-MISMATCH SHIPPED

Fixed SQLite Scan order transposition (close=0 bug). **Commit:** `bc515ab2`. TestSQLiteRepo_GetHistory_OHLCFieldParity added. 8 infra tests PASS.

## Session 2026-05-14 — 1912c Go Cutover COMPLETE

Full cutover from Bun/TS to Go 1.22 (CGO). 31/31 go tests PASS. Signal: `docs/signals/20260514T181854Z-1912c-cutover-complete.json`. TS fully retired.
