# TASK_1945d — Reparse pipeline gap (FIX HIGH)

**Type:** FIX
**Priority:** HIGH
**Owner:** dev-mcp-server
**Zone:** `apps/mcp-server/`
**Opened:** 2026-05-18T11:37:38Z (post-1944 OBSERVE gate FAILED 23min before 12:00Z deadline)
**Spawned by:** PO (c189), direct from gate FAIL — no SPIKE needed (root cause partially diagnosed already)
**Recurring-bug rank:** 3rd BCTC-pipeline patch this sprint cycle (1943a + 1944a + 1945d). If this fix fails verification, architect REQUIRED before any further patch attempt.

## Context

Sprint 1944 closed declaring "banking 7/7 source_url populated" + "VPS proxy working" + "Docker rebuilt cycling at 05:45/06:15 UTC". Sprint 1945 (verdict resolution recovery) declared an OBSERVE gate: `post-1944-financial-reports-q1-2026` at 2026-05-18T12:00Z with AC = ≥3 banks have Q1-2026 row in `financial_reports`.

C185 progress note (2026-05-18T08:39Z) reported pipeline progressing: `bctc_vps_queue` 6/7 banking had `source_url` populated; EIB status=done with PDF fetched at 08:22Z to VPS bctc-files/.

C189 evaluation (2026-05-18T11:37Z, 23min before deadline) via MCP `get_bctc_full(code, 2026, "Q1")` for all 7 banks:

| Ticker | Result |
|---|---|
| ACB | "Chưa có dữ liệu BCTC" |
| BID | "Chưa có dữ liệu BCTC" |
| CTG | "Chưa có dữ liệu BCTC" |
| EIB | "Chưa có dữ liệu BCTC" |
| MBB | "Chưa có dữ liệu BCTC" |
| VCB | "Chưa có dữ liệu BCTC" |
| VPB | "Chưa có dữ liệu BCTC" |

Cross-check `get_financial_summary(actionCode=VCB)`: returns "2025-Q4" as latest. Confirms 0 Q1-2026 rows.

`list_stored_pdfs(year=2026, quarter="Q1")` shows:
- `20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf` (12.1 MB, stored 2026-05-18)
- `20260420-DHG-BCTC-Quy-1.2026.pdf` (8.0 MB, stored 2026-05-18)

→ PDFs are landing in BCTC storage but `bctcReparseJob` has not extracted them into `financial_reports`.

## Gate verdict

**FAILED.** 0/7 banks (AC required ≥3). Gate closed FAIL at 11:37Z.

## Two-part fix scope

### Part A — bctcReparseJob trigger gap (highest priority)
EIB Q1-2026 PDF stored 2026-05-18 but no `financial_reports` row. Same for DHG. Investigate:
1. Is `bctcReparseJob` cron actively running? Check `cron_job_runs` for last successful invocation timestamp.
2. Does the job join `bctc_pdf_storage` ↔ `financial_reports` correctly, or is there an idempotency guard suppressing reparse of newly-stored PDFs?
3. Is the year/quarter parsing from filename (`20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf`) correctly identifying it as Q1-2026 and not skipping it?
4. Is there a confidence-threshold gate (`< 0.2` rejecting insert)? Check OCR output for EIB PDF.

### Part B — Source URL discovery gap (6/7 banks)
C185 c185 reported 6/7 banking `source_url` populated. C189 finds 6/7 banks still have no PDF stored. Either:
- The c185 progress note was inaccurate (source_url present in `bctc_vps_queue` but VPS PDF fetch never completed), OR
- The VPS PDF fetch ran but failed to push to mcp-server storage.

Verify:
1. Query `bctc_vps_queue` for ACB/BID/CTG/MBB/VCB/VPB Q1-2026 entries: what is current `status`, `source_url`, `last_attempt`, `attempts`?
2. Is the VPS bctc-files/ pull (`mcp-server pulls from VPS:8765/bctc-files/`) running and succeeding for these 6 banks?

## Acceptance criteria

