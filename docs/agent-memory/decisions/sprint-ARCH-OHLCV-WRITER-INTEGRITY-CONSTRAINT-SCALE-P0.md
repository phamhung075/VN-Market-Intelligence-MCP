# Decision Journal — FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 · architect

**Sprint goal:** Multi-zone P0 writer-integrity fix — close-outside-[low,high] + 1000x scale anomaly
**Agent:** architect
**Started:** 2026-06-20T08:09:11Z

---

### STEP architect-S1 · architect · 2026-06-20T08:30Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** Brownfield full writer audit + root cause mapping for 835-violation + DFF-1000x
**what-considered:**
- Zone 2 (apps/stock-price/): scanned all Go files — fetchers.go only reads daily_ohlcv (SELECT, Tier-3 cache). CLEARED.
- Writer F (priceBackfillService.ts): live INSERT OR IGNORE with LOCAL stub guard missing normalizeOhlcvToVnd + correct validateOhlcvUnit. GAP-1.
- Writer H (server.ts push-ohlcv-history): string-typed high/low coerced to `open` before guard — guard never sees real values. GAP-2.
- Schema CHECK approach (D-1): ALTER ADD CHECK blocked on existing table; SQLite table rebuild required; unsafe for P0.
**why-decision:** Both gaps are shallow (1-function replacements), no DDD violation for Writer F (domain→domain import allowed), and the existing guard infrastructure (validateOhlcvUnit Rule 5) already has the correct invariant — only the two bypass paths lack it.
**why-change:** no change from plan — gaps confirmed via raw code read; solution follows established Writer E reference pattern.

### STEP architect-S2 · architect · 2026-06-20T08:35Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** DFF 1000x root attributed to pre-guard era + mixed-unit VNDirect input; ABSORB decision for FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2
**what-considered:**
- Option A: add prevClose>0 cold-start detection guard — REJECTED: existing guard correctly skips when no prevClose (safe behaviour); new guards protect forward, not backward.
- Option B: attribute DFF violations to historical residue + trust existing HILO_RATIO_MAX guard to catch mixed-unit input from VNDirect — CHOSEN.
- FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2: root matches, no independent code fix needed → SUPERSEDED in board.
**why-decision:** HILO ratio guard (Rule 4: ratio > HILO_RATIO_MAX=5) catches mixed-unit DFF input (0.5/500 open/high → ratio=1000 after ×1000 normalization). No new logic required.
**why-change:** no change from plan.

### STEP architect-S3 · architect · 2026-06-20T08:40Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** Zone split confirmed: single Zone 1 (apps/mcp-server/), Zone 2 cleared
**what-considered:** only path: Go service has no write path to daily_ohlcv (confirmed by grep — only SELECT at fetchers.go:315 and INSERT to market_prices_cache at :359). No task needed in apps/stock-price/.
**why-decision:** Zone 2 read-only confirmed; PM creates all sub-tasks under apps/mcp-server/ specialist (dev-mcp-server).
**why-change:** no change from plan.
