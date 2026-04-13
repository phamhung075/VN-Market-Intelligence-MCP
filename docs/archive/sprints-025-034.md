# Archive — Sprints 025–034 (Feature Expansion + Stability)

---

## Sprint 025 — COMPLETE (2026-04-01)

Theme: Daily Investor Intelligence — Sector Rotation, Earnings Calendar, Alert Digest. Tool count 40 → 43.

| # | Title | Status |
|---|-------|--------|
| 186 | Sector rotation detector: `get_sector_rotation` MCP tool | Done |
| 187 | Earnings calendar: `get_earnings_calendar` MCP tool | Done |
| 188 | Daily alert digest: `send_alert_digest` MCP tool + scheduler job | Done |

---

## Sprint 026 — COMPLETE (2026-04-02)

Theme: Signal Quality and Portfolio Correlation. Tool count 43 → 46.

| # | Title | Status |
|---|-------|--------|
| 189 | Correlation analysis: `get_correlation_matrix` MCP tool | Done |
| 190 | Data export: `export_portfolio_snapshot` MCP tool | Done |
| 191 | Performance attribution: `get_performance_attribution` MCP tool | Done |

---

## Sprint 027 — COMPLETE (2026-04-02)

Theme: Stability First — Fix the Cracks Before Adding More Floors. Hotfixes 198-205 applied on main.

| # | Title | Status |
|---|-------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | Done |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | Done |
| 194 | CLAUDE.md sync through Sprint 026 | Done |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | Done |

---

## Sprint 028 — COMPLETE (2026-04-02)

Theme: Structural Integrity and Investor Safety Net. Tool count 46 → 51. Includes hotfix batch 198-208.

| # | Title | Status |
|---|-------|--------|
| 192 | Fix flaky test (carried from 027) | Done |
| 193 | Dynamic tool registration | Done |
| 206 | Stop-loss / take-profit threshold alerts (+3 tools) | Done |
| 207 | Per-source API rate limiting for external fetchers | Done |
| 198-208 | Hotfix batch: cascade rules, sentiment, macro, noise filter, DB path | Done |

---

## Sprint 029 — COMPLETE

| # | Title | Status |
|---|-------|--------|
| 208 | Telegram command interface: query system via Telegram messages | Done |
| 209 | Daily P&L snapshot in morning briefing | Done |
| 210 | News source health monitoring + get_source_health MCP tool | Done |

---

## Sprints 030-034 (historical backlog rows)

These were planned but many items were superseded by later sprints. Kept for reference.

| Sprint | Theme | Key Tasks |
|--------|-------|-----------|
| 030 | Quality Before Quantity | 211 CLAUDE.md sync, 212 worktree cleanup, 213 test isolation |
| 031 | Telegram Command Interface | 214 webhook router, 215 security, 216 integration tests |
| 032 | See More, Decide Faster | 217 compare_stocks, 218 weekly portfolio report, 219 custom alert rules |
| 033 | Investor UX Hardening | 220 watchlist enrichment, 222 alert snooze, 223 target allocation |
| 034 | Depth Over Breadth | 224 CLAUDE.md sync, 225 sentiment trend |
