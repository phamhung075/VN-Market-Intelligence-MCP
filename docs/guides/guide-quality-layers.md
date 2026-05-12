> Parent: [guide-quality.md](./guide-quality.md)

# Quality Stack — 6 Layers

The 6-layer quality framework for autonomous agents. Each layer catches a different class of quality failure.

```
Layer 5  SELF-REVIEW      <- "Was this cycle's output coherent?" (self-review)
Layer 4  DECISION TRACE   <- "WHY did I decide this?" (tracing)
Layer 3  CONFIDENCE       <- "HOW SURE am I?" (confidence scoring)
Layer 2  VALIDATION       <- "Is this output correct?" (pre-send validation)
Layer 1  GROUNDING        <- "Is this fact real?" (grounding rule)
Layer 0  DEGRADATION      <- "Can I still produce value?" (graceful degradation)
```

---

## Layer 0: Graceful Degradation (Partial Results > No Results)

**Problem:** Binary error boundary: everything works → full cycle, OR one tool fails → EXIT. A cycle that processed 25/26 stocks gets thrown away if stock #26 fails.

**Pattern:** Degrade gracefully — partial results are better than no results.

### Error Handling Levels

**Level 1 — TOOL RETRY** (current: 1 retry, keep this)
- Tool fails → retry once → if succeeds, continue

**Level 2 — SKIP & CONTINUE** (NEW)
- Non-critical tool fails after retry → skip that item, continue cycle
- Log: "DEGRADED: skipped {item} — {error}"
- Example: 1 stock price fetch fails → skip that stock, analyze other 25

**Level 3 — PARTIAL RESULT** (NEW)
- Critical tool fails but partial data exists → publish what you have
- Tag output: "PARTIAL: {N}/{total} items processed. Missing: {list}"
- Example: bootstrap works but 1 source unhealthy → analyze with available data

**Level 4 — FULL EXIT** (current behavior, keep for critical failures)
- Bootstrap fails OR >=50% of items fail → BUG → EXIT
- This is still the right call for systemic failures.

### Decision Matrix

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
