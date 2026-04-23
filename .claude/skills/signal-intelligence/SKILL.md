---
name: signal-intelligence
description: External intelligence validation — policy, broker, cascade outcomes
type: reusable-skill
usage: News Scout (01), Financial Analyst (02), Market Watcher (04)
---

# Signal Intelligence Skill

**Purpose:** Validate signals against government policy, broker credibility, and historical outcomes.

## Input

```
{
  stock: "VCB",
  signal_type: "fundamental",  // or "price", "news", etc
  sources_claimed: [
    { source: "broker_abc", claim: "VCB buy target 85k", impact: "bullish" },
    { source: "news", claim: "Bank ROE down 2% YoY", impact: "bearish" },
    { source: "government", claim: "New lending rules effective Q2", impact: "impact_unknown" }
  ]
}
```

## Process

### Check 1: Broker Credibility Validation
```
For each broker claim:
  Call: get_broker_credibility(broker_name)
  Returns: { sanctioned: boolean, credibility_multiplier: 0.0-1.0 }

Example:
- Broker ABC: sanctioned=false, multiplier=1.0 → trust 100%
- Broker XYZ: sanctioned=true, multiplier=0.4 → discount 60%

Result:
✓ Broker ABC = credible (apply claim as-is)
⚠️ Broker XYZ = sanctioned (discount claim to 40% confidence)
→ Broker check feeds into conviction_calculator
```

### Check 2: Policy Signal Validation
```
Call: get_policy_signals(days=7)
Returns: recent government decrees + sector impact

For each policy:
- Does policy SUPPORT the claim? (e.g., "lending rules → bank ROE pressure")
- Does policy CONTRADICT the claim?
- Does policy create NEW risk? (binary outcome, unknown direction)

Example:
News: "Bank ROE down due to tightened lending"
Policy: "New lending rules effective Q2 2026"
→ VALIDATES (policy explains fundamental weakness)

Broker: "Buy bank stocks now"
Policy: "Rate hike imminent (expectation)"
→ CONTRADICTS (rate hike = margin pressure on banks)
→ Suppress bullish signal
```

### Check 3: Cascade Outcome Validation
```
Call: get_cascade_outcomes(days=30)
Returns: which sector rules fired + actual 3d/7d price outcomes

For similar past signals:
- If "BCTC ROE down" led to price drop 3/5 times → signal valid
- If "bank stock bearish" led to recovery 70% of time → opposite signal stronger

Example:
Current: "ROE down → bearish bank"
Past 30d: "5 banks with ROE down: 3 dropped, 2 recovered within 3d"
→ Success rate 60% (uncertain but leaning bearish)

This adjusts conviction: -10% to -20% (since outcomes split)
```

### Check 4: Legal Risk Detection
```
Call: get_legal_risk_signals(days=7)
Returns: prosecutions, asset seizures, tax audits, regulatory fines

For stock-specific risks:
- If prosecution → CRITICAL (binary bad outcome)
- If tax audit → MEDIUM (binary, but company might win)
- If regulation → LOW (adjustable, not necessarily bad)

Example:
Stock VCB: Tax audit started (from news)
Legal signals: Confirm investigation (2 sources)
→ Legal risk HIGH, override other signals
→ Alert: SELL [CRITICAL] (legal risk overrides fundamental analysis)
```

### Check 5: Crisis Velocity Detection
```
Call: get_crisis_early_warning()
Returns: mention velocity (current vs baseline), reputation score

For crisis signals:
- If velocity > 2x baseline → crisis emerging (urgency HIGH)
- If reputation score < 50 → severe reputation damage

Example:
Stock ABC: mention velocity 3.5x (normally 1x, now 3.5x)
→ Crisis emerging, no matter what BCTC says
→ Alert: "Crisis momentum detected, recommend review" [MEDIUM URGENT]
```

## Output

