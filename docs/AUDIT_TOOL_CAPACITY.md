# MCP Tool Capacity Audit — Underutilized Capabilities

**Status:** 105 tools available | 37 categories | 7 Cowork agents

---

## 🔴 UNUSED TOOLS (Zero Agent Calls)

| Tool | Category | Purpose | Who Should Use |
|------|----------|---------|-----------------|
| `get_ticker_intelligence` | Ticker Intelligence | Pre-trade brief (price + evidence + insider + BCTC outlook) | Market Watcher (for priority stocks) / QA Responder |
| `get_technical_indicators` | Technical Analysis | RSI/MACD/Bollinger Bands analysis | Market Watcher (confirm anomalies) / Alert Commander (validate signals) |
| `get_broker_credibility` | Broker Intel | Check if broker under SSC sanction (discount confidence) | News Scout (when citing broker forecast) / Financial Analyst |
| `compare_financials` | Financial Reports | QoQ/YoY delta analysis | Financial Analyst (BCTC trend) / Digest (earnings season) |
| `compare_stocks` | Comparison & Sector | Side-by-side 2-5 stock comparison | Market Watcher (peer anomalies) / Alert Commander (conviction context) |
| `get_label_accuracy_report` | Calibration | Per-agent signal accuracy (how often agent messages labeled 'signal' vs 'noise') | Unified Coordinator (quality audit) / Digest (calibration trend) |
| `get_agent_work_log` | Agent Work Log | Track what other agents did | Unified Coordinator (to detect duplicates) |
| `review_market_message` | Market Message Review | Label a single message as 'signal' or 'noise' | Unified Coordinator (quality feedback loop) |
| `get_unreviewed_market_messages` | Market Message Review | Find unreviewed MARKET channel messages | Unified Coordinator (daily audit) |
| `get_policy_signals` | Capital Protection | Government decrees affecting sectors | News Scout (catalysts) / Digest (monthly policy summary) |
| `get_pharma_signals` | Pharma Radar | Drug approvals, hospital tenders, regulations | News Scout (if any watchlist stocks = pharma) |
| `explain_hexagram` | Kinh Dich | Vietnamese explanation + trading implications for hex 1-64 | Digest & Predict (in weekly forecast section) |
| `get_transition_probabilities` | Kinh Dich | Markov transitions (which hexagrams follow current one) | Market Watcher / Alert Commander (pattern prediction) |

---

## 🟡 UNDERUTILIZED TOOLS (Used by 1-2 Agents Only)

### **Expensive Tools (Should Be Used More)**

| Tool | Current Users | Missing Users | Impact if Added |
|------|---|---|---|
| `get_evidence_summary` | Digest | Market Watcher, Alert Commander | See conviction sources, not just scores |
| `get_calibration_report` | Digest | Market Watcher, Alert Commander | Know signal accuracy baseline |
| `get_cascade_metrics` | Digest | Market Watcher, News Scout | Understand which sector rules fire (dead rules?) |
| `get_cascade_outcomes` | Digest | Market Watcher, News Scout | Validate if cascade signals actually moved prices |
| `get_signal_effectiveness` | Alert Commander, Digest | News Scout, Market Watcher | Track which signal TYPE works best |
| `get_alert_accuracy` | Alert Commander, Digest | Market Watcher, News Scout | Know hit rate of each stock's alerts |
| `get_foreign_flow` | (none in agent files!) | Market Watcher, Financial Analyst, Alert Commander | Capture insider selling/buying pressure |
| `run_hexagram_backtest` | Digest | Market Watcher | Validate Kinh Dich timing accuracy |
| `get_insider_transactions` | Financial Analyst | Market Watcher, Digest | Track when leadership buys/sells |
| `get_crisis_early_warning` | News Scout, Market Watcher | Financial Analyst, Alert Commander | Reputation + velocity checks |

### **Sector/Context Tools (Minimal Usage)**

