# Architecture Brief — SPRINT-PPC-PDF-SOURCING

**Sprint:** SPRINT-PPC-PDF-SOURCING
**Date:** 2026-06-07
**Architect cycle:** a1
**BA spec:** docs/handoffs/SPRINT-PPC-PDF-SOURCING-BA.md (2026-06-07, c1)
**ZONE:** dev-zone
**DDD services:** mcp-server + vps-scripts

---

## Brownfield Scan

Files read and verified in this cycle:

| File | Layer | Finding |
|---|---|---|
| `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` | interface/scheduler | COMBINED_SQL Arm 1 + Arm 2 confirmed; FIX-CTG-1 (period_year + period_quarter) live at L228 |
| `apps/mcp-server/src/domain/services/bctcDiscovery.ts` | domain | Two-strategy chain: Strategy 0 hsx.vn (injectable `_fetchHsx`), Strategy 1 VPS (`BCTC_DISCOVER_URL`); SSC/cafef/vietstock removed |
| `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts` | infrastructure | `quarterToMonthPrefix` map: Q4→"04"; URL constructed as `filePath.replace("~", STATICFILE_BASE)` — raw spaces preserved |
| `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` | interface/scheduler | SQL filter: `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`; `VPS_BCTC_BASE_URL` constant |
| `vps-scripts/discover-bctc-urls-browser.py` | infrastructure/VPS | commit 7ed37441 content confirmed; `discover_from_ssc_curl` present; `discover_from_hose_ssc` delegates to it; `discover_bctc_pdf` Step 3 is SSC-curl |

---

## Validated and Corrected BA Claims

### CONFIRMED (no change)

**Stuck row id=255887 (PPC Q4-2025):**
Live DB probe confirms:
```
id=255887, status=url_not_found, attempts=6, source_url=NULL, last_attempt=NULL
```
Both Arm 2 conditions permanently false. Manual reset is required. BA claim fully validated.

**COMBINED_SQL Arm 2 dead for this row:**
Code at `bctcQueueEnricherJob.ts` L154–160 confirms: `status='url_not_found' AND last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days') AND attempts < 6`. Row has `last_attempt=NULL` and `attempts=6` — both conditions fail. Permanently excluded from enricher. BA claim fully validated.

**8 NULL-URL pending rows (FR-5):**
Live DB probe returns rows: ids 1308151, 1308190, 1308229, 1308268, 1308307, 1308346, 1308385, 1308424. All `status=pending, source_url=NULL`. No manipulation needed beyond the FR-1 reset. BA claim validated.

**BA note on Q3-2025 having wrong URL — CORRECTED:**
Live DB probe shows `id=1308151, source_url=NULL` (not a Q1-2026 URL). The BA spec and spike were based on an earlier DB state where the wrong URL had been written. Current state: Q3-2025 is clean `NULL` and will be picked up by Arm 1. No URL corruption in current production DB for PPC Q3-2025.

**No new adapter needed:**
Confirmed. Two-strategy chain (hsx.vn → VPS SSC-curl) is sufficient. BA claim validated.

### CORRECTED — B1 Status Change (CRITICAL)

**B1 — VPS Script Not Deployed: RESOLVED (not a blocker)**

BA spec identified B1 as a HIGH blocker: FIX-VPS-SSC-CURL-SCRAPER (commit 7ed37441) "may NOT be deployed to `/root/vps-scripts/discover-bctc-urls-browser.py`."

Live read-only VPS probes reveal:

1. `/root/vps-scripts/` directory exists but is **empty** (created 2026-04-24, no files).
2. The VPS proxy server (`vps-proxy-server.js`) invokes `BCTC_DISCOVER_SCRIPT` defaulting to `/root/discover-bctc-urls-browser.py` (root-level, not under `vps-scripts/`).
3. `/root/discover-bctc-urls-browser.py` on the VPS contains FIX-VPS-SSC-CURL-SCRAPER (7 matches).
4. Live test `python3 /root/discover-bctc-urls-browser.py PPC 2025 Q4` returned a valid JSON result with `source="SSC-NewsSearch"` and a non-null proxy URL.

