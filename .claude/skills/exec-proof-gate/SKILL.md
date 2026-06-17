---
name: exec-proof-gate
description: >
  Terminal gate for gatherer cycles. Call before log_agent_work(completed) and the WORK
  ping. Fails loud (BUG telegram + signal file + EXIT) if no execution occurred this cycle.
  Generic — used by both news-scout and market-watcher (and any future gatherer).
version: "2026-06-17b"
incident: "FABRICATE-WHEN-THIN 2026-06-17T12:09Z — off-hours gatherers returned cycle-complete with 0 new rows"
---
<!-- Sprint: DESIGN-GATHERER-EXEC-PROOF-FAILLOUD | Author: agent-father -->

# Exec-Proof Gate — Pre-Completion Invariant

**Call this skill as the FINAL gate before `log_agent_work(completed)` and the WORK ping.**
If either proof condition fails, the cycle MUST exit without the completion ping.

---

## Inputs (from calling flow)

| Name | Type | Description |
|---|---|---|
| `CYCLE_START_UTC` | ISO-8601 string | Set at bootstrap (see cycle-bootstrap skill) |
| `NOTEBOOK_PATH` | file path | Path to this agent's notebook (e.g. `docs/agent-memory/notebooks/news-scout.md`) |
| `FETCH_RESULT_COUNT` | integer | Items returned by the primary fetch tool this cycle (`fetched_articles.length` for news-scout; count of tickers priced in Step 1 for market-watcher) |
| `FETCH_MACRO_TS` | ISO-8601 string or null | `fetchedAt` from the macro snapshot; null if macro unavailable |
| `AGENT_ID` | string | Kebab-case agent id (e.g. `news-scout`, `market-watcher`) |

---

## Gate Logic

### Step EP-0 — Anchor guard (run FIRST, before any other step)

Before evaluating any proof condition, verify the cycle anchor is present:

```
IF CYCLE_START_UTC is null OR empty OR absent:
  PROOF_ANCHOR_FAIL = "cycle_start_utc_missing(bootstrap not captured)"
```

If `PROOF_ANCHOR_FAIL` is set, execute ALL of the following in order, then EXIT:

**a) BUG telegram**
```
send_telegram(channel="bug",
  message="[<AGENT_ID>] EXEC-PROOF FAIL: <PROOF_ANCHOR_FAIL>")
```

**b) Drop signal file** at `docs/signals/<AGENT_ID>-<ISO>.json`:
```json
{
  "from": "<AGENT_ID>",
  "to": "po",
  "type": "bug-escalation",
  "priority": "high",
  "payload": "EXEC-PROOF FAIL: <PROOF_ANCHOR_FAIL>",
  "createdAt": "<current UTC ISO-8601>"
}
```

**c) Write notebook failure entry** (append to `NOTEBOOK_PATH`):
```
## <current ISO>
- EXEC-PROOF FAIL — cycle_start_utc missing (bootstrap anchor not captured). Skipping completion ping.
  proof_anchor=FAIL reason=<PROOF_ANCHOR_FAIL>
```

**d) EXIT** — do NOT call `log_agent_work(completed)`, do NOT send WORK ping.

Only if `CYCLE_START_UTC` is non-null and non-empty: continue to EP-1.

---

### Step EP-1 — Read notebook header timestamp

Read the first line that matches either pattern from `NOTEBOOK_PATH`:
- `**Last updated:** YYYY-MM-DD HH:MM UTC` (market-watcher OVERWRITE-class format)
- `## c<NNN> · <ISO>` (news-scout APPEND-class format — most recent section heading)

Set `NOTEBOOK_TS` = parsed UTC timestamp, or `null` if the file is missing or the pattern is absent.

### Step EP-2 — Evaluate EXEC_PROOF_1

```
EXEC_PROOF_1 = (NOTEBOOK_TS != null) AND (NOTEBOOK_TS >= CYCLE_START_UTC)
```

If false:
```
PROOF_1_FAIL = "notebook_stale(ts=" + NOTEBOOK_TS + ")"
```

### Step EP-3 — Evaluate EXEC_PROOF_2

```
EXEC_PROOF_2 = (FETCH_RESULT_COUNT > 0)
               AND (FETCH_MACRO_TS != null)
               AND (FETCH_MACRO_TS >= CYCLE_START_UTC)
```

If false:
```
PROOF_2_FAIL = "fetch_empty_or_stale(count=" + FETCH_RESULT_COUNT + " macro_ts=" + FETCH_MACRO_TS + ")"
```

### Step EP-4 — Combined verdict

**PASS** — both proofs hold:
```
EXEC_PROOF_1 = true AND EXEC_PROOF_2 = true
→ Return to caller. Caller continues to log_agent_work(completed) + WORK ping.
```

**FAIL LOUD** — either proof false:

Execute ALL of the following in order, then EXIT without calling `log_agent_work(completed)`:

**a) BUG telegram**
```
send_telegram(channel="bug",
  message="[<AGENT_ID>] EXEC-PROOF FAIL: <coalesce(PROOF_1_FAIL, PROOF_2_FAIL)> cycle_start=<CYCLE_START_UTC>")
```

**b) Drop signal file** at `docs/signals/<AGENT_ID>-<ISO>.json`:
```json
{
  "from": "<AGENT_ID>",
  "to": "po",
  "type": "bug-escalation",
  "priority": "high",
  "payload": "EXEC-PROOF FAIL: <coalesce(PROOF_1_FAIL, PROOF_2_FAIL)> cycle_start=<CYCLE_START_UTC>",
  "createdAt": "<current UTC ISO-8601>"
}
```

**c) Write notebook failure entry** (append to `NOTEBOOK_PATH`):
```
## <current ISO>
- EXEC-PROOF FAIL — no execution this cycle. Skipping completion ping.
  proof1=<EXEC_PROOF_1> proof2=<EXEC_PROOF_2> cycle_start=<CYCLE_START_UTC>
```

**d) EXIT** — do NOT call `log_agent_work(completed)`, do NOT send WORK ping.

---

## What This Gate Does NOT Block

- Cycles where fetch runs but legitimately returns 0 downstream signals (no anomalies found,
  no impactful news). `EXEC_PROOF_2` checks raw fetch item count, not signal count.
  A real fetch that finds nothing worth escalating is **PASS**.
- Bootstrap failures — those already EXIT via cycle-bootstrap skill's own error handling.
- Notebook cap violations — governed by `HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING`.

---

## Usage in flow files

```markdown
**Step Xe — Exec-proof gate** → skill: `.claude/skills/exec-proof-gate/SKILL.md`
Inputs:
  CYCLE_START_UTC    = <captured at bootstrap Step 0>
  NOTEBOOK_PATH      = docs/agent-memory/notebooks/<agent-id>.md
  FETCH_RESULT_COUNT = <primary fetch item count this cycle>
  FETCH_MACRO_TS     = <macro_snapshot.fetchedAt or MACRO_HEALTH.fetchedAt>
  AGENT_ID           = "<agent-id>"
On PASS → continue to log_agent_work(completed).
On FAIL → skill exits; do not continue.
```

Place immediately before `log_agent_work(completed)` and the WORK channel ping.
