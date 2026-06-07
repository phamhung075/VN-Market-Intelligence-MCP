# BA Spec — SPRINT-PPC-PDF-SOURCING

**Sprint:** SPRINT-PPC-PDF-SOURCING
**DDD service:** mcp-server + vps-scripts
**Date:** 2026-06-07
**BA cycle:** c1
**Priority:** M / P1

---

## Problem Statement

PPC (Pha Lai Thermal Power, HOSE-listed) has ZERO `financial_reports` extraction rows.
The Q4-2025 queue entry exhausted 6 sourcing attempts with `source_url=NULL` and is
permanently stuck at `url_not_found`. All prior periods (Q1–Q3 2025, Q4 2024 and
earlier) remain pending with no source URL. No eval, no analysis, and no financial
dashboard data is possible for PPC until valid PDF URLs are queued and extracted.

Scope boundary: Q3-2025 queue row currently holds a wrong URL (Q1-2026 PDF assigned
to Q3 slot) — this data corruption is handled in the parallel SPRINT-HPG-QUEUE-URL-FIX
lane and is OUT OF SCOPE here. This sprint covers the sourcing gap: discovering and
injecting correct, period-matched PDF URLs so extraction can proceed.

---

## Live Queue State (read-only DB probe, 2026-06-07)

| period | status | attempts | source_url | blocker |
|---|---|---|---|---|
| Q4-2025 | url_not_found | 6 | NULL | permanently dead — grace-period arm cannot fire (last_attempt=NULL AND attempts=6, both conditions fail) |
| Q3-2025 | pending | 0 | Q1-2026 URL (wrong doc) | scoped OUT — SPRINT-HPG-QUEUE-URL-FIX |
| Q2-2025 | pending | 0 | NULL | no URL ever discovered |
| Q1-2025 | pending | 0 | NULL | no URL ever discovered |
| Q4-2024 | pending | 0 | NULL | no URL ever discovered |
| Q1-2026 | pending | 0 | staticfile.hsx.vn URL with spaces | URL encoding issue; separate from this sprint |

---

## Root Cause Analysis

### 1. Exchange Classification — PPC is HOSE-listed

PPC Q1-2026 `source_url` is `https://staticfile.hsx.vn/...` — confirming HOSE listing.
Strategy 0 in `bctcDiscovery.ts` (hsx.vn mediafiles API) is the primary path for HOSE tickers.

### 2. Why 6 Attempts Returned NULL (Q4-2025)

The 6 enrichment attempts on Q4-2025 ran BEFORE the following fixes shipped:

| Fix | Commit | Date |
|---|---|---|
| FIX-CTG-1: quarter parameter in hsx.vn fetcher | git log shows 2026-06-03 | Q-correct filtering added |
| FIX-VPS-SSC-CURL-SCRAPER: SSC NewsSearch without Playwright | 7ed37441 | 2026-06-06 |

At the time of those 6 attempts, the enricher had no reliable HOSE source after
hsx.vn returned empty (Q4-2025 may not have been indexed on hsx.vn mediafiles at
that point, or the pre-FIX-CTG-1 fetcher returned the wrong quarter's URL, OR the
VPS Playwright path was crashing with `pthread_create EAGAIN`). All attempts failed
silently → `markUrlNotFoundStmt` fired after attempt 5 → `attempts=6` with `source_url=NULL`.

**Key finding:** The `last_attempt` column is NULL on this row, which means all 6 attempts
completed before the `last_attempt` column was added to the schema (pre-migration enricher
runs). This means:
- Grace-period Arm 2 condition `last_attempt IS NOT NULL` is permanently FALSE.
- Arm 2 condition `attempts < 6` is also permanently FALSE (attempts=6).
- The row will NEVER be picked up again by the enricher without manual reset.

### 3. Source Coverage Gap — Not Anti-Bot

SSC NewsSearch (congbothongtin.ssc.gov.vn) shows no anti-bot protection (confirmed in
`docs/vps-sources/ssc-bctc-newsearch/recon.md` 2026-06-06): no Cloudflare, no WAF,
no rate-limit, Oracle ADF session tokens only. The VPS script `discover-bctc-urls-browser.py`
now uses a stdlib curl 3-step handshake (FIX-VPS-SSC-CURL-SCRAPER, commit 7ed37441,
2026-06-06) — no Chromium needed. BCTC PDFs for HOSE-listed tickers are served via the
SSC portal at `exchange_code="1"` (HOSE) and cached at `/root/bctc-cache/PPC/` on the VPS.

