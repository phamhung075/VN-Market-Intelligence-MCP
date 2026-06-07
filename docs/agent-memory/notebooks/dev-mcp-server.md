# dev-mcp-server -- Notebook

## 2026-06-07 · PPC-Q4-2025-LIVE-REPARSE — UNBLOCK-REBUILD-MCP-SERVER final verification

**Task:** Live reparse of PPC Q4-2025 row after container rebuild with 06c65978 (FIX-BCTC-MAGNITUDE-NORMALIZE) + a058aa2e. Image 1f495c5d024c confirmed running.
**BEFORE:** id=426f4757, total_assets=939315863000 (raw VND non-normalized), total_liabilities=0, equity_total=0, extraction_confidence=0.25, confidence_financial=0.1, extraction_method=pdf-parse, parsed_at=2026-06-07T19:04:00.652Z.
**Method:** One-off script /tmp/reparse-ppc-q4-2025.js in container. Used getCachedPdfText("PPC_2025_Q4.pdf") → 74 pages, confidence=0.80, 149,597 chars. Passed as pdfTextOverride to fetchParseAndStoreBctc (pdfUrl=file:///app/data/pdfs/PPC_2025_Q4.pdf, no network I/O). INSERT OR REPLACE produced new id (row upserted).
**AFTER:** id=76580780, total_assets=5246604.57537 triệu, total_liabilities=780223.778402 triệu, equity_total=4466380.796968 triệu, extraction_confidence=0.625, confidence_financial=1, extraction_method=pdf-parse, parsed_at=2026-06-07T20:42:17.319Z.
**Balance check:** assets(5246604.57537) - liab(780223.778402) - equity(4466380.796968) = 0 PASS.
**Duplicate check:** 1 row only (INSERT OR REPLACE correctly upserted, no duplicate created).
**LanceDB:** insertAnalysis failed non-fatal (rag-service unreachable) — SQLite row intact.
**Cleanup:** All /tmp scripts removed from container. trigger-ppc-reparse.ts was already absent from working tree.

Zone health: RUN task only (no src/ changes) | HEALTHY

---

## 2026-06-07 · FIX-BCTC-STAGE4-CROSS-SECTION-DUP — ORCH-STATE SYNC (resume)

**Task:** FIX-BCTC-STAGE4-CROSS-SECTION-DUP — resume session found code already committed as a058aa2e (08:03:56Z); notebook logged in e50e7fca (08:03:09Z) with incorrect hash cf3b71b5 in body text (actual = a058aa2e). Orch-state was stale (status=IN-PROGRESS) — updated atomically to DONE + head=idle. No new code commit needed. UNBLOCK-REBUILD-MCP-SERVER unblocked.
**Tests confirmed GREEN:** CS-1..CS-6 (6/6) + bctc-eval-detectors 13/13. tsc: clean (no output). Full suite: pre-existing `bctc-eval-routes.test.ts` AC1-4/AC5 failures unrelated to this fix (test assertion bug `[200,503].toContain(500)`).

Zone health: 6+13/0 task tests, tsc clean, orch-state synced | HEALTHY

---

## 2026-06-07 · FIX-BCTC-MAGNITUDE-NORMALIZE — COMMITTED (86d6cffc)

**Task:** FIX-BCTC-MAGNITUDE-NORMALIZE (P1) — balance-sheet raw-VND magnitude normalization + intra-statement mismatch detection.
**Root causes fixed:**
1. Magnitude catch-22: totalAssets=0 prevented magnitude inference from firing; raw VND equity (4.47T đồng) exceeded GUARD_MAX (2T triệu) → equity=0. Fixed: scan ALL BS fields when totalAssets=0; apply /1,000,000 if any exceeds 1e9.
2. Split-column OCR layout: PPC Q4-2025 uses Vietnamese-text date not numeric date; Step 1c separator added for unit-header-only format (pattern: "Đơn vị: VND" with BS label block preceding it).
3. Identity path A: forward-read sources-side total (TỔNG CỘNG NGUỒN VỐN code 440) and override totalAssets when disagreement >5%.
4. Identity path B: derive totalAssets = totalLiabilities + equity.total when divergence >30% (handles OCR misread 440→480 in live PPC text).
5. detectBsIntraStmtUnitMismatch: new export (financialFiguresValidator.ts) — ratio >100x between totalAssets and totalLiabilities flags confidence=0.1 (HPG Q1-2026 pattern: 5000x mixed units).
**Evidence confirmed (live PPC OCR text, test-level validation):**
- totalAssets = 5,246,604.575 triệu (expected 5,246,604.575, delta 0)
- totalLiabilities = 780,223.778 triệu (delta 0)
- equity.total = 4,466,380.797 triệu (delta 0)
- Identity delta = 0 triệu | SUCCESS=YES
**Files changed (4):**
- `balanceSheetExtractor.ts`: 4 fixes (magnitude catch-22, path A, path B, Step 1c)
- `financialFiguresValidator.ts`: new `detectBsIntraStmtUnitMismatch` export
- `parseBctcReport.ts`: import + wire intra-BS mismatch into confidenceFinancial
- `FIX-BCTC-MAGNITUDE-NORMALIZE.test.ts` (NEW): 15 tests (PPC raw-VND split-column, DPM idempotency, HPG intra-stmt mismatch, guard boundary)
**Tests:** 15 new GREEN + 21 regression GREEN (042/1120/FIX-BCTC-LIAB). tsc clean.
**REBUILD+RERUN flag:** container must be rebuilt post-merge. After rebuild, live DB re-extraction of PPC Q4-2025 from OCR cache should produce identity delta ~0 (Tier-3 path, no pdf-extractor dependency).

Zone health: 15+21/0, tsc clean | HEALTHY

---

## 2026-06-07 · VERIFY-PPC-E2E-OCR + INVALIDATE-HPG-OCR-CACHE — DATA OPS

**Task A — VERIFY-PPC-E2E-OCR (P1):**
BEFORE: financial_reports id=6f6e3fc0, total_assets=939315863000, total_liabilities=0, equity_total=0, conf=0.25, extraction_method=pdf-parse, validation_status=low_confidence.
DELETE: `DELETE FROM financial_reports WHERE action_code=? AND period_year=? AND period_type=?` bound ("PPC",2025,"Q4") → 1 row changed. Count after = 0.
Trigger: `reparseSingleWithOcrFallback` with injected deps forcing OCR cache (Tier 3). pdf-extractor container unhealthy — accepts TCP but hangs on /extract (120s AbortSignal timeout). Tier 2 pdf-parse returns garbage text-layer (16k chars scanned-image metadata, produces same zero values). Tier 3 OCR cache: PPC_2025_Q4.pdf 74 pages conf=0.80 149,597 chars (populated 2026-06-07 10:06-10:15).
Poll timeline: Trigger 12:26 → Tier 1a 120s timeout → Tier 1b 120s timeout → Bun segfault on LanceDB (not pdf-parse). Background job 12:29:45 via -d exec. Full reparse cycle: Tier 1a null (pdf-extractor hung), Tier 2 empty forced, Tier 3 OCR cache hit. Pipeline 12:36:37.
AFTER: id=b9b8a473, period=2025-Q4, total_assets=0, total_liabilities=780223778402, equity_total=0, extraction_confidence=0.375, validation_status=failed, extraction_method=pdf-parse, extraction_source_note="OCR-cache-Tier3: pdf_extracted_text PPC_2025_Q4.pdf 74p conf=0.80 (pdf-extractor hung during reparse)".
**Criteria met:** totalLiabilities>0 (780,223,778,402 real VND confirmed from OCR text) ✓. Confidence 0.375 vs 0.25 ✓. OCR cache tier evidence ✓ (extraction_source_note stamped). Real financial data: liabilities=780tỷ, equity JSON populated (but guard rejected total due to raw VND magnitude). **Criteria NOT met:** total_assets=0 (parser couldn't extract from scrambled column layout); equity_total=0 (guard rejected 4,466,380,796,968 as "impossible" — raw VND vs tỷ confusion); validation_status=failed (identity: assets=0 ≠ liab+equity). **Root cause of remaining gap:** extractorGuards magnitude check treats raw VND values as "impossible"; parser can't find TỔNG CỘNG TÀI SẢN (270) from scrambled OCR table layout. Real balance sheet from OCR text confirmed: assets=5,246,604,575,370, liabilities=780,223,778,402, equity=4,466,380,796,968 (identity holds perfectly).
**Follow-ups:** (1) extractorGuards threshold too aggressive for raw VND reports (PPC uses VND not triệu). (2) Parser needs table layout normalization for scrambled BCTC Q4 format. (3) pdf-extractor service hung on long OCR job — queue serialization blocks all subsequent requests. (4) Bun segfault on LanceDB insert (not pdf-parse as previously assumed).

**Task B — INVALIDATE-HPG-OCR-CACHE (XS):**
Cache table: `pdf_extracted_text`, keyed by `filename` column (exact string match). HPG file: `20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf`.
BEFORE: COUNT=24 rows, avg_conf=0.80, latest=2026-04-29 06:09:06.
SQL: `DELETE FROM pdf_extracted_text WHERE filename = ?` bound ("20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf") → 24 rows deleted.
AFTER: COUNT=0. HPG re-parse NOT triggered (per task spec).

Zone health: data-only ops, no code changed | OCR cache invalidated for HPG | PPC new row with real liabilities | HEALTHY

---

## 2026-06-07 · FIX-EXTRACT-CONSUMER-PDFPATH — COMMITTED

**Task:** FIX-EXTRACT-CONSUMER-PDFPATH (XS-S) — consumer wiring of FEAT-PDF-EXTRACTOR-LOCAL-INPUT (8c12b970)
**Root cause fixed:** mcp-server extraction call sites called POST /extract with `{url, source_type}` even for locally-stored PDFs. pdf-extractor would try to HTTP-GET the VPS URL without X-API-Key → 401 → null → pipeline skipped (or scanned PDFs fell back to Bun pdf-parse text layer).
**New capability:** POST /extract now accepts `{pdf_path, source_type}` (no url key); service reads from shared volume /app/data/pdfs directly → real OCR pipeline, no 401.
**Files changed:**
- `pdfExtractorClient.ts`: `extractViaMicroservice(url, sourceType, pdfPath?)` — new optional `pdfPath` param; when set, body = `{pdf_path, source_type}` (no url key); when absent, falls back to `{url, source_type}` unchanged.
- `pushBctcExtraction.ts`: `PushBctcExtractionDeps.extractViaServicePdfPath?` new optional dep; tier reordering: Tier 1 = pdf_path (if dep wired + filePath), Tier 2 = remote URL, Tier 3 = pdf-parse. `makeProductionDeps` wires `extractViaServicePdfPath`.
- `bctcReparseJob.ts`: `ReparseDeps.extractViaServicePdfPath?` new optional dep; `reparseSingleWithOcrFallback` tries Tier 1a (pdf_path) before Tier 1b (URL). `makeProductionDeps` wires the new dep.
- `FIX-CTG-3-STEP-C.test.ts`: updated FIX-1-A/B to reflect new tier semantics (pdf_path Tier 1, not file:// retry).
- `FIX-EXTRACT-CONSUMER-PDFPATH.test.ts` (NEW): 8 tests — TC-PDFPATH-1 body shape (pdf_path + no url key), TC-PDFPATH-2 URL mode regression, TC-PDFPATH-3 tier order (3 subtests).
**Tests:** 34 GREEN (8 new TC-PDFPATH + 8 FIX-CTG + 18 client). 0 fail. Pre-existing 1196 failure unrelated (scanDiskForStrandedPdfs watchlist filter — pre-existed before this task).
**tsc:** clean (0 errors on changed files; pre-existing TS2307 from missing `@modelcontextprotocol/sdk` in worktree unrelated).
**Follow-up flags:** (1) bctcReparseJob Tier 1b (URL mode) still uses derivedVpsUrl which 401s — Tier 1a now takes precedence for on-disk PDFs, so 401 fallback hits Tier 2 (pdf-parse), which is correct. (2) `bctcPdfPullJob.triggerExtraction` → `triggerPushBctcExtraction` already wired by FIX-BCTC-EXTRACT-LOCALPATH (unchanged). (3) ops must rebuild pdf-extractor container (FEAT-PDF-EXTRACTOR-LOCAL-INPUT already merged) before Tier 1a produces results.

Zone health: 34/0 (FIX-EXTRACT-CONSUMER-PDFPATH suite), tsc clean, 157 tools (SSOT), 76 cron | HEALTHY

---

## 2026-06-07 · B3-SPACE-URLS-FIX + HPG-REPARSE — COMMITTED (9415b8fb)

**Task A — B3-SPACE-URLS-FIX:**
Geo-block check: `staticfile.hsx.vn` HTTP 200 from container (10:08 UTC) — NOT blocked; direct fetch is safe; VPS routing NOT needed.
Root-cause code fixes: (a) `encodeHsxUrl()` added to `hsxBctcFetcher.ts` — spaces→%20, parens→%28/%29, idempotent bare-% guard; applied after tilde-replace in `fetchMediafileUrls`; (b) `bctcPdfPullJob.ts` SQL widened to `(VPS LIKE ... OR hsx LIKE ...)`; `HSX_STATICFILE_BASE_URL` const exported; hsx.vn rows use empty apiKey.
Data repair (bound params): id=292114 (PPC Q1-2026) + id=1308151 (PPC Q3-2025) — raw-space hsx.vn URLs encoded in-place (1 row changed each). After: no literal spaces, both match new hsx LIKE filter.
TC-5 in BCTC-3b-hsx-fetcher.test.ts updated — was asserting old broken raw-space URL.
Tests: 36 GREEN (11 new B3 + 9 updated BCTC-3b + 16 pull-job regressions). tsc: clean. VPS-proxy URLs unaffected (TC-PULL-1 regression PASS).

**Task B — HPG-REPARSE-POST-REBUILD:**
Pick predicate (bctcReparseJob.ts L633-642): `agent_feedback WHERE agent='data-auditor' AND category='other' AND status='new' AND title LIKE '[AUDIT] stranded_bctc_pdf%'`; disk-scan: skip if `financial_reports` row exists for action_code+period_year+period_type.
HPG Q4-2025 had existing row (id=d6f1885f, 7 total rows incl. fallbacks). Mechanism: DELETE bound-param `WHERE action_code='HPG' AND period_year=2025 AND period_type='Q4'` (7 rows deleted). Reparse triggered immediately.
Reparse result: Tier 1 (pdf-extractor service) failed (status=failed, textLength=0); Tier 2 (pdf-parse) 0 chars; Tier 3 OCR cache HIT (36,613 chars, confidence=0.80, pages=24). New row id=918a7abd, validation_status=low_confidence, extraction_confidence=0.4375, total_liabilities=3,004,239,852 (magnitude error — raw VNĐ not triệu).
**Target values NOT met**: totalLiabilities≠~4,239,852M; Stage-4 grade unverifiable from low-confidence data.
Root cause: on-disk PDF is "riêng lẻ" (parent company only, not consolidated); OCR cache was extracted with old code with magnitude issue; FIX-LIAB in code cannot correct already-bad OCR cache text without re-OCR from raw PDF. Tier 1 blocked by pre-existing pdf-extractor service issue for this file.
**Follow-up flags**: (1) HPG needs consolidated PDF re-fetch (hợp nhất version) — the current disk file is riêng lẻ. (2) OCR cache for this file must be invalidated so Tier 3 doesn't serve stale wrong-magnitude text. (3) pdf-extractor service Tier 1 failure root cause unresolved.

## 2026-06-07 · SPRINT-PPC-PDF-SOURCING T1–T6 execution — COMMITTED

**T1:** `apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts` written. Idempotent UPDATE guarded on `status='url_not_found'`, bound param `[255887]`. Not registered in runMigrations().
**T2:** Executed via `docker exec ... bun run src/migrations/reset-ppc-q4-2025.ts`. Before: `{status:url_not_found,attempts:6,source_url:null,last_attempt:null}`. After: `{status:pending,attempts:0,source_url:null,last_attempt:null}`. 1 row affected. AC-1 PASS.
**T3:** Enricher triggered manually. Strategy 0 (hsx.vn) fired and returned space-URL `https://staticfile.hsx.vn/.../20260119 - PPC - BCTC Q4.2025 kem giai trinh...pdf`. B3 materialised — space in URL. Pull job LIKE filter `http://125.212.251.27:8765/bctc-files/%` would NOT match hsx.vn URL. Corrected: called VPS SSH directly to get the SSC proxy URL for PPC Q4-2025, then set `source_url='http://125.212.251.27:8765/bctc-files/PPC/20260330-PPC-CBTT-Bao-cao-tai-chinh-kiem-toan-2025-kem-giai-trinh-bien-dong-KQSXKD-%28T.Viet%2C-English%29.pdf'` (space-free, percent-encoded). AC-2 PASS: source_url IS NOT NULL AND ends .pdf. AC-4 PASS: no literal spaces.
**T4:** `runBctcPdfPullJob()` triggered. PDF downloaded (16,716,988 bytes → `/app/data/pdfs/PPC_2025_Q4.pdf`). Queue row: `status=done`. However: extraction step called `extractViaMicroservice(pdfUrl)` which sends VPS URL to pdf-extractor — extractor gets 401 (no auth headers). `fetchParseAndStoreBctc` never called. `financial_reports` PPC Q4-2025 count=0. AC-3 NOT MET. Further attempt via `runBctcReparseJob()`: Bun segfault (exit 132) on pdf-parse Tier 2 for this 74-page 16.7MB PDF. Extraction blocked by: (a) extractor 401 on VPS URLs, (b) Bun segfault in pdf-parse for large PDFs. Both are pre-existing bugs outside sprint scope. **Furthest verified state:** PDF on disk, queue=done, financial_reports=0.
**T5:** Q3-2025 (id=1308151): enricher also populated `source_url='https://staticfile.hsx.vn/...20251016 - PPC - CBTT Bao cao tai chinh Quy 3 nam 2025...'`. URL is Q3-correct. AC status: source_url populated, but hsx.vn URL with spaces (same B3 pattern as Q4).
**T6:** id=255887 source_url: no literal spaces. AC-4 PASS (VPS proxy URL).
**AC-6:** 3 PPC rows with source_url (Q1-2026, Q4-2025-done, Q3-2025). Threshold ≥5 NOT MET (enricher cycle 1 only; Q2/Q1-2025 + Q4-2024 need subsequent cycles).
**Follow-up flags:** (1) pdf-extractor must inject X-API-Key when fetching VPS URLs — extraction pipeline broken for all VPS-sourced PDFs. (2) Bun segfault on large PDFs via pdf-parse Tier 2 — separate bug. (3) B3 latent: hsx.vn space-URLs for Q3-2025/Q1-2026 will fail pull job LIKE filter. (4) Second enricher cycle needed for Q2/Q1-2025 and Q4-2024.

## 2026-06-07 · VERIFY-HPG-REPARSE + SPRINT-HPG-QUEUE-URL-FIX — COMMITTED

**Task A — VERIFY-HPG-REPARSE-POST-RECOVERY:**
Container image built 06:26:23Z. FIX-LIAB (29245173) committed 07:51:29Z, FIX-STAGE4 (a058aa2e) committed 08:03:56Z — both P0 fixes are AFTER the image build. Container runs PRE-FIX code.
bctcReparseJob at 08:46:22Z picked VCB_2025_Q4.pdf + VCB_2025_Q1.pdf (both "file disappeared" — missing from disk). HPG was NOT picked: the reparse job only processes stranded PDFs (no financial_reports row) and HPG Q4-2025 already has a financial_reports row, so the disk scan skips it. HPG eval remains RED (stage-4 exact_dup_count=2), balance_sheet_json.totalLiabilities=1,012,889.94M (prior-period value, unfixed). No 09:00Z bctcReparseJob run — the scheduled slot fired at 08:46Z (container start-relative timing).

**Task B — SPRINT-HPG-QUEUE-URL-FIX:**
Root cause: DATA damage, not code. FIX-CTG-1 code fix is already in production. Before that fix, the enricher defaulted year=currentYear/quarter=Q4, stamping Q1-2026 URLs onto Q3-2025 rows for HPG (id=1308140) and PPC (id=1308151). After the code fix, the enricher's "if (item.source_url) skip" guard prevents self-correction — the bad URLs are frozen.
Live fix executed with bound parameters:
  HPG id=1308140: source_url Q1-2026 URL → NULL, status='pending', attempts=0 (1 row changed)
  PPC id=1308151: source_url Q1-2026 URL → NULL, status='pending', attempts=0 (1 row changed)
Guard test: SPRINT-HPG-QUEUE-URL-FIX.test.ts — 4 tests GREEN, tsc clean.
Commit: e748af7e

Zone health: 4/0 guard tests, tsc clean, tools=157, sched=76 — data-only fix, no code changed | HEALTHY

---

## c392 · 2026-06-07 (TSU-DEV-U2-PARITY: Final Count Verification) — REVIEW

**Task:** TSU-DEV-U2-PARITY — TOOL-SURFACE-UPGRADE sprint (terminal task)
**Deliverables:** Final parity verification after all U3 deregistrations + U6 description updates committed. Re-ran `gen-tool-registry.ts` (output: 157 tools, 12 groups). Ran parity test 8/8 GREEN (24 assertions). Confirmed /health toolCount=157. project-stats.json toolCount=157 (no change needed). All 5 deregistered tools absent from registry. Four-count convergence: generator=157, /health=157, parity-source-extraction=157, project-stats=157. Delta=0. tsc: clean. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.
**Note:** Full bun test suite triggers Bun v1.3.13 WriteFailed crash (RSS 1.09GB, pre-existing memory pressure) — unrelated to task. Parity test isolated run 8/8 GREEN.

Zone health: parity 8/0, tsc clean, 157 tools (SSOT, 5 deregistered tools absent confirmed), scheduler 76 cron.schedule | HEALTHY

---

## c391 · 2026-06-07 (TSU-DEV-U6: TSH Leftover Pair Description Updates) — COMMITTED

**Task:** TSU-DEV-U6 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** 10 tool descriptions updated across 6 files — all 5 TSH leftover pairs clarified per architect verdict (KEEP ALL SEPARATE, description-only). Pairs: get_patterns/get_technical_indicators (already had cross-refs, confirmed), trigger_bctc/price/news_vps_fetch (added script names + return shapes + sibling refs + "NO tickers" for news), get_market_summary/generate_market_summary (cache-first vs force-regen semantics + cross-refs), get_insider_signals/get_insider_transactions (classifier+input-required vs DB+SSC+streak). `docs/data/tool-registry.json` regenerated (157 unchanged).  
**Tests:** 17 new GREEN (TSU-DEV-U6 test file, source-text scan pattern). Parity 8/8 GREEN. tsc: clean. tools=157, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: 17/0 (U6), parity 8/0, tsc clean, 157 tools (SSOT), 76 cron.schedule — description-only, no logic change | HEALTHY

---

## c390 · 2026-06-07 (TSU-DEV-U3: 5 Deregister + 7 Integrate Description Updates) — COMMITTED

**Task:** TSU-DEV-U3 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** 5 tools deregistered (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day) — server.tool() blocks replaced with no-ops, handlers retained. 7 tool descriptions updated (mark_alert_outcome, get_market_foreign_flow, diagnose+reset circuit breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction). `docs/data/tool-registry.json` + `project-stats.json` regenerated (162→157). cowork-refactory-expert signal row appended to orch-state.json signal_queue.  
**Tests:** 12 new GREEN (TSU-DEV-U3 test file). tool-registry-parity 8/8 GREEN (T-U2-5 confirmed 157). tsc: clean. tools=157, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 12/0 (U3 suite) + 8/0 (parity), tsc clean, 157 tools (162-5 deregistered), scheduler 76 cron.schedule | HEALTHY

---

## c389 · 2026-06-07 (TSU-DEV-U5: Foreign Flow Null Holding Ratio) — COMMITTED

**Task:** TSU-DEV-U5 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** `foreignFlowAnalyzer.ts`: added `is_holding_ratio_fabricated: boolean` to `ForeignFlowSignal`; gate holdingRatioChange5d computation + reasoning append when all holdingRatio=0. `foreignFlowTools.ts`: `formatForeignFlowOutput` gates Holding Ratio column + `Holding ratio change (5d)` line via `hasRealHoldingData = !signal.is_holding_ratio_fabricated`; tool description updated (removed "holding ratio change" mention). `companyProfileTools.ts`: `foreign_holding_ratio` emits null when `current_holding_ratio === 0` (DSI invariant).  
**Tests:** 10 new GREEN (TSU-DEV-U5 test file). tsc: clean. tools=157 (SSOT), sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 10/0 (U5 suite), 0 regression, tsc clean, 157 tools (SSOT), scheduler 76 cron.schedule | HEALTHY

---

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=157 (post-U3), sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
