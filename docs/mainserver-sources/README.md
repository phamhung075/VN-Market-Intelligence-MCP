# Main Server Source Recon Docs

**Owner:** `ops-mainserver-fetch` agent
**Purpose:** Structured recon reports for every international (non-VN) data source probed directly from the main server.

---

## Convention

One subdirectory per source. Each directory contains a `recon.md` file produced by `ops-mainserver-fetch` after a live local HTTP probe.

```
docs/mainserver-sources/
  <source-name>/
    recon.md       ← produced by ops-mainserver-fetch
```

**Source name format:** kebab-case, provider-plus-data-type. Examples: `trading-economics-gdp`, `yahoo-finance-vn`, `world-bank-macro`, `reuters-news`, `imf-outlook`.

---

## Zone Rule

This directory is for **international sources only** — sources accessible WITHOUT a VPN or VPS proxy (i.e., not geo-blocked from outside Vietnam).

| Source zone | Directory | Owner agent |
|-------------|-----------|------------|
| International (no geo-block) | `docs/mainserver-sources/` | `ops-mainserver-fetch` |
| VN geo-blocked | `docs/vps-sources/` | `ops-vps-fetch` |

If ops-mainserver-fetch detects a geo-block during probing, it re-routes to ops-vps-fetch and does NOT write a recon doc here.

---

## Recon Doc Structure

Each `recon.md` MUST contain:

| Field | Required | Notes |
|-------|----------|-------|
| Date + agent | Yes | When probed and by whom |
| Source URL | Yes | Exact URL probed |
| Probe origin | Yes | Must be "main-server (direct, no VPS proxy)" |
| Trigger | Yes | `fetch_broken` or `new_source_needed` |
| Working request recipe | Yes | curl command that produced the most useful response |
| HTTP probe results | Yes | Status, final URL, redirect chain |
| Anti-bot assessment | Yes | Type, evidence, technique recommendation, headless likelihood |
| Geo-blocked flag | Yes | Must be "no" — confirmed accessible from outside VN |
| Page structure | Yes | DOM selectors (HTML) or JSON paths (API) |
| Sample response excerpt | Yes | ≤500 chars |
| Notes | Optional | Rate limits, API keys, subscription walls, pagination, etc. |

Full schema: `docs/agents/ops-mainserver-fetch/knowledge.md § Recon Doc Schema`

---

## Workflow

```
market-watcher / news-scout / system-auditor / user
  → signal: docs/signals/ops-mainserver-fetch-<ts>.json
  → ops-mainserver-fetch runs main.md flow
  → [geo-block check] → if blocked: re-route to ops-vps-fetch (exit)
  → writes docs/mainserver-sources/<source-name>/recon.md
  → drops docs/signals/dev-mainserver-crawls-<ts>.json
  → dev-mainserver-crawls implements scraper
```

---

## Known International Sources (candidates)

These sources are expected to be accessible without VPS proxy but must still be confirmed per recon:

| Provider | Data type | URL base | Expected anti-bot |
|----------|-----------|----------|------------------|
| TradingEconomics | Macro indicators, GDP, CPI, PMI | tradingeconomics.com | Possible JS challenge |
| Yahoo Finance | International stock prices, FX | finance.yahoo.com | Possible CF or DataDome |
| Bloomberg (public) | Market news (public endpoints) | bloomberg.com | Likely heavy JS / paywall |
| Reuters | News feeds (public) | reuters.com | Possible DataDome |
| IMF | Macro data API | imf.org / datamapper.imf.org | Usually open API |
| World Bank | Development indicators API | data.worldbank.org | Usually open API |
| ADB | Asian development indicators | adb.org | Usually open API |
| Investing.com | Charts, economic calendar | investing.com | Heavy CF + DataDome |

> Update status column once recon is run. Add new rows as sources are identified.

---

## Active Sources

| Source name | URL pattern | Anti-bot confirmed | Last recon |
|-------------|------------|-------------------|-----------|
| (none yet) | — | — | — |

> Update this table when a new recon doc is written.
