<!-- size-justification: generated read-only audit artifact (9 lanes × 81 raw findings × 60 verifier agents) — sprint-scoping input for PO, not hand-maintained source. 120L cap N/A. Produced by read-only Workflow audit 2026-06-15T21:xxZ; router-persisted pending PO scoping. NO code modified. -->
<!-- provenance: Workflow runId wf_6824a339-96a — find→adversarial-verify→synthesize; 14 findings dropped on verdict.is_real=false. Aggregate: 81 raw / 50 verified / 29 verified-real / 24 carried (4 P0, 11 P1, 9 P2). -->

# Error-Handling Audit → Cleanup Brief

> **Status: READ-ONLY AUDIT — awaiting PO scoping.** No code was modified. All four P0s below were re-read from disk and confirmed line-for-line. Severities use the verifier's `corrected_severity` where one was set; lead-engineer judgment notes are flagged inline where this brief diverges (PO may down-scope). Findings whose adversarial `verdict.is_real === false` were **dropped** (14 of them — see Appendix).

## Headline

The served-data layers are, on the whole, **disciplined** — most fetchers carry deadlines, most degrade paths are logged, and several files (vnstockBridge banner-suppression, the `/page-text` anti-fabrication contract, `resilientFetcher.ts`) are exemplary. The real damage is concentrated:

- **4 verified P0 data-masking bugs** — 3 on the pdf-extractor PEK path (a crashed layout/OCR model served as a successful 0-row extraction), 1 on the served system-status line every cowork agent reads (`status="ok"` hardcoded over three swallowed DB queries).
- **Two systemic P1 classes**: (a) unbounded fetches with no `AbortSignal` — a HANG starves the well-written degrade path; (b) destructuring/parser defaults that fabricate a real-looking value (`0`, `1.0`, `neutral`) on error.
- The whole long tail collapses into **~6 shared helpers**. The duplication *is* the bug: the missing macro timeout leaked into 8 sites at once because there was no `macroFetch`; the frontend timeout + logging gaps each exist in ~55 places because there is no `safeFetch`.

| Bucket | Count |
|---|---|
| Lanes audited | 9 |
| Raw findings | 81 |
| Dropped (verdict.is_real=false) | 14 |
| **Carried** | **24** |
| → P0 | 4 |
| → P1 | 11 |
| → P2 | 9 |
| Shared helpers proposed | 6 |

---

## P0 — Masks real served data on a live path (Wave 1)

Each re-read from disk and confirmed.

| ID | File:Line | Antipattern | Class | What breaks |
|---|---|---|---|---|
| pdf-extractor-02 | `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:668` | parser-fails-closed | BCTC silent-0-rows | Layout-detection crash (OOM/native-lib fault on the 8GB host) is logged at 668-673 then **continues** with empty `pages_bboxes` → `total_pages=0` (687), `units_in_map=[]` (700). Caller pushes a fully-formed result dict as a **successful** extraction. A model CRASH is indistinguishable from a PDF with no tables. |
| pdf-extractor-03 | `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:342` | parser-fails-closed | BCTC silent-0-rows | PaddleOCR PP-StructureV2 load fails → warning only, `paddle_table` stays `None`. The `if paddle_table is not None` guard at **717** then silently skips table extraction; units assemble `row_count=0` with `quarantined=False` → a clean-looking 0-row "pass" (`units_passing==units_total`). Contrast `extract_layout_first_usecase.py:450` which correctly quarantines. |
| mcp-domain-sched-04 | `apps/mcp-server/src/domain/services/marketContextBuilder.ts:417` | destructuring-default-mask | passive-health-masks-dead-data | Three DB queries each swallow (388/390, 401-403, 413-415); line **417 hardcodes `status="ok"` unconditionally**. On a locked/broken DB, every cowork agent reads `ok \| 0 alerts pending \| last alert: unknown` at cycle start — a fabricated healthy status. Consumed by `getCycleBootstrap.ts:105` + `get_market_*`. |
| mcp-interface-03 | `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts:119` | parser-fails-closed | BCTC silent-0-rows served-to-user | `get_ticker_intelligence` (live, `registry.ts:197`) builds 6 sections, **each** a bare logless `catch {}` (119/139/171/206/266/298) returning its Vietnamese no-data default. A SQL error / missing column / schema drift / DB lock renders IDENTICAL to "this stock has no data" — a broken price query shows `Giá hiện tại: (không có dữ liệu)` served to the user as if real. |

