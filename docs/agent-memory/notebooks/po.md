# PO Notebook

## Last updated: 2026-05-14T20:28Z (c112 — 1916-bctc-queue-enricher SPIKE queued alongside 1915)

---

## Cycle 112 — User-injected CRITICAL: 1916-bctc-queue-enricher-scraper-broken

**Spawn context:** user prompt to `.claude/flows/po/main.md` adding new CRITICAL bug to backlog alongside 1915. Ops confirmed via Docker logs 2026-05-14 20:00-20:15 UTC.

### Bug summary (user-provided, ops-confirmed)
- `bctcQueueEnricherJob` SSC portal scraper returns 0 URLs for 14/30 watchlist tickers.
- Affected: DPM, KBC, MWG, NVL, REE, TCH, VNH + 7 others.
- Working: VCB, FPT, DIG, BSR, DGC, HPG, SHB, VEA, VNM (12 PDFs on disk, last Apr 27-29).
- Likely cause: SSC portal (ssc.hsx.vn) HTML structure changed → Cheerio/jsdom selectors stale.
- Impact: Q1-2026 BCTC collection blocked for 14 tickers. Banking deadline 2026-05-15.
- Key file: `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (user said `bctcQueueEnricher.ts` — actual filename `*Job.ts`).

### Triage decisions
- **NEW row added to Backlog: 1916-bctc-queue-enricher-scraper-broken** (CRITICAL/UNBLOCK, owner dev-mcp-server, zone `apps/mcp-server/`).
- **Concurrent with 1915 — NOT a duplicate**: 1915 = bctcReparseJob extraction-side silence (PDFs on disk, no DB rows); 1916 = bctcQueueEnricherJob discovery-side silence (NO new PDFs reaching disk for 14 tickers). Different upstream stages.
- **No block dependency**: user explicit "do not block on 1915". Both SPIKEs run in parallel.
- **NOT recurring-bug** vs 1908/1909-series (different module, different failure mode).
- Mode: SPIKE first (2h timebox) — HTML structure change vs auth-block vs rate-limit unconfirmed; need raw DOM diff before committing to selector rewrite. Findings doc only.

### project-stats.json refresh
- `_lastRefreshedBy` updated to c112 with 1916 context.
- `currentSprintNotes` rewritten to lead with 1916 + cross-reference 1915 + concurrent-not-blocking note.

### BATCH return (added to existing 1915 SPIKE queue)
```
[{
  type: "SPIKE",
  id: "1916-bctc-queue-enricher-scraper-broken",
  title: "bctc-queue-enricher-scraper-broken-triage",
  question: "Is bctcQueueEnricherJob returning 0 URLs for 14/30 tickers because SSC portal HTML structure changed (Cheerio selectors stale), or is it auth-block / rate-limit / other?",
  mode: "spike",
  zone: "apps/mcp-server/",
  files: ["apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts"],
  timebox: 120,
  deadline: "2026-05-15T02:00:00Z",
  owner: "dev-mcp-server",
  baseline_pass: 9277,
  concurrent_with: "1915-bctc-pipeline-silence",
  blocks_on: null
}]
```

### Carry-forward to c113+
- Review 1916 SPIKE deliverable: `reports/SPIKE_1916-bctc-queue-enricher-scraper-broken.md`.
- Post-FIX verify: bctcQueueEnricherJob returns ≥1 URL for ≥10 of 14 affected tickers on next run.
- Track 1915 + 1916 in parallel until both ship.
- 1909c-reparse-validation now blocked by BOTH 1915 + 1916 in addition to calendar.
- Pending USER F1: 1913 (FA gateway desktop config, 10th cycle), 1897b-carry (Docker .git/ exclude).
