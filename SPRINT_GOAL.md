# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 082 (ACTIVE)

**Goal:** Config drift fix — alert cooldown reads from mcp.config.json instead of hardcoded value, plus sector classification deduplication.

**Scope:**
- IN: Task 1281 — fix step E cooldown hardcode (60 min) to read from mcp.config.json alertQuality.cooldownMinutes (30 min)
- IN: Task 1282 — remove sector classification duplication between mcp.config.json referenceStocks and SECTOR_PEERS
- OUT: VPS SSH tasks (1218, 1248), UI changes, new features

**Success metric:** `intelligenceCycleJob.ts` step E reads cooldownMinutes from loaded config object, not a hardcoded literal. Alerts fire correctly at 30-minute cooldown intervals.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 081 | Domain bug batch — cascade/classification fixes, NER fixes (1251, 1266) | COMPLETE 2026-04-15 |
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
| 079 | Data pipeline integrity — VPS price push + BCTC extraction | COMPLETE 2026-04-14 |
| 078 | Evening summary empty-content fallback (1192) + bug dedup (1215) | COMPLETE 2026-04-14 |
| 077 | Trading Economics RSS fallback chain (1191) | COMPLETE |
| 076 | Pipeline watchdog job | COMPLETE |
