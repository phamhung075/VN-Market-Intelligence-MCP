# dev-team tick 2026-06-03 ~18:3xZ — CTG fetch correctness

## Outcome
CTG bctc-analyst 8-cycle blocker triaged → root gap found (BCTC-CTG-ATTACHMENT-FETCH referenced only in closed-task notes, never actionable; 5+ escalations drained as routine product). Promoted sprint **BCTC-FETCH-CORRECTNESS**.

## Shipped
- **SPIKE-BCTC-CTG-ATTACHMENT-FETCH** DONE `517a9056` (brief `docs/architecture-briefs/2026-06-03-bctc-ctg-attachment-fetch-spike.md`). Verdict **DEV-FIXABLE**: live-probed hsx.vn (CTG id 2351, reachable from FR) — full B02-TCTD "hop nhat" PDFs exist every quarter (Q1-2026 6.34MB); pipeline pulled a 524KB owa.hnx.vn cover letter ("CV CBTT BCTC Quy I.2026") → conf 0.0625, zero financials.
- **FIX-CTG-1** DONE-LIVE-VERIFIED `ddf37a3b` (mcp-server rebuild img 18:34:22Z). Defects B+C: `bctcQueueEnricherJob` now SELECTs+passes period_year/period_quarter; `hsxBctcFetcher.fetchHsxBctcUrls` quarter-filters via `time` field ("01."=Q1) + ranks `type="Quý"`+`fileName~"hop nhat"` first. 67/67 tests. Live-invoked deployed fetcher: CTG Q1-2026→rank[0] "BCTC hop nhat Quy I.2026", CTG Q4→"hop nhat Quy IV.2025". Discovery layer correct.

## 3 defects (spike)
- A (VPS): `vps-scripts/discover-bctc-urls-browser.py` no cover-letter discrimination (matched "CV CBTT" notice for HOSE-listed CTG).
- B (systemic, FIXED): enricher discarded year/quarter → defaulted year=2026,Q4 → wrong-quarter URLs written to MULTIPLE queue rows (Q3-2025+Q2-2025 corrupted with a Q1-2026 URL).
- C (FIXED): `fetchHsxBctcUrls` no quarter filter → newest-first wins.
- Dead code: `discoverBctcPdfUrlDirectApi.ts` (tests only, NOT active path — PO's original hypothesis).

## OPEN (next tick)
- **FIX-CTG-2** (dev-vps-crawls, `vps-scripts/`, S, med): Defect A cover-letter keyword skip; needs ops-vps deploy. depends FIX-CTG-1.
- **FIX-CTG-3** (dev-mcp-server, S, high): purge bad owa.hnx.vn source_url from `bctc_vps_queue` for CTG + re-enrich the Defect-B-corrupted Q3/Q2-2025 rows, re-enrich CTG→correct hop-nhat URL, re-fetch+re-extract (async VPS), DoD: `get_bctc_full(CTG)` real B02-TCTD bank data conf>0.5. depends FIX-CTG-1.

## Deferred (self-managing, no task)
FPT ESC-3 (16-cycle guard-renewed, FU-BCTC-HISTORY-COVERAGE data-coverage, multi-week) · ACB (PUB-5 conf 0.38, re-refine territory).

## Commits this tick
dd1a32ab (PO spike promote) → 517a9056 (spike findings) → board promote → ddf37a3b (FIX-CTG-1) → board close. All raw-verified in-zone, no leak.
