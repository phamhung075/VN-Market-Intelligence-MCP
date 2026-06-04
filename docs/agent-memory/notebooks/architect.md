# Architect — Notebook

**Last updated:** 2026-06-04 19:30 UTC | **Sprint:** DATA-SERVE-INTEGRITY (DSI-ARCH)

[3 most recent cycles retained below. Archive in git history.]

## 2026-06-04T19:30Z — DSI-ARCH: DATA-SERVE-INTEGRITY brief + per-zone split

**Brief:** `docs/architecture-briefs/2026-06-04-data-serve-integrity.md`
**Handoff:** `docs/handoffs/DSI-ARCH.md`

**Fleet invariant defined (DSI-INV-1):** No served macro/price/financial value may be a hardcoded substitute presented as live. Fallback = FAIL-LOUD OR carry-forward with per-field source_tier + true fetched_at (never re-stamped) + is_estimate that propagates fetcher → DB → tool output → TS type → render.

**Regression root-cause confirmed:**
- `macroIndicatorSla.ts:35,73` queries `country='VN'` — dead since commit 7a0adfdc (1923a, 2026-05-17) which moved active writer to `'vietnam'`.
- `freshnessSlaChecker` always returns false (no row found) → SLA alert never fires.
- Domain fetcher (`macroIndicatorFetcher.ts`) writing `'VN'` is dead code (production path returns `success:false`).
- push-gso HTTP endpoint (server.ts:1435,1520) defaults to `'VN'` — may write rows if VPS omits country.
- `usecases.go` allLive flag covers only oil/gold/usdVnd, NOT carry/yield — fixture fed/deposit invisible in dataSource.

**Per-zone split:**
- dev-mcp-server: S1-SLA (XS, first), S1-FE-TYPE (S), S2-PRICE client side (S), S3-SECTOR-FIN (L, P2)
- dev-stock-price: S2-PRICE service side (M) — Staleness field missing from FetchPriceResponse DTO
- dev-macro-indicators: LATENT LANDMINE (not deployed, backlog only)

**Sequence:** DSI-S1-SLA first (restores detection net) → DSI-S1-MACRO + DSI-S1-FE-TYPE → DSI-S2-PRICE → DSI-S3-SECTOR-FIN.

**Next agent:** BA-DSI. orch-state.head.next_agent = 'ba'.

## 2026-06-04T10:30Z — FIX-I officer-appointment-year / CEO tenure design

**Handoff:** `docs/handoffs/TASK_FIX-I.md`

**Multi-zone split (relay to pm):**
- Zone A: `vps-scripts/` → dev-vps-crawls — Python scraper + shell loop + systemd, mirrors FIX-G agm-plan pattern exactly; serves via VPS:8765/proxy/board-details.
- Zone B: `apps/mcp-server/` → dev-mcp-server — extend `vnstock_officers` with `appointment_year INTEGER` nullable column (ALTER TABLE migration); new `boardDetailsFetcher.ts` + `boardDetailsStore.ts` + `boardDetailsJob.ts` (all mirror agmPlan counterparts); extend `companyProfileTools.ts` to surface `appointment_year` + `ceo_tenure_years` on every `OfficerEntry`.

**Key design decisions:**
- EXTEND `vnstock_officers` (not new table): avoids name-mismatch JOIN orphans; single-table read in get_company_profile preserved; UPDATE-only in store (not INSERT OR REPLACE) to preserve VCI-sourced own_percent/quantity columns.
- Only current-term (page=1) appointment year stored — no historical term pagination.
- `appointment_year=null` for N/A entries; `ceo_tenure_years=null` propagated honestly (no fabrication).
- BUILD-STANDARD: lean (existing service, new feature).

**Sprint close gate:** FIX-I is the last open core item of RAPID-DATA-LAYER. Ship + router raw-verify `get_company_profile("FPT").officers[0].appointment_year=1988` → sprint closes.

---

## 2026-06-04T06:00Z — RAPID-ANALYSIS-DATA-LAYER-GAPS brownfield analysis

**Brief:** `docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md`

**Verdict:** All 6 skills BLOCKED. COVERED 3 / PARTIAL 12 / GAP 22 (of 37 assessed fields).

**Five root causes:**
- RC-1: `VnstockRatioSummary.marketCap` defined in `vnstockBridge.ts:82` but never stored — no market_cap MCP tool
- RC-2: `get_bctc_full` single-period only (no `years` param) — no multi-period series for P/E history, CFO, EPS
- RC-3: `get_company_info` is a PHANTOM tool — `vnstock_shareholders` + `vnstock_officers` tables exist but zero MCP exposure
- RC-4: `charter_capital`, `investment_property`, `reward_fund` not extracted by BCTC scalar pipeline
- RC-5: `get_price_history` hard-capped at 90 days; SKILL-6 needs 730 days

