# SPIKE — INVESTIGATE-EMPTY-DATA-TABLES

- **Date:** 2026-07-31
- **Author:** dev-mcp-server (BOUNDED-1 auto-pickup)
- **Task-id:** INVESTIGATE-EMPTY-DATA-TABLES
- **Question:** 5 tables (`credit_data`, `insider_transactions`, `public_contracts`, `pharma_events`, `broker_sanctions`) have 0 rows. For each: empty-by-design (rare events) or dead-pipeline?
- **Scope note:** Writer/pipeline angle only — `DS-DEGRADE-01-FIX` (2026-07-23, commit `b1d2f0582`) already covers the SERVE layer for `public_contracts`.
- **Prior art:** `docs/spikes/SPIKE_1922-empty-tables-audit.md` (2026-05-16, architect) audited `credit_data` (C-orphan), `insider_transactions` (B-silent-failure) and `pharma_events` (D-legit-empty) at that time. This SPIKE re-verifies all three live 2.5 months later (all conclusions changed except `credit_data`) and investigates the 2 tables that spike didn't cover (`public_contracts`, `broker_sanctions`).

## Approach

Live-verified against the actual bind-mounted production DB (`docker-compose.yml`: `./data/live:/app/data`, `DB_PATH=/app/data/market.db` — same file for all 13 services, not a stale named-volume mount). `sqlite3 -readonly` row counts + `cron_job_runs` history per job, cross-referenced against source (`schedulerJobTable.ts`, `cronConfig.ts`, fetcher files, VPS proxy config), plus live `curl` probes of the VPS proxy endpoints and origin sites to reproduce the writer's actual runtime behavior (not just static-read the code).

## Findings

### 1. `credit_data` — **empty-by-design (orphan, no writer — already fully diagnosed)**

Zero production references confirmed today (`grep -rn "credit_data" apps/mcp-server/src` → only the documented exclusion comments). Sprint 1922c (2026-05-16, commit `12b8417b6`) already classified this as a zombie orphan (pre-migration artifact, no `CREATE TABLE`/writer/reader anywhere) and added a `DO NOT add new writers` guard comment in `schema-macro.ts`, plus a `freshnessSlaMonitor` exclusion. No pipeline exists to be dead — table is a schema-only relic. Not urgent, but `DROP TABLE IF EXISTS credit_data` (recommended by 1922c, never executed) remains an optional low-priority cleanup, not part of this SPIKE's scope.

### 2. `insider_transactions` — **dead-pipeline**

`insiderCheckJob` fires reliably every day (`cron_job_runs`: daily 01:00 UTC, `status='success'`, no scheduling gap — 8/8 sampled days 07-24..07-31 all ran). But `rows_written=0` on every single run. Root cause, live-reproduced today: `sscInsider.ts` fetches `http://125.212.251.27:8765/proxy/ssc-insider` (VPS proxy → `congbothongtin.ssc.gov.vn/faces/.../ketquagiaodich.jspx`). Live curl through the real VPS proxy just now returned **HTTP 200**, 6.8KB — contradicting the `vps-proxy-server.js` code comment's 2026-07-29 claim of a persistent upstream 503 outage. But the 200 response is a pure Oracle ADF/WebCenter JS bootstrap shell (`AdfLoopbackUtils`, zero `<table>`/`<tr>`/`<td>` tags, ends in `This page uses JavaScript and requires a JavaScript enabled browser.`). `sscInsider.ts`'s `parseInsiderHtml()` is a plain regex `<tr>/<td>` extractor — it structurally **cannot ever** extract real rows from this endpoint via a bare HTTP GET, regardless of upstream health. This is a distinct, deeper defect than the outage diagnosed on 07-29: even when SSC returns 200 (as it does right now), the pipeline is still dead.

### 3. `public_contracts` — **dead-pipeline, root cause pinned exactly**

