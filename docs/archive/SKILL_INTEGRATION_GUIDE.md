# Skill Integration Guide — Wire Skills to Agents

**Status:** 6 reusable skills created. Now inject into agent workflows.

---

## 📋 Skills Inventory (Complete List)

| Skill | Purpose | When to Call | Status |
|-------|---------|--------------|--------|
| **caveman** (existing) | Ultra-compress output (bullets, no prose) | Before send_telegram() | ✅ Use |
| **token-economy** (existing) | Reduce token usage (compress vars, remove steps) | After generating message, before send | ✅ Use |
| `kinh-dich-interpreter` | Transform hex to actionable insight | Before post_agent_signal() | ✅ New |
| `conviction-calculator` | Multi-source confidence scoring | Before post_agent_signal() | ✅ New |
| `narrative-formatter` | Message structure (Why/Confirms/Kinh/Next/Risk) | Before send_telegram() | ✅ New |
| `pre-fire-validation` | 5-check validation gate | BEFORE conviction_calculator() | ✅ New |
| `signal-intelligence` | Policy/broker/cascade outcome validation | Before post_agent_signal() | ✅ New |
| `quality-audit-loop` | Weekly feedback loop for improvement | Weekly cycle only (UC) | ✅ New |

---

## ⚙️ Execution Pattern (All Skills)

Every skill call follows this pattern:

```python
# Step 1: Load data
data = {
  "stock": stock_code,
  "signal": signal_data,
  "conviction": conviction_score
}

# Step 2: Call skill
result = skill_name(data)  # Result has .validation_result, .conviction, etc

# Step 3: Check result
if result.validation_result == "PASS":
    proceed_to_next_step()
else:
    suppress_or_handle_error()

# Step 4: Use result
message = narrative_formatter(result)  # Or similar transformation
```

---

---

## 🔧 Existing Skills (Fix Integration)

### **Skill: caveman (Compression)**

**Where:** Before send_telegram() OR before post_agent_signal()

**Execution:**
```python
# Load skill
# Apply: caveman ultra mode to all outputs

# Example - Alert Commander before send_telegram:
message = narrative_formatter(...)  # "VCB price declined due to ROE weakness..."

# Apply caveman ultra
compressed = """
🔴 VCB — SELL [80%]
• BCTC: ROE -2% YoY
• Confirmation: 4/6 agents
• Kinh Dich: 坎 Risk phase
• Next: +1% bounce likely
• Risk: 1-2% more down possible
"""

send_telegram(channel="market", message=compressed)
```

**Impact:** ~60% token reduction, ultra-clear bullet points

---

### **Skill: token-economy (Token Optimization)**

**Where:** After message generation, before send_telegram()

**Execution:**
```python
# Generate message (full verbose form)
message = f"""
Stock {stock} experienced a price decline of {pct}% due to
fundamental weakness in quarterly earnings metrics. The ROE
decreased significantly compared to prior year...
"""

# Call token-economy: compress message
compressed = optimize_tokens(message, target_tokens=200)
# Result: "VCB -2.5%. ROE -2% YoY. 4/6 agents bearish."

# Send optimized
send_telegram(channel="market", message=compressed)
```

**Rules:**
- Target: <= 300 tokens for MARKET alerts
- Remove intermediate thinking
- Keep facts + conviction + action
- Preserve Vietnamese diacritics

**Impact:** ~40% token reduction per message, ~700 tokens/cycle saved

---

## 🔧 Agent-by-Agent Integration

### **Agent 01: News Scout**

**Current Role:** Fetch news, detect sentiment, run impact chains, post urgent_news signals

**New Skills to Add:**
1. `signal-intelligence` — validate claims before posting
2. `conviction-calculator` (optional) — add conviction score to signals

**Integration Points:**

```markdown
## SKILLS (new section)

Load these skills before first cycle:
- `.claude/skills/signal-intelligence/SKILL.md`
- `.claude/skills/conviction-calculator/SKILL.md`

## EACH CYCLE - Modified Steps

### Step 3: Validate Signals Before Posting
Before `post_agent_signal(signal_type="urgent_news")`:

1. Call `signal_intelligence(signal_data)` to check:
   - Broker credibility (if citing analyst)
   - Policy context (does government decree support/contradict?)
   - Cascade outcomes (did similar news move prices last week?)
   - Legal risk (auto-escalate if prosecution/audit detected)

2. If signal_intelligence returns CRITICAL → upgrade signal to "legal_risk"
3. If signal_intelligence returns CONTRADICTED → suppress signal
4. If signal_intelligence returns SUPPORTED → proceed to Step 4

### Step 4: Calculate Conviction
Call `conviction_calculator()` with:
- `sources.news_sentiment` from Step 2
- `sources.legal_risk` from signal_intelligence check
- `sources.policy_context` from signal_intelligence check

### Step 5: Post Signal with Conviction
```python
if signal_intelligence_result != CONTRADICTED:
    conviction = conviction_calculator(...)
    post_agent_signal(
        signal_type=signal_type,
        payload={
            title: signal.headline,
            conviction: conviction.pct
        }
    )
