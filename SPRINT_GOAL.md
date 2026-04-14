# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 081 (ACTIVE)

**Goal:** Domain bug batch — fix cascade/classification bugs from unified-agent reports. Clear backlog of domain-layer issues: macro keyword disambiguation, sentiment polarity checks, cascade confidence caps, stock alias tightening, and missing stock classifications.

**Scope:**
- IN: Tasks 1195, 1199, 1200, 1203, 1205, 1207, 1208, 1210, 1211, 1213, 1214, 1216 (PM sprint plan)
- IN: New backlog from 2026-04-13/14 bug reports: 1217–1222 (see TASKS.md)
- OUT: VPS BCTC service investigation (needs SSH access to VPS), UI changes

**Success metric:** get_cascade_metrics shows oil_gas_down keyword hit rate above 10 hits/30d. US CPI surge articles classified correctly as BEARISH for VN markets. DFF/BSR/DPM aliases produce fewer false positives.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
| 079 | Data pipeline integrity — VPS price push + BCTC extraction | COMPLETE 2026-04-14 |
| 078 | Evening summary empty-content fallback (1192) + bug dedup (1215) | COMPLETE 2026-04-14 |
| 077 | Trading Economics RSS fallback chain (1191) | COMPLETE |
| 076 | Pipeline watchdog job | COMPLETE |
