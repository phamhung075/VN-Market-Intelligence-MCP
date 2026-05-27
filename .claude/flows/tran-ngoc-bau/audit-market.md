> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 1 & 2: Audit MARKET Messages + Agent Notebooks

## Phase 1: Audit MARKET Messages

**Step 1a — Read MARKET channel (plain-language check)**
`read_telegram_reports(channel="market", limit=10)` → last 10 MARKET messages

For each MARKET message check:
- [ ] Vietnamese diacritics present (no mojibake, no missing marks)
- [ ] Message is plain Vietnamese prose — no inline citations (`#ID`, `price_anomaly_*`), no `[gap:]` markers, no metadata block
- [ ] Message is 3–6 sentences and comprehensible to a non-technical reader
- [ ] Ticker direction + delta % visible (not σ notation)
- [ ] No bullet-point ticker dumps (narrative only)

**Step 1b — Read WORK channel for analyst detail (layer-walk audit)**
`read_telegram_reports(channel="work", limit=20)` → filter messages starting with `[CHEF-DETAIL]`

For each `[CHEF-DETAIL]` message (one per dish — Morning / EOD / Evening), check:
- [ ] Message structure follows `docs/standards/alert-message-format.md`
- [ ] Confidence displayed as 0–1 decimal (not percentage, not raw integer)
- [ ] Regime caveat appended when required (TIGHTENING + bullish must have caveat)
- [ ] Ticker symbol valid (in watchlist or known VN stock)
- [ ] No duplicate messages (same ticker + same signal type within 2h)
- [ ] **Pillar coverage** — investment-thesis references ≥3 of {M2, COC, EPS, POL} per `tnb-methodology.md` Layer 4. Score logged for Phase 2.5.
- [ ] Causal-chain sentence from Step 6.5 present in paragraph 2
- [ ] Inline citations present in paragraph 2 (signal ID / source file / source_tier)
- [ ] TNB metadata footer present: "TNB layers walked", "Signal IDs consumed", "source_tier values cited"

**Step 2 — Cross-validate with live data**
For each MARKET alert about a specific ticker:
1. `get_market_snapshot()` → verify current price
2. Check if alert price diverges >5% from current → flag as STALE
3. If alert claims earnings beat/miss → `compare_financials(codes=[ticker])` to verify
4. If alert claims price anomaly → `get_price_history(code=ticker, days=5)` to verify sigma
5. If alert claims sector move → `get_sector_comparison(code=ticker)` to verify

Log: `"[Verify] [TICKER] claim={X} actual={Y} → MATCH|MISMATCH"`

## Phase 2: Review Agent Notebooks

**Step 3 — Read agent notebooks**
```
Glob: docs/agent-memory/notebooks/*.md
```
For each agent notebook (check the latest appended cycle entry — today's date or most recent):
- Did agent extract REGIME at bootstrap? (check for "REGIME" keyword in log)
- Did agent apply regime thresholds? (check for threshold values)
- Did agent attach regime caveat to MARKET output?
- Did agent log signal outcomes?

Agents to audit: news-scout, market-watcher, alert-commander, financial-analyst, report-analyzer, digest-predict, qa-responder, unified-agent

**Step 4 — Validate agent flows**
For agents with quality issues found in Step 3:
1. Read their flow file: `.claude/flows/{agent}/cycle.md` or `main.md`
2. Check: does flow reference REGIME extraction?
3. Check: does flow apply regime-conditioned thresholds?
4. Check: does flow attach regime caveat?
5. If systematic gap (same error 3+ cycles in notebook history) → AUTO-CURE (Step 6 in report-cycle.md)