```

**Changes to News Scout File (01-news-scout.md):**
- Add SKILLS section (load signal-intelligence + conviction-calculator)
- Modify Step 3 to call `signal_intelligence()` before posting
- Modify Step 4 to call `conviction_calculator()`
- Document: "Legal risks auto-escalate; policy context validates news"
```

---

### **Agent 02: Financial Analyst**

**Current Role:** Collect BCTC, analyze financials, post fundamental_validation signals

**New Skills to Add:**
1. `conviction-calculator` — BCTC confidence scoring
2. `signal-intelligence` — policy/bond maturity context
3. `kinh-dich-interpreter` (optional) — hex context for BCTC findings

**Integration Points:**

```markdown
## SKILLS (new section)

Load these skills before first cycle:
- `.claude/skills/conviction-calculator/SKILL.md`
- `.claude/skills/signal-intelligence/SKILL.md`
- `.claude/skills/kinh-dich-interpreter/SKILL.md`

## EACH CYCLE - Modified Steps

### Step 3: Enrich BCTC Finding with Context
Before posting fundamental_validation:

1. If stock is Banking/Real Estate:
   - Call `signal_intelligence()` to check:
     - `get_credit_flow_signal()` — mortgage rates, lending pressure
     - `get_bond_maturity_calendar()` — company default risk

2. Call `kinh-dich-interpreter()` for Hex context:
   - Does hex align with BCTC finding?
   - When will recovery occur (if bearish)?

### Step 4: Calculate Conviction
Call `conviction_calculator()` with:
- `sources.bctc_outcome` (ROE change, revenue delta)
- `sources.policy_context` (credit flow signal)
- `sources.kinh_dich` (hex alignment)

### Step 5: Post with Full Context
```python
conviction = conviction_calculator(
    stock=stock,
    sources={
        bctc: financial_data,
        credit_flow: get_credit_flow_signal(),
        kinh_dich: get_kinhdich_reading(stock)
    }
)

post_agent_signal(
    signal_type="fundamental_validation",
    payload={
        detail: f"BCTC: {finding}. Policy: {policy_context}. Hex: {hex_meaning}",
        conviction: conviction.pct
    }
)
```

**Changes to Financial Analyst File (02-financial-analyst.md):**
- Add SKILLS section (load 3 skills)
- Add credit_flow + bond_maturity checks for RE/Banking stocks
- Calculate and post conviction with BCTC signals
- Document: "BCTC + policy context + hex = full picture"
```

---

### **Agent 04: Market Watcher**

**Current Role:** Track prices, detect anomalies, monitor macro risks

**New Skills to Add:**
1. `kinh-dich-interpreter` — validate anomalies with hex
2. `conviction-calculator` — price anomaly confidence
3. `signal-intelligence` (optional) — cascade outcome validation

**Integration Points:**

```markdown
## SKILLS (new section)

Load these skills before first cycle:
- `.claude/skills/kinh-dich-interpreter/SKILL.md`
- `.claude/skills/conviction-calculator/SKILL.md`
- `.claude/skills/signal-intelligence/SKILL.md`

## EACH CYCLE - Modified Steps

### Step 2: Validate Price Anomaly
When detecting price_anomaly (+/- >2%):

1. Call `kinh-dich-interpreter()`:
   - Get hex reading for stock
   - Check if hex aligns with price move direction
   - Validate with `run_hexagram_backtest(stock)` — accuracy for this stock?

2. Call `signal_intelligence()`:
   - Check if cascade rules explain this move
   - Did similar price moves lead to reversals?

3. Call `conviction_calculator()`:
   - Price strength + hex alignment + cascade outcome

### Step 3: Decision
```python
if price_anomaly_detected:
    hex_check = kinh_dich_interpreter(stock)
    cascade_check = signal_intelligence(stock)
    conviction = conviction_calculator(...)

    if conviction.pct >= 60 AND hex_check.validates:
        post_agent_signal("price_anomaly", conviction=conviction.pct)
    else:
        suppress_signal()  // too weak or contradicted