The Q4-2025 failure was therefore a **timing gap** (fix not yet available) + **schema gap**
(`last_attempt` column absent), NOT a permanent source blockage. The source is now reachable.

### 4. Current Enricher Blindspot for Q4-2025

Even though the source is now reachable, the enricher will never re-attempt Q4-2025 because:
1. The row is `status=url_not_found` — only Arm 2 of the COMBINED_SQL picks up url_not_found rows.
2. Arm 2 requires `last_attempt IS NOT NULL` — which is NULL on this row.
3. Arm 2 also requires `attempts < 6` — this row has `attempts=6`.

A manual DB reset (`status='pending', attempts=0`) is required to re-enqueue Q4-2025.

---

## Requirements

### FR-1: Queue Reset for PPC Q4-2025
**DDD layer: application**

Reset `bctc_vps_queue` row id=255887 (PPC Q4-2025) from `url_not_found` to
`pending` with `attempts=0` and `source_url=NULL`, so the next enricher cron cycle
picks it up via Arm 1 (normal pending).

Acceptance: `SELECT status, attempts, source_url FROM bctc_vps_queue WHERE id=255887`
returns `status='pending', attempts=0, source_url=NULL`.

### FR-2: Enricher Successfully Discovers PPC Q4-2025 PDF URL
**DDD layer: infrastructure (hsxBctcFetcher.ts) + domain (bctcDiscovery.ts)**

The `bctcQueueEnricherJob` must resolve a valid `source_url` for PPC Q4-2025 within
one cron cycle (15 min). The discovery chain for HOSE tickers is:
- Strategy 0: `fetchHsxBctcUrls("PPC", 2025, 5000, "Q4")` via `api.hsx.vn`
- Strategy 1 fallback: VPS Playwright endpoint → `discover-bctc-urls-browser.py PPC 2025 Q4`
  → `discover_from_ssc_curl("PPC", 2025, "Q4")` on the VPS SSC NewsSearch path.

Acceptance: after one enricher cycle, `bctc_vps_queue` row id=255887 has
`source_url IS NOT NULL AND status='pending'`.

### FR-3: PPC Q4-2025 PDF Fetched and Queued for Extraction
**DDD layer: infrastructure (bctcPdfPullJob.ts)**

After FR-2, the `bctcPdfPullJob` must fetch the PDF and trigger extraction:
- If `source_url` starts with `https://staticfile.hsx.vn/` — direct fetch, no VPS.
- If `source_url` starts with `http://125.212.251.27:8765/bctc-files/` — VPS proxy fetch
  (PDF already cached on VPS by the SSC curl discovery step).
- PDF must pass size guard (>= 10 240 bytes).
- Extraction triggered → `financial_reports` row created for PPC Q4-2025.

Acceptance: `SELECT COUNT(*) FROM financial_reports WHERE action_code='PPC' AND period_year=2025 AND period_quarter='Q4'` returns 1.

### FR-4: PPC Q3-2025 URL Populated (Source Only — Not Extraction)
**DDD layer: application (bctcQueueEnricherJob) + infrastructure (hsxBctcFetcher)**

Row id=1308151 (PPC Q3-2025) already has a `source_url` but it is the wrong document
(Q1-2026 URL in a Q3-2025 slot — the SPRINT-HPG-QUEUE-URL-FIX lane handles the URL
correction). This sprint's requirement: verify the enricher, once FIX-CTG-1 is active,
correctly resolves Q3-2025 to a Q3-specific PDF. The `period_quarter='Q3'` parameter
is forwarded to `fetchHsxBctcUrls` (confirmed in `bctcQueueEnricherJob.ts` line ~229).
The hsx.vn API time-field filter maps Q3 → monthPrefix `"03"`. No additional code change
needed here; this FR is a verification requirement for the architect's acceptance test.

