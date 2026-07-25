# Developer — Notebook

**Last updated:** 2026-07-25 | **Cycle:** FIX-FB-GATE-POINT-PCT-MATH (fb-gate Check-H index point-vs-pct math consistency, zone-routed generic developer)

## Session 2026-07-24 — FACTORY-NEWS-go-server-tier-split — REVIEW

**Task:** `apps/news-fetch/cmd/server/main.go` (254L, `package main`) mixed the HTTP handlers (`handleHealth`/`handleRSSFetch`/`handleFetchAll`) with env-read/store/fetcher wiring. Two hardcoded fetch-limit `20` literals + a hardcoded `"port":5008` duplicating the env-resolved `port` var. Board row was branch:null direct-execute (BOUNDED-1 auto-pickup). Zone-routed to `developer` (no `dev-news-fetch` specialist exists in `system-map.json`).

**Actions taken:** New `internal/httpapi/{router.go,handlers.go}` — `Router(fetchers Fetchers, s *store.Store, logger *slog.Logger, port string) *chi.Mux` wires the 6 routes; moved `handleHealth`/`handleRSSFetch`/`handleFetchAll`/`fetchResult`/`writeJSON` verbatim. `main.go` now 138L — env reads, `store.Open`, fetcher construction, `Router(...)`, graceful shutdown only. Added `envInt("RSS_MAX_ITEMS", 20)`, passed to both `NewVnEconomyFetcher`/`NewVnExpressFetcher` (was bare `20` each). `/health`'s port field now `strconv.Atoi(port)` of the resolved env var (kept `int` type per `api/openapi.yaml`'s `port: integer` schema — not a string).

**Verification:** `go build ./...`/`go vet ./...`/`gofmt -l` all clean on the 3 touched files. `go test ./...` 2/2 packages pass (no regressions; httpapi has no dedicated test file — handlers are pure relocations). RAW-verify: ran the built binary locally (`PORT=15008 RSS_MAX_ITEMS=7`) — `/health` returned `"port":15008` (proving derivation, not the old literal), `/vneconomy/fetch`+`/fetch/all` hit live vneconomy.vn/vnexpress.net RSS feeds and persisted 13/7 real rows into `rag_analyses` (confirmed via `sqlite3`), `/newsapi`+`/vps` unchanged deterministic zero-insert shape. grep-verified 0 residual bare `20` (only `const defaultRSSMaxItems = 20`) and 0 residual `5008` literal in any JSON path (only in the legitimate `envStr("PORT","5008")` fallback).

**Board:** `task_board.in_progress[FACTORY-NEWS-go-server-tier-split]` → `review`, `.head` synced to idle (`next_agent:router`), via `orch-apply.sh`.

**Scope discipline:** Touched exactly `main.go` + the 2 new `internal/httpapi` files named in the task's DO list. `rebuild_required=true` — Go binary changed; code-only landed, no `docker compose up --build` run (user-gated).

Zone health: no drift detected

## Session 2026-07-25 — FIX-DOWJONES-STALE-WRONG-VALUE — REVIEW

**Task:** Backlog's `zone: apps/macro-indicators/` tag was stale — verified the Go macro-indicators service has zero dow_jones references; real code is `apps/mcp-server/`. Live-verified root cause via `docker exec` into the named-volume DB: `tracked_indicators` dow_jones rows are news-mined garbage (10604/23750/23807/48221/76848, no ceiling gate) AND `get_system_status`'s "Auto-tracked Indicators" ran its own unguarded latest-row query serving 23750 as current (report 3237) — a separate bug from the already-shipped DSI-MACRO-PHANTOM-STALE-GUARD (only covers `buildMacroSection`).

