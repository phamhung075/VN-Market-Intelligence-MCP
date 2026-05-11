# Market Watcher — EOD Flow (16:00 UTC)

**Tools:** `.claude/tools/package/market-watcher.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
`get_watchlist()` | EOD prices + RSI + volume

## Output
Ledger entries in `docs/analysis-briefs/{TICKER}.md` | MARKET EOD summary

> Channel rule: MARKET = signal-grade EOD per ticker (ticker + direction + conviction). "Write complete / ledger updated" operational notices → WORK, not MARKET.

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `market-watcher`)

**A. Ledger** — per ticker, if `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`

Then append `docs/analysis-briefs/{TICKER}.md` [Market Watcher]:
```
YYYY-MM-DD 16:00 | Close: {price} VND | RSI: {rsi} | Vol: {volume} ({vs_avg_pct}% avg) | YoY: {yoy_change}%
```
Write fails → `send_telegram(channel="bug")` immediately, still proceed to B.

**B. MARKET EOD** — per ticker:
```
{TICKER} — EOD YYYY-MM-DD
Price: {price} VND ({daily_change}, YoY {yoy_change}) | Vol: {volume} | RSI: {rsi}
Sentiment: {sentiment} | Insider: {insider_activity}
→ Action: {brief_action}
📖 docs/analysis-briefs/{TICKER}.md
```
`send_telegram(channel="market")`

Rules:
- `{brief_action}` max 10 words: Hold / Buy on dip / Reduce / Watch
  - `REGIME=TIGHTENING` + action=`Buy on dip` → append `"(Thiên thời bất lợi — xác nhận trước khi mua)"`
  - `REGIME=EASING` + action=`Buy on dip` → append `"(Thiên thời thuận — carry tích cực)"`
  - `REGIME=TIGHTENING` + action=`Reduce` → append `"(Thiên thời bất lợi — ưu tiên phòng thủ)"`
- `{sentiment}` = last [News Scout] entry
- `{insider_activity}` = `get_insider_signals()` or "no activity"
- Skip weekends + market holidays

**C. WORK status** — `send_telegram(channel="work", message=...)`:
```
[Market Watcher EOD] 16:00 UTC — N tickers processed | Ledger: N written, M failed | MARKET summary sent
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
