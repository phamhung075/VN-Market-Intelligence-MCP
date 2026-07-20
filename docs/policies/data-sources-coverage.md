# Data Sources & Coverage Policy

**Load when:** adding/removing a news/macro data source, auditing signal-category coverage, diagnosing a "missing signal category" gap.

## In-Scope International/Geopolitical Coverage

| Category | Source(s) | Ingestion path | Status |
|---|---|---|---|
| VN domestic news | CafeF, VnExpress, VnEconomy | `fetch_and_analyze` (news-scout Stage 1) | LIVE |
| International news | Reuters (RSS-proxied via `news-fetch` microservice → Google News RSS) | `fetch_and_analyze(sources=["reuters"])` (news-scout Stage 1a) | LIVE — reachability tracked, see LANE C |
| Geopolitical conflict / war / trade-war events | Detected within the above news sources via WAR_GEOPOLITICAL_KEYWORDS pattern-match | news-scout Stage 3 § Geopolitical/War Signal Dispatch → `chain_catalyst` (`event_type: trade_war\|macro` interim, `geopolitical_conflict` pending code) | LANE A live 2026-07-21; LANE B enum pending |
| US equity indices (S&P 500 / Nasdaq / VIX) | Not yet sourced | none — no MCP tool exposes these today | GAP — tracked LANE B, PO backlog |
| FX/rate/commodity derivative proxies (DXY, US10Y, Brent, Gold) | Yahoo Finance | `get_macro_snapshot` | LIVE |

## Out-of-Scope (explicit, to prevent scope creep)

- Company-specific foreign filings/press releases — BCTC Analyst's zone, separate pipeline
- Social media sentiment — not sourced anywhere in this system today
- Non-VN-relevant global news with no plausible market linkage (e.g. pure domestic US politics with no trade/market angle) — filtered by the "plausible VN-market relevance" clause in news-scout's Geopolitical/War Signal Dispatch trigger condition

## Ownership

- Source additions/removals: `dev-mainserver-crawls` (international) / `dev-vps-crawls` (VN geo-blocked) implement; `ops-mainserver-fetch` / `ops-vps-fetch` recon first — see `docs/references/agent-roster.md` § Crawl Pipeline Agents
- Coverage-category definitions (this file): agent-father maintains; agents-architect proposes changes via architecture brief

## Revision History

- 2026-07-21: initial version — authored in response to `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md` (2026-07-20 war/trade-war selloff, zero global coverage in any cowork agent output).
