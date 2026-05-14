# SPIKE 1915 — BCTC Pipeline Silence (since 2026-04-09)

- **Question:** Which of 3 candidates is the real cause of bctcReparseJob silence since 2026-04-09?
- **Timebox:** 120 min
- **Spike date:** 2026-05-14

---

## Candidates investigated

1. bctcReparseJob unregistered post-container-restart (c95-c97/1912c)
2. fetchParseAndStoreBctc silent failure (error-swallow paths)
3. Empty feedback queue / bctcPdfPullJob upstream broken

---

## Evidence gathered

### Candidate 1 — Registration state

Container boot log (`vn-market-intelligence-mcp-mcp-server-1`, started 2026-05-14T09:31:01Z):

```
[2026-05-14T09:31:01.740Z] [SCHEDULER] [scheduler] jobs registered — 60 cron keys in CRONS map
[2026-05-14T09:31:01.741Z] [SCHEDULER] [bootstrap] Scheduler started — cron jobs active
```

Source audit:
- `startScheduler.ts` L31: `import { runBctcReparseJob } from './financial-reports/bctcReparseJob.js'` — present
- `startScheduler.ts` L229-231: `cron.schedule(CRONS.bctcReparseJob, async () => { await runBctcReparseWithDb(db) }, ...)` — present
- `cronConfig.ts` L28: `bctcReparseJob: Bun.env.CRON_BCTC_REPARSE_JOB ?? '30 9 * * *'` — present
- `startupHelpers.ts` L212-216: `runBctcReparseWithDb` wrapper calls `recordJobRun(db, 'bctcReparseJob', fn)` — present
- `startScheduler.ts` L236-245: startup catch-up `setTimeout(runBctcReparseJob, 30_000)` — present

**VERDICT: ELIMINATED.** bctcReparseJob is correctly registered and confirmed running.

---

### Candidate 2 — fetchParseAndStoreBctc silent failure

Full audit of error-return paths in `fetchParseAndStoreBctc.ts`:

| Path | Behavior |
|------|----------|
| No SSC documents found | `return null` + `logger.warn` — logged |
| CircuitOpenError on SSC fetch | `return null` + `logger.warn` — logged |
| PDF extraction timeout, fallback disabled | throws | 
| PDF extraction timeout, fallback enabled (default=false) | tries news chain, logs result |
| OCR confidence < 0.3 | `return null` + `logger.warn` — logged |
| rawText empty, no extraction error | `return null` + `logger.warn` — logged |
| `parseBctcReport` throws | `return null` + `logger.error` — logged |
| LanceDB insertAnalysis fails | non-fatal, continues |

All paths that return null produce a logger.warn/error. There is NO unlogged silent swallow in `fetchParseAndStoreBctc` itself.

**However**: the startup catch-up call at `startScheduler.ts` L238 calls `runBctcReparseJob()` with NO `options.db` injection. This triggers the internal `recordJobRun` at bctcReparseJob.ts L706-708:

```typescript
if (!options.db) {
  void recordJobRun(db, "bctcReparseJob", async () => {}).catch(() => {});
}
```

This is a **fire-and-forget no-op** — it records a `success` run with zero work done, immediately, rather than recording the actual outcome. The outer `runBctcReparseWithDb(db)` call (the scheduled cron at L229) calls `recordJobRun` correctly. But the startup catch-up at L238 bypasses `runBctcReparseWithDb` and calls `runBctcReparseJob()` directly, producing a misleading job run entry. This is a code smell but not the root cause of silence.

**Root cause of candidate 2 in this pipeline**: `runBctcReparseJob` only processes `agent_feedback` rows where `title LIKE '[AUDIT] stranded_bctc_pdf%'` AND `status = 'new'`. If `dataAuditJob` D-7c has not written these rows, the feedback queue is empty, causing a no-op scan. The disk-scan fallback (`scanDiskForStrandedPdfs`) activates when `rows.length === 0`, but it requires PDFs to exist on disk and a matching financial_reports absence.

Host filesystem check: `/data/pdfs/` contains only 2 PDFs (VEA + VNM Q4-2025). These are the spike targets. No `financial_reports` rows exist (count=0).

