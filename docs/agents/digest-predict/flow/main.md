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
     FIX-DIGESTPREDICT-SUNDAY-DAILY-GATE-SKIP (2026-08-23, digest-predict live cycle,
     slot=digest-daily 17:30 UTC on a Sunday): this gate used to be wrapped in an
     `IF weekday != Sunday:` guard, on the (incorrect) assumption that "Sunday" implies
     "we are in the 13:47 UTC weekly window". That is false — `daily_predict`'s cron
     (`30 17 * * *`) fires all 7 days including Sunday, at a DIFFERENT time than the
     13:47 UTC weekly slot. The Steps dispatch table below already scopes correctly
     (Step 2 = Sunday 13:47 weekly window, never calls this gate; Step 3 = any-day 17:30
     daily window, always calls this gate) — an internal weekday check duplicating and
     contradicting that external dispatch was redundant at best and, on a Sunday 17:30
     fire, a live bug: it skipped UTC_DATE/MARKER_KEY computation entirely, leaving
     daily-predict.md's P-5a with no MARKER_KEY to claim against. Removed; this block now
     always executes whenever Step 3 invokes it (i.e. on every calendar day the daily
     17:30 UTC window fires, Sunday included).
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
# Runs whenever Step 3 (below) invokes this block — i.e. every day the 17:30 UTC daily
# window fires, Sunday included. Step 2 (Sunday 13:47 weekly window) never calls this
# block at all, so no weekday check is needed here (see FIX-DIGESTPREDICT-SUNDAY-DAILY-
# GATE-SKIP note above).

# UTC_DATE = the YYYY-MM-DD the marker key is anchored to.
# PRIMARY source (FIX-CHEF-MARKER-KEY-ANCHOR-4, 2026-08-23): the `scheduled_utc=<ISO8601>`
#   token in this invocation's own prompt — take its leading 10 characters. cowork-team's
#   spawn-fanout.md Step 5.2 appends it to EVERY spawn, live or catch-up, and it carries the
#   cron's NOMINAL fire instant, so a retry that crosses midnight UTC still mints the SAME
#   MARKER_KEY as its on-time peer instead of silently retargeting to "today" and double-
#   publishing. Parse it the same way the slot id is parsed.
# SECONDARY source (token absent — genuine ad-hoc/manual invocation with no scheduler tick, or
#   a degraded producer; spawn-fanout OMITS the token rather than emitting `scheduled_utc=null`):
#   cycle-bootstrap UTC-now timestamp (the "now" field / current UTC datetime recorded at the
#   top of this session) — take only the date part (before the 'T').
# TERTIARY source: call get_current_date if that tool is available and returns today's date.
# FORBIDDEN: do NOT use get_week_period.periodStart — that is the Sunday week-anchor and is
#   the same value Mon–Sat, which would produce duplicate keys across the whole week.
# Each calendar day MUST yield a distinct UTC_DATE (e.g. Mon=2026-06-23, Tue=2026-06-24 …).
SCHEDULED_UTC = <ISO8601 from prompt token `scheduled_utc=`, or null if the token is absent>
if SCHEDULED_UTC is present and non-empty:
  UTC_DATE = SCHEDULED_UTC[0:10]                 # window-anchored — retry-safe
else:
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
     Always use get_week_period and key on periodKey.

     FIX-CHEF-MARKER-KEY-ANCHOR-4 (2026-08-23, agent-father) — DELIBERATELY NOT APPLIED HERE, and
     that is not an oversight. The daily gate above now anchors on the `scheduled_utc=` prompt
     token because it was reading a wall clock. This weekly gate never was: it keys on
     `get_week_period().periodKey`, a SERVER-side week anchor, which is already the "own the window
     value, don't re-derive it" property the token exists to provide. Swapping in a locally-derived
     week from `scheduled_utc` would replace a server SSOT with agent-side arithmetic and directly
     contradict the IMPORTANT directive immediately above. Residual, explicitly out of scope for
     ANCHOR-4 and NOT silently assumed away: a catch-up retry that lands after the week boundary
     still gets the NEW week's periodKey from the server, so the cross-week retry case remains open
     — it needs `get_week_period` to accept an `as_of` instant, which is a server change, not a
     flow-doc change. -->


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
