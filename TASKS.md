# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 081 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | Dev | domain | — | — | Done |
| 1210 | Policy classifier misclassifies criminal prosecution as monetary_policy | Dev | domain | — | — | Done |
| 1213 | Unicode corruption in Vietnamese analysis text (combining diacritics) | Dev | infrastructure | — | — | Done |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1219 | Prediction market sector mapper: exclude sports/entertainment markets | Dev | domain | — | — | Done |
| 1221 | weeklyPortfolioReportJob: add DB-backed lock to prevent concurrent runs on restart | Dev | interface | — | — | Done |
| 1228 | pollNews() scheduled path fails on startup while MCP fetch_and_analyze succeeds | Dev | infrastructure | — | bbf661c | Done |
| 1247 | US personal finance / sports articles ingested as VN market signals (no relevance filter) | Dev | domain | — | — | Done |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |
| 1251 | VNDiamond exclusion article: NER missing — specific ticker not extracted, generic cascade applied | Dev | domain | — | — | Backlog |
| 1253 | VCB stale price in get_market_context — [STALE] warning for prices >24h | Dev | interface | — | bde8125 | Done |
| 1254 | Duplicate morning briefing insert (from_agent=unknown duplicate) | Dev | infrastructure | — | 2e5b975 | Done |
| 1255 | Retail net-buy cascade rule missing for securities sector | Dev | domain | — | 6ff8acc | Done |

**WIP:** 0 In Progress. 0 Review. Remaining Backlog: 1218 (VPS BCTC source_hints), 1248 (BDI VPS route), 1251 (VNDiamond NER).

---

## Task Details (active tasks only — Done tasks archived)

*(No active task details — all open tasks are Backlog with descriptions in their original bug reports.)*