### FR-5: NULL-URL Pending Rows for Earlier Periods (Q2/Q1-2025, Q4/Q3/Q2/Q1-2024)
**DDD layer: application (bctcQueueEnricherJob)**

Eight queue rows (ids 1308190, 1308229, 1308268, 1308307, 1308346, 1308385, 1308424 +
1308151 after URL correction) are `status=pending, source_url=NULL`. The enricher
will process them normally in batch. No code change needed; they are picked up by
Arm 1. This FR confirms no additional queue manipulation is required beyond FR-1.

### FR-6: VPS Script Deployment Verification
**DDD layer: infrastructure (VPS vps-scripts/discover-bctc-urls-browser.py)**

`FIX-VPS-SSC-CURL-SCRAPER` (commit 7ed37441, 2026-06-06) must be deployed to the VPS
at `/root/vps-scripts/discover-bctc-urls-browser.py`. The SSC curl path is only
operational if the deployed script is current. The ops/vps-deploy runbook governs sync.

Acceptance: `ssh vps 'python3 /root/vps-scripts/discover-bctc-urls-browser.py PPC 2025 Q4'`
returns a JSON result with `results[0].source = "SSC-NewsSearch"` and a valid proxy URL,
OR hsx.vn Strategy 0 succeeds before the VPS is reached.

### NFR-1: No Chromium on VPS
**DDD layer: infrastructure (VPS)**

The VPS cannot run Chromium (`pthread_create EAGAIN` crash). All VPS-side PDF discovery
must use the SSC curl path (`urllib` + cookie jar, 3-step ADF handshake). The `discover-bctc-urls-browser.py`
script must not invoke `playwright`, `pyppeteer`, or any subprocess that launches a browser.
Confirmed satisfied by FIX-VPS-SSC-CURL-SCRAPER.

### NFR-2: Geo-Block Policy
**DDD layer: infrastructure**

SSC portal (`congbothongtin.ssc.gov.vn`) is geo-restricted from France.
All SSC curl calls must run on the VPS (Vietnam IP). The `bctcQueueEnricherJob`
triggers the VPS endpoint via `BCTC_DISCOVER_URL` env var
(`http://125.212.251.27:8765/proxy/bctc-discover`). The hsx.vn mediafiles API
(Strategy 0) is accessible from France — no VPS required.

### NFR-3: Idempotent Queue Reset
**DDD layer: application**

The queue reset for FR-1 must be idempotent: if run twice, the row must remain in
`status='pending', attempts=0` (not double-reset). An `UPDATE ... WHERE status='url_not_found'`
guard prevents double-reset.

### NFR-4: Period-Correct URL Injection
**DDD layer: domain (bctcDiscovery.ts) + infrastructure (hsxBctcFetcher.ts)**

The enricher must pass `period_year` and `period_quarter` from the queue row to
`discoverHosePdfUrls()` (FIX-CTG-1 already ships this). The hsx.vn fetcher filters
`time` field: Q4 → monthPrefix `"04"`. No URL from a different quarter must be
written into a PPC queue row.

---

## Edge Cases

### EC-1: hsx.vn Returns Empty for PPC Q4-2025
PPC Q4-2025 PDF may not be indexed on hsx.vn (late filing, or mediafiles API coverage
gap for thermal-power companies). In this case Strategy 0 returns `[]` and the enricher
falls through to Strategy 1 (VPS SSC NewsSearch). The SSC portal covers ALL listed tickers
regardless of exchange.

### EC-2: PPC Q4-2025 PDF Has Spaces in URL
The Q1-2026 `source_url` already observed in the queue contains spaces (`20260420 - PPC - CBTT Bao cao...`).
The VPS proxy URL is a stable `http://125.212.251.27:8765/bctc-files/PPC/<safe_filename>` path
(sanitised by `_sanitise_filename` in the VPS script). The hsx.vn static CDN URL
(`https://staticfile.hsx.vn/...`) may also contain spaces. The `bctcPdfPullJob` must
URL-encode spaces before fetching, or the VPS must serve the canonical proxy URL.

