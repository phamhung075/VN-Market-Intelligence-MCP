**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 18. Autonomous Quality Patterns

How agents maintain output quality without human supervision. Based on Anthropic's research on reliable autonomous agents: self-validation, grounding, confidence calibration, graceful degradation, decision tracing, and self-review.

---

## 6-Layer Quality Stack

The quality framework with each layer catching a different class of failure:

| Layer | Name | Catches | Read from |
|-------|------|---------|-----------|
| 0 | Graceful Degradation | Total cycle loss (partial > nothing) | → see [guide-quality-layers.md](./guide-quality-layers.md) |
| 1 | Grounding | Hallucinated facts (every claim traced) | → see [guide-quality-validation.md](./guide-quality-validation.md) |
| 2 | Output Validation | Malformed output (schema + sanity) | → see [guide-quality-validation.md](./guide-quality-validation.md) |
| 3 | Confidence | Unqualified priority (downstream knows certainty) | → see [guide-quality-confidence.md](./guide-quality-confidence.md) |
| 4 | Decision Trace | Irreproducible decisions (why this choice?) | → see [guide-quality-confidence.md](./guide-quality-confidence.md) |
| 5 | Self-Review | Quality drift (catch degradation early) | → see [guide-quality-review.md](./guide-quality-review.md) |

---

## Section Index

→ see [guide-quality-layers.md](./guide-quality-layers.md) — Graceful Degradation (Layer 0) + error handling levels

→ see [guide-quality-validation.md](./guide-quality-validation.md) — Grounding rule (Layer 1) + output validation (Layer 2)

→ see [guide-quality-confidence.md](./guide-quality-confidence.md) — Confidence scoring (Layer 3) + decision trace (Layer 4)

→ see [guide-quality-review.md](./guide-quality-review.md) — Cycle self-review (Layer 5) + flow integration patterns