`publicContractsJob` fires reliably weekly (Monday 03:00 UTC, `status='success'` every week 06-01..07-27, no scheduling gap) and the table now physically exists (`DS-DEGRADE-01-FIX`, 07-23, fixed the missing-table serve-layer bug). Still `rows_written=0` every week. Root cause, live-reproduced: `docker-compose.yml` sets `MUASAMCONG_VPS_PROXY_URL=http://125.212.251.27:8765/proxy/muasamcong` (no `?path=` param). `getMuasamcongUrl()` in `muasamcong.ts` returns this env var **verbatim**, discarding the actual results-page path baked into `MUASAMCONG_ORIGIN` (`/web/guest/home-page-new-ver2/-/thauthau/ket-qua-chon-nha-thau`). `vps-proxy-server.js`'s `/proxy/muasamcong` route only forwards to that deep path when given `?path=<encoded-path>` — never supplied. Live curl of the exact configured URL just now: HTTP 200, 295KB, but it's the muasamcong.mpi.gov.vn **portal homepage** (`<title>Hệ thống mạng đấu thầu quốc gia — Bộ Tài chính...</title>`, canonical link `.../web/guest`), zero `table-result` matches, only 2 stray `<tr>` / 1 `<td>` (framework chrome, not the results table). `parseContractsFromHtml()` correctly finds nothing on a homepage — it will find nothing on **every** run forever, independent of how many real contracts VN government procurement publishes weekly (normally hundreds-to-thousands nationally).

### 4. `pharma_events` — **dead-pipeline, two independent stacked defects**

**(a) Scheduling.** `davPharmacyCheckJob` (monthly, 1st @ 06:00 `Asia/Ho_Chi_Minh` = 23:00 UTC prior day) has recorded exactly **one** successful run ever: 2026-04-30 23:00 UTC. Zero rows since — June 1 and July 1 both silently missed, no error row, nothing. This is the same root-cause CLASS already diagnosed and fixed for 6 sibling jobs this sprint (`FIX-CRON-SUNDAY-STARTUP-CATCHUP` ×4, `FIX-CRON-SSCCHECKERJOB-DEAD-87D`, `FIX-BASE-RATE-COMPUTATION-CRON-DEAD`): node-cron's `Scheduler.start()` re-seeds its `lastCheck` from `new Date()` on every container (re)construction, so a job with only one narrow firing window per period silently loses that whole period if the process isn't alive at the exact instant. `davPharmacyCheckJob` was never included in that sweep — it has **no** `shouldRunCatchup`/startup-catchup block, unlike its now-fixed siblings. Corroboration: the confirmed 2026-06-28→07-19 restart-storm also silently cost the July-1 window of two OTHER same-day-of-month jobs (`monthlySignalQualityAuditJob`, `summaryJob:monthly`) — but `davPharmacyCheckJob` additionally missed June, meaning it has a strictly worse gap than its siblings (still consistent with the same underlying class, just unswept).
**(b) Reachability.** Independent of (a): live-tested today, `https://dav.gov.vn/` hard-times-out (25s, exit 28, zero bytes) from the France-hosted mcp-server. `davPharmacy.ts` has **zero** VPS-proxy fallback (no env-var override, no `vps-proxy-server.js` route for `dav.gov.vn`) — unlike its Sprint-1922-series siblings `muasamcong.ts`/`sscInsider.ts`, which both got VPS-proxy wiring. `fetchDavPharmacy()`'s documented "never throws, empty on error" contract means even a correctly-scheduled run would currently return `[]` and log a swallowed warning, not an error — so fixing (a) alone would NOT populate the table.

### 5. `broker_sanctions` — **dead-pipeline, unambiguous, self-documented stub**