### EC-3: SSC Session Expiry During Multi-Quarter Batch
SSC JSESSIONID expires after ~10 hours. For a batch of 8+ PPC rows processed in a
single enricher cycle, the VPS script creates a fresh session per call (confirmed in
`discover_from_ssc_curl` — `_ssc_make_opener()` is called each invocation). No session
reuse risk.

### EC-4: PPC BCTC Is Parent-Company (Riêng Lẻ) Not Consolidated
PPC is not a large conglomerate. Its BCTC is likely standalone (`báo cáo tài chính riêng lẻ`),
not consolidated. The hsx.vn ranker prefers `type="Quý"` + `fileName contains "hop nhat"`
(consolidated). If PPC's PDF filename does not contain "hop nhat", the ranker falls back
to rank 1 (`type="Quý"`, non-consolidated) — this is correct behaviour. No code change needed.

### EC-5: SSC Portal Returns HOSE Exchange Code "1" for PPC
The VPS script `discover_from_ssc_curl` hardcodes `exchange_code = "1"` (HOSE).
PPC is HOSE-listed — this is correct. No risk of exchange mismatch.

### EC-6: Grace-Period Arm 2 Never Fires for Q4-2025 Even After Reset
After FR-1 reset (status='pending', attempts=0), the row moves to Arm 1 (normal pending).
Arm 2 (grace-period) is irrelevant post-reset. The enricher will pick it up via Arm 1
in the next cycle.

---

## DDD Layer Mapping

| Requirement | Layer | File / Component |
|---|---|---|
| FR-1: Queue reset | application | One-shot migration script or `task_queue_reset` tool call |
| FR-2: URL discovery | domain | `bctcDiscovery.ts::discoverHosePdfUrls` → `hsxBctcFetcher.ts::fetchHsxBctcUrls` |
| FR-2: VPS fallback | infrastructure | `bctcQueueEnricherJob.ts::runBctcQueueEnricherJob` → VPS endpoint → `discover-bctc-urls-browser.py` |
| FR-3: PDF fetch + extract | infrastructure | `bctcPdfPullJob.ts::runBctcPdfPullJob` → `pdfExtractorClient.ts` → `fetchParseAndStoreBctc` |
| FR-4: Q3 verification | infrastructure | `hsxBctcFetcher.ts::quarterToMonthPrefix("Q3")` = "03" |
| FR-5: Null-URL rows | application | `bctcQueueEnricherJob` Arm 1 — no change needed |
| FR-6: VPS script sync | infrastructure | VPS deploy runbook (`docs/vps-sources/`) |
| NFR-1: No Chromium | infrastructure | VPS `discover-bctc-urls-browser.py` SSC curl path |
| NFR-2: Geo-block | infrastructure | `BCTC_DISCOVER_URL` env → VPS proxy endpoint |
| NFR-3: Idempotent reset | application | Reset script guard `WHERE status='url_not_found'` |
| NFR-4: Period-correct | domain | FIX-CTG-1 already shipped — verify in enricher output |

---

## Blockers / Risks

### B1 — VPS Script Not Deployed (RISK: HIGH)
FIX-VPS-SSC-CURL-SCRAPER (commit 7ed37441, 2026-06-06) is committed to main but may
NOT be deployed to `/root/vps-scripts/discover-bctc-urls-browser.py` on the VPS.
If undeployed, Strategy 1 (VPS fallback) will run the OLD Playwright path → crash.
**Resolution:** ops must `rsync` / `scp` the updated script to the VPS before the
first enricher cycle. Verify with `ssh vps head -5 /root/vps-scripts/discover-bctc-urls-browser.py`
and confirm the `FIX-VPS-SSC-CURL-SCRAPER` docstring is present.

### B2 — No URL Found on hsx.vn for PPC Q4-2025 (RISK: MEDIUM)
PPC Q4-2025 BCTC may not be indexed on `api.hsx.vn/m/api/v1/1/mediafiles/5/{id}?year=2025`.
This depends on whether PPC filed on time and HOSE uploaded to their mediafiles endpoint.
If hsx.vn returns empty, Strategy 1 (SSC curl via VPS) is the fallback. The SSC portal
covers all listed HOSE tickers. Risk is LOW if VPS is deployed (B1 resolved).

