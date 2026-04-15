# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 083 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1284 | schema.ts: replace process.env["DB_PATH"] fallback with Bun.env exclusively | Dev | infrastructure | — | — | Backlog |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 0 Review. Remaining Backlog: 1284 (standalone); 1218, 1248 require VPS SSH access.

## Sprint 082 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1281 | Alert cooldown config drift: step E hardcodes 60 min vs config 30 min | Done |
| 1282 | Sector classification duplication: mcp.config.json referenceStocks vs SECTOR_PEERS | Done |
| 1283 | Code janitor scan: post-082 clean-state audit (checks 1-5) | Done |

## Sprint 081 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1266 | Fix: HUT false positive — Vietnamese word "hụt" triggering HUT ticker NER | Done |
| 1251–1265 | Domain bug batch (archived) | Done |

---

## Task Details (active tasks only — Done tasks archived)

### 1283 — Code janitor scan (post-082)

**Problem:** Both findings from the 2026-04-15 janitor scan (1281, 1282) have been resolved. The `code-janitor-known-findings.json` has been cleared. A fresh scan is needed to confirm the codebase is clean or surface any new drift.

**Fix:** Run all 5 janitor checks against the current main branch. Record results in `docs/data/code-janitor-known-findings.json`. If new findings: create tasks. If clean: commit the empty findings file.

**Test:** `src/__tests__/1283-janitor-scan.test.ts` — verify canonical sources match their consumers (spot-check checks 1, 2, 5).

---

### 1284 — schema.ts: Bun.env migration

**Problem:** `src/infrastructure/db/schema.ts` lines 64 and 550 use `process.env["DB_PATH"] ?? Bun.env["DB_PATH"]`. In production (Bun runtime), `process.env` is a compatibility shim — `Bun.env` is canonical. The dual-check pattern was flagged as non-blocking in the 1282 QA review.

**Fix:** Replace `process.env["DB_PATH"] ?? Bun.env["DB_PATH"]` with `Bun.env["DB_PATH"]` at both sites. The `process.env` fallback is only needed in test environments where Bun injects `process.env` from `beforeAll` — replace with `Bun.env` and update test setup to use `Bun.env` injection instead.

**Test:** `src/__tests__/1284-schema-bun-env.test.ts` — verify `initDatabase()` path resolution uses `Bun.env["DB_PATH"]`.