```
{
  validation_result: "SUPPORTED",  // or CONTRADICTED, UNCERTAIN, CRITICAL_RISK

  checks: {
    broker_credibility: {
      result: "SUPPORTED",
      detail: "Broker ABC credible (not sanctioned), claim valid",
      confidence_adjustment: 1.0  // multiply original conviction by this
    },
    policy_validation: {
      result: "SUPPORTED",
      detail: "Lending rules confirm bank ROE pressure expected",
      confidence_adjustment: 1.1  // boost confidence
    },
    cascade_outcomes: {
      result: "UNCERTAIN",
      detail: "Similar signals: 3 correct, 2 wrong (60% success rate)",
      confidence_adjustment: 0.7  // discount confidence
    },
    legal_risk: {
      result: "CRITICAL",
      detail: "Tax audit + prosecution risk. Override other signals.",
      confidence_adjustment: 1.5  // escalate to CRITICAL
    },
    crisis_velocity: {
      result: "NORMAL",
      detail: "Mention velocity 1.0x (baseline), reputation 75 (normal)",
      confidence_adjustment: 1.0
    }
  },

  overall_result: "SUPPORTED with CAUTION",
  final_conviction_multiplier: 1.1 × 0.7 × 1.5 = 1.15,  // compound adjustments

  recommendation: "Signal valid but monitor legal risk closely. ROE pressure confirmed by policy.",
  escalation_triggers: [
    "If legal audit outcome released → re-evaluate immediately",
    "If policy delayed past Q2 → re-assess ROE assumptions"
  ]
}
```

## Usage In Agent

### **News Scout** (Before posting urgent_news)
```python
signal = { stock: "VCB", news: "Tax audit started", impact: "bearish" }

intelligence = signal_intelligence(signal)

if intelligence.validation_result == "CRITICAL":
    post_agent_signal("legal_risk", stock="VCB", detail=intelligence.recommendation)
elif intelligence.validation_result == "SUPPORTED":
    post_agent_signal("urgent_news", stock="VCB", severity="HIGH")
else:
    suppress_signal()  // contradicted or uncertain
```

### **Financial Analyst** (Before posting fundamental_validation)
```python
bctc_finding = { stock: "VCB", metric: "ROE down 2%", direction: "bearish" }

intelligence = signal_intelligence(bctc_finding)

if intelligence.overall_result != "CONTRADICTED":
    conviction = original_conviction × intelligence.final_conviction_multiplier
    post_agent_signal("fundamental_validation",
        conviction=conviction,
        validates=intelligence.checks
    )
```

### **Market Watcher** (Before posting price_anomaly)
```python
price_signal = { stock: "HPG", move: "+3%", reason: "Contract win?" }

intelligence = signal_intelligence(price_signal)

if intelligence.checks.policy_validation.result == "SUPPORTED":
    post_agent_signal("price_anomaly", validates="policy_context")
elif intelligence.checks.crisis_velocity.result == "CRITICAL":
    suppress_signal()  // crisis != normal price move
```

## Rules

1. **Legal risk overrides all** — If legal_risk = CRITICAL, alert at top priority
2. **Broker credibility varies** — Apply multiplier based on sanction status
3. **Policy changes context** — "ROE down" ≠ bearish if policy made it inevitable
4. **Cascade outcomes ground expectations** — Historical success rate discounts confidence
5. **Crisis velocity trumps fundamentals** — If reputation damaged, sell pressure likely regardless

## Intelligence Validation Checklist

- [ ] Broker claims vetted for credibility (sanctioned = discount)
- [ ] Policy decrees checked for alignment with signal
- [ ] Historical cascade outcomes reviewed (success rate known)
- [ ] Legal risks escalated (not buried in narrative)
- [ ] Crisis velocity checked (reputation damage detected)

---

**Integration:**
- Add to: 01-news-scout.md (before urgent_news), 02-financial-analyst.md (before fundamental_validation), 04-market-watcher.md (optional, price context)
- Replaces: Ad-hoc external validation
- Saves tokens: ~200 per cycle (reusable validation logic)
- Impact: Catches false signals from sanctioned brokers, policy-driven moves, and reputational crises
