# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 080 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1194 | Missing MCP tools for Agent 08 Prediction Synthesizer | Dev | interface | — | — | Done |
| 1195 | Cascade keyword "hạ nhiệt" disambiguation: interest-rate vs geopolitical | Dev | domain | — | — | Backlog |
| 1197 | Cascade seed sentiment inversion: bullish headline classified BEARISH | Dev | domain | — | — | Done |
| 1216 | PM: sprint-plan TECH_080 domain bug batch (4 tasks) | PM | — | TECH_080 | — | Todo |
| 1198 | VND currency/ticker false positive in detectStocksInText | Dev | domain | — | task/1198-vnd-guard | Review |
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | Dev | domain | — | — | Backlog |
| 1200 | Cascade "đầu tư công" missing sentiment polarity check | Dev | domain | — | — | Backlog |
| 1203 | Dow Jones +59% spike: add outlier validation for macro indicators | Dev | domain | — | — | Backlog |
| 1205 | get_legal_risk_signals misses "truy tố" prosecution articles | Dev | domain | — | — | Backlog |
| 1206 | Cascade keyword fix: "đất vàng"→real_estate, "cầu" in "toàn cầu"→no construction | Dev | domain | — | — | Todo |
| 1207 | Market-wide cascade confidence cap for non-watchlist company events | Dev | domain | — | — | Backlog |
| 1208 | Stock price freshness reads direct-API timestamp, not VPS-push timestamp | Dev | infrastructure | — | — | Backlog |
| 1209 | Polymarket test markets not refreshing (fetchedAt 12 days stale) | Dev | infrastructure | — | — | Backlog |
| 1210 | Policy classifier misclassifies criminal prosecution as monetary_policy | Dev | domain | — | — | Backlog |
| 1211 | BSR missing from "công ty lọc dầu" / "Bình Sơn" stock aliases | Dev | domain | — | — | Backlog |
| 1212 | Interest rate cooling seed sentiment should be BULLISH not NEUTRAL | Dev | domain | 1197 | — | Todo |
| 1213 | Unicode corruption in Vietnamese analysis text (combining diacritics) | Dev | infrastructure | — | — | Backlog |
| 1214 | VNM Middle East dairy exposure missing from Hormuz cascade rules | Dev | domain | — | — | Backlog |
| 1215 | Bug report dedup: suppress duplicate category within 4h in send_telegram | Dev | infrastructure | — | — | Done |

**WIP:** 0 In Progress. 0 Review.

---

## Task Details (active tasks only — Done tasks archived)

