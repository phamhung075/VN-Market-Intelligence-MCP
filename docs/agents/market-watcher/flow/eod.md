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

**0. Bootstrap** → skill: `.claude/skills/step-0-cowork/SKILL.md` (replace `<agent-id>` with `market-watcher`) — § 0b only (this flow derives `regime_flag` directly from the bootstrap macro block below; it does not call regime-extraction separately, and does not read notebook carry-over at Step 0a)

**A. Ledger** — per ticker, if `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`

Then append `docs/analysis-briefs/{TICKER}.md` [Market Watcher]:
```
YYYY-MM-DD 16:00 | Close: {price} VND | RSI: {rsi} | Vol: {volume} ({vs_avg_pct}% avg) | YoY: {yoy_change}%
```
Write fails → `send_telegram(channel="bug", message="[market-watcher] EOD ledger write failed for {TICKER} — proceeding to signal file")` immediately, still proceed to B.

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

> **Same-agent multi-slot mutex** (FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK, 2026-08-06): `market-watcher-eod` (`0 16 * * 1-5`) and `market-watcher-offhours` (`0 */4 * * *`) share an identical 16:00 UTC Mon-Fri tick (`docs/data/cowork-schedule.json`) — both are expected to co-fire (match-slots.md Step 4b WARN-only, brief §5 R3: two genuinely different sub-flows, not a bug). Without mutual exclusion, offhours' cycle.md Step 5 notebook OVERWRITE can clobber `market-watcher.md` on disk between this step's read and its `git add`, silently losing whatever intraday-cycle content was pending commit. Guard with the same task_claim mutex idiom already used for the analogous coverage-state.json cross-writer race (cycle.md Step 5c, FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE):
> ```
> LOCK = call_tool(server="vn-market", tool="task_claim", arguments={
>   task_id: "market-watcher-notebook:main", task_kind: "sprint-task",
>   owner_agent: "market-watcher",
>   owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, coordinationTools.ts:104-110;
>     substitute the ACTUAL resolved value, NEVER write the literal text "$CLAUDE_CODE_SESSION_ID" —
>     an LLM-issued call_tool is a direct function call, not a shell command, so the variable is NOT
>     expanded (session memory: feedback_llm_issued_call_tool_does_not_expand_session_id_variable)>",
>   ttl_seconds: 60
> })
> ```
> Same bounded-retry style as `git_commit_retry` below: if `claimed:false`, retry up to 2 more times (5s apart); if still held after 3 attempts, proceed unguarded and log `[market-watcher] notebook-lock contended 3x — proceeding unguarded` (best-effort — never a hard block, consistent with WARN-not-BLOCK multi-slot policy). On success, hold through the commit below, then `task_release(task_id="market-watcher-notebook:main", owner_client_session="<same resolved value as above>")` in a finally regardless of outcome.

```bash
git add docs/agent-memory/notebooks/market-watcher.md docs/agent-memory/notebooks/news-scout.md
git_commit_retry -m "chore(memory/market-session-eod): notebook YYYY-MM-DD cycles N"
```

> `git_commit_retry` idiom: retry up to 3× on `HEAD.lock` / `index.lock` only — see `docs/protocols/head-lock-self-cure.md` § F4.
> If commit fails after retries: log to BUG channel + `send_telegram(channel="bug", message="[eod] notebook batch commit failed — manual recovery needed: docs/protocols/head-lock-self-cure.md")`. Notebook writes are on disk; git loss window is bounded to this market session.

> Invoke directly via Bash (this agent holds Bash — `.claude/agents/market-watcher.md:5` — granted 2026-07-30T23:18Z, commit 610110e16). If the Bash invocation itself errors (`git add`/`git_commit_retry` genuinely fails after the retry protocol above — a genuine transport failure, not a tool-grant gap): that is already covered by the BUG-channel escalation above — do NOT additionally SKIP this step, fabricate the commit, or silently drop the note. Ledger + signal file writes (Steps A/B) are unaffected either way.

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`
