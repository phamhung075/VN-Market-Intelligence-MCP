# Developer — Notebook

**Last updated:** 2026-07-24 | **Cycle:** FACTORY-NEWS-go-server-tier-split (news-fetch Go server handler extraction, zone-routed generic developer)

## Session 2026-07-24 — FACTORY-NEWS-fix-source-logging — REVIEW

**Task:** `apps/news-fetch/src/module/news_ingest/index.ts` `ingestHeadlines(_source, ...)` ignored its `source` param and unconditionally emitted BOTH `[reuters/headlines]` and `[bloomberg/headlines]` `console.warn` in every RSS-fallback branch — a Bloomberg ingest printed spurious Reuters log lines and vice-versa. Zone-routed (no dev-news-fetch specialist).

**Actions taken:** RED test first (2 new tests in `index.test.ts` — capture `console.warn`, assert tag matches the actual source, confirmed failing pre-fix). Fix: renamed `_source`→`source` (now used), value-imported `NewsSource` (was type-only, needed at runtime for the enum compare), computed `tag` once (`source===NewsSource.REUTERS ? '[reuters/headlines]' : '[bloomberg/headlines]'` — confirmed exactly 2 enum members in `domain/models.ts`), collapsed 3 duplicated warn-pairs (6 calls total — task text said 4 pairs, actual grep count was 3) to 3 single `console.warn` calls. Control flow byte-diffed unchanged. Also updated 3 pre-existing source-text-scan assertions in `__tests__/fix-reuters-url-bloomberg-timeout.test.ts` that hardcoded the buggy reuters-prefixed literal — now check the source-agnostic message body (same text), since the hardcoded tag was literally the bug being fixed.

**Verification:** `bun test` 235 pass/0 fail/6 skip (was 233/0/6, +2 net new). `bun tsc --noEmit` 0 errors. `eslint lint:ci --max-warnings 0` clean. `bun run sandbox --tier=all --module=news-fetch` 16/16 PASS. Security clause: env grep for DB_/API_KEY/SECRET/TOKEN/PASSWORD/NEWS_API_KEY returned no credential matches.

**Board:** `task_board.in_progress[FACTORY-NEWS-fix-source-logging]` → `review`, `.head` synced to idle, via `orch-apply.sh` (dispatcher-owned commit, not committed by this cycle).

**Scope discipline:** Touched exactly the target file + its unit test + the one pre-existing regression test whose assertions encoded the bug's premise. Code-only landed per task constraint — `rebuild_required=true` but PENDING-USER-GATED, no docker rebuild performed.

Zone health: no drift detected

## Session 2026-07-23 — FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION — REVIEW

**Task:** `auditor-tier1-probe.sh`'s launchd check (fixed same day, FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN, to check exit-status not just presence) started returning `FAILURE` EVERY ~30min Tier-1 tick because 2 already-tracked dead backstops persist: `com.vn-market.docker-events` (exit-1, `FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP`) + `com.vn-market.fleet-push` (exit-78, `FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD`) — fail-opening the passive-health guard into spawning a full system-auditor subagent ~48x/day for zero new signal.

**Actions taken:** New ACK LEDGER `docs/data/auditor-launchd-ack.json` (`{acked:[{label,tracked_by,acked_at}]}`, live-seeded with both entries). `_check_launchd_agents` in `scripts/agents-flow/auditor-tier1-probe.sh` now label-exact-matches each unhealthy launchd label against the ledger — acked labels report "acknowledged" instead of "bad"; if EVERY unhealthy label this pass is acked, the check still PASSes (verdict stays `ALL_GREEN`, detail names the acked labels for transparency). A new/unacknowledged label always still fails, even mixed with acked ones. Chose the ALL_GREEN-remap (not a new verdict enum) — the live-registered Tier-1 cron prompt already treats `ALL_GREEN AND heartbeat<=60min` as skip-eligible, zero prompt/re-arm change needed. New `LAUNCHD_ACK_PATH` test seam mirrors the existing `LAUNCHD_DIR_PATH` pattern.

**Verification:** `auditor-tier1-probe.test.sh` extended with a default nonexistent-ledger seam (kept T1-T35 byte-identical — first confirmed 102/102 baseline green BEFORE adding new tests, since the real ack ledger would otherwise silently flip T33's fleet-push-exit-78 fixture to ALL_GREEN) + T36-T39 (acked-only→ALL_GREEN, mixed acked+new→FAILURE, ledger-present-but-uncovered→FAILURE, all-healthy+ledger-present→ALL_GREEN no false noise) — 120/120 total PASS. Live-verified against the real running system: `bash scripts/agents-flow/auditor-tier1-probe.sh` now returns `ALL_GREEN` with both acknowledged labels named in `detail` (previously `FAILURE` every tick).

**Board:** `task_board.in_progress[FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION]` → `review`, `next_agent=qa`, `.head` synced to idle, via `orch-apply.sh` (separate commit).

**Scope discipline:** Touched exactly the new ack ledger + probe script's Check-6 function + `run_probe`'s detail-line assembly + paired test + `WORK.md`/journal/notebook. Did NOT touch the heartbeat-write/freshness code paths (constraint #2) — verified T31/T32 (tier-2/3 stale-heartbeat dead-branch tests) still green, proving zero collateral change there. Did NOT touch `cron-detect-loop/register.md` (ALL_GREEN-remap choice makes that unnecessary).

Zone health: Tier-1 probe no longer churns a full system-auditor spawn on 2 known, already-owned launchd deaths; ack ledger is a live, hand-edited SSOT with an explicit staleness rule (remove entry at DONE_VERIFIED) so this can never become a permanent blind spot | HEALTHY

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
