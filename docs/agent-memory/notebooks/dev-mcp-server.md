# dev-mcp-server -- Notebook

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