| Tool | Current Users | Should Be Mandatory For |
|---|---|---|
| `get_credit_flow_signal` | (Digest only, rare) | Financial Analyst (RE/Banking signals) |
| `get_bond_maturity_calendar` | (Digest only) | Financial Analyst (RE company risk) |
| `get_public_contracts` | (Digest only) | News Scout (construction/energy catalysts) |
| `get_correlation_matrix` | Market Watcher, Digest | Alert Commander (if stock rises but corr pairs fall = anomaly) |
| `get_supply_chain_exposure` | Market Watcher, Digest | Financial Analyst (cost structure impact) |
| `get_sentiment_trend` | (Unified only?) | All agents (multi-day sentiment drift = reversal?) |

---

## 📊 Tool Usage by Agent (Detailed)

### **News Scout (01) — 15 Tools Called**
```
✅ Using: bootstrap, legal, crisis, prediction markets, impact chain, search context, market snapshot
❌ Missing:
   - get_policy_signals (political catalysts)
   - get_pharma_signals (if any pharma stocks)
   - get_broker_credibility (discount broker forecasts)
   - get_cascade_metrics (why did that sector rule fire?)
   - get_cascade_outcomes (did it work?)
   - run_impact_chain (correct! using it)
   → Add: policy, pharma, broker checks
```

### **Financial Analyst (02) — 18 Tools Called**
```
✅ Using: BCTC full, earnings, insider, financials, Kinh Dich, sector comparison, legal
❌ Missing:
   - get_credit_flow_signal (RE/Banking exposure)
   - get_bond_maturity_calendar (RE company defaults?)
   - get_ticker_intelligence (quick earnings context)
   - compare_financials (QoQ/YoY deltas)
   - get_cascade_outcomes (did earnings report theory pan out?)
   - run_hexagram_backtest (Kinh Dich accuracy for this stock)
   → Add: credit flow, bonds, compare, cascade outcomes, hex backtest
```

### **Market Watcher (04) — 24 Tools Called (Highest)**
```
✅ Using: prices, anomalies, Kinh Dich, supply chain, climate/energy, alerts, portfolio, sector rotation
❌ Missing:
   - get_technical_indicators (RSI oversold = anomaly? or noise?)
   - get_ticker_intelligence (pre-trade context)
   - compare_stocks (is this stock unique or sector-wide move?)
   - get_foreign_flow (FII selling = red flag?)
   - get_broker_credibility (broker bullish but FII selling = trap?)
   - get_transition_probabilities (current hex → likely next hex?)
   - run_hexagram_backtest (how accurate is Kinh Dich for this stock?)
   - get_cascade_outcomes (did price move validate sector rule?)
   → Add: technical, ticker intel, compare, foreign flow, transitions, backtest, cascade
```

### **Alert Commander (05) — 14 Tools Called**
```
✅ Using: alerts, signals, Kinh Dich, legal, crisis, effectiveness
❌ Missing:
   - get_ticker_intelligence (full context before firing)
   - compare_stocks (peer context = amplify or suppress alert?)
   - get_technical_indicators (RSI oversold + hex bearish = CRITICAL)
   - get_label_accuracy_report (am I sending signal or noise? accuracy check)
   - get_foreign_flow (FII flows validate price moves)
   - get_evidence_summary (show user WHY convinced = transparency)
   - get_transition_probabilities (next hex suggests recovery? extend alert?)
   → Add: ticker intel, compare, technical, accuracy check, foreign flow, evidence, transitions
```

### **Digest & Predict (06) — 40 Tools Called (Maximum!)**
```
✅ Using: BCTC, earnings, conviction, calibration, correlation, evidence, predictions, etc
❌ Missing:
   - get_technical_indicators (weekly technical summary)
   - get_ticker_intelligence (per-watchlist-stock brief)
   - get_label_accuracy_report (message quality trend)
   - get_policy_signals (monthly policy summary)
   - review_market_message / get_unreviewed_market_messages (feedback loop)
   → Add: technical, ticker briefs, label accuracy, policy, message feedback
```

