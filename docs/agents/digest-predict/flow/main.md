# Digest & Predict — Main Dispatcher

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `digest-predict` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `docs/agents/tools/package/digest-predict.md`

## Step 0-GW — Gateway availability gate

**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md` (agent-id=digest-predict; single top-of-file placement — covers BOTH the non-Sunday `DAILY_CLAIM` path inside Step pre-D below AND the Sunday Published Marker Gate further down this file, since both execute unconditionally after this point — UC-CCA-P2 FR-4, architect-ratified, no conditional/if-guard needed)

---

## Step pre-D: DAILY-PREDICT DEDUP GATE (non-Sunday days only) — Phase 1 (cheap probe)

<!-- FEAT-PREDICTION-CLAIMS-DAILY-CADENCE (2026-06-24 Sprint S2/ARCH-PREDICTION-DAILY-CADENCE):
     Protects against cron re-fire, session restart, or dispatcher double-fire producing
     duplicate claims for the same UTC calendar day.
     Key: "published:digest-daily:" + UTC_DATE  (e.g. "published:digest-daily:2026-06-24")
     TTL: 86400 seconds (24h)
     Pattern mirrors the Sunday Published Marker Gate below but is keyed on the calendar day
     (not week period) and uses a 24h TTL (not 8d).
     The gate is ONLY evaluated on non-Sunday paths; Sunday falls straight through to its own
     Published Marker Gate (unchanged).
     UC-CCA-P3-FR3-DIGEST-PREDICT (agent-father, 2026-08-14): converted from an EARLY task_claim
     to a Phase-1 read-only probe per .claude/skills/published-marker-gate/SKILL.md. Phase-2
     claim now happens in daily-predict.md immediately before its P-5 create_prediction_claim
     loop (that flow's own irreversible publish action) — NOT the docs/agents/digest-predict/
     flow/daily.md path the original architecture brief anchored on: that file is dead/unrouted
     code (this dispatch table below routes the daily window to daily-predict.md, never
     daily.md; confirmed by docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-
     audit.md's own explicit "git rm daily.md" recommendation, never executed — same
     stale-anchor class as UC-CCA-P2's fb-market-poster Q-file-count-correction). daily.md
     left untouched, flagged for a future code-janitor pass. -->

```
# Only execute this gate if NOT Sunday (Sunday path has its own Published Marker Gate below)
IF weekday != Sunday:

  # UTC_DATE = the YYYY-MM-DD portion of the actual current UTC instant.
  # PRIMARY source: cycle-bootstrap UTC-now timestamp (the "now" field / current UTC datetime
  #   recorded at the top of this session) — take only the date part (before the 'T').
  # SECONDARY source: call get_current_date if that tool is available and returns today's date.
  # FORBIDDEN: do NOT use get_week_period.periodStart — that is the Sunday week-anchor and is
  #   the same value Mon–Sat, which would produce duplicate keys across the whole week.
  # Each calendar day MUST yield a distinct UTC_DATE (e.g. Mon=2026-06-23, Tue=2026-06-24 …).
  UTC_DATE = <YYYY-MM-DD from UTC-now, e.g. "2026-06-24">

  MARKER_KEY = "published:digest-daily:" + UTC_DATE

  # Phase 1 — cheap read-only probe (per .claude/skills/published-marker-gate/SKILL.md).
  # task_list_held has NO task_id filter — scan client-side for MARKER_KEY.
  PROBE = call_tool(server="vn-market", tool="task_list_held",
                     arguments={ kind: "cowork-slot", owner_agent: "digest-predict" })
  HELD  = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

  if HELD:
    log "[digest-predict] daily-predict dedup blocked (Phase-1 probe) — already held date=" + UTC_DATE
    EXIT with: "DONE: duplicate-daily-predict blocked | PIPELINE: complete"
    # claims NOTHING — a leak from this call is structurally impossible.

  # not held → proceed to Dispatch table; MARKER_KEY carried forward as session state to
  # daily-predict.md, which performs the mandatory Phase-2 claim (ttl_seconds=86400,
  # owner_client_session REQUIRED there) immediately before its P-5 claim-creation loop.
