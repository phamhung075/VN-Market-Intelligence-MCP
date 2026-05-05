---
name: submit_feedback
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# submit_feedback

Submit an improvement suggestion to the BUG Telegram channel (TELEGRAM_REPORT_BUG_CHANNEL_ID). Use this when you find: missing cascade rules, wrong trade mappings, data extraction errors, alert quality issues, or any system gap. Tag a recipient: @team (all), @po (Product Owner), @dev, @qa, etc.



## Arguments

- **title** (string) — **required**
  - Short bug/feedback title (max 200 chars)

- **category** (enum) — **required**
  - Type of feedback: `"bug"`, `"enhancement"`, `"data_error"`, `"performance"`, `"documentation"`, `"alert_quality"`

- **agent** (string) — **required**
  - Which agent discovered the issue (e.g., "news-scout", "financial-analyst", "alert-commander")

- **detail** (string) — optional
  - Detailed description (context, steps to reproduce, error logs, etc.)

- **priority** (enum) — optional
  - Severity: `"critical"`, `"high"`, `"medium"`, `"low"` (default: "medium")

- **to** (string) — optional
  - Target recipient: `"@team"`, `"@po"`, `"@dev"`, `"@qa"`, `"@ops"` (default: "@team")

## Return Type

`{ success: boolean, feedback_id: string, channel: "bug", recipients: string[], timestamp: string }`

## Example Usage

### Data Extraction Error (Financial Analyst)
```typescript
const result = await call_tool("vn-market", "submit_feedback", {
  agent: "financial-analyst",
  title: "BCTC PDF extraction failing for FPT",
  category: "data_error",
  detail: "read_bctc_pdf timeout after 30s. VPS latency spike observed. Attempted 3 retries, all failed. Stock: FPT, Date: 2026-05-04 10:15 UTC.",
  priority: "critical",
  to: "@ops"
});
// Sends to BUG channel with @ops tag → ops team auto-fixes
```

### Alert Quality Issue (Alert Commander)
```typescript
const result = await call_tool("vn-market", "submit_feedback", {
  agent: "alert-commander",
  title: "False positive: watchlist-opportunity fired for VIC without sentiment confirmation",
  category: "alert_quality",
  detail: "Alert fired with 65% conviction (below 70% threshold). Check kinhdich signal validation logic. VIC data as of 2026-05-04 14:30 UTC.",
  priority: "high",
  to: "@dev"
});
```

### Missing Cascade Rule (News Scout)
```typescript
const result = await call_tool("vn-market", "submit_feedback", {
  agent: "news-scout",
  title: "No cascade rule for 'VND deprecation → exporter stocks bullish'",
  category: "enhancement",
  detail: "Detected: VND weakening signal (USD/VND 24.500 → 24.600). Impact cascade should map: macro FX weakness → sector export bullish → stocks (GAS, PVD, STB) opportunity. Not in current cascade rules.",
  priority: "medium",
  to: "@po"
});
```

### Performance Issue (Market Watcher)
```typescript
const result = await call_tool("vn-market", "submit_feedback", {
  agent: "market-watcher",
  title: "get_price_history slow for 1000+ tickers (5s+ latency)",
  category: "performance",
  detail: "Fetching daily OHLCV for full watchlist takes 5-7 seconds. Consider: pagination, caching, or DB indexing on (stock_code, date).",
  priority: "medium",
  to: "@dev"
});
```

### Documentation Gap (QA Responder)
```typescript
const result = await call_tool("vn-market", "submit_feedback", {
  agent: "qa-responder",
  title: "Missing example: how to interpret kinhdich confidence scores",
  category: "documentation",
  detail: "Users ask frequently about what '65% confidence' means. Need brief guide in .claude/knowledge/kinh-dich-layer.md explaining score interpretation (0-20% = uncertain, 20-60% = moderate, 60-80% = high, 80%+ = very high).",
  priority: "low",
  to: "@po"
});
```

## When to Use

- **Any bug discovery** — Crash, error, data wrong → feedback immediately
- **Alert firing incorrectly** — False positives, wrong thresholds → feedback
- **Missing cascade rule** — News event not in impact chain → enhancement feedback
- **Performance degradation** → Tool taking too long → feedback to @dev
- **Documentation gap** → Users confused by behavior → feedback to @po

## Feedback Routing

Feedback automatically routed to **BUG Telegram channel** (TELEGRAM_REPORT_BUG_CHANNEL_ID):

```
Feedback with @ops tag → Dev Team Ops agent auto-fixes
Feedback with @dev tag → Developer agent auto-fixes
Feedback with @po tag → Product Owner reviews priorities
Feedback with @team tag → All team members can see
```

## Categories Guide

| Category | What | To |
|----------|------|-----|
| `bug` | Crash, error, unexpected behavior | @dev or @ops |
| `data_error` | Wrong data, missing fields, extraction failed | @ops (if VPS), @dev (if logic) |
| `alert_quality` | False positive, wrong threshold, missed alert | @dev |
| `performance` | Tool slow, timeout, high latency | @dev |
| `enhancement` | Missing cascade rule, new feature idea | @po |
| `documentation` | Unclear docs, missing examples | @po |

## Dev Team Auto-Fix Loop

Feedback → BUG channel → Dev Team cron reads BUG → developer agent claims issue → auto-fix + test → push to main → restart services

**Typical latency:** 15-60 min (within one hourly dev cycle)

## Notes

- **Be specific** — Include stock codes, timestamps, error messages, steps to reproduce
- **One issue per feedback** — Multiple separate issues → separate feedback entries
- **Include context** — Which agent, which tool, what data triggered the issue
- **Priority honestly** — Don't mark everything critical (reserve for crashes/data loss)
- **Feedback is async** — Don't wait for response; Dev Team processes in hourly cycle

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — categories, routing, dev loop integration, examples)
