---
name: record_signal_outcome
type: tool
package: alert-control, digest-synthesis, unified-coordination
related_tools: get_agent_signals, post_agent_signal
complexity: simple
---

# record_signal_outcome

Record the processing outcome for an agent signal. Use this after a signal has been acted upon to feed the effectiveness tracker and calibration loop.

## Arguments

- **signal_id** (string) — **required**
  - ID of the signal being processed (from `get_agent_signals` return)

- **outcome** (enum) — **required**
  - How the signal was handled. Options:
    - `alert_sent` — Signal triggered a market alert
    - `alert_suppressed` — Signal evaluated but didn't meet threshold
    - `cascaded` — Signal passed to downstream agent
    - `noted` — Signal logged but no action taken
    - `error` — Signal processing failed

- **conviction** (number) — optional, range: 0-1
  - Final conviction level of the decision. Used for calibration tracking.

- **reasoning** (string) — optional, max 500 chars
  - Why this outcome was chosen. Example: "VIC price change 2.1% < 3% threshold"

## Return Type

```typescript
{
  success: boolean,
  signal_id: string,
  outcome_recorded: boolean,
  calibration_impact: number,  // How much this outcome shifts conviction model
  timestamp: string
}
```

## Example Usage

### Alert Commander — Recording Signal Outcome
```typescript
// After evaluating a signal and deciding not to alert
const outcome = await call_tool("vn-market", "record_signal_outcome", {
  signal_id: "sig_2026050412345",
  outcome: "alert_suppressed",
  conviction: 0.62,  // Below 70% threshold
  reasoning: "VND sentiment bullish, but price confirmation missing. Waiting for next cycle."
});

console.log(`Signal recorded. Calibration impact: ${outcome.calibration_impact}`);
```

### News Scout → Financial Analyst → Alert Commander Chain
```typescript
// News Scout posts signal
const signal = await call_tool("vn-market", "post_agent_signal", {
  agent: "financial-analyst",
  signal_type: "urgent_news",
  confidence: 0.82,
  data: { headline: "Central Bank rate cut", impact_score: 8.5 }
});

// Financial Analyst receives signal, evaluates, and cascades to Alert Commander
const faSignals = await call_tool("vn-market", "get_agent_signals", {
  agent: "financial-analyst"
});

const newsSignal = faSignals.signals[0];
const cascaded = await call_tool("vn-market", "post_agent_signal", {
  agent: "alert-commander",
  signal_type: "verified_chain",  // Upgraded: news → financial validation
  confidence: 0.78,
  data: { ...newsSignal.data, validation: "BCTC exporters bullish" }
});

// Record Financial Analyst's work
await call_tool("vn-market", "record_signal_outcome", {
  signal_id: newsSignal.id,
  outcome: "cascaded",
  conviction: 0.78,
  reasoning: "News signal + BCTC validation → confidence 78% → cascade to alert-commander"
});
```

### Digest & Predict — Recording Synthesis Outcome
```typescript
// Gather all signals, synthesize, then record outcome for each
const allSignals = await call_tool("vn-market", "get_agent_signals", {
  agent: "digest-predict"
});

for (const sig of allSignals.signals) {
  const included = await shouldIncludeInDigest(sig);

  await call_tool("vn-market", "record_signal_outcome", {
    signal_id: sig.id,
    outcome: included ? "noted" : "alert_suppressed",
    conviction: included ? 0.9 : 0.3,
    reasoning: included
      ? `Included in daily digest (impact: ${sig.data.impact_score})`
      : "Low novelty — similar signals already covered"
  });
}
```

### QA Monitoring — Cascade Path Tracking
```typescript
// Unified Agent tracks signal cascade quality
const qaMetrics = {
  total_cascades: 0,
  cascade_quality: 0,
  suppression_rate: 0
};

const signals = await call_tool("vn-market", "get_agent_signals", {
  agent: "unified-agent"
});

for (const sig of signals.signals) {
  if (sig.from_agent === "news-scout") {
    // Track: news → financial → alert cascade
    const assessment = await assessCascadeQuality(sig);

    await call_tool("vn-market", "record_signal_outcome", {
      signal_id: sig.id,
      outcome: assessment.quality > 0.75 ? "cascaded" : "alert_suppressed",
      conviction: assessment.quality,
      reasoning: `QA check: ${assessment.reasons.join(", ")}`
    });

    qaMetrics.total_cascades += 1;
    qaMetrics.cascade_quality += assessment.quality;
  }
}

console.log(`QA metrics: ${qaMetrics.total_cascades} cascades, avg quality: ${(qaMetrics.cascade_quality / qaMetrics.total_cascades).toFixed(2)}`);
```

## When to Use

- **Immediately after signal evaluation** — Every signal should have an outcome recorded (alert_sent, suppressed, cascaded, etc.)
- **For calibration** — Conviction and reasoning feed the alert quality model
- **For audit trails** — QA and Unified Agent use outcomes to track cascade health
- **NOT optional** — Outcome recording is mandatory for signal bus integrity
- **At end of signal processing** — After you've made a decision about the signal

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_agent_signals` | Retrieve signals (you record outcomes for them) |
| `post_agent_signal` | Produce new signals (received agents record their outcomes) |
| `log_agent_work` | Log the overall cycle; record_signal_outcome logs individual signals |
| `get_prediction_accuracy` | View calibration metrics (outcomes feed this) |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `signal_id not found` | Signal already processed or doesn't exist | Log to WORK, skip if stale |
| `outcome: "error"` | Processing failed | Record with `reasoning`, monitor for systemic issues |
| `conviction > 1 or < 0` | Invalid range | Clamp to [0, 1] or fail-loud alert |

## Notes

- **Mandatory per signal** — Every signal from `get_agent_signals` should get one `record_signal_outcome` call
- **Calibration feedback:** Outcomes aggregate to train alert conviction thresholds. False suppression lowers thresholds; false alerts raise them.
- **Cascade tracking:** Use `outcome: "cascaded"` when passing signal downstream. Enables impact chain analysis.
- **Not idempotent:** Calling `record_signal_outcome` twice with different outcomes will update the record (last write wins).
- **Batching:** No limit on number of outcome records per cycle, but typically 1:1 with signals.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 3 workflow examples, calibration tracking, cascade monitoring)
