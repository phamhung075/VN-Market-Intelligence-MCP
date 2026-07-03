# SPIKE-HSX-STRATEGY0-0URLS — Why does `discoverHosePdfUrls()` Strategy-0 return 0 URLs?

**Task:** SPIKE-HSX-STRATEGY0-0URLS (P0/critical, timebox 120min)
**Investigator:** dev-mcp-server (router-dispatched)
**Mode:** read-only investigation — code trace + bounded live probes (curl, and a
direct in-process call of the actual production TypeScript function via `bun run`).
No code changed, no branch created, no deploy/DB write performed.

---

## Question

Why does HSX Strategy-0 `discoverHosePdfUrls()` return 0 URLs for legitimately-HOSE-listed
tickers, and what is the minimal fix to restore live PDF-URL discovery?

---

## Approach tried

1. Read the full call chain: `domain/services/bctcDiscovery.ts` (`discoverHosePdfUrls`,
   `tryFetchHsx`) → `infrastructure/fetchers/hsxBctcFetcher.ts` (`fetchHsxBctcUrls`,
   `resolveNumericId`, `fetchMediafileUrls`) → wired into
   `scheduler/financial-reports/bctcQueueEnricherJob.ts`.
2. Live bounded `curl` probes (`--max-time 10`) against the real two-call hsx.vn recipe
   (`api.hsx.vn/l/api/v1/1/securities/stock`, `api.hsx.vn/m/api/v1/1/mediafiles/5/{id}`)
   with the exact headers `hsxBctcFetcher.ts` sends, for the 8 tickers named in the spawn
   brief (FPT, GVR, MBB, VHM, VIC, SSI, BID, ACB).
3. A direct in-process re-run of the ACTUAL production code (`bun run`, same Bun 1.3.13
   runtime the container uses) importing `fetchHsxBctcUrls` and `discoverHosePdfUrls`
   unmodified from this repo's current `main` HEAD, calling them exactly as
   `bctcQueueEnricherJob.ts` does (same params: `year`, `quarter="Q4"`, `_fetchHsx`).
4. Cross-checked against two same-day sibling documents already in the repo:
   `docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md` (architect SPIKE,
   docker-exec probe at 07:04Z) and `docs/agent-memory/notebooks/ops.md` §
   "RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL" (ops recon, 19:37–20:15Z, same day) —
   both purport to test the identical function/tickers, with **contradictory** results.
5. Traced the `bctc_vps_queue.deferred_infra` population back through git history to its
   origin (`FIX-BCTC-VPS-QUEUE-STALE-TRIAGE`, 2026-06-08) to determine whether it is
   actually related to the "17-day-dead pipeline since 2026-06-16" framing in the spawn
   brief.
6. Paginated the hsx.vn mediafiles endpoint (`pageIndex=2`) for FPT to check whether older
   filings are reachable at all, and in what shape.

---

## Findings

### Finding 1 — HSX Strategy-0 is NOT broken for current/recent quarters (falsifies the spike's premise)

Live evidence, right now, for **all 8** tickers named in the spawn brief (FPT, GVR, MBB,
VHM, VIC, SSI, BID, ACB) at Q4-2025 and Q1-2026:

- Direct `curl` against `api.hsx.vn/l/api/v1/1/securities/stock?code=<T>` → HTTP 200,
  valid numeric ID for every ticker (FPT=2129, GVR=3184, MBB=2481, VHM=2676, VIC=2239,
  SSI=2204, BID=2289, ACB=2784).
- Direct `curl` against `api.hsx.vn/m/api/v1/1/mediafiles/5/<id>?...&year=2026` → HTTP 200,
  real `.pdf` entries for Q1-2026 and Q4-2025 (e.g. FPT:
  `20260424 - FPT - BCTC hop nhat Quy 1 nam 2026.pdf`, time `01.2026`, type `Quý`).
- Running the **actual, unmodified** `fetchHsxBctcUrls()` / `discoverHosePdfUrls()` via
  `bun run` (same runtime, same headers, same code as production) for all 8 tickers ×
  {Q1-2026, Q4-2025} → **every single call returned ≥1 valid `staticfile.hsx.vn` PDF URL**,
  `source: "hsx"`. Zero failures, zero empty results.