---

## P1 — Ungraceful degrade / unbounded fetch / fabricated default (Wave 2)

| ID | File:Line | Antipattern | Class | What breaks |
|---|---|---|---|---|
| mcp-app-03 | `apps/mcp-server/src/application/usecases/scanMarket.ts:120` | destructuring-default-mask | silent-0-rows | `getAvgVolumeSync` `catch{return 0}` — line 115-117 *already* returns 0 for legit insufficient-history, so a DB error collapses to the same 0; downstream `if(avgVol>0)` silently disables every volume-surge signal for that ticker. |
| mcp-infra-06 | `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts:477` | destructuring-default-mask | confidence_score=50 / no-fake-data | `pe=pb=roe=roa=de=npm=0.0`; the except (487-492) only writes stderr on a ratio-column key mismatch → served `roe:0` etc. indistinguishable from genuine zero (a bank with `roe:0` is implausible-but-non-empty). Comment concedes "0.0 as before — acceptable fallback". Verifier: could-not-refute. |
| mcp-app-06 | `apps/mcp-server/src/application/services/imfDataFetcher.ts:136` | parser-fails-closed | contract-from-live-payload / stale-served-as-fresh | `parseImfApiResponse` `catch{return null}`, no log; caller drops the indicator. An IMF API shape change silently shrinks the served indicator set then falls back to stale DB rows at 0.8 confidence — stale-served-as-fresh. Live `imfIndicatorPollerJob` (every 6h). |
| mcp-app-01 | `apps/mcp-server/src/application/services/imfConvictionBridge.ts:91` | destructuring-default-mask | confidence_score=50 | `catch{return 0}` = the literal 'neutral' value; line 71 also conflates no-rows with neutral. Feeds conviction dimension 7 in 3 served tools (`scanMarket:506`, `assembleBriefing:1036`, `portfolioTools:321`). **Verifier corrected_severity=P2**; raised to P1 here as a real served-metric fabrication across 3 tools — PO may down-scope. |
| mcp-app-02 | `apps/mcp-server/src/application/usecases/assembleBriefing.ts:957` | silent-swallow | silent-0-rows on served report | Step-7 macro catch swallows ANY error, no log → `macroSnapshot=[]` served as "no macro indicators". 7 such best-effort catches (957/964/983/1026/1036/1057/1067) each drop a served section. **Verifier corrected_severity=P2**; bundled into Wave-2 `withSection` work. |
| mcp-infra-01 | `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts:216` | unbounded-fetch-hang | bounded-fetch | Geo-blocked VPS-proxied fetch with NO `AbortSignal` — a TCP hang blocks `fetchPublicContracts` indefinitely. Siblings (hose/boardDetailsFetcher/bctcHttpFetcher) all use `AbortController`. |
| mcp-infra-03 | `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts:134` | unbounded-fetch-hang | bounded-fetch | SSC insider portal via Vinahost VPS proxy, NO timeout; VPS proxy is a known slow/wedge point. A hang starves the degrade path. |
| mcp-domain-sched-02 | `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts:41` | unbounded-fetch-hang | bounded-fetch | `fetchFromNewsFetch` native fetch, NO timeout; a stalled upstream hangs the scheduled headlines cycle (the return-null degrade never fires). Siblings `taOhlcvBackfillJob:150`/`deepFetchVpsJob:96` bound at 15s. |
| mcp-domain-sched-03 | `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:165` | unbounded-fetch-hang | bounded-fetch | Production `fetchPdf` native fetch of a large geo-blocked PDF, NO timeout → a stalled download hangs the BCTC pull cron. |
| mcp-interface-01 | `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:446` | unbounded-fetch-hang | F-MACRO-FETCH-DEADLINE | `get_macro_snapshot` (highest-traffic macro tool, `registry.ts:141`) fetch to macro-indicators:5004 with NO deadline. try/catch degrades a connection ERROR to a 200 but a HANG never throws → blows the gateway 60s timeout (false "gateway down"). Verifier corrected P0→P1. |
| mcp-interface-05 | `apps/mcp-server/src/interface/mcp/server.ts:642` | unbounded-fetch-hang | bounded-fetch | `POST /api/trigger-pek-extract` proxies to pdf-extractor:5001 with NO timeout; top-level `handleRequest().catch` fires on a thrown rejection, not a hang → the request boundary blocks indefinitely. |

