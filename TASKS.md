# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 081 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1195 | Cascade keyword "hạ nhiệt" disambiguation: interest-rate vs geopolitical | Dev | domain | — | — | Backlog |
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | Dev | domain | — | — | Backlog |
| 1200 | Cascade "đầu tư công" missing sentiment polarity check | Dev | domain | — | — | Backlog |
| 1203 | Dow Jones +59% spike: add outlier validation for macro indicators | Dev | domain | — | — | Backlog |
| 1207 | Market-wide cascade confidence cap for non-watchlist company events | Dev | domain | — | — | Backlog |
| 1208 | Stock price freshness reads direct-API timestamp, not VPS-push timestamp | Dev | infrastructure | — | — | Backlog |
| 1209 | Polymarket test markets not refreshing (fetchedAt 12 days stale) | Dev | infrastructure | — | — | Backlog |
| 1210 | Policy classifier misclassifies criminal prosecution as monetary_policy | Dev | domain | — | — | Backlog |
| 1211 | BSR missing from "công ty lọc dầu" / "Bình Sơn" stock aliases | Dev | domain | — | — | Backlog |
| 1213 | Unicode corruption in Vietnamese analysis text (combining diacritics) | Dev | infrastructure | — | — | Backlog |
| 1214 | VNM Middle East dairy exposure missing from Hormuz cascade rules | Dev | domain | — | — | Backlog |
| 1217 | Outlier validation for macro indicators (Dow Jones -69% spike) | Dev | domain | — | — | Backlog |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1219 | Prediction market sector mapper: exclude sports/entertainment markets | Dev | domain | — | — | Backlog |
| 1220 | DPM alias resolver: require sector context for person-name alias matches | Dev | domain | — | — | Backlog |
| 1221 | weeklyPortfolioReportJob: add DB-backed lock to prevent concurrent runs on restart | Dev | interface | — | — | Backlog |
| 1222 | Add DFF (Đua Fat Group) to stock-classification.json — sector real_estate | Dev | domain | — | — | Backlog |
| 1223 | VNDiamond index exclusion → BEARISH cascade rule (ETF forced selling) | Dev | domain | — | — | Backlog |
| 1225 | congbao + sbvCircular fetch failures — diagnose and fix (geo-block or URL change) | Dev | infrastructure | — | — | Backlog |
| 1226 | FTSE/index upgrade capital inflow → BULLISH cascade rule | Dev | domain | — | — | Backlog |
| 1227 | Source health table not updating on transient fetch failure (Reuters false OK) | Dev | infrastructure | — | — | Backlog |
| 1228 | pollNews() scheduled path fails on startup while MCP fetch_and_analyze succeeds | Dev | infrastructure | — | — | Todo |
| 1229 | VNDiamond/VN30/ETF index rebalance → BEARISH cascade rule (forced passive selling) | Dev | domain | — | — | Backlog |
| 1233 | Taiwan conflict prediction market has no sector/stock mapping (FPT, VEA, GEX exposure) | Dev | domain | — | — | Backlog |
| 1237 | FTSE inflow article misclassified NEUTRAL — should be BULLISH (passive fund catalyst) | Dev | domain | — | — | Backlog |
| 1241 | Geopolitical escalation keywords missing — "phong tỏa", "đàm phán đổ vỡ" default to BULLISH | Dev | domain | — | — | Backlog |
| 1246 | Hormuz/Suez/OPEC cascade rules: oil_supply_shock → bearish_market + bullish_oil_gas + bearish_aviation | Dev | domain | — | — | Backlog |
| 1247 | US personal finance / sports articles ingested as VN market signals (no relevance filter) | Dev | domain | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |
| 1251 | VNDiamond exclusion article: NER missing — specific ticker not extracted, generic cascade applied | Dev | domain | — | — | Backlog |

**WIP:** 0 In Progress. 0 Review.

---

## Task Details (active tasks only — Done tasks archived)

