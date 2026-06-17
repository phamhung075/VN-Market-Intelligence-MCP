<!-- size-justification: ~160L — single invariant design with exact hook insertion points, QA test script, and agent-father task table; all sections are implementation-load-bearing for agent-father -->

# Architecture Brief — Gatherer Exec-Proof Fail-Loud Gate

**Slug:** `gatherer-exec-proof-failloud`
**Date:** 2026-06-17
**Author:** agents-architect
**Status:** READY → agent-father

---

## Problem Statement (RAW-verified by dev-team router, 2026-06-17T12:09Z)

Off-hours gatherers (`news-scout-offhours` + `market-watcher-offhours`) returned "cycle complete"
at 12:09Z but executed NOTHING:

- news-scout notebook: latest entry c114 dated 08:08Z (stale — no new entry written)
- market-watcher notebook: header "Last updated 08:07 UTC" (unchanged)
- `signal_queue`: 0 NEW rows from either agent in the 12:00–12:15Z window
- Macro value parroted verbatim from prior notebook: `oil=78.38` (not freshly fetched)

This is the **FABRICATE-WHEN-THIN** failure class: the agent narrates a successful cycle
(emits the normal WORK ping, calls `log_agent_work` status=completed) without ever executing
its core fetch steps.

## Distinct Scope — NOT a Dedup Problem

| Task | Failure mode | Root |
|---|---|---|
| `DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER` | fires TWICE (dedup) | concurrency primitives |
| `AF-1-LEADER-LOCK-BACKSTOP-DEFER` | fires TWICE (leader-lock defer) | leader-lock unreadable |
| **This brief** | fires ONCE and executes NOTHING | no execution-proof gate |

Do NOT fold or merge. These are sibling tasks addressing opposite failure modes.

## Adjacent Tasks — Cross-ref, Do Not Duplicate

- `SPIKE-UNIFIED-NB-GAP`: crash before notebook — this brief addresses post-bootstrap silent
  no-execution (agent reaches log step but skipped fetch steps).
- `HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING`: cap enforcement after write — this brief is
  a pre-completion gate (was execution ever attempted?), not a post-write size gate.

---

## Root Cause Analysis

The cycle flow for both agents follows this shape:

```
Step 0-GW  → gateway probe
Step 0      → bootstrap (get_cycle_bootstrap)
Step 0b     → macro / regime
Steps 1..N  → FETCH steps (fetch_and_analyze, get_price_history, etc.)
Step last-1 → notebook write
Step last   → WORK ping + log_agent_work(status=completed)
```

The WORK ping and `log_agent_work(completed)` are emitted at the END regardless of whether
Steps 1..N executed or were silently skipped. There is no invariant that reads:
"I may only call log_agent_work(completed) if at least ONE fetch step succeeded and produced
output that differs from my previous notebook entry."

When the agent's context is stale (e.g., LLM erroneously sees prior session completion as
current state) or when Steps 1..N produce empty results and the agent treats empty-is-fine,
the completion signal is emitted without any execution having occurred.

---

## Design — Generic Execution-Proof Invariant (EXEC-PROOF)

### Invariant Definition

A gatherer cycle is "complete" if and only if BOTH conditions hold:

```
EXEC_PROOF_1: notebook entry written this cycle has a timestamp within the current tick window
              (i.e., notebook header timestamp ≥ cycle_start_utc)

EXEC_PROOF_2: at least one primary fetch tool succeeded with a non-empty result
              (fetch_and_analyze → fetched_articles.length > 0  [news-scout]
               get_price_history(any_ticker)  → prices.length > 0  [market-watcher])
              AND the macro snapshot fetchedAt field is within the current tick window
              (fetchedAt ≥ cycle_start_utc)
```

If EITHER condition is false → the cycle FAILS LOUD:

```
EXEC_PROOF_FAIL: do NOT call log_agent_work(status=completed)
                 do NOT emit the normal WORK ping
                 INSTEAD:
                   send_telegram(channel="bug", message="[<agent>] EXEC-PROOF FAIL: cycle completed no execution — notebook stale OR fetch empty. cycle_start=<ISO> notebook_ts=<ts_or_null> fetch_result_count=<N>")
                   drop signal → docs/signals/<agent>-<ISO>.json (type: "bug-escalation", priority: "high")
                   write notebook entry: "## <ISO>\n- EXEC-PROOF FAIL — no execution this cycle. Skipping completion ping."
                   EXIT (no completed log entry written)
```