### B3 — URL Has Spaces / Encoding Issue (RISK: LOW)
Observed in Q1-2026 row: `source_url` contains raw spaces. The `bctcPdfPullJob` uses
`source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'` to identify VPS-proxy URLs.
If hsx.vn returns a URL with spaces (Strategy 0), the VPS proxy path won't match and
the PDF pull job won't process it. Architect must verify URL encoding at time of
`updateStmt.run(firstUrl, item.id)` in the enricher, or add percent-encoding for spaces.

### B4 — SSC Portal Session State (RISK: LOW)
SSC portal is stateful (JSESSIONID). Concurrent enricher runs for multiple tickers could
in theory share a cookie jar if sessions are cached. The current VPS script creates a
fresh opener per call — no risk of session collision.

### B5 — PPC Historical PDFs Not on SSC Portal (RISK: MEDIUM for older quarters)
Q2/Q1-2025 and 2024 quarters: the SSC portal retains filings for 2–3 years typically.
PDFs older than 2023 may no longer be served. Architect should test discovery for
Q4-2024 as the oldest mandatory period. If SSC has no filing for older quarters, the
enricher will correctly mark them `url_not_found` after exhausting attempts.

---

## Acceptance Criteria

1. `SELECT status, attempts, source_url FROM bctc_vps_queue WHERE id=255887` →
   `status='pending', attempts=0, source_url IS NULL` (queue reset complete, FR-1).

2. After one enricher cron cycle: `SELECT source_url FROM bctc_vps_queue WHERE id=255887`
   returns a non-null URL ending with `.pdf` (FR-2).

3. After one PDF pull cron cycle: `SELECT COUNT(*) FROM financial_reports WHERE action_code='PPC' AND period_year=2025 AND period_quarter='Q4'` = 1 (FR-3).

4. `SELECT source_url FROM bctc_vps_queue WHERE action_code='PPC' AND period_year=2025 AND period_quarter='Q4'`
   URL does NOT contain spaces (URL encoding correct, EC-2 / B3 resolved).

5. VPS script verification: `python3 /root/vps-scripts/discover-bctc-urls-browser.py PPC 2025 Q4`
   on the VPS returns a JSON result with `results[0].url` non-null (FR-6, B1 resolved).

6. `SELECT COUNT(*) FROM bctc_vps_queue WHERE action_code='PPC' AND source_url IS NOT NULL AND status='pending'`
   >= 2 within two enricher cycles (Q4-2025 + at least one other quarter discovered, FR-5).

---

## Implementation Notes for Architect

1. **FR-1 delivery:** A minimal one-shot SQL statement is sufficient:
   `UPDATE bctc_vps_queue SET status='pending', attempts=0, source_url=NULL, last_attempt=NULL WHERE id=255887 AND status='url_not_found'`
   This can be delivered as a Bun migration script or a `task_queue_reset` tool.
   No schema change required.

2. **B1 is the gate blocker:** If VPS script is not deployed, FR-2 Strategy 1 fails.
   Architect should include a VPS deploy step as Task #1 before triggering the enricher.

3. **B3 URL encoding:** The `fetchHsxBctcUrls` function constructs download URLs via
   `filePath.replace("~", STATICFILE_BASE)` where `filePath` comes from the hsx.vn API
   verbatim. If the API returns paths with spaces, the enricher stores them as-is.
   The `bctcPdfPullJob` SQL filter uses `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`
   — a VPS-proxy URL (spaces-free) will pass; a raw staticfile.hsx.vn URL with spaces
   will be attempted directly. Architect should test whether the hsx.vn CDN accepts
   space-encoded vs percent-encoded URLs and add `encodeURI()` in `fetchMediafileUrls`
   if needed.

4. **No new source adapter needed:** The existing two-strategy chain (hsx.vn + VPS SSC curl)
   is sufficient for PPC. The only missing pieces are (a) queue reset, (b) VPS deploy.

---

## Zone Guess

**Zone:** `apps/mcp-server/src/scheduler/financial-reports/` (enricher + pull job) +
`apps/mcp-server/src/infrastructure/fetchers/` (hsx fetcher) +
`vps-scripts/` (VPS deploy verification).
Zone classification: **dev-zone** (mcp-server scheduler + infrastructure layers).