**B1 is fully resolved. The deployed script is the correct version. `/root/vps-scripts/` was never the actual deploy target.** No ops task is needed for VPS script deployment.

### CORRECTED — VPS Discovery Results (New Finding)

Live probes against the VPS script for all PPC queue rows produced these results:

| Period | VPS Result | Source | URL (proxy) |
|---|---|---|---|
| Q4-2025 | FOUND | SSC-NewsSearch | `http://125.212.251.27:8765/bctc-files/PPC/20260330-PPC-CBTT-Bao-cao-tai-chinh-kiem-toan-2025-...pdf` |
| Q3-2025 | FOUND | SSC-NewsSearch | `http://125.212.251.27:8765/bctc-files/PPC/20251016-PPC-CBTT-Bao-cao-tai-chinh-Quy-3-nam-2025-...pdf` |
| Q2-2025 | FOUND | SSC-NewsSearch | `http://125.212.251.27:8765/bctc-files/PPC/20250716-PPC-CBTT-Bao-cao-tai-chinh-Quy-2.2025-...pdf` |
| Q1-2025 | FOUND | SSC-NewsSearch | `http://125.212.251.27:8765/bctc-files/PPC/20250416-PPC-CBTT-Bao-cao-tai-chinh-Quy-1-nam-2025-...pdf` |
| Q4-2024 | FOUND (annual) | SSC-NewsSearch | `http://125.212.251.27:8765/bctc-files/PPC/20250331-PPC-CBTT-BCTC-kiem-toan-2024-...pdf` |
| Q3-2024 | NOT FOUND | — | SSC returned no results |
| Q2-2024 | NOT FOUND | — | SSC returned no results |
| Q1-2024 | NOT FOUND | — | SSC returned no results |
| Q4-2023 | NOT FOUND | — | SSC returned no results |

**Key observations:**
- Q4-2025 returns the **audited annual 2025** report ("kiem toan 2025"), not a discrete Q4 quarterly. This is standard for Vietnamese BCTC: the audited annual statement subsumes the Q4 quarter. The enricher will store this as the Q4-2025 `source_url` — correct behaviour.
- B5 risk materialises: PDFs older than Q4-2024 are not on SSC. Rows id=1308307 (Q3-2024), 1308346 (Q2-2024), 1308385 (Q1-2024), 1308424 (Q4-2023) will exhaust enricher attempts and be marked `url_not_found`. This is expected and correct — no action required.
- All proxy URLs returned by `_sanitise_filename` are percent-encoded and space-free. B3 does not apply to SSC-sourced URLs.

### CONFIRMED — B3 URL Encoding (SCOPED DOWN)

BA spec identified B3 as a risk for hsx.vn Strategy 0 URLs with spaces (observed in Q1-2026 `source_url`). Live probe confirms:

- SSC-sourced VPS proxy URLs from `discover_from_ssc_curl` are sanitised via `_sanitise_filename` (spaces → hyphens, non-ASCII stripped, `urllib.parse.quote` applied in the returned proxy URL). **B3 does not apply to the SSC path.**
- B3 remains a risk only if Strategy 0 (hsx.vn) fires for PPC and returns a raw `staticfile.hsx.vn` URL with spaces. The `fetchMediafileUrls` function in `hsxBctcFetcher.ts` performs `filePath.replace("~", STATICFILE_BASE)` verbatim — no `encodeURIComponent`. If hsx.vn yields a PPC URL with spaces, the enricher stores it raw. The `bctcPdfPullJob` SQL filter `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'` would NOT match a `staticfile.hsx.vn` URL, so the pull job would attempt a direct fetch with unencoded spaces — likely to fail with HTTP 400.
- **Risk level for this sprint:** LOW. The Q1-2026 PPC row already has a space-containing hsx.vn URL (out of sprint scope), and Strategy 0 for PPC Q4-2025 is expected to either return a valid URL (if hsx.vn has it) or fall through to SSC (which returns a space-free proxy URL). The architect flags this as a pre-existing latent bug in `hsxBctcFetcher.ts` — `encodeURIComponent` should be applied in `fetchMediafileUrls` — but it is NOT blocking this sprint because the SSC path is proven to work and produces space-free URLs.

