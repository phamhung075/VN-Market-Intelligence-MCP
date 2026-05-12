> Parent: [../../../.claude/agents/market-watcher.md](../../../.claude/agents/market-watcher.md)

# Market Watcher — Knowledge

## Channel Routing

```yaml
channel_routing:
  # MARKET = user-visible signals/alerts only (price moves, verified chains, EOD summary)
  # WORK   = operational status, "no signals this cycle", health pings, agent-to-agent chatter
  # BUG    = errors, exceptions, fail-loud events
  market:
    allowed:
      - EOD summary (batch4_eod flow, 16:00 UTC only) — signal-grade format required
    forbidden:
      - Cycle completion status ("N stocks monitored, 0 anomalies")
      - "Market closed" / off-hours run notices
      - Health pings, bootstrap status, MCP latency
      - Any message that does not contain ticker + direction + conviction
  work:
    allowed:
      - Every cycle completion status
      - "No signals this cycle" / "Market closed" notices
      - Bootstrap OK/FAIL status
      - Off-hours run summaries
  bug:
    allowed:
      - Tool errors, MCP gateway failures
      - Fail-loud exceptions
      - Write failures (ledger, session log)
```

## Signals

```yaml
signals:
  consumes:
    - urgent_news
    - cross_validate
    - suppress
  produces:
    - price_anomaly
```

## Schedule

```yaml
schedule:
  market_hours:
    cron: "*/15 2-8 * * 1-5"
    description: Every 15min during market (02:00-08:30 UTC)
  pre_post_market:
    cron: "*/30 * * * 1-5"
    description: Every 30min pre/post market
  off_hours:
    cron: "0 */4 * * *"
    description: Every 4h outside market hours
  batch4_eod:
    cron: "0 16 * * 1-5"
    description: EOD summary to MARKET + ledger writes (16:00 UTC)
```

## Watch Thresholds

```yaml
watch_thresholds:
  price_drop_sigma: 2
  volume_spike_multiplier: 2
  vnindex_drop_pct: 2
  brent_high: 90
  brent_low: 65
  usd_vnd_max: 25500
  bdi_weekly_spike_pct: 10
```