**10 fixes prescribed (FIX-A through FIX-I + RECON-AGM-1):**
- FIX-B (P1): persist marketCap, new `get_market_cap` tool → dev-mcp-server
- FIX-A (P1): new `get_company_profile` (shareholders+officers) → dev-mcp-server
- FIX-D (P1): extend `get_bctc_full` structured JSON + receivables join → dev-mcp-server
- FIX-H (P1): extend insider lookback 90→180d → dev-mcp-server
- FIX-C (P2): new `get_bctc_series` multi-period tool → dev-mcp-server
- FIX-E (P2): extend price history cap 90→730d → dev-mcp-server
- FIX-F (P3): BCTC scalar extraction for charter_capital/inv_prop/reward_fund → dev-mcp-server
- FIX-G (P4): AGM revenue plans — VPS fetch + store + tool → dev-vps-crawls + dev-mcp-server
- RECON-AGM-1 (P0): ops-vps-fetch probe on HSX/HNX/SSC portals FIRST

**Earliest partial live:** FIX-B + FIX-A + FIX-H → SKILL-1 (size gate only) + SKILL-4 (ownership+insider, no comp-extraction)

**Signal:** written to `docs/signals/architect-20260604T060000Z.json` → pm

---

## 2026-06-03T14:30Z — FU-DE-DECOMP-MAPPING SPIKE (debt decomposition gap)

**Brief:** `docs/architecture-briefs/2026-06-03-bctc-debt-decomposition-gap.md`

**VERDICT: MAPPING GAP (not extraction gap). Rows ARE in bctc_table_rows, never read by aggregator.**

Three root causes confirmed by direct DB queries:
1. `bctcScalarAggregator.ts` ScalarAggregate missing `short_term_debt`/`long_term_debt` fields — BEQ-3 full-column-audit missed them. Codes 321 (FPT) and 319 (VNM) are in bctc_table_rows with correct values (14,491 tỷ and 102 tỷ respectively); aggregator returns null because fields don't exist.
2. `finalizeBctcRefineTool.ts` BLOCK-1 cannot write what aggregator doesn't return.  BLOCK-3 ratio recompute reads the DB zeros → D/E stays null.
3. `balanceSheetExtractor.ts` (OCR path) hardcodes code 311 for shortTermDebt — but live corpus uses 321/319. HPG "short_term_debt=38,729" is actually accounts payable (code 311 = "Phải trả người bán").

**VAS code landscape confirmed:** short_term_debt = code 321 (current) or 319 (older layout, /vay/i hint required); long_term_debt = code 339 (current) or 334 (fallback).

**Fix fanout (4 tasks, all dev-mcp-server):**
- FIX-DE-1 (S): add fields + mappings to bctcScalarAggregator.ts
- FIX-DE-2 (S): wire through finalizeBctcRefineTool BLOCK-1 + balance_sheet_json blob sync (nested keys)
- FIX-DE-3 (XS): corpus re-finalize 5 DONE reports post-deploy
- FIX-DE-4 (XS): fix balanceSheetExtractor OCR path codes 311→321/319

BLOCK-3 requires no change — it already reads debt scalars from DB for ratio recompute.

---

## 2026-06-02T09:30Z — FU-CHEF-MARKER-INFLOW + BEQ-EXTRACT-RESIDUAL (dev-team cron 09:09Z)

**Briefs:**
- `docs/architecture-briefs/2026-06-02-chef-marker-inflow.md` (NEW)
- `docs/architecture-briefs/2026-06-02-bctc-extract-quality.md` (FIX-5 extended)

**Item 1 — FU-CHEF-MARKER-INFLOW (cowork agent-.md contract):**
Two coupled defects. Defect A: published marker is dispatcher-prompt-injected → any
direct spawn bypasses it. Defect B: marker is released after publish (per-execution-lock
semantics) → same-window re-spawn re-acquires and double-publishes.
Root cause: responsibility split — marker lifecycle was assigned to dispatcher side, not
co-located with the operation it guards (`send_telegram`). Wrong semantics: content-dup-guard
must not be released (28h TTL natural expiry), not an execution token (claim/release cycle).
Fix: move `task_claim(published:SLOT_ID:VN_DATE)` into chef.md Step 7a immediately before
MARKET send. Remove task_release on published-marker. BLOCKED_DUP = silent-exit, not error.
Update dispatcher §Step 5 to doc-only comment (no executable claim).
Zone: docs/agents/unified-agent/flow/ + docs/agents/cowork-team/flow/ (doc-only)
Agent: agent-father

**Item 2 — BEQ-EXTRACT-RESIDUAL (layered quality gate):**
DHG-Q1 total_assets=4, SHB-Q4 total_assets=11, EIB-Q1 total_assets=0, VEA-Q4
operating_cf=255T survived balance gate. Root causes: (1) isBankPath discriminator wrong
(corporate balance-sheet-only → misclassified as bank), (2) balance_pass is necessary
not sufficient (5 prior false-greens, confirmed), (3) scale-mismatch heterogeneous units,
(4) zero-row reports silently stranded. Fix = 3 new layers: A) plausibility bounds
(sector-aware magnitude envelope), B) cross-field consistency (OCF/total_assets ratio,
ROA ratio), C) scale coherence nullification. Plus zero-row signal + HPG balance-violation
escalation. Prerequisite: BEQ-8 isBankFormFromRows must ship first.
Zone: apps/mcp-server/ | Agent: dev-mcp-server | Task: BEQ-6

---

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
