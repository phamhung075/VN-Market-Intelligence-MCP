# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 082 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1281 | Alert cooldown config drift: step E hardcodes 60 min vs config 30 min | Dev | scheduler/domain | — | merged | Done |
| 1282 | Sector classification duplication: mcp.config.json referenceStocks vs SECTOR_PEERS | Dev | interface/config | — | fix/1282-sector-classification-dedup | Review |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 1 Review (1282). Remaining Backlog: 1218, 1248 require VPS SSH access.

## Sprint 081 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1266 | Fix: HUT false positive — Vietnamese word "hụt" triggering HUT ticker NER | Done |
| 1251–1265 | Domain bug batch (archived) | Done |

---

## Task Details (active tasks only — Done tasks archived)

### 1281 — Alert cooldown config drift

**Problem:** `intelligenceCycleJob.ts` step E hardcodes `{ cooldownMinutes: 60, maxAlertsPerStockPerDay: 3 }` at line 805. `mcp.config.json` defines `alertQuality.cooldownMinutes: 30`. The hardcoded value doubles the intended cooldown — users receive alerts at half the expected frequency.

**Fix:** Load the alertQuality config section and pass `cooldownMinutes` from config to `shouldSuppressAlert()`. Ensure the config object is available in the step E closure (it is already loaded earlier in the cycle).

**Test:** `src/__tests__/1281-alert-cooldown-config.test.ts` — verify step E reads from config, not hardcoded literal.

---

### 1282 — Sector classification duplication

**Problem:** `mcp.config.json` contains a `referenceStocks` map that duplicates ticker-to-sector mappings already maintained in `SECTOR_PEERS` (domain service). Two sources of truth for sector classification increases drift risk.

**Fix:** Audit overlap. Where `referenceStocks` entries are fully covered by `sectorPeers.ts`, remove the duplicate from `mcp.config.json`. Where they diverge, align or document the intended difference. No behaviour change expected — classification logic should use the canonical domain source.

**Test:** `src/__tests__/1252-reference-stocks-sync.test.ts` already exists — confirm it passes after cleanup.
