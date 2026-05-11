**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 18. Autonomous Quality Patterns

How agents maintain output quality without human supervision. Based on Anthropic's research on reliable autonomous agents: self-validation, grounding, confidence calibration, graceful degradation, decision tracing, and self-review.

### 18.1 Output Self-Validation (Pre-Send Check)

**Problem:** Agent produces a signal/report and sends it immediately. If the output is wrong, it propagates to downstream agents before anyone notices.

**Pattern: validate before send.**

Every agent adds a pre-send check before posting signals or reports:

```
BEFORE sending signal/report:
  1. Schema check: does my output match the expected schema?
     - Signal: has required fields (from_agent, signal_type, finding_data)?
     - Report: has required sections (Found, For, Next)?
  2. Sanity check: does the content make sense?
     - Price anomaly: is the % change realistic (not 9999%)?
     - Sentiment score: is it in [-1.0, +1.0] range?
     - Ticker: does it exist in watchlist?
  3. Duplicate check: did I already send this exact signal this cycle?
     - Check session log for matching signal_type + stock_code in last 2h
  IF any check fails -> log warning in session, DO NOT send, continue cycle
```

**In flow files, add before every `post_agent_signal` or `send_telegram`:**
```
PRE-SEND VALIDATION:
  - [ ] Schema valid
  - [ ] Values in expected ranges
  - [ ] Not a duplicate of recent output
```

### 18.2 Grounding Rule (No Hallucination Between Tool Calls)

**Problem:** Between tool calls, the agent may fill gaps with assumptions that look like facts. This is the #1 cause of wrong analysis in autonomous agents.

**The rule:**

```
GROUNDING RULE (applies to ALL agents, ALL steps):

Every factual claim in an output MUST trace to one of:
  1. A tool call result from THIS cycle (not remembered from training)
  2. A notebook lesson with a linked source (-> detail: <path>)
  3. An explicit value from bootstrap context
  4. A value from a knowledge file loaded this cycle

If you cannot trace a fact -> DO NOT include it.
Use "no data" or "insufficient data" instead of guessing.
```

**Common violations:**
```
WRONG: "VNM dang giao dich o P/E 15x" <- where did 15x come from? No tool call returned it
RIGHT: "VNM P/E: no data this cycle (fundamental_validation not received)"

WRONG: "Gia dau tang 5% tuan nay" <- did a tool return this exact number?
RIGHT: "Brent crude: $87.3 (from bootstrap macro_snapshot)" <- traced to source
```

**Implementation in flow files:**

Add to every analysis step:
```
GROUNDING CHECK: every number, %, price, or date in my output must trace to:
  [ ] tool result  [ ] bootstrap  [ ] notebook lesson  [ ] knowledge file
  If untraceable -> replace with "no data" or remove claim
```

### 18.3 Confidence Scoring

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

### 18.4 Graceful Degradation (Partial Results > No Results)

**Problem:** Current error boundary is binary: everything works -> full cycle, OR one tool fails -> EXIT. A market-watcher cycle that processed 25/26 stocks gets thrown away if stock #26 fails.

**Pattern: degrade gracefully — partial results are better than no results.**

```
ERROR HANDLING LEVELS (replaces binary EXIT):

Level 1 — TOOL RETRY (current: 1 retry, keep this)
  Tool fails -> retry once -> if succeeds, continue

Level 2 — SKIP & CONTINUE (NEW)
  Non-critical tool fails after retry -> skip that item, continue cycle
  Log: "DEGRADED: skipped {item} — {error}"
  Example: 1 stock price fetch fails -> skip that stock, analyze other 25

Level 3 — PARTIAL RESULT (NEW)
  Critical tool fails but partial data exists -> publish what you have
  Tag output: "PARTIAL: {N}/{total} items processed. Missing: {list}"
  Example: bootstrap works but 1 source unhealthy -> analyze with available data

Level 4 — FULL EXIT (current behavior, keep for critical failures)
  Bootstrap fails OR >=50% of items fail -> BUG -> EXIT
  This is still the right call for systemic failures.
```

**Decision matrix:**

