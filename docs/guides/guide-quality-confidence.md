> Parent: [guide-quality.md](./guide-quality.md)

# Confidence & Decision Trace

---

## Layer 3: Confidence Scoring

**Problem:** Agent fires a signal with impact_score=8 but has no way to express "I'm 60% sure about this." Downstream agents (alert-commander) treat all signals equally.

**Pattern: add confidence + reasoning to every signal.**

```yaml
finding_data:
  # ... existing fields ...
  confidence: 0.75          # 0.0-1.0, required on every signal
  confidence_basis:          # WHY this confidence level
    - "2 independent sources confirm (cafef + vnexpress)"
    - "historical context: similar event in 2024 had same outcome"
  confidence_penalty:        # what REDUCED confidence
    - "single source only"
    - "no price confirmation yet"
```

**Confidence calibration table:**

| Confidence | Meaning | Basis required |
|-----------|---------|---------------|
| **0.9-1.0** | Near-certain | >=3 independent sources + price confirmation |
| **0.7-0.8** | High | 2 sources + historical precedent |
| **0.5-0.6** | Moderate | 1 reliable source + logical chain |
| **0.3-0.4** | Low | 1 source, no confirmation |
| **0.1-0.2** | Speculative | Inference only, no direct source |

**Rule: signals with confidence < 0.3 are logged but NOT sent.** They go in session log as "suppressed — low confidence."

---

## Layer 4: Decision Trace (Log WHY, Not Just WHAT)

**Problem:** Session logs say "Fired 3 signals" but not "WHY I decided to fire signal X instead of suppressing it." When a wrong decision is discovered later, nobody can debug it.

**Pattern: log the reasoning chain, not just the outcome.**

**Enhanced session log format:**

```markdown
### Cycle (HH:MM-HH:MM)
- Processed: 26 stocks | Signals fired: 3 | Suppressed: 5 | Degraded: 1
- Regime: TIGHTENING | Confidence: high (3 sources)

#### Decisions
- FIRED price_anomaly VNM: price -3.2% (> 2sigma threshold), volume 2.5x avg
  -> confidence: 0.82 (price + volume confirm)
  -> grounding: get_daily_ohlcv returned close=78500 vs prev=81100
- SUPPRESSED price_anomaly MWG: price -1.8% (< 2sigma), volume normal
  -> reason: below threshold, no confirming signal
- DEGRADED: skipped HPG — get_daily_ohlcv timeout after retry
  -> impact: low (1/26 stocks, non-critical)

#### Lessons
- LESSON: ...
```

**The key addition:** Each fired/suppressed decision includes:
1. **What triggered it** (the data)
2. **Why the decision** (threshold comparison, confidence)
3. **Grounding** (which tool call produced the data)