The key behavior change: a gatherer that ran nothing CANNOT masquerade as one that ran
something. The BUG channel surfaces the failure immediately; the signal file routes it to PO
for triage.

---

## Exact Hook Insertion Points

### Hook A — `cycle-bootstrap` skill (generic, shared)

**File:** `.claude/skills/cycle-bootstrap/SKILL.md`

**Where:** Add a new section `## Execution Proof Bootstrap` at the end of `## Step 0 — Bootstrap`,
after `get_cycle_bootstrap` succeeds.

**Content to add:**

```markdown
## Execution Proof Bootstrap

After a successful bootstrap, capture the cycle anchor:

CYCLE_START_UTC = current UTC timestamp (from bootstrap response or `date -u`)

This value is passed downstream. Every flow using this skill must:
1. Record CYCLE_START_UTC at bootstrap time.
2. At completion, check EXEC-PROOF invariant before calling log_agent_work(completed).
   See → skill: `.claude/skills/exec-proof-gate/SKILL.md`
```

This is a one-line anchor capture — zero behavior change to the existing bootstrap steps.

### Hook B — `exec-proof-gate` skill (NEW — to be authored by agent-father)

**File:** `.claude/skills/exec-proof-gate/SKILL.md`

**Purpose:** Generic gate callable from any gatherer's final stage (stage-log-notify.md,
cycle.md Step 5). Encapsulates the EXEC-PROOF invariant.

**Spec:**

```
---
name: exec-proof-gate
description: >
  Terminal gate for gatherer cycles. Call before log_agent_work(completed) and the WORK
  ping. Fails loud (BUG telegram + signal file + EXIT) if no execution occurred this cycle.
---

## Inputs (from calling flow)
- CYCLE_START_UTC     : ISO-8601 — set at bootstrap (Hook A)
- NOTEBOOK_PATH       : path to agent's notebook file
- FETCH_RESULT_COUNT  : integer — number of items returned by the primary fetch tool
                        (fetched_articles.length for news-scout, prices.length for market-watcher)
- FETCH_MACRO_TS      : ISO-8601 — fetchedAt from macro snapshot; null if macro unavailable
- AGENT_ID            : string — kebab-case agent id (for BUG message + signal)

## Gate Logic

Step EP-1: Read notebook header timestamp.
  - Extract first `**Last updated:**` or `## c<NNN> · <ISO>` timestamp from NOTEBOOK_PATH.
  - Set NOTEBOOK_TS = parsed timestamp or null if unparseable.

Step EP-2: Evaluate EXEC_PROOF_1.
  EXEC_PROOF_1 = (NOTEBOOK_TS != null) AND (NOTEBOOK_TS >= CYCLE_START_UTC)
  If false → PROOF_1_FAIL = "notebook_stale(ts=" + NOTEBOOK_TS + ")"

Step EP-3: Evaluate EXEC_PROOF_2.
  EXEC_PROOF_2 = (FETCH_RESULT_COUNT > 0) AND
                 (FETCH_MACRO_TS != null) AND (FETCH_MACRO_TS >= CYCLE_START_UTC)
  If false → PROOF_2_FAIL = "fetch_empty_or_stale(count=" + FETCH_RESULT_COUNT + " macro_ts=" + FETCH_MACRO_TS + ")"

Step EP-4: Combined verdict.
  If EXEC_PROOF_1 AND EXEC_PROOF_2:
    → PASS: return to caller (caller proceeds with log_agent_work(completed) + WORK ping)
  Else:
    → FAIL LOUD:
      send_telegram(channel="bug",
        message="[<AGENT_ID>] EXEC-PROOF FAIL: " + coalesce(PROOF_1_FAIL, PROOF_2_FAIL)
                 + " cycle_start=" + CYCLE_START_UTC)
      drop docs/signals/<AGENT_ID>-<ISO>.json:
        { from: AGENT_ID, to: "po", type: "bug-escalation", priority: "high",
          payload: "EXEC-PROOF FAIL: " + ..., createdAt: <ISO> }
      Append to NOTEBOOK_PATH: "## <ISO>\n- EXEC-PROOF FAIL — skipping completion ping."
      EXIT — do NOT call log_agent_work(completed), do NOT send WORK ping