---

## P2 — Error-context-loss / noisy logs / ad-hoc inconsistency (Wave 3)

| ID | File:Line | Antipattern | Note |
|---|---|---|---|
| pdf-extractor-01 | `apps/pdf-extractor/domain/services.py:91` | destructuring-default-mask | `validate_financial_figures` always called all-None → `confidence_financial` hardcoded 1.0 for EVERY `/extract`; feeds `composite_confidence` signal gating. Verifier corrected P0→P2 (fixed-1.0, not a per-error mask). |
| pdf-extractor-04 | `apps/pdf-extractor/infrastructure/extraction_engine.py:102` | parser-fails-closed | `_extract_tables_sync` bare `except: pass` no log → error and table-less PDF both yield `[]`. Verifier P1→P2. |
| mcp-domain-sched-05 | `apps/mcp-server/src/domain/services/marketContextBuilder.ts:216` | silent-swallow | Three bare `catch{}` (216/240/256) conflate missing-table with real DB error on the cycle-bootstrap MACRO section. Verifier refutation FAILED — holds. |
| mcp-app-08 | `apps/mcp-server/src/application/usecases/scanMarket.ts:175` | silent-swallow | `getThresholds()` failure swallowed → empty Map silently reverts every stock to `DEFAULT_DROP_PCT`. Live alert-scan path. |
| mcp-app-09 | `apps/mcp-server/src/application/usecases/assembleBriefing.ts:1036` | silent-swallow | Dead/redundant outer swallow around the IMF bridge (which already fail-silent-returns-0) — would re-mask if the bridge were fixed to throw. Coupled to mcp-app-01. |
| mcp-infra-11 | `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts:377` | parser-fails-closed | BCTC PDF-discovery `catch → []` no log; a transient hsx.vn 500 / SSL-chain outage is indistinguishable from a non-HOSE empty. Verifier P2 (VPS fallback + enricher retry reduce impact). |
| mcp-interface-04 | `apps/mcp-server/src/interface/mcp/routes/alertsHandler.ts:146` | parser-fails-closed | `parseSignalsJson`/`parseAffectedActionsJson` silent `[]` on malformed stored JSON + `confidence ? : 0` fabricates 0. Live `GET /api/alerts` → dashboard. Verifier P1→P2. |
| mcp-interface-08 | `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts:57` | inconsistent-adhoc | The macro fetch+!ok+catch block hand-copied across 8 sites — the **root cause** of interface-01/02. One `macroFetch` fixes all 8. |
| **frontend-cluster** | `apps/frontend/app/lib/api/client.ts:40` (+ ~60 fetch sites / 55 copied blocks) | unbounded-fetch-hang / inconsistent-adhoc / noisy-log | frontend-01/02/03: not one of ~60 fetch sites has a timeout (loaders fetch the also-unbounded proxies → two unbounded hops). frontend-04: same ~40-line block × 55. frontend-06: ZERO server-side logging in the live frontend. frontend-07: 4 non-fatal wrappers bare-catch to null/[]/{}. *Low fabrication risk, high resilience/observability risk.* (frontend-05 confidence-mask **dropped** — verdict false, dead path.) |

---

## EASY-HANDLE remediation — the shared helper set

The whole tail collapses into six helpers. Each turns dozens of ad-hoc `try/catch` sites into one typed, fail-loud pattern.

### TypeScript

