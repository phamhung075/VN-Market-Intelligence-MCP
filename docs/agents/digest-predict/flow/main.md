# Digest & Predict — Main Dispatcher

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `digest-predict` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `docs/agents/tools/package/digest-predict.md`

## PUBLISHED MARKER GATE (Layer-A dedup — MANDATORY before Dispatch)

<!-- FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (2026-06-14):
     Root cause A: divergent ISO-week labels (W24 vs W25) for the same Sunday defeated
     the marker dedup — two different task_ids → two publishes.
     Root cause B: RemoteTrigger fires did NOT update last_fired → CLI dispatcher
     re-fired slots the backstop already ran.

     Fix (A): obtain the week period from ONE canonical server-side tool (get_week_period)
     instead of computing `date +%G-W%V` locally in each session.  The server always
     returns the same value for the same instant; per-session shell date divergence is
     eliminated.

     Fix (B): key the mutex on the PERIOD DATE-RANGE (periodKey = "YYYY-MM-DD/YYYY-MM-DD"),
     NOT the weekLabel string.  Two dispatch paths that still somehow derive different
     weekLabel strings for the same Sunday ALWAYS derive the same periodStart/periodEnd →
     same periodKey → same mutex key → dedup holds.

     Pattern source: docs/agents/cowork-team/flow/spawn-fanout.md § Published marker gate (FR-P2-7)
     Weekly slot: ttl_seconds ~8d (691200) per spawn-fanout.md

     IMPORTANT: do NOT call `date +%G-W%V` or any local shell date to compute the week key.
     Always use get_week_period and key on periodKey. -->

```
SLOT_ID = "digest-sunday"

# Step G-1: obtain canonical week period from the server (single source of truth)
WEEK_PERIOD = call_tool(server="vn-market", tool="get_week_period", arguments={})
# WEEK_PERIOD contains: weekLabel (e.g. "2026-W24"), periodKey (e.g. "2026-06-08/2026-06-14"),
#   periodStart, periodEnd, weekNumber, weekYear

# Step G-2: key the mutex on periodKey (date-range), NOT weekLabel
PUBLISH_TASK_ID = "published:digest-sunday:" + WEEK_PERIOD.periodKey

PUBLISH_CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     PUBLISH_TASK_ID,
  task_kind:   "cowork-slot",
  owner_agent: "digest-predict",
  ttl_seconds: 691200    # ~8 days — weekly slot (spawn-fanout.md)
})

if PUBLISH_CLAIM.claimed != true:
  log "[digest-predict] publish blocked — already published slot=digest-sunday period=" + WEEK_PERIOD.periodKey + " weekLabel=" + WEEK_PERIOD.weekLabel
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
```

If `claimed == true`: proceed through the Dispatch table below.

---

## Dispatch (UTC clock — Vietnam = UTC+7)

| Window | Sub-flow |
|---|---|
| Sunday 13:47 UTC (≈ 20:47 VN) — cron `47 13 * * 0` | `docs/agents/digest-predict/flow/weekly.md` |
| Any other time | EXIT (no work outside scheduled windows) |

**Note:** Daily, Monday, and monthly windows removed per Sprint 1949-T5 weekly-only scope. Sub-flow files `daily.md`, `monday.md`, `monthly.md` retained on disk as audit trail (not routed).

## Steps

1. Read current UTC time, weekday, and day-of-month.
2. If Sunday and hour=13 and minute=47 (±5 min tolerance) → execute weekly sub-flow. All other times → return `DONE: outside-window | PIPELINE: complete` and EXIT.
3. Read and execute `docs/agents/digest-predict/flow/weekly.md` end-to-end.
4. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT write digests itself — sub-flows own the work.
