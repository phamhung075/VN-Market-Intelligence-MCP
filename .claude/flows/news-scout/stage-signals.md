> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 3: Post Signals

## Inter-cycle dedup gate (Auto-cure TNB c51 — 2026-05-14)

Before posting any `chain_catalyst` or `urgent_news`, check the last 3 hours of signals on the bus:

```
recent = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "news-scout",
  "from_agent": "news-scout",
  "status": "all"
})
# from_agent filters by sender (self-history). status="all" ensures already-read rows
# (marked read by other agents) are still visible. The 180-min window check is applied
# manually using created_at from the returned payload.
# Read-mark side-effect is suppressed when from_agent is set.
```

For each candidate signal:
1. Extract the primary `event_type` + `affected_sectors` or `stock_code` from the candidate.
2. Check `recent` for any entry where **both** match (same event_type AND overlapping affected_sectors or same stock_code) **AND** `created_at` is within the last 180 minutes.
3. If match found → **SUPPRESS** with log: `"[DEDUP] {signal_type} suppressed — same theme already on bus as #{prior_id} ({N} min ago). Skipping post."`
4. If no match → proceed to post.

**Threshold:** 180 minutes (3 hours). Covers intra-session recurring macro events (CPI/oil, FII-outflow, sector ATH rallies).

**Exception:** If the candidate has a materially different `direction` (e.g., prior=bearish, candidate=bullish on new data) → override suppression. Log the override explicitly.

---

**3. Signals**

### Legal Risk Signal Dispatch

Legal risk event detected (prosecution / asset freeze / investigation) in article for watchlist or reference ticker →

**Trigger condition (either):**
- `legalRiskDetector.detectLegalRisk(articleText, watchlistCodes)` returns non-empty result, OR
- Article text matches any `CRIMINAL_PROSECUTION_KEYWORDS` (from `policyImpactMapper.ts`) AND `detectStocksInText()` resolves ≥1 watchlist/reference-stock code (e.g. PC1 from `referenceStocks.utilities`)

**Step 1 — Dedup check:**
Query recent `agent_signals` for matching `(stock_code, signal_type = "legal_risk")` within 360 minutes:

```
dedup_check = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "news-scout",
  "from_agent": "news-scout",
  "status": "all"
})
# Manual check: scan returned rows for same stock_code + signal_type="legal_risk"
# within last 360 minutes using created_at.
# 360 min = 6h TTL — legal proceedings evolve slowly, no need for per-cycle repost.
```

- If duplicate found within 360 min → **SUPPRESS** with log: `"[DEDUP] legal_risk suppressed — same (stock_code, legal_risk) already on bus within 360 min. Skipping post."`
- If no duplicate → proceed to Step 2

**Step 2 — Classify risk level:**

| Risk type | Confidence |
|-----------|-----------|
| `prosecution` / `asset_freeze` | 0.95 |
| `tax_penalty` / `license_revocation` | 0.85 |
| `investigation` / `litigation` / `anti_dumping` | 0.70 |

Use `legalRiskSignal.riskType` (from `detectLegalRisk()`) to look up the confidence score above.

**Step 3 — Post signal:**

```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "alert-commander",
  "signal_type": "legal_risk",
  "stock_code": "<TICKER resolved by detectStocksInText()>",
  "payload": {
    "title": "<headline>",
    "detail": "<riskType> — <matched patterns joined by ', '> — <source>"
  },
  "ttl_minutes": 360,
  "finding_data": {
    "title": "<headline>",
    "detail": "<riskType> — <matched patterns joined by ', '>",
    "confidence_score": <0.95 | 0.85 | 0.70>
  }
})
```

**Notes:**
- `ttl_minutes: 360` — legal events are durable; signal expires after 6 h to prevent stale alerts
- Do NOT contact `verdictResolutionJob.ts` or `alert_accuracy` tables — legal_risk signals are not scored by the verdict pipeline
- Multiple risk types in one article → one `post_agent_signal` call per distinct `riskType` (deduplicated by type)

---

Watchlist hit (breaking news) → post `urgent_news`:
<!-- AUTO-CURE TNB c55 — 2026-05-15: F/H-step gap (3-cycle evidence c53/c54/c55).
     payload.detail must include pillar summary + cycle phase + pyramid tier (same as chain_catalyst).
     Format: "<summary> | pillars=<M2:neutral,COC:headwind,EPS:tailwind,POL:neutral> | phase=<phase> tier=<tier>" -->
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "alert-commander",
  "signal_type": "urgent_news",
  "stock_code": "<TICKER>",
  "payload": { "title": "<headline>", "detail": "<summary> | pillars=<M2:neutral,COC:headwind,EPS:tailwind,POL:neutral> | phase=<recovery|expansion|slowdown|contraction> tier=<equity|fixed_income|cash|alternative>", "impact_score": 7 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>",
    "severity": "<low|medium|high|critical>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "regime_adjusted_score": 7.0,
    "hot_money_risk": false,
    "cpi_pressure_risk": false
  }
})
```

Crisis / macro catalyst → post `chain_catalyst`:
<!-- regime is read from bootstrap macro snapshot by alert-commander, not from signal finding_data.
     ChainCatalystFindingDataSchema is strict (no .passthrough()) — extra fields are silently stripped.
     Include regime context in payload.detail instead. -->

<!-- AUTO-CURE TNB c55 — 2026-05-15: F/H-step gap (3-cycle evidence c53/c54/c55).
     Every chain_catalyst payload.detail MUST include:
       - pillar summary: which of {M2,COC,EPS,POL} support/contradict the thesis
       - cycle phase: Investment Clock phase (recovery/expansion/slowdown/contraction)
       - pyramid tier: equity | fixed_income | cash | alternative
     Omitting these fields produces a 3/7 NEEDS_ATTENTION methodology score (Layer 5, steps F and H).
     Format: "<summary> | regime=<REGIME> regime_adj_score=<N> | pillars=<M2:neutral,COC:headwind,EPS:tailwind,POL:neutral> | phase=<recovery|expansion|slowdown|contraction> tier=<equity|fixed_income|cash|alternative>" -->
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "all",
  "signal_type": "chain_catalyst",
  "stock_code": "<TICKER or omit>",
  "payload": { "title": "<headline>", "detail": "<summary> | regime=<REGIME> regime_adj_score=<N> | pillars=<M2:neutral,COC:headwind,EPS:tailwind,POL:neutral> | phase=<recovery|expansion|slowdown|contraction> tier=<equity|fixed_income|cash|alternative>", "impact_score": 9 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "event_type": "<credit_policy|trade_war|earnings|macro|legal|crisis|sector_event>",
    "direction": "<bullish|bearish|neutral>",
    "confidence": 0.8,
    "affected_stocks": ["<TICKER1>", "<TICKER2>"],
    "affected_sectors": ["<sector1>"],
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>",
    "hot_money_risk": false,
    "gdp_warning_signal": false
  }
})
```