```

### Hook C — `news-scout` stage-log-notify.md

**File:** `docs/agents/news-scout/flow/stage-log-notify.md`

**Where:** Before `call_tool(log_agent_work, status=completed)` in Step 4.

**Insertion:**

```markdown
**Step 3e — Exec-proof gate** → skill: `.claude/skills/exec-proof-gate/SKILL.md`
Inputs:
  CYCLE_START_UTC    = <captured at bootstrap Step 0>
  NOTEBOOK_PATH      = docs/agent-memory/notebooks/news-scout.md
  FETCH_RESULT_COUNT = fetched_articles.length (from stage-fetch.md Step 1 result)
  FETCH_MACRO_TS     = macro_snapshot.fetchedAt (from stage-bootstrap.md Step 0b)
  AGENT_ID           = "news-scout"
On PASS → continue to log_agent_work(completed).
On FAIL → skill exits; do not continue.
```

### Hook D — `market-watcher` cycle.md

**File:** `docs/agents/market-watcher/flow/cycle.md`

**Where:** Before the WORK ping in Step 5b.

**Insertion:**

```markdown
**Step 4e — Exec-proof gate** → skill: `.claude/skills/exec-proof-gate/SKILL.md`
Inputs:
  CYCLE_START_UTC    = <captured at bootstrap Step 0>
  NOTEBOOK_PATH      = docs/agent-memory/notebooks/market-watcher.md
  FETCH_RESULT_COUNT = count of tickers priced in Step 1 (items_fetched)
  FETCH_MACRO_TS     = MACRO_HEALTH.fetchedAt (from macro-health-read skill Step 2)
  AGENT_ID           = "market-watcher"
On PASS → continue to WORK ping + log_agent_work.
On FAIL → skill exits; do not continue.
```

---

## What EXEC-PROOF Does NOT Gate

- Cycles where fetch runs but legitimately returns 0 signals (no anomalies, no impactful news).
  EXEC_PROOF_2 counts fetch results (articles, prices), not downstream signals — a real fetch
  that finds nothing is PASS, not FAIL.
- Bootstrap failures — those already EXIT via cycle-bootstrap skill's own error handling.
- Notebook cap violations — those are governed by HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING.

---

## QA Verification

A cycle with no execution is proven to FAIL LOUD when:

1. **Stale-notebook proof:** Run a gatherer cycle immediately after manually backdating the
   notebook header by 2h. Verify: BUG telegram fired, `log_agent_work(completed)` NOT called
   (check `log_agent_work` call log — no "completed" row for that cycle timestamp).

2. **Empty-fetch proof:** Temporarily stub `fetch_and_analyze` to return `{fetched_articles: []}`.
   Verify: BUG telegram fired, WORK ping absent from WORK channel, signal file created in
   `docs/signals/`.

3. **Happy-path regression:** Normal cycle with real data → PASS (no BUG, WORK ping present,
   `log_agent_work(completed)` called).

4. **Live probe (post-deploy):** After next offhours cycle, confirm:
   - news-scout notebook header timestamp >= cycle_start (within 10 min of fire time)
   - market-watcher notebook header timestamp >= cycle_start
   - `signal_queue` or `log_agent_work` shows at least one "completed" row with matching cycle_start

---

## Agent-Father Task Table

| Task | Scope | Files | Depends on |
|---|---|---|---|
| **EP-1** | Author new skill | `.claude/skills/exec-proof-gate/SKILL.md` | — |
| **EP-2** | Patch cycle-bootstrap | `.claude/skills/cycle-bootstrap/SKILL.md` | EP-1 |
| **EP-3** | Insert Hook C | `docs/agents/news-scout/flow/stage-log-notify.md` | EP-1 |
| **EP-4** | Insert Hook D | `docs/agents/market-watcher/flow/cycle.md` | EP-1 |

EP-1 first. EP-2, EP-3, EP-4 can be parallel after EP-1.

---

## Non-Goals (Out of Scope for This Brief)

- Fixing the root cause of WHY the agent skips fetch steps (that is `SPIKE-UNIFIED-NB-GAP`'s scope).
- Adding retry logic to fetch steps on empty result (a separate improvement — this gate
  treats empty-after-real-fetch as PASS, stale/no-fetch as FAIL).
- Cloud/VPS deploy gating (this is a flow-doc change only — no container rebuild required).
