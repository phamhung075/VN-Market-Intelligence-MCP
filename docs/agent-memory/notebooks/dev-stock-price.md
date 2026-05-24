# dev-stock-price — Notebook

Zone: `apps/stock-price/` | Stack: Go 1.22 (CGO — mattn/go-sqlite3) | DB: stock_price.db (write WAL) + market.db (read-only WAL)

## Session 2026-05-24 — P2-F G5a git mv _deprecated + FetchPriceUseCase rewire DONE

### What shipped (P2-F)

`git mv` pkg/domain/services.go → pkg/domain/_deprecated/services_v1.go (history preserved).
`git mv` pkg/domain/services_test.go → pkg/domain/_deprecated/services_v1_test.go.
Both deprecated files annotated with `//go:build ignore` (circular-import prevention).

Rewired `FetchPriceUseCase`: removed `*domain.ResolvePriceService` dependency; now depends on
`PriceResolverPort` interface (defined in pkg/application/) satisfied by `*PriceResolutionModule`.
`cmd/server/main.go` composition root wires `priceresolution.New()` directly.
`usecases_test.go` + `router_test.go` updated to use `mockResolver` (no deprecated service).

**All 6 ACs PASS:**
- AC-1: git mv confirmed; originals gone; FOUND in _deprecated/
- AC-2: grep → 0 matches for ResolvePriceService in usecases.go
- AC-3: go build ./... exit 0
- AC-4: golangci-lint run: 0 issues, all fences intact
- AC-5: sandbox total=11 pass=11 fail=0 status=OK
- AC-6: _deprecated/ directory confirmed with both files

**Commit:** `6225f926` — `chore(stock-price): P2-F — git mv ResolvePriceService → _deprecated/ + FetchPriceUseCase rewire (G5a)`

**Signal:** `docs/signals/dev-sp-P2-F-git-mv-done-20260524T003755Z.json`

**Files staged (L84 explicit):**
- CREATE: `apps/stock-price/pkg/domain/_deprecated/services_v1.go` (moved + build-ignored)
- CREATE: `apps/stock-price/pkg/domain/_deprecated/services_v1_test.go` (moved + build-ignored)
- MODIFY: `apps/stock-price/pkg/application/usecases.go` (PriceResolverPort + rewire)
- MODIFY: `apps/stock-price/pkg/application/usecases_test.go` (mockResolver)
- MODIFY: `apps/stock-price/pkg/interface/http/router_test.go` (mockResolver)
- MODIFY: `apps/stock-price/cmd/server/main.go` (priceresolution.New() wiring)

**Anchor:** `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor (merge-base exit 0).

**State for P2-G:** FetchPriceUseCase is now fully wired to the module tier. Next: QA G5b/G5c audit.

## Session 2026-05-24 — P2-B Depguard Fence-A/B/C + CI job DONE

### What shipped (P2-B)

Created `apps/stock-price/.golangci.yml` with THREE named depguard rules (fence-a/b/c), `run.timeout: 120s`, 73 lines. Added CI job `stock-price-go-lint` to `.github/workflows/ci.yml`.

**Key fix:** Fence-C requires `mattn/go-sqlite3` blank import only in `cmd/server/main.go`. Moved `_ "github.com/mattn/go-sqlite3"` from `pkg/infrastructure/fetchers.go` → `cmd/server/main.go` (composition root). Infrastructure package now uses `database/sql` with driver name string only — no direct mattn import.

**All 5 ACs PASS:**
- AC-1: `.golangci.yml` created, 73 lines, 3 named fence rules, `run.timeout: 120s`
- AC-2: `golangci-lint run` exits 0, 0 issues
- AC-3: CI job `stock-price-go-lint` wired (golangci-lint-action@v6.1.1, working-directory: apps/stock-price)
- AC-4: `d5ce886e` is most recent commit on `.golangci.yml` (freeze anchor established)
- AC-5: sandbox total=11 pass=11 fail=0 status=OK exit 0

**Commit:** `d5ce886e` — `feat(stock-price): P2-B golangci depguard fence (Fence-A/B/C) + CI stock-price-go-lint job`

**Signal:** `docs/signals/dev-sp-P2-B-done-20260524T000539Z.json`

**Files modified:**
- CREATE: `apps/stock-price/.golangci.yml`
- MODIFY: `.github/workflows/ci.yml` (added stock-price-go-lint job)
- MODIFY: `apps/stock-price/cmd/server/main.go` (added blank import for Fence-C)
- MODIFY: `apps/stock-price/pkg/infrastructure/fetchers.go` (removed blank import from infra)

**State for P2-C (QA):** Fence-A/B/C are live, lint is GREEN. QA will deliberately introduce a Fence-A violation in a temp branch to prove the linter catches it (reverted-never-committed).

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
