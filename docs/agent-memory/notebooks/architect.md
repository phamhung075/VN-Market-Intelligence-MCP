# Architect — Notebook

**Last updated:** 2026-06-02 15:30 UTC | **Sprint:** BEQ-1-SPIKE

[3 most recent cycles retained below. Archive in git history.]

## 2026-06-02T15:30Z — BEQ-1-SPIKE (BCTC extraction quality symptom-to-layer findings)

**Brief:** `docs/architecture-briefs/2026-06-02-beq1-symptom-layer-findings.md`

Three symptoms pinned, all to apps/mcp-server/ only, zero pdf-extractor changes needed.

**Layer pins (one line each):**
- (a) EMPTY CTG/VCB → **Refine-trigger**: OCR present (CTG 2 pages, VCB 72+54 pages),
  `refined_units=0`, `refine_status=PENDING` for all three reports. Fleet cron never
  dispatched. PUB-1 gate blocks get_bctc_full. CTG has extra blocker: cover-letter PDF.
- (b) ZEROED secondary FPT/ACB → **Scalar-mapping**: `bctcScalarAggregator` ScalarAggregate
  has 10 fields, missing operating_profit/cash/eps/ebitda/cf. Code-30=2.75T and code-110=
  7.99T are in bctc_table_rows but never read by the aggregator. Garbage from initial
  storeReport regex persists permanently.
- (c) GARBAGE /docs scalars → **OCR-extractor + no serve guard**: LIST_SQL has no
  refine_status filter; net_profit is read directly from financial_reports where PENDING
  rows hold storeReport regex output (CTG=5, EIB=1, VNM=5.1e-05).

**Raw values confirmed by direct DB query (bun /app/data/market.db via docker exec).**

**Fix sequence for PM:** BEQ-4b (XS, no-risk YoY guard) → BEQ-4a (XS, /docs null guard)
→ BEQ-2 (S, refine trigger audit) → BEQ-3 (M, full ScalarAggregate column audit).
BEQ-5 (CTG PDF fetch) is prerequisite for CTG; separate backlog item.

**Recurring-bug note:** bctcScalarAggregator.ts ≥5 fix commits → escalation-eligible.
BEQ-3 must be full column audit pass, not another incremental patch.

---

## 2026-06-02T12:00Z — COWORK-LEADER-SELFLOCK (leader-lock self-blocking fix)

**Brief:** `docs/architecture-briefs/2026-06-02-cowork-leader-selflock.md`

**Defect:** Step 0b re-claims a still-heartbeated leader lock. `task_claim` is not
re-entrant → returns `claimed:false` even for own-held lock → Step 0b silently exits
→ guaranteed slots dropped. Confirmed: chef-morning dropped 2026-06-02 (05:18Z tick
hit lock heartbeated to 05:34Z by the 05:03Z WON tick).

**Discriminator decision: `owner_session` via heartbeat probe, NOT `owner_agent` literal.**
Rationale: `owner_agent="cowork-dispatcher"` is a shared string — both concurrent sessions
would see own-held and both proceed, re-opening dup-spawn hole. `task_heartbeat` is
guarded server-side with `AND owner_session=<pid-bound-token>` → only the holding OS
process gets `ok=true`. The flow does not need to know its own session token.

**Fix logic:** After `claimed=false`, call `task_heartbeat("cowork-leader")`. If `ok=true`
→ own-held → renew and proceed. If `ok=false` → peer-held → silent-exit (unchanged).
Step 4.6b heartbeat stays; peer-held silent-exit stays. One-file edit (Step 0b only).

**Two-concurrent-session safety:** Session B's heartbeat hits owner_session mismatch
→ `changes=0` → `ok=false` → peer-held path. Phase-2 dup-spawn protection intact.

**Recurring-bug note:** Root cause = assumption that `task_claim` is re-entrant (wrong)
+ 1800s TTL > 900s inter-tick gap with no observability on silent-exit. Observability
gap flagged in brief §8 for PO backlog.

---

## 2026-06-02T10:45Z — FE-REROUTE-REAL-DATA (FE pages serving real data)

**Brief:** `docs/architecture-briefs/2026-06-02-fe-reroute-real-data.md`

**Per-dataset availability verdicts:**
- Kinh Dich reading: REAL-REACHABLE — `kinhdich_readings` in DB, `getLatestReading()` exists
- Kinh Dich market: REAL-REACHABLE (derived) — aggregate from watchlist readings, `derived:true` flag
- Stock price history: REAL-REACHABLE — `daily_ohlcv` table, existing `priceQueries.ts` pattern
- Stock price batch: REAL-REACHABLE — `market_prices` + `daily_ohlcv` fallback + `agent_signals` count
- News (Reuters/Bloomberg): REAL-REACHABLE — `rag_analyses` table, reuse `newsFetchLiveHandler` query
- TA indicators: HONEST UNAVAILABLE — no cache in mcp-server; frontend already handles `ta=null` gracefully

**Key design decisions:**
- 5 new REST endpoints on mcp-server under `/mcp/api/` namespace
- api-gateway `HandleProxy` gains not-deployed branch: routes `kinh-dich`/`stock`/`news` to mcp-server with path rewrite
- New primitive `not-deployed-rerouter/reroute.go` for path rewriting (pure, testable)
- `NOT_DEPLOYED_SERVICES` env var drives the set — restoring a real service = env var edit, no code change
- SSOT from `system-map.json .not_deployed_short_keys`; not hardcoded in Go

**Critical risks flagged:**
- R-1: VNINDEX actual code in `daily_ohlcv` must be verified before assuming `WHERE code='VNINDEX'`
- R-6: DDD footgun — route handlers must NOT call domain `kinhDichReading.ts` live per request

**Phase 1 (Kinh Dich + prices):** 12 tasks FE-RR-1..12 + QA-1. Sequential: mcp-server → api-gateway → rebuild → QA.
**Phase 2 (News + DB page):** 5 tasks FE-RR-13..17 + QA-2. After Phase 1 green.

---