---

## Technical Design

### Architecture Overview

No new files. No schema changes. No new adapters. Two interventions required:

1. A one-shot idempotent SQL reset to re-enqueue PPC Q4-2025 (FR-1).
2. Triggering the existing enricher cron to process the reset row and the 8 NULL-URL pending rows (FR-2 / FR-5).

The pull job and extraction pipeline require zero changes (FR-3 self-executes once `source_url` is populated).

### FR-1: Queue Reset SQL

Idempotent, bound-parameter-safe reset for row id=255887:

```sql
UPDATE bctc_vps_queue
SET
  status        = 'pending',
  attempts      = 0,
  source_url    = NULL,
  last_attempt  = NULL
WHERE
  id     = 255887
  AND status = 'url_not_found';
```

The `WHERE status = 'url_not_found'` guard satisfies NFR-3: running twice leaves the row in `status='pending'` (second execution matches 0 rows, no-op).

**Delivery mechanism:** `task_queue_reset` MCP tool call, or a one-shot Bun migration script (`apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts`). The migration script is the safer approach — it can be audited, committed, and versioned. It must NOT be part of the normal migration sequence (no `runMigrations()` registration) — it is a one-shot data correction script invoked explicitly by `bun run`.

**Script template:**
```typescript
// apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts
// One-shot: reset PPC Q4-2025 stuck row. Run once. Idempotent.
import { getDb } from "../infrastructure/db/schema.js";

const db = getDb();
const result = db.run(
  `UPDATE bctc_vps_queue
   SET status='pending', attempts=0, source_url=NULL, last_attempt=NULL
   WHERE id=? AND status='url_not_found'`,
  [255887],
);
console.log(`Rows affected: ${result.changes}`);
// Expected: 1 on first run, 0 on subsequent runs
```

Verification SQL (run after):
```sql
SELECT status, attempts, source_url, last_attempt
FROM bctc_vps_queue
WHERE id = 255887;
```
Expected: `status='pending', attempts=0, source_url=NULL, last_attempt=NULL`.

### FR-2: Enricher Discovery Path for PPC Q4-2025

After FR-1 reset, the row has `status='pending', source_url=NULL`. The COMBINED_SQL Arm 1 will select it in the next enricher cron cycle.

Discovery chain for PPC (HOSE-listed):

1. **Strategy 0 (hsx.vn):** `fetchHsxBctcUrls("PPC", 2025, 5000, "Q4")`. If PPC Q4-2025 is indexed on hsx.vn, returns a `staticfile.hsx.vn` URL. If the URL contains spaces, the `bctcPdfPullJob` will attempt a direct HTTPS fetch — this may fail (B3). Accept this risk: if Strategy 0 returns a space-URL, the pull job will attempt it and fail, `attempts` is incremented, and the row stays `pending`. On the next enricher cycle, Strategy 0 may still return the same URL — this will become a recurrence. **Pre-emptive mitigation (optional, not blocking):** add `encodeURIComponent` in `fetchMediafileUrls` at `(item.filePath as string).replace("~", STATICFILE_BASE)`.

2. **Strategy 1 (VPS SSC-curl):** `bctcHttpFetch` calls `BCTC_DISCOVER_URL/PPC?year=2025&quarter=4`. VPS proxy invokes `/root/discover-bctc-urls-browser.py PPC 2025 Q4`. Returns `source="SSC-NewsSearch"`, proxy URL `http://125.212.251.27:8765/bctc-files/PPC/20260330-PPC-CBTT-Bao-cao-tai-chinh-kiem-toan-2025-kem-giai-trinh-bien-dong-KQSXKD-%28T.Viet%2C-English%29.pdf`. No spaces. `extractVpsPlaywrightUrls` validates: ends `.pdf`, starts `http://` — PASS.