### **Unified Coordinator — 45 Tools Called**
```
✅ Using: most tools, quality review, system status
❌ Missing (Rare):
   - review_market_message (actively label messages)
   - get_label_accuracy_report (track agent accuracy over time)
   - get_cascade_outcomes (cascade health)
   - get_broker_credibility (if analyzing broker forecasts)
   → Mostly good. Minor gaps.
```

---

## 🎯 **Tool Capacity Problems (Why Agents Underutilize)**

### **Problem 1: Missing Tier System**
- **Current:** Agent instructions mention tools but don't mandate them
- **Reality:** "SHOULD use X" ≠ "MUST use X before firing alert"
- **Example:** Alert Commander fires alerts without `get_ticker_intelligence()` context → user doesn't know stock profile

### **Problem 2: No Confirmation Pattern**
- Many tools return data but agents don't cross-validate
- **Example:** Market Watcher sees price anomaly (+3%) but doesn't call:
  - `get_technical_indicators()` → validate with RSI
  - `get_foreign_flow()` → check if FII buying or selling
  - `run_hexagram_backtest()` → is Kinh Dich accurate for this stock?
  - Result: False positive (noise fire)

### **Problem 3: No "Evidence Trail" in Outputs**
- Agents call tools but don't expose the reasoning chain
- **Example:** Alert fires with conviction=80% but Telegram doesn't show:
  - Which tools contributed? (5 of 7 agents say BUY?)
  - What's the accuracy baseline? (calibration_report: 75%?)
  - Any contradictions? (FII selling vs hex bullish?)

### **Problem 4: Kinh Dich Used Sporadically**
- Tools exist: `get_kinhdich_reading`, `explain_hexagram`, `get_transition_probabilities`, `run_hexagram_backtest`
- Reality: Only fetched, never interpreted in context
- Missing: Agents don't explain "what the hex MEANS for this trade"

### **Problem 5: Sector/Context Tools Rarely Combined**
- Available: `get_sector_rotation`, `get_sector_comparison`, `get_supply_chain_exposure`, `get_credit_flow_signal`
- Reality: Used separately, not as a "stock in context" picture
- Missing: "Why is HPG moving when STEEL sector is flat?"

### **Problem 6: Performance Tools Not In Alert Flow**
- Tools exist: `get_alert_accuracy`, `get_signal_effectiveness`, `get_cascade_metrics`, `get_cascade_outcomes`
- Reality: Only used by Digest for retrospectives
- Missing: Alert Commander doesn't validate if ITS OWN signals historically worked before firing

### **Problem 7: External Intelligence Not Tied to Decisions**
- Tools exist: `get_policy_signals`, `get_pharma_signals`, `get_broker_credibility`, `get_public_contracts`
- Reality: Not used by most agents
- Missing: "This stock up because of new contract? Or sector rotation?"

---

## 💡 **Recommendations to Unlock Full Capacity**

### **Immediate (Quick Wins)**

#### 1. **Alert Commander: Add 5 Pre-Fire Checks**
```python
Before send_telegram(alert):
  1. get_ticker_intelligence(stock) → user knows stock profile
  2. get_technical_indicators(stock) → RSI/MACD confirm anomaly?
  3. get_foreign_flow(stock, days=3) → FII buying or selling?
  4. get_label_accuracy_report() → am I 80% or 50% accurate?
  5. get_evidence_summary(stock) → show conviction sources

  Result: Alert goes from "VCB hit stop-loss" → "VCB stop-loss + RSI oversold + FII selling + 4/5 agents bearish = CRITICAL"
```

#### 2. **Market Watcher: Add 3 Confirmation Calls**
```python
When detecting price_anomaly(stock, +3%):
  1. get_technical_indicators(stock) → RSI overbought or recovery?
  2. run_hexagram_backtest(stock) → does Kinh Dich predict +3% moves?
  3. compare_stocks([stock] + sector_peers) → sector-wide move or unique?

  Result: Signal quality improves (suppress false positives)
```