This is **not just my own re-test** — it directly corroborates the independent, earlier,
same-day architect SPIKE (`docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md`,
docker-exec probe at 07:04Z), which explicitly answers its own sub-question 4 ("Is the
enricher returning 0 URLs for CURRENT quarters?"): **"No — confirmed working... it now
discovers URLs on nearly every 15-min cycle."** That brief's live evidence lists real hsx.vn
URLs discovered that same morning for ACB/BID/CTG/D2D/NKG/POW/SSI/VCI/VHM/VIC/VPB/VRE/GAS/
GVR/HCM/HSG/MBB — a list that **directly overlaps** with the tickers the later ops recon
claimed returned 0 URLs (MBB, VHM, VIC, SSI, BID, ACB, GVR all appear in both).

**The contradicting "0 URLs" claim comes from a later, same-day ops recon**
(`docs/agent-memory/notebooks/ops.md` § "Incident Diagnosis: RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL",
19:37–20:15Z), whose own log line reads:
```
discoverHosePdfUrls('FPT', {year:2025, quarter:4}) → 0 URLs
```
Note `quarter:4` — a bare **number**, not the string `"Q4"` that `quarterToMonthPrefix(quarter: string)`
requires (`hsxBctcFetcher.ts:264`, `quarter.toUpperCase()`). If that ad hoc probe script really
called the function with a numeric `quarter`, `.toUpperCase()` would throw a `TypeError`
inside `fetchMediafileUrls()`'s try/catch (`hsxBctcFetcher.ts:335-379`) and silently degrade to
`[]` — indistinguishable from "hsx.vn returned nothing" in the log, but actually a **test-harness
type mismatch**, not a network/parse failure. (Every real production call path — the seed
functions in `seedWatchlist.ts`, the `/api/bctc-fetch-queue` and `/api/push-bctc-pdf` handlers in
`server.ts`, and `bctcQueueEnricherJob.ts` itself — consistently use/validate the string form
`"Q1".."Q4"`, so this mismatch, if real, is confined to the ops recon's own probe script, not
to any production code path.) The router's own spawn brief already independently falsified the
ops recon's *other* claim in the same diagnosis ("not HOSE-listed") via `system-map.json`; this
spike additionally falsifies its "Strategy 0 returns 0 URLs" claim via live re-test.

### Finding 2 — The real, previously un-ticketed gap for OLDER quarters: no pagination + `fileType` format drift

`fetchMediafileUrls()` (`hsxBctcFetcher.ts:322-383`) hardcodes `pageIndex=1` — it never
paginates. Live probe of `api.hsx.vn/m/api/v1/1/mediafiles/5/2129?pageIndex=2&pageSize=100&year=2026`
for FPT returned `paging: {pageIndex:2, pageSize:100, totalCount:334, totalPages:4}` with real
BCTC PDFs going back to **2015** (e.g. `20160121_20160121 - VFS - BCTC Q4.2015.pdf`) — but
**every item on page 2 has `fileType: "application/pdf"`** (MIME-style), not `".pdf"`
(extension-style) as page-1's recent uploads have. `fetchMediafileUrls()`'s filter is an exact
match: `if (fileType !== ".pdf") continue;` (`hsxBctcFetcher.ts:358`). So even if pagination were
added, this filter alone would still silently drop every older-page result.

Net effect: hsx.vn genuinely **has** the older filings, but the current Strategy-0
implementation structurally cannot reach them (page-1-only cap + exact-string `fileType` filter).
This matters because it is exactly the range targeted by `backfillBctcHistorical()`
(`infrastructure/db/seedWatchlist.ts:220-246`, seeds Q3-2025 back to Q4-2023, 8 quarters ×
35 watchlist tickers ≈ 280 rows — close to the 328/293 figures cited below).

### Finding 3 — The 328 `deferred_infra` rows are a static, by-design-excluded population, unrelated to the 06-16 incident (the real red herring)

Traced via `git log --grep`: the 328 `deferred_infra` count is **not** a symptom of the
"pipeline dead since 2026-06-16" incident. It originates from `FIX-BCTC-VPS-QUEUE-STALE-TRIAGE`
(commit `157c0f404`, **2026-06-08** — a week *before* the 06-16 stall began), whose commit
message reads verbatim: *"328 HIST-VPS-BACKFILL rows (2023Q4–2025Q4) → status: deferred_infra
(sources gone/geo-blocked, 0 attempts, never drainable)"*. `interface/mcp/routes/fetchStatusHandler.ts`
documents this explicitly (lines 30, 123, 198): *"historical HIST-VPS-BACKFILL rows; sources
gone/geo-dead; non-actionable by design"*.

Confirmed by direct SQL-arm reading of `bctcQueueEnricherJob.ts` (lines 313-347, 404-410): none
of the three SELECT arms — Arm 1 (`status='pending'`), Arm 2 (`status IN ('url_not_found',
'enrich_failed')` grace-period), or the orphan-resync arm (`status IN ('pending','deferred_infra')
AND source_url LIKE '<VPS_BASE>%'`) — ever match a row with `status='deferred_infra' AND
source_url IS NULL`. These 293-of-328 rows are **never handed to `discoverHosePdfUrls()` at
all**, regardless of whether Strategy 0 is healthy. This is a deliberate 2026-06-08 policy
choice, made a week *before* Strategy 0 (hsx.vn, TASK-BCTC-3b, 2026-05-15 — actually a few weeks
*before* the triage) had been evaluated against this specific historical range; Finding 2 shows
that premise ("sources gone/geo-dead") is now stale for at least part of that range — the data
exists on hsx.vn, the current fetcher just can't reach/parse it (page cap + `fileType` filter).

The **actual** 06-16 incident (the genuinely actionable ~36-38 row backlog: `pending` /
`url_not_found` / `enrich_failed`) is **already fixed**, same day, via two separate, already
`done_verified` tasks confirmed in `docs/data/orch/orch-state.json` + `git log`:
`FIX-BCTC-ENRICHER-STUCK-BACKLOG` (Stage 2 — `last_attempt` stamping, commit `d92801332`/`14b955802`)
and `FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD` (Stage 3 — overlap mutex, commit `8bc0b5b5`). Neither of
those touches the static 328-row `deferred_infra` bucket, which was never in their scope.

---

## Recommended next step

1. **No code change to `hsxBctcFetcher.ts`/`bctcDiscovery.ts` is needed to "fix Strategy 0 for
   current quarters"** — it is healthy, verified live, and corroborated by an independent
   same-day SPIKE. Router/PO should down-rank or close the "HSX Strategy-0 broken" framing for
   the 06-16 incident specifically — that incident's actionable rows are already remediated.
2. **Flag the ops RECON-BCTC-ENRICH-0ROWS "0 URLs" claim for a quick, cheap re-verify** (not a
   fix task): re-run the exact probe with `quarter: "Q4"` (string) instead of `quarter: 4`
   (number) to confirm the type-mismatch theory in Finding 1, or rule it out in favour of a
   transient hsx.vn-side rate-limit/WAF blip (~1-2h window). Either way this is a test-harness
   question, not a production defect — cheap to close.
3. **If/when PO decides the 293 static historical `deferred_infra` rows are worth reviving**
   (real backlog-depth value for BCTC analytics), the minimal, precisely-zoned fix is two
   small, additive changes, both confined to
   `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts::fetchMediafileUrls()`:
   - **(a) Pagination:** loop `pageIndex` up to `paging.totalPages` (or a bounded cap, e.g. 5)
     instead of a hardcoded `pageIndex=1`, accumulating candidates across pages.
   - **(b) `fileType` filter:** accept both `".pdf"` (recent uploads) and `"application/pdf"`
     (older uploads) instead of the current exact-match `!== ".pdf"`.
   This is a `discovery/fetch`-layer change only (no schema change). A **separate, explicit**
   decision would still be needed to widen `bctcQueueEnricherJob.ts`'s SELECT arms to include
   `status='deferred_infra' AND source_url IS NULL` rows (bounded, e.g. only within a provable
   hsx.vn coverage window) — that is a queue-policy change, not a bug fix, and should go through
   PO/architect, not be bundled silently into the fetcher fix.
4. This spike's own conclusion should be routed back through PO — it materially changes the
   sprint's premise (from "fix Strategy 0" to "close/downgrade the 06-16 framing, cheaply
   re-verify ops's probe, and separately scope a `hsxBctcFetcher.ts` pagination+filter FIX only
   if the 293-row historical backlog is judged worth reviving").

---

## Code reference

- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — `discoverHosePdfUrls()` (L347-406),
  `tryFetchHsx()` (L214-227) — Strategy 0 orchestration, confirmed healthy.
- `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts` — `fetchHsxBctcUrls()`
  (L189-207), `resolveNumericId()` (L217-251, confirmed working for all 8 tickers),
  `fetchMediafileUrls()` (L322-383 — **pageIndex=1 hardcoded at L328-330, no pagination**;
  **exact-match `fileType !== ".pdf"` filter at L358**, drops legacy `"application/pdf"`-typed
  older entries — Finding 2).
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — production wiring
  (L484-509, `_fetchHsx: fetchHsxBctcUrls`), the 3 SELECT arms that structurally exclude
  `deferred_infra + source_url IS NULL` rows (`ARM1_ONLY_SQL`/`COMBINED_SQL` L313-347,
  orphan-resync `ORPHAN_SQL` L404-410) — Finding 3.
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — `backfillBctcHistorical()`
  (L220-246), the origin of the ~293-328-row historical seed population.
- `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` — L30, L123, L198,
  the explicit "non-actionable by design" documentation for `deferred_infra`, traced to
  `FIX-BCTC-VPS-QUEUE-STALE-TRIAGE` (commit `157c0f404`, 2026-06-08).
- `docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md` — independent, same-day
  architect SPIKE corroborating Finding 1 (Stage 2/hsx.vn confirmed working) and documenting
  Stage 3 (`bctcPdfPullJob` overlap guard, already fixed, commit `8bc0b5b5`).
- `docs/agent-memory/notebooks/ops.md` § "Incident Diagnosis: RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL"
  — the contradicted ops recon (source of the falsified "0 URLs"/"not HOSE-listed" claims).
- Live probe artifacts (bounded `curl --max-time 10` + a `bun run` of the unmodified production
  functions) were run from this repo's dev sandbox against the real `api.hsx.vn` endpoints;
  no repo files were modified by the probes.