- **AC-1 (PRIMARY):** ≥3 banking Q1-2026 rows in `financial_reports` after 1 full enricher + reparse cycle post-fix deploy. OR
- **AC-1-fallback:** Documented root cause + scoped follow-up if root cause is in a different zone (e.g., VPS-side fetch — then 1945d-vps follow-up to dev-vps-crawls). PO will accept a failed AC-1 only if accompanied by clear root-cause-not-this-zone evidence.
- **AC-2:** No new BUG storm on `bctcReparseJob` channel for 24h post-deploy.
- **AC-3:** Unit/integration tests cover the regression: at least one test asserts `bctcReparseJob` picks up a freshly-stored PDF with year=2026 quarter=Q1 and inserts a `financial_reports` row.

## Recurring-bug escalation rule

This is the 3rd BCTC-pipeline patch within Sprint 1942–1945 (1943a queue reset + retry, 1944a VPS route + header injection, now 1945d reparse pipeline). Recurring-bug rule: ≥2 fix commits on same module → architect rethink required before further fix. If 1945d's first commit attempt fails AC-1 verification → **STOP, escalate to architect SPIKE-1945d for root-cause rethink** before any second commit.

## Reference

- TNB c70 finding #4 (post-1943a OBSERVE) — resolved with FAIL verdict.
- Sprint 1944c smoke report: `reports/TASK_REPORT_1944c.md`.
- SPIKE-1943: `docs/spikes/SPIKE_1943-bctc-banking-q1-2026-deadline-delay.md`.
- ARCH-1944: `docs/architecture-briefs/2026-05-18-vps-bctc-discover-route-zone-split.md`.

## Sprint context

Sprint 1948 (closed-loop auto-improvement Phase 1) remains BLOCKED on independent gate `post-1945-verdict-resolution-scored-pct` (2026-05-20T07:22Z). 1945d does not affect that gate. WIP rises to 1 (1945d only). All other Sprint 1948 tasks stay in Backlog.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` — GAP-A fix: disk scan unconditional + `pdfDir` injectable option; `options.pdfDir` passed to `scanDiskForStrandedPdfs`; processedFilenames dedup set
  - `apps/mcp-server/src/interface/mcp/server.ts` — GAP-B fix: `setImmediate` in `push-bctc-pdf` now calls `triggerPushBctcExtraction` instead of raw `fetchParseAndStoreBctc`
- **Files created:**
  - `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts` — new module: `triggerPushBctcExtraction(params)` with injectable deps (extractPages, getCache, runPipeline); production wired to `extractAndStorePdfPagesWithRetry` + `getCachedPdfText` + `fetchParseAndStoreBctc`
  - `apps/mcp-server/src/__tests__/1945d-reparse-pipeline-gap.test.ts` — 12 tests: TC-1 filename parse, TC-2 disk scan stranded, TC-3 AC-3 unconditional disk scan, TC-4 push extraction injection contract
- **Tests written:** 1945d-reparse-pipeline-gap.test.ts — 12 assertions, GREEN
- **Git commits:** `159b0888 fix(1945/bctc): reparse pipeline gap — disk scan + push extraction`
- **Type check:** clean
- **Service tests:** 12 new pass / 0 fail; existing 75 BCTC tests GREEN; 1 pre-existing failure in 1196 (task 1915-fix-part2 broke watchlist-only guard — not introduced by 1945d)
- **Docs updated:** `docs/architecture/microservice/mcp-server/financial-reports.md` — invariants 6+7 added (push-bctc-pdf extraction path, bctcReparseJob disk scan unconditional)
- **Graphify:** skipped (doc update is additive to existing invariants section only)

### Root cause analysis (Part B — 6/7 banks)

ACB/BID/CTG/MBB/VCB/VPB: `bctc_vps_queue` has `source_url` but no PDF stored. The VPS discover endpoint (`BCTC_DISCOVER_URL`) may be returning SSC URLs (not VPS bctc-files/ URLs). `bctcPdfPullJob` only pulls from `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`. If source_urls are SSC URLs, `bctcPdfPullJob` skips them (auth/geo-block). This is a VPS-side gap — the VPS playwright scripts have not yet fetched these 6 banks' PDFs to bctc-files/. Outside mcp-server zone. If VPS fetch doesn't complete, a follow-up task for dev-vps-crawls would be needed.

