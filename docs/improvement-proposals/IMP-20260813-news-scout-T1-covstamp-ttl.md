---
Created by: news-scout
Status: DRAFT
Triggered: 2026-08-13T12:11:00Z
Cycle: c262 news-scout-offhours slot
---

# Improvement Proposal: coverage-stamp.sh mutex TTL below task_claim schema minimum (T1)

## Weakness

`scripts/agents-flow/coverage-stamp.sh` line 158 hardcodes `ttl_seconds:30` for its
`coverage-state:main` mutex `task_claim` call. The live `task_claim` MCP tool schema
enforces a minimum of 60. Every invocation of the script now fails input validation on
all 5 retry attempts and fail-CLOSED (no write performed) — this is not a transient
mutex-contention timeout, it is a permanent schema mismatch that cannot self-resolve by
retrying.

**Workaround applied:** flow doc `docs/agents/news-scout/flow/stage-log-notify.md` Step 7
already prescribes exactly this outcome for a genuine transport failure — SKIP the
coverage-state write for the cycle and log `[coverage-write-skipped: <reason>]` on the
WORK ping, never fall back to a full-file rewrite. news-scout followed that path this
cycle. **Non-fatal to this cycle's signal output, but the 48h staleness sweep
(`--list-stale`) that this same script also serves depends on `last_covered_news_scout`
timestamps actually landing — those timestamps have not been written by news-scout since
at least this cycle, degrading the sweep's future accuracy.**

## Evidence

**T1 Trigger — tool call returned error (task_claim input-validation failure) on all 5
retry attempts, every cycle, deterministically:**

```
[coverage-stamp] WARN: task_claim transport error (attempt 1/5): [mcp-call] ERROR: tool=task_claim isError=true: MCP error -32602: Input validation error: Invalid arguments for tool task_claim: [ { "code": "too_small", "minimum": 60, "type": "number", ...
[coverage-stamp] WARN: task_claim transport error (attempt 2/5): ... (same error, attempts 2-5)
[coverage-stamp] ERROR: could not acquire coverage-state:main mutex after 5 attempts — fail-CLOSED, no write performed
```

Root cause confirmed by direct grep of the script:
`scripts/agents-flow/coverage-stamp.sh:158` — `ttl_seconds:30` literal, hardcoded, not
parameterised. This is a schema-vs-caller mismatch, not a load/contention issue — retrying
5, 50, or 500 times produces the identical validation error every time.

**Blast radius:** the script's own header comment (stage-log-notify.md Step 7, and the
matching step in `market-watcher`'s flow) states this mutex "serializ[es] against
market-watcher's own write (co-ships FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE)" — i.e.
BOTH news-scout and market-watcher call this same script/mutex path, so the defect is
fleet-wide, not news-scout-specific. Flagged via `send_telegram(channel="bug")` this cycle
(message_id 5212) in addition to this DRAFT per PLAN-ONLY self-critique scope.

## Proposed Change

**What:** Raise `ttl_seconds:30` to a value ≥60 (e.g. 60, matching the schema floor
exactly, or a modest buffer such as 90) on `scripts/agents-flow/coverage-stamp.sh:158`.

**Why:** One-line literal change unblocks `coverage-state:main` mutex acquisition for
every future news-scout and market-watcher cycle, restoring `last_covered_*` staleness
tracking (currently frozen at whatever value each ticker held before the schema minimum
was raised to 60). No behavioral change beyond the TTL value itself — the mutex's
acquire/release/CAS logic is otherwise unaffected.

## Lane

**Lane A** — mechanical parameter fix in a support script; no gate/audit/success-criteria
change, no flow-logic change, no user-facing comprehensibility impact.

**Lane Rationale (C-3 answer):** Does this proposal edit gate/audit logic, loop success
criteria, an irreversible action, or user-facing comprehensibility? NO. It changes one
numeric literal in a mutex-acquisition call inside a support script; the coverage-state
write's own validation (jq surgical patch, CAS-guard) is untouched. Purely mechanical.

## Success Signal

- `coverage-stamp.sh --agent news-scout --tickers <...>` (or the market-watcher
  equivalent) exits 0 and reports a successful write instead of 5/5 `task_claim` failures.
- 2 consecutive news-scout cycles complete Step 7 without a `[coverage-write-skipped]`
  WORK-ping note.
- `docs/data/coverage-state.json` `.tickers[*].last_covered_news_scout` timestamps advance
  past 2026-08-13T12:11Z on the next successful cycle.

## Rollback

No rollback needed — single-literal value change, trivially revertible via git if it
somehow regresses (e.g. if some other caller relied on the invalid ttl_seconds=30 never
succeeding, which is not the case: the mutex acquisition is unconditionally attempted
every cycle today and unconditionally fails today).

---

## Dashboard Entry (signal_queue.rows[])

```json
{
  "id": "new-20260813T121100Z",
  "ts": "2026-08-13T12:11:00Z",
  "from": "news-scout",
  "to": "po",
  "type": "improvement_proposal",
  "summary": "coverage-stamp.sh:158 ttl_seconds=30 < task_claim schema minimum=60 — mutex fails 5/5 every cycle, fail-CLOSED, fleet-wide (news-scout+market-watcher).",
  "severity": "INFO",
  "status": "NEW",
  "payload_ref": "docs/improvement-proposals/IMP-20260813-news-scout-T1-covstamp-ttl.md"
}
```
