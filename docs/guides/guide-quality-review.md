> Parent: [guide-quality.md](./guide-quality.md)

# Cycle Self-Review & Flow Integration

---

## Layer 5: Cycle Self-Review (Quality Gate Before Notebook Write)

**Problem:** Agent writes notebook and exits without checking if this cycle's outputs were coherent. Over time, quality drifts — the agent keeps running but outputs degrade.

**Pattern: add a self-review step between lesson extraction and notebook write.**

```
**N-2.5. Cycle self-review** (between lesson extraction and notebook write)

Review this cycle's outputs against 5 quality checks:

| Check | Question | If FAIL |
|-------|----------|---------|
| **Coherence** | Do my signals contradict each other? | Suppress contradictory signal, log |
| **Grounding** | Does every claim trace to a tool result? | Remove ungrounded claims |
| **Completeness** | Did I process all items in my scope? | Tag PARTIAL if not |
| **Calibration** | Are my confidence scores consistent? (high conf items should have more sources) | Adjust confidence |
| **Drift check** | Is my behavior this cycle consistent with my last 3 cycles? | Log: "DRIFT: <what changed>" |

IF >=2 checks fail -> add to notebook carry-over: "Quality degraded cycle HH:MM — review next cycle"
IF coherence OR grounding fails -> suppress affected outputs, don't send
```

### Drift Detection Examples

```
NORMAL: Fired 2-4 signals/cycle for last 10 cycles. This cycle: 3. -> OK
DRIFT:  Fired 2-4 signals/cycle for last 10 cycles. This cycle: 15. -> LOG DRIFT
        Possible cause: threshold too loose, data anomaly, or regime shift

NORMAL: Confidence avg 0.65-0.75 for last 10 cycles. This cycle: 0.70. -> OK
DRIFT:  Confidence avg 0.65-0.75 for last 10 cycles. This cycle: 0.35. -> LOG DRIFT
        Possible cause: data source degraded, or genuinely uncertain market
```

---

## Integration in Flows

### Cowork Flow — Where Each Pattern Applies

```
Step 0-0e: (unchanged — bootstrap, notebook, regime)

Step 1-N: Main work steps
  -> ADD per-item: grounding check (Layer 1) + try-continue (Layer 0)

Step N-4: Pre-send validation (Layer 2) — before every signal/report
Step N-3: Lesson extraction (existing) + decision trace (Layer 4)
Step N-2.5: Cycle self-review (Layer 5) — NEW
Step N-2: Session log with decision trace format (Layer 4)
Step N-1: WORK channel
Step N: BUG on error
Notebook write + doc self-heal + registry check
```

### Dev Team Flow — Where Each Pattern Applies

```
Pre-code checklist: (unchanged)
  -> ADD: grounding check — read existing code before changing (Layer 1)

TDD workflow: RED -> GREEN -> REFACTOR
  -> ADD: after GREEN — self-review: "does my implementation match the spec?" (Layer 5)

After code:
  -> ADD: confidence in handoff — "confidence: high|medium|low" with basis (Layer 3)

RETURN block:
  -> ADD: quality_status: "full|partial|degraded" (Layer 0)
```