**Actions taken:** New `infrastructure/db/indicatorPlausibility.ts` — shared, generic `isPlausibleIndicatorValue()` band gate (dow_jones 25000–60000) used by every `tracked_indicators` writer; `commodityTracker.ts` delegates to it (other indicators' bounds preserved byte-identical). Retired the dow_jones news-mining regex (precedent: brent's backlog-921 removal); `yahooFinance.ts` gained `fetchDowJonesIndex()`(live `^DJI`)+`storeDowJonesIndex()` (fail-closed, dedup-before-insert), wired into `commodityTrackerRefreshJob.ts` Block 3 (own try/catch, zero-arg production call site already picks it up — no scheduler change). `systemTools.ts` switched to the proven `listTrackedIndicatorsFromDb()` — stale rows now tagged `[STALE]`, generic across all indicators. Added dow_jones to audit-layer `INDICATOR_RANGES` (defense-in-depth).

**Verification:** New `FIX-DOWJONES-STALE-WRONG-VALUE.test.ts` 15/15 pass (band accept/reject on the literal phantom values, news-mining retirement, live fetch parse, fail-closed store + dedup, `[STALE]` tag). Extended `1920c-commodity-tracker-refresh-job.test.ts` +3. Full targeted+adjacent suite (7 files touching every changed module) 68/68 pass. `bun tsc --noEmit` clean. Simplicity-gate self-caught scope creep — trimmed 3 speculative ceiling additions (sp500/nasdaq/vnindex) not required by this AC. Full monorepo `bun test` kicked off as an extra background check but stalled/did not complete in-session (unrelated pre-existing suite characteristic, not this diff — every directly-dependent file already green); noted transparently, not claimed.

**Board:** `task_board.in_progress[FIX-DOWJONES-STALE-WRONG-VALUE]` → `review` (`next_agent:qa`), `.head` synced to idle, via `orch-apply.sh`. `REBUILD_REQUIRED: true` — live container swap + 2 elapsed daily-cron cycles needed for the LIVE-across-2-cycles portion of the verification_gate; ops-gated, flagged not fabricated.

Zone health: no drift detected

## Session 2026-07-25 — FIX-FB-GATE-POINT-PCT-MATH — REVIEW

**Task:** `scripts/fb-data-integrity-gate.sh` had no check for a post stating both a point delta ("giảm X điểm") and a % delta ("(±Y%)") for the same VN index that were internally inconsistent — lesson L2 (06-19): post said "giảm 0,32 điểm (−0,32%)" when −0,32% at that day's level is actually ≈ −5,9 điểm. Zone `cross-service/` — outside every dev-* zone, handled directly. Ticket minted "Check-F" (06-20), before letters F (currency-unit guard) and G (structural validator) shipped and claimed those letters.

**Actions taken:** New Check-H — BLOCKs when |stated point delta − pct×prev_close| > `POINT_PCT_MATH_TOLERANCE` (new header const, 1.0 index points). prev_close derived from the live snapshot only (`close/(1+changePct/100)`), never hardcoded. Generic `INDEX_ALIASES` mapping (VN-Index/VN30/HNX-Index/UPCOM) — new indices participate by adding one alias entry, check logic never names a ticker. `FETCH_TICKERS` widened to always include the 4 standard index codes.

**Verification:** RAW fence (both injected fixtures, pre-fetched snapshot file, no network dependency) — prev_close=1800: `'giảm 0,32 điểm (−0,32%)'` → `[BLOCK] Check-H point-pct-math: ... delta=5.44 > 1.0pt tolerance`, exit 1; `'giảm 5,90 điểm (−0,32%)'` → `[PASS] fb-data-integrity-gate: 0 violations`, exit 0. RED confirmed via `git stash`: pre-fix script falsely PASSed the inconsistent fixture. Regression: real `docs/social/fb-post-2026-07-24.md` (VN-Index −13 điểm/−0,78%) + matching live snapshot → 0 violations; same file with live API unreachable → graceful skip. `bash -n` + `shellcheck` clean.

**Board:** `task_board.in_progress[FIX-FB-GATE-POINT-PCT-MATH]` → `review` (`next_agent:qa`), `.head` synced to idle (`next_agent:router`), via `orch-apply.sh`.

**Scope discipline:** Touched exactly `scripts/fb-data-integrity-gate.sh` (single file per task). `rebuild_required=false` — shell script, no container rebuild gate.

Zone health: no drift detected