The enricher writes `firstUrl` to `bctc_vps_queue.source_url` via `updateStmt.run(firstUrl, item.id)`.

### FR-3: PDF Pull and Extraction

`bctcPdfPullJob` SQL filter: `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`.

The URL written by the enricher starts with `http://125.212.251.27:8765/bctc-files/` — the LIKE filter matches. Pull job fetches with `X-API-Key: VPS_PUSH_API_KEY`, validates size >= 10 240 bytes (audited BCTC PDFs are multi-MB, no risk), saves to `data/pdfs/PPC_2025_Q4.pdf`, triggers `extractViaMicroservice` → `fetchParseAndStoreBctc`. Creates `financial_reports` row for PPC Q4-2025.

No code change required in `bctcPdfPullJob.ts`.

### FR-4: Q3-2025 Verification

Live DB probe shows id=1308151 is `source_url=NULL` (BA spec's claim of a wrong URL is stale). The Arm 1 enricher will pick it up, call Strategy 0 (`fetchHsxBctcUrls("PPC", 2025, 5000, "Q3")`) and Strategy 1. VPS live probe already returned a valid Q3-2025 URL. No code change needed; enricher handles this automatically.

### FR-5: NULL-URL Pending Rows

VPS live probes show 5 of the 8 NULL-URL rows have discoverable PDFs (Q3-2025, Q2-2025, Q1-2025, Q4-2024). The enricher Arm 1 processes all `pending, source_url=NULL` rows up to `batchSize=20` per cycle. With 8 rows, all fit in one cycle. No change needed.

Rows where VPS returns no results (Q3/Q2/Q1-2024, Q4-2023): enricher leaves them `pending` on first pass (attempts=0, `else { leave at 0 }` branch in enricher). On subsequent passes with `attempts > 0`, they increment until `attempts >= MAX_ENRICH_ATTEMPTS (5)` → marked `url_not_found`. Expected and correct.

### FR-6: VPS Script — No Deploy Task Needed

B1 is resolved. The VPS already runs commit 7ed37441 at `/root/discover-bctc-urls-browser.py`. No ops task is needed. FR-6 acceptance criterion is pre-satisfied.

---

## Ordered Task Breakdown for PM

| id | title | lane | gate | DDD layer | notes |
|---|---|---|---|---|---|
| T1 | Write one-shot migration script: `reset-ppc-q4-2025.ts` | developer | none (precondition: B1 resolved — DONE) | application | Writes the Bun script; no registration in migration sequence; idempotent SQL per spec above |
| T2 | Execute migration script on live DB; verify FR-1 acceptance SQL | developer | T1 complete | application | `docker exec ... bun run apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts`; read-verify `SELECT status, attempts, source_url FROM bctc_vps_queue WHERE id=255887` |
| T3 | Trigger enricher cron manually once (or wait ≤15 min); verify id=255887 source_url IS NOT NULL | developer | T2 complete | interface/scheduler | `docker exec ... bun -e "require('./src/scheduler/financial-reports/bctcQueueEnricherJob.js').runBctcQueueEnricherJob({})"` |
| T4 | Verify pull job picks up row; verify `financial_reports` PPC Q4-2025 row created | developer | T3 complete (source_url populated) | interface/scheduler | `bctcPdfPullJob` cron fires within 30 min; verify AC-3 SQL |
| T5 | Verify FR-4: Q3-2025 URL populated (no separate action — confirm in enricher log) | developer | T3 complete | — | Observation only; Q3 row is id=1308151, Arm 1 picks it up in same cycle as id=255887 |
| T6 | Verify B3 encoding: confirm source_url for id=255887 contains no raw spaces | developer | T3 complete | — | `SELECT source_url FROM bctc_vps_queue WHERE id=255887`; URL must not contain literal space |
| T7 (optional) | Fix B3 latent bug: add `encodeURIComponent` in `fetchMediafileUrls` for staticfile.hsx.vn URLs | developer | no blocker — schedule separately | infrastructure | Applies `encodeURIComponent` to `filePath` before `replace("~", STATICFILE_BASE)` in `hsxBctcFetcher.ts` |

**Critical path:** T1 → T2 → T3 → T4. T5 and T6 are verification observations within T3/T4. T7 is optional, non-blocking.

---

## Acceptance Criteria (Architect-level)

| # | Check | Query / Action | Expected |
|---|---|---|---|
| AC-1 | FR-1 queue reset | `SELECT status, attempts, source_url, last_attempt FROM bctc_vps_queue WHERE id=255887` | `pending, 0, NULL, NULL` |
| AC-2 | FR-2 URL discovered | Same query after one enricher cycle | `source_url IS NOT NULL AND source_url LIKE '%.pdf'` |
| AC-3 | FR-3 extraction | `SELECT COUNT(*) FROM financial_reports WHERE action_code='PPC' AND period_year=2025 AND period_quarter='Q4'` | `1` |
| AC-4 | URL encoding (B3) | `SELECT source_url FROM bctc_vps_queue WHERE id=255887` | No literal space in URL |
| AC-5 | VPS script version (B1) | Pre-verified by architect — `/root/discover-bctc-urls-browser.py` already has FIX-VPS-SSC-CURL-SCRAPER | PASS |
| AC-6 | FR-5 multi-period | `SELECT COUNT(*) FROM bctc_vps_queue WHERE action_code='PPC' AND source_url IS NOT NULL AND status IN ('pending','done')` within two enricher cycles | `>= 5` (Q4-2025 + Q3/Q2/Q1-2025 + Q4-2024) |

---

## Risks Carried Forward

| Blocker | Status | Severity | Description |
|---|---|---|---|
| B1 — VPS script undeployed | **RESOLVED** | ~~HIGH~~ N/A | VPS already runs correct script at `/root/discover-bctc-urls-browser.py`. `/root/vps-scripts/` is empty and is NOT the proxy server's script path. |
| B2 — PPC Q4-2025 not on hsx.vn | LOW | LOW | Strategy 0 may return `[]`; Strategy 1 (SSC-curl) is proven to return a valid URL. Not a blocker. |
| B3 — URL spaces (hsx.vn path) | Scoped down — OPEN (latent) | LOW | SSC-sourced proxy URLs are space-free. Risk applies only if Strategy 0 fires and returns a space-URL. Pre-emptive fix: `encodeURIComponent` in `fetchMediafileUrls` (T7 optional). |
| B5 — Historical PDFs not on SSC | CONFIRMED | MEDIUM (scoped) | Q3/Q2/Q1-2024 and Q4-2023 (4 rows) return no results from VPS live probes. These rows will exhaust enricher attempts and be marked `url_not_found`. Expected and acceptable — no action required. |

---

## Zone

**ZONE: dev-zone**

All code changes (migration script) are in `apps/mcp-server/src/migrations/`. VPS script is already deployed. No new files in `vps-scripts/`. No scheduler changes. No schema migrations.

---

## Notes to PM

1. B1 is resolved — no ops-vps-fetch or dev-vps-crawls task is needed for VPS deploy. Remove any ops-lane tasks from sprint board related to VPS script syncing.
2. The sprint scope shrinks: only T1 and T2 are dev tasks (migration script). T3/T4 are enricher cron verification (can be done by developer or ops observing logs).
3. T7 (B3 fix) is a separate optional improvement. It should be tracked as a follow-up task, not blocking sprint completion.
4. BA spec FR-4 note about Q3-2025 having a wrong URL is no longer accurate against the live DB. Q3-2025 row is clean (`source_url=NULL`). No corrective action needed for Q3-2025 beyond letting the enricher pick it up normally.