#### 3. **Financial Analyst: Add 2 Context Calls**
```python
When analyzing BCTC:
  1. get_credit_flow_signal() → if RE/Banking → add housing market context
  2. get_bond_maturity_calendar() → if RE → check company bond maturity risk

  Result: Earnings analysis includes debt/default risk, not just revenue
```

#### 4. **News Scout: Add Policy + Broker Context**
```python
When posting urgent_news:
  1. get_policy_signals(days=7) → is there a new decree affecting this stock?
  2. get_broker_credibility(broker_name) → if citing analyst → discount if sanction
  3. get_cascade_outcomes(days=7) → did this type of news move prices last week?

  Result: Signal validated against past outcomes, not just current headline
```

### **Medium-Term (Process Changes)**

#### 5. **Unified Coordinator: Weekly Quality Audit Loop**
```python
Every day (post-digest):
  1. get_unreviewed_market_messages() → find all MARKET messages sent
  2. For each: review_market_message(id, verdict='signal' or 'noise')
  3. get_label_accuracy_report(since_days=7) → which agents are 'signal' vs 'noise'?
  4. send_telegram(work) → "Agent accuracy this week: Alert Cmd 82%, Digest 75%, etc"

  Result: Feedback loop drives agent quality up over time
```

#### 6. **Digest & Predict: Weekly Cascade Health Check**
```python
Every Monday:
  1. get_cascade_metrics() → which sector rules are dead (never fire)?
  2. get_cascade_outcomes() → did cascade signals move prices?
  3. Report: "Sector rules: 18/42 firing. Oil↑ drives Energy+Aviation. Finance static."

  Result: System transparency: users know cascade is working or broken
```

#### 7. **Hexagram Trend Analysis (Monthly)**
```python
First of month:
  1. For each watchlist stock:
     - get_hexagram_history(stock, days=30) → trend in readings
     - get_transition_probabilities(current_hex) → which hex likely next?
  2. Digest output: "Hexagram trends: VCB stable (Hex 29), HPG ascending (11→34→34), FPT volatile (63→64→63)"

  Result: Kinh Dich becomes predictive (not just descriptive)
```

---

## 📈 **Capacity Gain Estimate**

| Agent | Current Tools | Proposed | Gain | Output Quality Lift |
|---|---|---|---|---|
| News Scout | 15 | 18 | +3 | Signal/noise ratio improves |
| Financial Analyst | 18 | 22 | +4 | BCTC context richer |
| Market Watcher | 24 | 31 | +7 | Anomaly confirmation → fewer false alerts |
| Alert Commander | 14 | 21 | +7 | **Biggest impact: pre-fire evidence + accuracy check** |
| Digest & Predict | 40 | 44 | +4 | Cascade health + message feedback loop |
| **Total Cowork Capacity** | **111** | **147** | **+36** | **+32% tool utilization** |

---

## 🔧 **Implementation Order**

1. **Week 1:** Alert Commander +7 tools (highest impact)
2. **Week 2:** Market Watcher +7 tools (most anomalies)
3. **Week 3:** Financial Analyst +4, News Scout +3
4. **Week 4:** Unified Coordinator quality loop
5. **Month 2:** Cascade + Hexagram trends

---

## 🎓 **Why This Matters for Message Quality**

**Current State:**
- Agent sends: "VCB down 2.5%"
- User thinks: "So what? Is this important?"

**With Full Capacity:**
- Agent sends: "🔴 VCB [CRITICAL 87% conv] Down 2.5% + RSI oversold (18) + FII net sell 500k shares + 4/5 agents bearish + Hex 29→53 suggests recovery Thu. Stop-loss: 75,000. Action: Hold/sell depending on conviction tolerance."
- User knows: **Exactly why** + **how confident** + **when to reassess** + **what data sources agree**

You have 105 tools. Agents are using ~25-40. Gap is real.

