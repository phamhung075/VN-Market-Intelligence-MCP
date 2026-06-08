# Market Watcher — EOD Flow (16:00 UTC)

**Tools:** `docs/agents/tools/package/market-watcher.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
`get_watchlist()` | EOD prices + RSI + volume

## Output
Ledger entries in `docs/analysis-briefs/{TICKER}.md` | Signal file `docs/signals/price_anomaly_<YYYYMMDDTHHMM>.json`

> Channel rule: market-watcher is a GATHERER. No MARKET writes. Chef (unified-agent) reads the signal file at 08:37 UTC EOD dish. All MARKET writes are chef's responsibility.

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `market-watcher`)

**A. Ledger** — per ticker, if `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`

Then append `docs/analysis-briefs/{TICKER}.md` [Market Watcher]:
```
YYYY-MM-DD 16:00 | Close: {price} VND | RSI: {rsi} | Vol: {volume} ({vs_avg_pct}% avg) | YoY: {yoy_change}%
```
Write fails → `send_telegram(channel="bug")` immediately, still proceed to B.

**B. SIGNAL FILE** — write `docs/signals/price_anomaly_<YYYYMMDDTHHMM>.json`:

```json
{
  "schema": "price_anomaly_v1",
  "generated_at": "<ISO8601>",
  "dish_window": "eod",
  "tickers": [
    {
      "code": "{TICKER}",
      "price": {price},
      "daily_change_pct": {daily_change},
      "yoy_change_pct": {yoy_change},
      "volume": {volume},
      "vs_avg_pct": {vs_avg_pct},
      "rsi": {rsi},
      "sentiment": "{last_news_scout_entry}",
      "insider_activity": "{get_insider_signals result or 'no activity'}",
      "brief_action": "{Hold|Buy on dip|Reduce|Watch}",
      "regime_flag": "{TIGHTENING|EASING|NEUTRAL}",
      "anomaly": {true|false},
      "anomaly_reason": "{reason or null}"
    }
  ]
}
```

Rules:
- **JSON NUMERIC FIELDS — NO LEADING `+` SIGN (MANDATORY):** All numeric fields (`price`, `daily_change_pct`, `yoy_change_pct`, `volume`, `vs_avg_pct`, `rsi`) MUST be written as raw JSON numbers. Positive values have NO sign prefix (e.g. `2.17`, `2.21`, `1234.5`). A leading `-` for negatives is valid. A leading `+` is **invalid JSON** and will cause `JSON.parse` to reject the entire file. Strip any `+` prefix before writing. This rule supersedes any display-format convention from upstream tool output.
- `brief_action` max 10 words; regime_flag from current macro regime
- `insider_activity` = `get_insider_signals(code="{TICKER}")` or "no activity"
- Skip weekends + market holidays
- File written atomically; chef reads at 08:37 UTC (24min settle window)

**C. WORK status** — `send_telegram(channel="work", message=...)`:
```
[Market Watcher EOD] HH:MM UTC — N tickers processed | Ledger: N written, M failed | Signal file: docs/signals/price_anomaly_<ts>.json written
```

**D. Notebook batch commit** (L-7, 1968b2) — Commit all in-session notebook writes for market-watcher AND news-scout in a single EOD commit:

```bash
git add docs/agent-memory/notebooks/market-watcher.md docs/agent-memory/notebooks/news-scout.md
git_commit_retry -m "chore(memory/market-session-eod): notebook YYYY-MM-DD cycles N"
```

> `git_commit_retry` idiom: retry up to 3× on `HEAD.lock` / `index.lock` only — see `docs/protocols/head-lock-self-cure.md` § F4.
> If commit fails after retries: log to BUG channel + `send_telegram(channel="bug", message="[eod] notebook batch commit failed — manual recovery needed: docs/protocols/head-lock-self-cure.md")`. Notebook writes are on disk; git loss window is bounded to this market session.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
