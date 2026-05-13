# VPS Source Recon Docs

**Owner:** `ops-vps-fetch` agent
**Purpose:** Structured recon reports for every VN data source probed on the Vinahost VPS.

---

## Convention

One subdirectory per source. Each directory contains a `recon.md` file produced by `ops-vps-fetch` after a live SSH probe.

```
docs/vps-sources/
  <source-name>/
    recon.md       ← produced by ops-vps-fetch
```

**Source name format:** kebab-case, descriptive. Examples: `vietstock-prices`, `cafef-news`, `hsx-bctc`, `sbv-rates`.

---

## Recon Doc Structure

Each `recon.md` MUST contain:

| Field | Required | Notes |
|-------|----------|-------|
| Date + agent | Yes | When probed and by whom |
| Source URL | Yes | Exact URL probed |
| Trigger | Yes | `fetch_broken` or `new_source_needed` |
| Working request recipe | Yes | curl command that produced the most useful response |
| HTTP probe results | Yes | Status, final URL, redirect chain |
| Anti-bot assessment | Yes | Type, evidence, technique recommendation |
| Page structure | Yes | DOM selectors (HTML) or JSON paths (API) |
| Sample response excerpt | Yes | ≤500 chars |
| Notes | Optional | Rate limits, tokens in URL, auth quirks |

Full schema: `docs/agents/ops-vps-fetch/knowledge.md § Recon Doc Schema`

---

## Workflow

```
market-watcher / ops / system-auditor / user
  → signal: docs/signals/ops-vps-fetch-<ts>.json
  → ops-vps-fetch runs main.md flow
  → writes docs/vps-sources/<source-name>/recon.md
  → drops docs/signals/dev-vps-crawls-<ts>.json
  → dev-vps-crawls implements scraper
```

---

## Active Sources

| Source name | URL pattern | Anti-bot | Last recon | Status |
|-------------|------------|---------|-----------|--------|
| vps-prices | `bgapidatafeed.vps.com.vn/getliststockdata/<CODES>` | none | 2026-05-13 | upstream healthy; MCP push failing |
| cafef-index | `banggia.cafef.vn/stockhandler.ashx?index=true` | none | 2026-05-13 | healthy |
| sbv-rates | `portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68` | none (Akamai CDN passive) | 2026-05-13 | healthy end-to-end |
| vn-news-rss | 14 RSS feeds (cafef, vnexpress, vneconomy, vietstock, …) | none / CF RP passive | 2026-05-13 | upstream healthy; MCP push 404 |
| hsx-bctc | `hnx.vn` AJAX POST + `hsx.vn` SPA fallback | page_restructure + resource_constraint | 2026-05-13 | critical — zero Q1/2026 PDFs acquired |

> Update this table when a new recon doc is written or status changes.