```ts
// 1. The deadline primitive — owns AbortController + setTimeout + clearTimeout + attribution log
withDeadline<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T>
//    throws typed DeadlineError on abort
//    REPLACES: muasamcong:216, sscInsider:134, newsHeadlinesRefreshJob:41(+pushToMcpServer:79),
//              bctcPdfPullJob:165, server.ts:642
//    WHY EASIER: no live fetch/subprocess ships without a deadline < gateway budget; promotes the
//    inline copies already in taOhlcvBackfillJob/deepFetchVpsJob to one util. Closes bounded-fetch.

// 2. The macro-proxy chokepoint — wraps withDeadline + !ok + catch into a discriminated result
macroFetch<T>(path: string, body: unknown, opts:{deadlineMs:number})
  : Promise<{ok:true; data:T} | {ok:false; degrade:DegradeEnvelope}>
//    REPLACES (one edit, 8 sites): macroTools:446, tradeBalance:96, bop:119, liquidityState:137,
//              cpiComponents:95, macroIndicatorsVn:80, dinhGia:56, carry:57+134
//    WHY EASIER: carries the F-MACRO-FETCH-DEADLINE fix everywhere at once; deletes ~25 lines × 8.

// 3. The SQLite read — logs on a THROWN error, distinct from a genuine 0-row result
safeQuery<T>(db, sql, params, ctx): {ok:true; rows:T[]} | {ok:false; reason:'db-error'|'no-rows'}
//    REPLACES: imfConvictionBridge:91 (+ line-71 no-rows conflation), scanMarket getAvgVolumeSync:120,
//              + the wider catch→0/[]/null cluster
//    WHY EASIER: kills the confidence_score=50 class at source — a DB error can no longer collapse to
//    the same number as a real reading; callers DROP the dimension instead of feeding a fake 0.

// 4. The composite-brief section runner — fails loud on error, no-data ONLY on genuine empty
runSection(name: string, fn: () => string, emptyMsg: string): {text:string; degraded:boolean}
//    REPLACES: tickerIntelligenceTools 6 sections (119/139/171/206/266/298)
//    SIBLING:  withSection(name, fn) for assembleBriefing 7 catches (957/964/983/1026/1036/1057/1067)
//    WHY EASIER: a broken query can no longer render identical to "this stock has no data".

// 5. The structured-degrade logger — replaces bare catch { return []|null|0 }
failLoud(logger, err, ctx): <T>(degradeValue: T) => T
//    REPLACES: marketContextBuilder:417 (status), buildMacroSection 216/240/256, scanMarket getThresholds:175
//    WHY EASIER: real failure ≠ legitimately-empty; for marketContextBuilder, status becomes DERIVED
//    from query-success ('degraded: DB read failed') instead of the hardcoded 'ok'.

// 6. Frontend chokepoints (covers the ~55-site cluster)
safeFetch<T>(url, {parse, deadlineMs})  // 26 dashboard loaders
proxyUpstream(upstreamUrl, init)        // 29 api.*.tsx proxies → 504 on abort / 502 on net error
safeFetchOrNull<T>(url)                 // 4 non-fatal client wrappers (preserve null/[]/{} contract)
//    one shared DEADLINE_MS < gateway, one structured console.error per degrade
//    WHY EASIER: fixes timeout + duplication + logging gaps in 3 places instead of 55.
```

### Python (pdf-extractor)

```py
fail_loud_or_tag_degraded(result: dict, status: str) -> dict
#   re-raise OR stamp extraction_status / degraded / quarantined
#   REPLACES: pek_engine_adapter:668 (layout-crash), :342+:717 (PaddleOCR-load), ocr_adapter:502, extract_layout_first:250
parse_or_raise(fn, context)        # logs ctx + raises typed PDFProcessingError instead of `except: pass`
#   REPLACES: extraction_engine:102
validate_or_unknown(figures)       # returns None on all-None input, not 1.0
#   REPLACES: services.py:91
#   WHY EASIER: a crashed model / failed parse is NEVER served as a successful 0-row extraction
#   (FIX-BCTC-ENRICH-SILENT-0ROWS). crash-empty becomes a tagged degraded result or a loud FAILED.
```

---

## Mapping to known project classes

| Project class | Findings |
|---|---|
| **BCTC silent-0-rows** (FIX-BCTC-ENRICH-SILENT-0ROWS) | pdf-extractor-02, pdf-extractor-03, mcp-interface-03, mcp-infra-11, mcp-app-03, mcp-app-02 |
| **confidence_score=50 destructuring class** | mcp-app-01, mcp-infra-06, pdf-extractor-01, mcp-interface-04 |
| **graceful-degrade-needs-bounded-fetch / F-MACRO-FETCH-DEADLINE** | mcp-interface-01, mcp-interface-05, mcp-infra-01, mcp-infra-03, mcp-domain-sched-02, mcp-domain-sched-03, frontend-cluster |
| **passive-health-masks-dead-data** | mcp-domain-sched-04 |
| **silent-swallow-serial-bugs** | mcp-domain-sched-05, mcp-app-08, mcp-app-09, extraction_engine:102 |
| **contract-from-live-payload** | mcp-app-06 |
| **stdout-banner-poison** | not material here — mcp-server uses SSE-over-HTTP (not stdio); vnstockBridge already suppresses banners. The lone `console.warn` (imfDataFetcher:192) is logger-consistency only (dropped to noise). |