| What failed | Items processed | Action |
|-------------|----------------|--------|
| 1 stock out of 26 | 25/26 = 96% | **Level 2**: skip & continue |
| 5 stocks out of 26 | 21/26 = 81% | **Level 3**: partial result, tag "PARTIAL" |
| 15 stocks out of 26 | 11/26 = 42% | **Level 4**: EXIT — too degraded |
| Bootstrap | 0% | **Level 4**: EXIT |
| Signal post failed | N/A | **Level 2**: log to session, retry next cycle |

**In flow files, wrap each item in a try-continue:**
```
FOR each item in work_list:
  TRY:
    process(item)
    success_count += 1
  CATCH:
    skip_count += 1
    log: "DEGRADED: skipped {item} — {error}"
    IF skip_count > 50% of total -> ESCALATE to Level 4 (EXIT)
    ELSE -> continue to next item

IF success_count > 0:
  publish results (tag PARTIAL if skip_count > 0)
ELSE:
  Level 4: BUG -> EXIT
```

### 18.5 Decision Trace (Log WHY, Not Just WHAT)

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

### 18.6 Cycle Self-Review (Quality Gate Before Notebook Write)

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

**Drift detection examples:**
```
NORMAL: Fired 2-4 signals/cycle for last 10 cycles. This cycle: 3. -> OK
DRIFT:  Fired 2-4 signals/cycle for last 10 cycles. This cycle: 15. -> LOG DRIFT
        Possible cause: threshold too loose, data anomaly, or regime shift

NORMAL: Confidence avg 0.65-0.75 for last 10 cycles. This cycle: 0.70. -> OK
DRIFT:  Confidence avg 0.65-0.75 for last 10 cycles. This cycle: 0.35. -> LOG DRIFT
        Possible cause: data source degraded, or genuinely uncertain market
```

### 18.7 Quality Pattern Integration in Flows

Where each pattern applies in the flow templates:

**Cowork flow ([Section 6.1](guide-flows.md#61-cowork-agent-flow)) — add these steps:**
```
Step 0-0e: (unchanged — bootstrap, notebook, regime)

Step 1-N: Main work steps
  -> ADD per-item: grounding check (18.2) + try-continue (18.4)

Step N-4: Pre-send validation (18.1) — before every signal/report
Step N-3: Lesson extraction (existing) + decision trace (18.5)
Step N-2.5: Cycle self-review (18.6) — NEW
Step N-2: Session log with decision trace format (18.5)
Step N-1: WORK channel
Step N: BUG on error
Notebook write + doc self-heal + registry check
```

**Dev team flow ([Section 6.2](guide-flows.md#62-dev-team-agent-flow)) — add these steps:**
```
Pre-code checklist: (unchanged)
  -> ADD: grounding check — read existing code before changing (18.2)

TDD workflow: RED -> GREEN -> REFACTOR
  -> ADD: after GREEN — self-review: "does my implementation match the spec?" (18.6)

After code:
  -> ADD: confidence in handoff — "confidence: high|medium|low" with basis (18.3)

RETURN block:
  -> ADD: quality_status: "full|partial|degraded" (18.4)
```

### 18.8 Summary — The Quality Stack

```
Layer 5  SELF-REVIEW      <- "Was this cycle's output coherent?" (18.6)
Layer 4  DECISION TRACE   <- "WHY did I decide this?" (18.5)
Layer 3  CONFIDENCE        <- "HOW SURE am I?" (18.3)
Layer 2  VALIDATION        <- "Is this output correct?" (18.1)
Layer 1  GROUNDING         <- "Is this fact real?" (18.2)
Layer 0  DEGRADATION       <- "Can I still produce value?" (18.4)
```

Each layer catches a different class of quality failure:
- Layer 0 prevents **total cycle loss** (partial > nothing)
- Layer 1 prevents **hallucinated facts** (every claim traced)
- Layer 2 prevents **malformed output** (schema + sanity)
- Layer 3 enables **prioritization** (downstream knows certainty)
- Layer 4 enables **debugging** (why was this wrong?)
- Layer 5 prevents **quality drift** (catch degradation early)