`brokerSanctionsSweep` fires correctly on its quarter-guard schedule (last-Friday-of-month, `0 8 25-31 * 5`; non-quarter months hit the skip branch, quarter months hit the real path — confirmed live: 05-29 skip, 06-26 real-run×2, 07-31 skip, matching [3,6,9,12] guard exactly). The job's own `defaultFetchSanctions()` in `brokerSanctionsJob.ts` is a literal, explicitly-labeled stub:
```
// TODO(1920d-fetcher): implement real SSC enforcement page scraper.
...
async function defaultFetchSanctions(): Promise<InsertBrokerSanctionInput[]> {
  return [];
}
```
Sprint 1920d shipped the scaffolding (quarter-guard, dedup schema, zero-result WORK alert) intentionally with a stub fetcher and a comment saying the real scraper is a follow-up — that follow-up was never done. No ambiguity here; this is the cleanest finding of the 5.
Bonus finding: the target page (`https://congbothongtin.ssc.gov.vn/faces/NewsDetailPage.xhtml`, live-curled today) is — like finding #2 — a pure Oracle ADF/WebCenter JS-only shell (zero table markup, same `AdfLoopbackUtils`/`<noscript>` signature). Whoever implements the real fetcher will hit the identical JS-rendering obstacle as `insider_transactions`; the two fixes should share whatever rendering solution gets built (this stack already runs a `flaresolverr` container for JS-heavy sites — worth evaluating as the shared solution).

## Verdict Table

| Table | Verdict | Root cause |
|---|---|---|
| `credit_data` | empty-by-design (orphan) | No writer exists; already diagnosed/guarded Sprint 1922c. Optional: `DROP TABLE`. |
| `insider_transactions` | dead-pipeline | SSC portal is JS-only (Oracle ADF/WebCenter); regex HTML parse structurally cannot extract data even when upstream returns 200. |
| `public_contracts` | dead-pipeline | `MUASAMCONG_VPS_PROXY_URL` env var used verbatim, drops the `?path=` needed to reach the results page — proxy returns the portal homepage instead, live-confirmed. |
| `pharma_events` | dead-pipeline (2 stacked causes) | (a) No startup-catchup guard — job has fired once in 3 months, same unswept class as 6 already-fixed sibling jobs. (b) `dav.gov.vn` unreachable (hard timeout) from France with zero VPS-proxy fallback. |
| `broker_sanctions` | dead-pipeline | Fetcher is an explicit `TODO` stub (`return []`) shipped intentionally in Sprint 1920d, follow-up never built. Target page also JS-only (shares #2's obstacle). |

## Recommended next step: real sprint — 4 follow-up FIX tasks

1. **FIX-PUBLIC-CONTRACTS-MUASAMCONG-PROXY-PATH** (zone `apps/mcp-server/`, size S) — `getMuasamcongUrl()` must compose `${MUASAMCONG_VPS_PROXY_URL}?path=${encodeURIComponent(<results-page-path>)}` when the proxy env var is set, instead of using it verbatim. Root cause pinned exactly; smallest of the 4.
2. **FIX-DAV-PHARMACY-CATCHUP-AND-VPS-PROXY** (zone `apps/mcp-server/` + `vps-scripts/`, size M) — (a) add a `davPharmacyCheckJob` startup-catchup block mirroring the `shouldRunCatchup` + `jobRunRepo.wrapRun` pattern already proven for 6 sibling jobs this sprint; (b) wire `davPharmacy.ts` through a new `/proxy/dav-pharmacy` VPS route (mirror `muasamcong.ts`/`sscInsider.ts` pattern) since `dav.gov.vn` hard-times-out from France.
3. **FIX-SSC-ADF-JS-RENDERING-INSIDER-TRANSACTIONS** (zone `apps/mcp-server/`, possibly `vps-scripts/`, size M/L) — SSC's `congbothongtin.ssc.gov.vn` portal is Oracle ADF/WebCenter, JS-rendered only. Plain `fetch()` + regex HTML parse can never work. Needs a JS-executing fetch path (evaluate routing through the already-deployed `flaresolverr` container, or a proper ADF Partial-Page-Render request sequence).
4. **FIX-BROKER-SANCTIONS-SSC-FETCHER-STUB** (zone `apps/mcp-server/`, size M) — implement the real `defaultFetchSanctions()` scraper for the SSC enforcement page (`https://congbothongtin.ssc.gov.vn/faces/NewsDetailPage.xhtml`). Shares #3's JS-rendering obstacle — sequence after #3, or scope a shared rendering helper.

`credit_data` needs no FIX task (already closed/guarded); optional `DROP TABLE` cleanup only.

- **Code reference:** investigation-only, no throwaway branch created (read-only `sqlite3 -readonly` queries + live `curl` probes against the running VPS proxy / origin sites; zero code changes).