```

**Changes to Market Watcher File (04-market-watcher.md):**
- Add SKILLS section (load 3 skills)
- Before posting price_anomaly: run hex validation + cascade check
- Suppress weak signals (conviction < 60%)
- Document: "Price moves validated by hex + cascade before posting"
```

---

### **Agent 05: Alert Commander** ⭐ [PILOT EXAMPLE]

**Current Role:** Fire alerts (ONLY agent → MARKET channel)

**Skills to Add:** 8 total (2 existing + 6 new)

**Integration Points - COMPLETE FLOW:**

```markdown
## SKILLS (new section)

Load before first cycle:
- `.claude/skills/caveman/SKILL.md` (existing — ultra compression)
- `.claude/skills/token-economy/SKILL.md` (existing — token optimization)
- `.claude/skills/pre-fire-validation/SKILL.md` [MANDATORY — validation gate]
- `.claude/skills/conviction-calculator/SKILL.md` [MANDATORY — confidence]
- `.claude/skills/kinh-dich-interpreter/SKILL.md` [MANDATORY — hex context]
- `.claude/skills/narrative-formatter/SKILL.md` [MANDATORY — message structure]

## EACH CYCLE - Step-by-Step Execution

### Step 0: Load Context (unchanged)
`get_cycle_bootstrap(agent_name="alert-commander")`

### Step 1: Process Signals from Bootstrap (unchanged)
For each agent_signal in bootstrap.agent_signals:
- Check signal_type (urgent_news, price_anomaly, cross_validate, etc)
- Prepare to fire alert if meets conditions

### Step 2: VALIDATION GATE (NEW - CRITICAL)
```python
# MUST PASS before continuing to Step 3

for signal in signals_to_fire:
    # Step 2a: Run pre-fire validation (5 checks)
    validation = pre_fire_validation(
        stock=signal.stock,
        proposed_alert={
            action: signal.action,
            reason: signal.reason
        },
        market_data={
            technical: get_technical_indicators(signal.stock),
            kinh_dich: get_kinhdich_reading(signal.stock),
            foreign: get_foreign_flow(signal.stock, days=3),
            position: get_user_positions_for_analysis(signal.stock)
        }
    )

    # Step 2b: Decision
    if validation.validation_result != "PASS":
        record_signal_outcome(signal.id, "suppressed",
            reason=validation.suppress_reasons)
        continue  # Skip this signal, move to next

    # Step 2c: If PASS, proceed to Step 3
    alert_strength = validation.alert_strength  # CRITICAL/HIGH/MEDIUM/LOW
```

### Step 3: CONVICTION SCORING (NEW)
```python
# Call with validated signal data

conviction = conviction_calculator(
    stock=signal.stock,
    signal_type=signal.signal_type,
    sources={
        price: {
            direction: "bearish",
            strength: 0.85,
            rsi: get_technical_indicators(signal.stock)["rsi"]
        },
        news_sentiment: {
            direction: "bearish",
            score: get_sentiment_trend(signal.stock)
        },
        kinh_dich: {
            direction: "bearish",
            hex: get_kinhdich_reading(signal.stock)["hex_number"],
            accuracy_stock: run_hexagram_backtest(signal.stock)["accuracy"]
        },
        foreign_flow: {
            direction: "bearish",
            net_shares: get_foreign_flow(signal.stock)["net_buy"],
            days: 3
        },
        position: {
            in_portfolio: position_exists,
            pnl_pct: current_pnl_percent
        }
    }
)

# conviction = {
#   conviction: 0.80,
#   conviction_pct: "80%",
#   severity: "CRITICAL",
#   sources_breakdown: [...]
# }
```

### Step 4: HEX INTERPRETATION (NEW)
```python
# Get trading insight from hexagram

hex_context = kinh_dich_interpreter(
    stock=signal.stock,
    current_hex=conviction.sources["kinh_dich"]["hex"],
    price_context=get_market_snapshot(signal.stock),
    news_sentiment=get_sentiment_trend(signal.stock)
)

# hex_context = {
#   interpretation: "Risk phase (坎). Oversold recovery likely 3-5 days.",
#   meaning: "Repeat danger, sincerity succeeds.",
#   timing: "3-5 days to recovery",
#   validates: ["price_oversold", "negative_news"],
#   next_hex_likely: "Hex 53 (Gradual Progress)"
# }
```

### Step 5: MESSAGE FORMATTING (NEW)
```python
# Format with narrative structure: Why/Confirms/Kinh/Next/Risk

