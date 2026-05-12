> Parent: [guide-quality.md](./guide-quality.md)

# Validation & Grounding Rules

---

## Layer 1: Grounding Rule (No Hallucination Between Tool Calls)

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

---

## Layer 2: Output Self-Validation (Pre-Send Check)

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
