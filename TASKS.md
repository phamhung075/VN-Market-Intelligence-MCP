# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 081 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1195 | Cascade keyword "hạ nhiệt" disambiguation: interest-rate vs geopolitical | Dev | domain | — | 15a3451 | Done |
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | Dev | domain | — | — | Backlog |
| 1200 | Cascade "đầu tư công" missing sentiment polarity check | Dev | domain | — | 6b21acf | Done |
| 1203 | Dow Jones +59% spike: add outlier validation for macro indicators | Dev | domain | — | — | Backlog |
| 1207 | Market-wide cascade confidence cap for non-watchlist company events | Dev | domain | — | — | Backlog |
| 1208 | Stock price freshness reads direct-API timestamp, not VPS-push timestamp | Dev | infrastructure | — | 96358d4 | Done |
| 1209 | Polymarket test markets not refreshing (fetchedAt 12 days stale) | Dev | infrastructure | — | b3b61c2 | Done |
| 1210 | Policy classifier misclassifies criminal prosecution as monetary_policy | Dev | domain | — | — | Backlog |
| 1211 | BSR missing from "công ty lọc dầu" / "Bình Sơn" stock aliases | Dev | domain | — | a6f218c | Done |
| 1213 | Unicode corruption in Vietnamese analysis text (combining diacritics) | Dev | infrastructure | — | — | Backlog |
| 1214 | VNM Middle East dairy exposure missing from Hormuz cascade rules | Dev | domain | — | 5d021cf | Done |
| 1217 | Outlier validation for macro indicators (Dow Jones -69% spike) | Dev | domain | — | — | Backlog |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1219 | Prediction market sector mapper: exclude sports/entertainment markets | Dev | domain | — | — | Backlog |
| 1220 | DPM alias resolver: require sector context for person-name alias matches | Dev | domain | — | 19a224b | Done |
| 1221 | weeklyPortfolioReportJob: add DB-backed lock to prevent concurrent runs on restart | Dev | interface | — | — | Backlog |
| 1222 | Add DFF (Đua Fat Group) to stock-classification.json — sector real_estate | Dev | domain | — | 80391f3 | Done |
| 1223 | VNDiamond index exclusion → BEARISH cascade rule (ETF forced selling) | Dev | domain | — | — | Backlog |
| 1225 | congbao + sbvCircular fetch failures — diagnose and fix (geo-block or URL change) | Dev | infrastructure | — | ab251e2 | Done |
| 1226 | FTSE/index upgrade capital inflow → BULLISH cascade rule | Dev | domain | — | — | Backlog |
| 1227 | Source health table not updating on transient fetch failure (Reuters false OK) | Dev | infrastructure | — | 2877312 | Done |
| 1228 | pollNews() scheduled path fails on startup while MCP fetch_and_analyze succeeds | Dev | infrastructure | — | — | Todo |
| 1229 | VNDiamond/VN30/ETF index rebalance → BEARISH cascade rule (forced passive selling) | Dev | domain | — | — | Backlog |
| 1233 | Taiwan conflict prediction market has no sector/stock mapping (FPT, VEA, GEX exposure) | Dev | domain | — | — | Backlog |
| 1237 | FTSE inflow article misclassified NEUTRAL — should be BULLISH (passive fund catalyst) | Dev | domain | — | — | Backlog |
| 1241 | Geopolitical escalation keywords missing — "phong tỏa", "đàm phán đổ vỡ" default to BULLISH | Dev | domain | — | 7dcd2de | Done |
| 1246 | Hormuz/Suez/OPEC cascade rules: oil_supply_shock → bearish_market + bullish_oil_gas + bearish_aviation | Dev | domain | — | 5d021cf | Done |
| 1247 | US personal finance / sports articles ingested as VN market signals (no relevance filter) | Dev | domain | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |
| 1251 | VNDiamond exclusion article: NER missing — specific ticker not extracted, generic cascade applied | Dev | domain | — | — | Backlog |
| 1252 | Sync mcp.config.json::market.referenceStocks with SECTOR_PEERS (45+ missing tickers) | Janitor | config | — | fb3ae99 | Done |

**WIP:** 0 In Progress. 0 Review.

---

## Task Details (active tasks only — Done tasks archived)

### 1252 — Sync mcp.config.json::market.referenceStocks with SECTOR_PEERS (45+ missing tickers)

**Agent:** Janitor (Code DRY audit)
**Layer:** Config
**Severity:** MEDIUM — Incomplete sector context for tools

**Problem:**
mcp.config.json::market.referenceStocks is missing 45+ ticker entries vs the canonical SECTOR_PEERS in src/domain/services/sectorPeers.ts. Additionally, 4 entire sectors are missing from config (construction, energy, pharmaceutical, gold_mining).

**Impact:**
Tools like getSectorPeersForComparison(), sectorRotation analysis, and briefing generation return incomplete sector context, leading to incomplete sector-wide price analysis.

**Examples:**
- real_estate: config [VHM,VIC,VRE,NVL,KDH,DXG,KBC,DIG,PDR,HUT] vs SECTOR_PEERS [VIC,VHM,VRE,NVL,KDH,DXG,NLG,PDR,KBC,DIG,HUT,HDG] — missing NLG, HDG
- tech: config [FPT,CMG] vs SECTOR_PEERS [FPT,CMG,ELC,SAM] — missing ELC, SAM
- Full comparison: 14 sectors in config, 18 in SECTOR_PEERS

**Canonical Source:**
`src/domain/services/sectorPeers.ts::SECTOR_PEERS` (authoritative ticker classification)

**Fix Approach:**
1. For each sector in SECTOR_PEERS, update mcp.config.json::market.referenceStocks with all tickers
2. Add missing sectors (construction, energy, pharmaceutical, gold_mining)
3. Preserve ordering by market cap (first = leader)
4. Verify all referenced tickers exist in STOCK_CATALOG

**Testing:**
- Check that all new tickers have test coverage in stock alias tests
- Verify no build/config parse errors
- Spot-check a few sector rotations in briefing output