---

## Wave plan — WIP ≤ 2, grouped by zone

Each wave maps to zone dev agents; respect the project's WIP≤2 cap so no two heavy zone agents run concurrently (over-parallel-fanout host-starvation lesson).

### Wave 1 — P0 data-masking fixes (no new helpers; smallest correct change)
- **`dev-pdf-extractor`** (one agent, sequential): pdf-extractor-02 (`:668` re-raise/tag), pdf-extractor-03 (`:342`+`:717` quarantine on `paddle_table is None`). Both are the same `fail_loud_or_tag_degraded` shape — ship the helper here as a by-product.
- **`dev-mcp-server`** (one agent): mcp-domain-sched-04 (`marketContextBuilder:417` derive status from query-success) + mcp-interface-03 (`tickerIntelligenceTools` 6-section logless catches). Both are pure error→marker changes; no fetch surface touched.
- **DoD per fix**: a forced failure (drop the model / lock the DB) must now produce a tagged-degraded / `(lỗi truy vấn)` / `degraded:` output — NOT an empty success. Verify on the **named-volume** DB, not host `./data`. Rebuild containers after the code change.

### Wave 2 — shared helpers + P1 (the bulk of the value)
- **`dev-mcp-server` — fetch deadlines**: land `withDeadline` + `macroFetch`, then migrate mcp-interface-01/05 (+ the 7 macro siblings via macroFetch), mcp-infra-01/03, mcp-domain-sched-02/03. One helper edit clears the whole bounded-fetch cluster.
- **`dev-mcp-server` — data-layer**: land `safeQuery` + `runSection`/`withSection` + `failLoud`, migrate mcp-app-01/02/03/06, mcp-infra-06 (python None-on-miss for vnstock ratios).
- **`dev-frontend`**: land `safeFetch`/`proxyUpstream`/`safeFetchOrNull` + one `DEADLINE_MS`; migrate the loader + proxy + non-fatal clusters. (Sequence AFTER the mcp-server interface deadlines so the two unbounded hops are closed inner-first.)

### Wave 3 — P2 consistency & observability
- **`dev-mcp-server`**: mcp-domain-sched-05, mcp-app-08, mcp-app-09 (remove dead swallow once mcp-app-01 lands), mcp-interface-04 (parse_or_warn + null-not-0 confidence), mcp-interface-08 (final macro-proxy de-dup), mcp-infra-11.
- **`dev-pdf-extractor`**: pdf-extractor-01 (`validate_or_unknown`), pdf-extractor-04 (`parse_or_raise`).
- **`dev-frontend`**: the structured `console.error`-per-degrade in the shared helpers (closes the zero-server-side-logging gap, frontend-06) — already delivered if Wave 2 helpers carry the log.

---

## Appendix — dropped findings (verdict.is_real = false)

Not carried (adversarial verifier refuted the masking/live-path claim): `mcp-app-04` (pollNews — all-sources-dark detector + breaker already cover it), `mcp-app-05` (evening renderer doesn't render the dropped field), `mcp-infra-02` (muasamcong consumers DO distinguish), `mcp-infra-05` (clients.ts brent/gold `??0` — refuted), `mcp-infra-07` (commodityTracker — not masking real data), `mcp-infra-08` (insertMarketMessage return value uncaptured by both callers), `mcp-infra-09` (`readOrchStateOrNull` has zero prod callers — test-only), `mcp-infra-10` (tradingEconomics parseIndicatorValue — dead/test-only), `mcp-domain-sched-01` (signalOutcomeJob — catch not reachable on live path), `mcp-domain-sched-07` (cascadeEngine `??0.6` — structurally impossible to mask), `mcp-domain-sched-08` (macroIndicatorRefreshJob parsers — DO log; COALESCE-safe), `mcp-interface-06` (correlationTools — refuted), `frontend-05` (toAgentSignal `:0` — unreachable on the single live endpoint).