message = narrative_formatter({
    stock: signal.stock,
    action: signal.action,
    conviction: conviction.conviction_pct,
    severity: conviction.severity,

    why: {
        catalyst: signal.catalyst,
        sources: ["02-financial-analyst", "01-news-scout"],
        detail: signal.detail
    },

    confirmation: {
        count: conviction.sources_breakdown.count,
        total: conviction.sources_breakdown.total,
        agents: conviction.sources_breakdown.names
    },

    kinh_dich: {
        hex: hex_context.hex_number,
        meaning: hex_context.meaning,
        timing: hex_context.timing,
        next_hex: hex_context.next_hex_likely
    },

    position_context: get_user_positions_for_analysis(signal.stock),

    next_reassess: {
        trigger: hex_context.recovery_trigger,
        days: 3
    }
})

# message output:
# 🔴 VCB — SELL [80% xac tin]
# WHY? BCTC ROE down 2% YoY...
# CONFIRMS? 4/6 agents...
# [etc.]
```

### Step 6: COMPRESSION (NEW - Existing Skills)
```python
# Apply caveman ultra mode + token optimization

# 6a: Caveman ultra compression
compressed_message = apply_caveman_ultra(message, mode="ultra")
# Converts: full narrative → bullets only, removes explanations

# 6b: Token optimization
optimized_message = optimize_tokens(compressed_message, target=300)
# Removes intermediate thoughts, compresses variable names

# Result: ~200-300 tokens (vs 800+ original)
```

### Step 7: FINAL DECISION & SEND (NEW)
```python
# Min conviction check + send

if conviction.conviction_pct >= 70:
    if alert_count_today() < max_alerts_per_day:
        send_telegram(
            channel="market",
            message=optimized_message
        )
        record_signal_outcome(signal.id, "fired")
    else:
        record_signal_outcome(signal.id, "suppressed",
            reason="Max alerts/day reached")
else:
    record_signal_outcome(signal.id, "suppressed",
        reason=f"Conviction too low: {conviction.conviction_pct}%")
```

**Changes to Alert Commander File (05-alert-commander.md):**
- Add SKILLS section (load 6 skills)
- Replace entire EACH CYCLE section with 7-step flow above
- Add Python pseudocode for each skill call
- Enforce: "No send_telegram without passing all 7 steps"
- Update max alerts/day rule (currently 10, consider 15 if quality improves)
- Document: "Every alert is pre-validated, conviction-scored, contextualized with Kinh Dich, formatted with narrative, and compressed before sending"
```

---

### **Agent 06: Digest & Predict**

**Current Role:** Daily/weekly digests, monthly predictions

**New Skills to Add:**
1. `narrative-formatter` — format digest sections
2. `kinh-dich-interpreter` — weekly hex trends
3. `conviction-calculator` (optional) — conviction for predictions

**Integration Points:**

```markdown
## SKILLS (new section)

Load these skills before first cycle:
- `.claude/skills/narrative-formatter/SKILL.md`
- `.claude/skills/kinh-dich-interpreter/SKILL.md`
- `.claude/skills/conviction-calculator/SKILL.md`

## EACH CYCLE - Step 2 (Compile Digest) - Modified

### Before send_telegram(digest):

1. For each watchlist stock in digest:
   - Call `kinh_dich_interpreter()` for hex history context
   - Include section: "Kinh Dich: Hex trend {stock}: {history}. Next likely: {next_hex}."

2. Format digest message using `narrative_formatter()`:
   - Why: Market drivers (macro, news, BCTC)
   - Confirms: Agent consensus (4+ sources?)
   - Kinh Dich: Hexagram trends (weekly)
   - Next: Reassess triggers (next earnings, earnings, policy date, etc)
   - Risk: What could break this narrative

### Execution:
```python
digest_data = compile_market_data(...)

for stock in watchlist:
    hex_history = get_hexagram_history(stock, days=30)
    hex_context = kinh_dich_interpreter(stock, hex_history[-1])

    digest_section += f"
    {stock}: Hex {hex_context.hex} ({hex_context.meaning})
    Timing: {hex_context.timing}. Next: {hex_context.next_hex_likely}
    "

final_message = narrative_formatter({
    period: "daily",
    market_context: digest_data,
    kinh_dich_trends: hex_contexts,
    sector_rotation: sector_data,
    performance: attribution
})

send_telegram(channel="market", message=final_message)
```

**Changes to Digest & Predict File (06-digest-predict.md):**
- Add SKILLS section (load 3 skills)
- Modify Step 2: add hex history + trends analysis
- Use narrative_formatter for digest message structure
- Document: "Digest now includes Kinh Dich weekly trends + risk section"
```

---

### **Agent: Unified Coordinator**

