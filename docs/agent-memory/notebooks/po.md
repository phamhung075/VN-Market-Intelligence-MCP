# PO Notebook

## Cycle 2026-05-30 — TRIAGE: BCTC-EXTRACT-COVERAGE backlog (DEFER, no sprint)

bctc-analyst validated refined extraction against real FPT Q1-2026 (report `e8ea3df5-…`, refine_status=DONE) and surfaced 5 concrete extraction defects. Logged as new OPEN sprint cluster **BCTC-EXTRACT-COVERAGE** in TASKS.md (76L, under 80 cap). DID NOT design fixes — architect's job if kicked off. Scoped `git add` only.

**Backlog entries logged (analyst-ranked):**
- EC-1 (HIGHEST VALUE, coverage): P&L opex codes 11/24/25/26 not captured → gross_profit=revenue (100%-margin artifact), operating_profit=0; blocks margin-attribution of FPT net-margin 22.6%→19.8% YoY.
- EC-2 (data-integrity): sequential-digit garble units 0007/0012/0013 carry HIGH conf ~0.85; conf scores OCR legibility not semantic validity → add post-extraction sanity filter (monotonic-digit + magnitude). Distinct root cause.
- EC-3 (coverage): equity/liabilities decomposition absent → ESC-2 balance gate can't fire.
- EC-4 (coverage): cash-flow fragmentation unit-0006 pages 9/10/16; net-OCF + WC rows (CF 03–12) missing → OCF/NI uncomputable.
- EC-5 (coverage): begin assets 88,142 tỷ vs end 68,586 tỷ (−22.2%/qtr) = suspect prior-period column pulled from wrong year.

**Root-cause read (for architect later, NOT designed here):** EC-1/3/4/5 = statement-coverage class (refine/extractor not capturing rows) — overlaps BCTC-LAYOUT-FIRST scope. EC-2 = separate post-proc validation gap (dev-mcp-server / refine-contract).

**DECISION: DEFER (backlog only, no sprint now).** Rationale: WIP≤2 already pressured by OPEN HIGH sprints (FF-DEAD, SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST READY); the coverage class is the existing BCTC-LAYOUT-FIRST charter — these findings are validation evidence to FEED its scope, not a parallel competing sprint. EC-2 genuinely new but no live trading-decision dependency → not urgent. Task was explicitly TRIAGE-ONLY.

**Next-kickoff hint:** when BCTC-LAYOUT-FIRST kicks off, hand EC-1/3/4/5 to architect as concrete acceptance evidence; spin EC-2 as a standalone small sanity-gate FIX (dev-mcp-server) any time — independent, cheap.

## Carry-over
- DB: market.db at `/app/data/market.db` in mcp-server container (not `/data/market.db`). Page-image volume `/data/bctc-page-images`. `xxd` absent (use `od -An -tx1`); bun:sqlite via temp-file `bun run /tmp/q.ts`.
- TASKS.md cap = 80L (file-size-caps.json class sprint-task-index). Now 76L.
- Scoped `git add <file>` ONLY — tree has MANY unrelated uncommitted files (HCM-DISAMBIG-extraction.test.ts NOT mine); NEVER `-A`.
- Open OTHER sprints: FF-DEAD (HIGH, vps-scripts/), FU-MON (Mon DPI Brent/Gold + get_foreign_flow probe), SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST, CHEF-ATTN, AR-FU-DETERMINISM (MED, deferred).
