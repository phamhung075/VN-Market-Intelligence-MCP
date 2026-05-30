# PO Notebook

## Cycle 2026-05-30 — RE-TRIAGE: BCTC trust-layer RED (OVERTURNS DEFER 09353af0)

Router re-read FPT Q1-2026 refined (report `e8ea3df5-…`) directly. Verified myself via gateway: `get_bctc_refined(report_id)` + `get_bctc_full(FPT/ACB/GAS/VHM)`. Prior DEFER (BCTC-EXTRACT-COVERAGE, 5 coverage gaps) was WRONG: this is a data-integrity RED, not deferrable coverage.

**DECISION: GO-NOW.** Renamed cluster BCTC-EXTRACT-COVERAGE → **BCTC-TRUST-RED**, re-ranked:
- TR-0 (LEAD, new): no mock/placeholder data may carry refine_status=DONE + feed analysis. Quarantine FPT+ACB seeded rows; block structured feed when decomposition absent.
- TR-1 (was EC-2): semantic sanity gate — ESCALATED DEFER→GO. conf+flags+balance all GREEN on fabricated/contradictory data.
- TR-2 (was EC-1/3/4/5): coverage gaps DEMOTED → feed existing BCTC-LAYOUT-FIRST as acceptance evidence, not parallel sprint.

**MOCK-vs-REAL determination: SEEDED/MOCK, not genuine OCR.** Evidence: (1) perfect ascending/cyclic digit runs (12345678901234, 8901234567890, 5678901234567) — OCR never emits ordered digits; (2) all 15 units identical `refined_at` 11:18:58 — real fan-out staggers; (3) exact values NOT in any committed fixture (grep clean) → runtime push_bctc_refined_unit into live market.db.

**Cross-report contamination: CONFIRMED ≥2.** ACB get_bctc_full = same pathology (gross=net_rev, opProfit/EBITDA/equity/liab/cash=0, conf 38%). GAS+VHM = "Chưa có dữ liệu" (no BCTC). So FPT+ACB contaminated; GAS/VHM empty.

**CHAIN to dispatch (router executes, NOT me):** architect FIRST (root-cause split TR-0 quarantine-gate / TR-1 sanity-gate / confirm TR-2 belongs to BCTC-LAYOUT-FIRST) → ba spec → dev-mcp-server (TR-0/TR-1 in refine-contract + structured-feed publish guard) → qa (inject fabricated unit, prove flag+block fires) → po EXIT. WIP: BCTC-TRUST-RED takes a slot; respect WIP≤2 (pause lower-priority CHEF-ATTN/SELF-IMPROVE X-1 if needed — FF-DEAD is uncontended VPS zone, can run parallel).

## Carry-over
- TASKS.md cap 80L (now 76L). Scoped `git add <file>` ONLY — tree has MANY unrelated files (HCM-DISAMBIG-extraction.test.ts NOT mine); NEVER `-A`.
- DB: market.db at `/app/data/market.db` in mcp-server container. bun:sqlite via temp-file `bun run /tmp/q.ts`.
- get_bctc_refined needs report_id (string), no `code` arg. get_bctc_full takes code.
- Refine pipeline code IS real (bctcRefineJob, pushBctcRefinedUnitTool, refinedMarkdownParser) — the BUG is the data pushed + missing semantic gate, not absent code.
- Open OTHER sprints: FF-DEAD (HIGH, vps-scripts/ uncontended), SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST (TR-2 feeds it), CHEF-ATTN, FU-MON, AR-FU-DETERMINISM (deferred).