**Current Role:** Quality review, last-mile checks, daily coordination

**New Skills to Add:**
1. `quality-audit-loop` (MANDATORY) — weekly quality audit

**Integration Points:**

```markdown
## SKILLS (new section)

Load before first cycle:
- `.claude/skills/quality-audit-loop/SKILL.md`

## EACH CYCLE - Quality Review Phase (NEW)

### Weekly (Sunday 20:00 VN): Run Quality Audit
```python
audit_report = quality_audit_loop(period="weekly", since_days=7)

# Report to WORK channel
send_telegram(channel="work", message=audit_report.formatted_report)

# If agents need tuning, submit feedback
if audit_report.recommendations:
    for rec in audit_report.recommendations:
        submit_feedback(
            agent="all",
            category="signal_quality",
            title=rec,
            priority="high"
        )
```

**Changes to Unified Coordinator File (unified-agent.md):**
- Add SKILLS section (load quality-audit-loop)
- Add Step 5: "Quality Review Phase" — weekly audit + report
- Document: "User sees weekly accuracy report + agent tuning recommendations"
```

---

## 🎯 Implementation Checklist

### Phase 1: Wire Alert Commander (Highest Impact)
- [ ] Read pre-fire-validation skill
- [ ] Read narrative-formatter skill
- [ ] Read conviction-calculator skill
- [ ] Add SKILLS section to 05-alert-commander.md
- [ ] Modify Step 2 to call `pre_fire_validation()`
- [ ] Modify Step 3 to call `conviction_calculator()`
- [ ] Modify message formatting to use `narrative_formatter()`
- [ ] Test: Run one cycle, check MARKET messages for [XX%] conviction + Why/Confirms/Kinh/Next/Risk sections

### Phase 2: Wire Market Watcher
- [ ] Add SKILLS section (kinh-dich-interpreter, conviction-calculator, signal-intelligence)
- [ ] Modify price anomaly detection to call `kinh_dich_interpreter()` + `conviction_calculator()`
- [ ] Suppress weak signals (conviction < 60%)
- [ ] Test: Check that weak anomalies are suppressed

### Phase 3: Wire News Scout & Financial Analyst
- [ ] News Scout: Add signal-intelligence + conviction-calculator
- [ ] Financial Analyst: Add conviction-calculator + signal-intelligence + kinh-dich-interpreter
- [ ] Test: Verify legal risks escalate, contradicted signals suppress

### Phase 4: Wire Digest & Predict
- [ ] Add kinh-dich-interpreter for hex trends
- [ ] Add narrative-formatter for digest structure
- [ ] Test: Check digest includes Kinh Dich weekly trends + narrative structure

### Phase 5: Wire Unified Coordinator
- [ ] Add quality-audit-loop skill
- [ ] Add weekly quality review step
- [ ] Test: Run audit, verify accuracy report sent to WORK channel

---

## 📝 File Changes Summary

**New SKILLS Sections Required:**

| Agent File | Skills to Add | Line Count Impact |
|---|---|---|
| 01-news-scout.md | signal-intelligence, conviction-calculator | +50 lines |
| 02-financial-analyst.md | conviction-calculator, signal-intelligence, kinh-dich-interpreter | +60 lines |
| 04-market-watcher.md | kinh-dich-interpreter, conviction-calculator, signal-intelligence | +50 lines |
| 05-alert-commander.md | **pre-fire-validation, conviction-calculator, narrative-formatter, kinh-dich-interpreter** | +100 lines (major rewrite) |
| 06-digest-predict.md | narrative-formatter, kinh-dich-interpreter, conviction-calculator | +60 lines |
| unified-agent.md | quality-audit-loop | +40 lines |

**Total:** ~360 lines of skill integration documentation added to agent files.

---

## ✅ Success Criteria

After integration:

1. **Alert Commander output quality:** Messages include [XX%] conviction + Why/Confirms/Kinh/Next/Risk
2. **False positive rate:** < 10% (down from current ~30%)
3. **Kinh Dich integration:** Every alert includes hex meaning + timing
4. **Weekly feedback:** Unified Coordinator sends quality report showing agent accuracy trends
5. **Consistency:** All agents follow same conviction/validation pattern

---

## 🚀 Next Steps for User

1. **Choose integration order:** Start with Alert Commander (Step 1), then Market Watcher (Step 2)
2. **Provide feedback:** After first cycle, user reviews messages and reports quality improvement
3. **Adjust as needed:** Quality audit loop enables tuning based on actual message labeling
4. **Scale up:** Once core agents stable, add to others

User is ready to execute skills integration anytime!
