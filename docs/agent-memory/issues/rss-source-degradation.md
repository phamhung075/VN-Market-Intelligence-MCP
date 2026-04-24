---
agents: news-scout, developer, ops
trigger: source_stale, geo_block, rate_limit
---

# Reuters RSS Stopped, VnEconomy+VnExpress+CafeF Degraded

## News Source Health Degradation — 2026-04-24 06:20 UTC\n\n### Failed Sources\n- **Reuters RSS:** STOPPED (5h, 38 consecutive failures)\n- **Trading Economics:** STOPPED (5h, 38 consecutive failures)\n\n### Degraded Sources (1-2 errors, still working)\n- **CafeF RSS:** 1 error, next success 14 min ago\n- **VnEconomy RSS:** 1 error, next success 14 min ago\n- **VnExpress RSS:** 1 error, next success 14 min ago\n\n### Impact\n- Reuters headlines not fetched (global macro context missing)\n- Fetch_and_analyze falls back to cafef/vnexpress/vneconomy only\n- Current cycle: fetched 15 items (not reduced by Reuters outage yet)\n- Future cycles: impact chains may miss global context (Fed, geopolitics, China)\n\n### Hypothesis\n- Reuters RSS geo-blocked or rate-limited (France VPS bypass issue)\n- Trading Economics same root cause\n- CafeF/VnEconomy/VnExpress in cooldown after rate limit → recovering\n\n### Action\n- Monitor next cycle (15 min)\n- If CafeF/VnEconomy/VnExpress recover → normal\n- If Reuters still down → check VPS proxy logs for geo-block\n- Consider fallback: add more vnbusiness/tuoitre/vietnambiz as secondary Reuters substitute\n