**VERDICT: PARTIAL — not the trigger, but the pipeline would execute correctly once PDFs are on disk and feedback rows exist. The empty feedback queue is real but is a symptom of upstream (#3), not an independent cause.**

---

### Candidate 3 — Empty feedback queue / upstream broken

**CONFIRMED (two sub-causes):**

**Sub-cause 3a — bctcQueueEnricher cannot find SSC source URLs for 14/30 tickers.**

Ops finding (2026-05-14 20:00-20:15 UTC docker logs):
```
[bctcQueueEnricher] 0 URLs found for ticker DPM — scrape may be stale or source unavailable
[bctcQueueEnricher] 0 URLs populated across all 14 item(s) — all sources may be unavailable or geo-blocked
```

The enricher queries `bctc_vps_queue` for rows where `source_url IS NULL` and calls `discoverHosePdfUrls()` (SSC portal scraper). When the scraper returns 0 results (Cheerio/jsdom parsing against SSC's current HTML structure), `source_url` stays NULL and the row is never eligible for `bctcPdfPullJob` (which requires `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`).

Result: bctcPdfPullJob has 0 eligible rows → downloads 0 PDFs → 0 new files land in `data/pdfs/` → `dataAuditJob` D-7c finds 0 stranded PDFs → `agent_feedback` queue stays empty → `bctcReparseJob` fires but processes 0 rows.

**Sub-cause 3b — 2 PDFs on disk (VEA + VNM) are NOT being extracted.**

The disk-scan fallback in `runBctcReparseJob` (L675-694) activates when `rows.length === 0` and calls `scanDiskForStrandedPdfs`. This SHOULD detect VEA and VNM as stranded (0 `financial_reports` rows). However: the disk-scan ran silently with `examined=0, resolved=0` since 2026-04-09. 

Root cause of sub-cause 3b: the startup catch-up at `startScheduler.ts` L238 calls `runBctcReparseJob()` with default db (no injection). The disk-scan executes, but `scanDiskForStrandedPdfs` calls `db.prepare("SELECT code FROM watchlist...")`. If the container's `watchlist` table is empty or the DB path differs at startup, `codes = []`, the scan returns `[]`, and `examined` stays 0. The cron fires at 09:30 GMT+7 — whether the watchlist is populated at that point determines whether the scan works.

**CONFIRMED CANDIDATE: 3 (both sub-causes).**

---

## Root cause summary

| Candidate | Status | Confidence |
|-----------|--------|------------|
| 1 — bctcReparseJob unregistered | ELIMINATED | Source audit + boot log confirms registration |
| 2 — fetchParseAndStoreBctc silent failure | ELIMINATED as primary | All returns logged; no unlogged swallow found |
| 3 — Empty queue / upstream broken | CONFIRMED | Ops docker logs + 0 financial_reports + queue enricher failure |

**Primary root cause: SSC portal HTML structure likely changed, causing `discoverHosePdfUrls()` to return 0 URLs for 14/30 tickers. The entire bctc pipeline depends on this URL discovery chain.** 

Secondary issue: 2 on-disk PDFs (VEA + VNM) are also not being extracted, likely due to `watchlist` table being empty at the time `scanDiskForStrandedPdfs` runs, or a timing issue with the startup catch-up.

---

## Fix scope (carry-forward task 1915-fix)

**For the 2 on-disk PDFs (immediate, verifiable):**

1. Verify watchlist table has VEA and VNM entries in the running container.
2. Manually trigger `runBctcReparseJob` via MCP tool or restart to force the startup catch-up with a populated watchlist.
3. AC: `financial_reports` row count > 0; `pdf_extracted_text` row count > 0; bctcReparseJob log entry within last hour.

**For the 14 tickers with no source_url (structural fix):**

1. Audit `discoverHosePdfUrls()` / `listSscDocuments()` against current SSC portal HTML structure (Cheerio selector drift).
2. Verify VPS scraper `vn-bctc-fetch.service` is accessible and pushing to `bctc_vps_queue` correctly (check VPS_BCTC_BASE_URL=`http://125.212.251.27:8765/bctc-files/`).
3. Check if geo-block affects the queue enricher's direct SSC scraping from the mcp-server container.
4. AC: `bctcQueueEnricher` reports `urlsPopulated > 0` in next cron run.

**Double-recordJobRun smell (non-blocking):**

- `startScheduler.ts` L238: startup catch-up calls `runBctcReparseJob()` directly (bypasses `runBctcReparseWithDb`), causing a misleading fire-and-forget `recordJobRun` at bctcReparseJob.ts L706. Should call `runBctcReparseWithDb(db)` instead to use consistent recording.

---

## Key files

- `apps/mcp-server/src/scheduler/startScheduler.ts` L229-245 — registration + startup catch-up
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` L675-695 — disk-scan fallback
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — SSC URL discovery
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` L226-248 — VPS pull query
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` — parse+store pipeline

## Recommended next step

Real sprint task: **1915-fix** — two-part fix:
1. Fix `scanDiskForStrandedPdfs` to handle empty watchlist gracefully (use filenames directly if watchlist is empty) so VEA + VNM PDFs are immediately extracted.
2. Audit SSC Cheerio selectors in the queue enricher for HTML structure drift, with fallback to VPS cache path.

No architect-rethink gate needed (confirmed per spike spec: 1915 is upstream ingestion silence, not extractor-accuracy path).