```

---

## PUBLISHED MARKER GATE — Phase 1 (Layer-A dedup, cheap probe — MANDATORY before Sunday Dispatch)

<!-- UC-CCA-P3-FR3-DIGEST-PREDICT (agent-father, 2026-08-14): converted from an EARLY task_claim
     to a Phase-1 read-only probe per .claude/skills/published-marker-gate/SKILL.md. Phase-2
     claim now happens in weekly.md immediately before its own send_telegram(channel="market")
     call (that flow's irreversible publish action). Week-period derivation below (get_week_period,
     periodKey) is UNCHANGED and carried forward as session state — do not recompute in weekly.md. -->

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
MARKER_KEY = "published:digest-sunday:" + WEEK_PERIOD.periodKey

# Phase 1 — cheap read-only probe (per .claude/skills/published-marker-gate/SKILL.md).
# task_list_held has NO task_id filter — scan client-side for MARKER_KEY.
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={ kind: "cowork-slot", owner_agent: "digest-predict" })
HELD  = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

if HELD:
  log "[digest-predict] publish blocked (Phase-1 probe) — already held slot=digest-sunday period=" + WEEK_PERIOD.periodKey + " weekLabel=" + WEEK_PERIOD.weekLabel
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # claims NOTHING — a leak from this call is structurally impossible.
```

If NOT held: proceed through the Dispatch table below. `WEEK_PERIOD`/`MARKER_KEY` are carried
forward as session state to `weekly.md`, which performs the mandatory Phase-2 claim
(ttl_seconds=691200, owner_client_session REQUIRED there) immediately before its own
`send_telegram(channel="market")` call.

<!-- NOTE: this gate runs ONLY on the Sunday path (Step 2 above). The daily path uses the
     DAILY-PREDICT DEDUP GATE (Step pre-D) with its own key and TTL. The two gates are
     independent and non-overlapping. -->


---

## Dispatch (UTC clock — Vietnam = UTC+7)

| Window | Sub-flow |
|---|---|
| Sunday 13:47 UTC (cron `47 13 * * 0`) | `docs/agents/digest-predict/flow/weekly.md` |
| Daily 17:30 UTC (cron `30 17 * * *`) | `docs/agents/digest-predict/flow/daily-predict.md` |
| Any other time | EXIT (outside scheduled windows) |

**Note:** Daily prediction synthesis restored via daily-predict.md (Sprint S2/ARCH-PREDICTION-DAILY-CADENCE). monday.md retained on disk as audit trail (not routed). Monthly removed. daily-predict.md reuses monday.md P-3..P-5 pipeline; weekly.md unchanged.

## Steps

1. Read current UTC time, weekday, and day-of-month.
2. If Sunday AND hour=13 AND minute ∈ [47,52]:
   - DAILY-PREDICT DEDUP GATE is SKIPPED (Sunday path has its own Published Marker Gate above).
   - Run the Published Marker Gate above (existing, unchanged).
   - Execute `docs/agents/digest-predict/flow/weekly.md` end-to-end.
   - Return that sub-flow's RETURN block verbatim.
3. Else if hour=17 AND minute ∈ [30,35]:
   - Run the DAILY-PREDICT DEDUP GATE above (§Step pre-D). If gate blocks → EXIT.
   - If gate passes: execute `docs/agents/digest-predict/flow/daily-predict.md` end-to-end.
   - Return that sub-flow's RETURN block verbatim.
4. Else:
   - EXIT "DONE: outside-window | PIPELINE: complete"

This dispatcher MUST NOT write digests itself — sub-flows own the work.
The Published Marker Gate (Sunday/weekly) and the Daily-Predict Dedup Gate (Mon-Sat/daily) are independent. Never cross-evaluate them.
