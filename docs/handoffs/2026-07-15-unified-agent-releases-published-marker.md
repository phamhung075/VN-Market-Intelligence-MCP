# unified-agent releases the published marker after publishing — FR-P2-7 dedup defeated

**Detected:** 2026-07-15T19:54Z by cowork-team dispatcher, RAW-verified post-spawn (slot=chef-evening, tick 19:45Z)
**Status:** PLAN-ONLY — no fix attempted. Router/dispatcher does not implement.
**Severity: HIGH — this is no longer hypothetical. A duplicate reached the user-facing MARKET channel.**

## CONFIRMED OUTCOME (updated 2026-07-15T19:56Z)

`get_market_message_digest({limit_days:1})` after the tick:

```
mcp-user  2 tin  ids: [932, 933]
```

**Two chef dishes published to MARKET for the same slot/date within ~3 minutes.**
Before the marker was released there was one (id 932). The observed sequence:

| Time (UTC) | Event |
|---|---|
| ~19:52 | my chef agent claims `published:chef-evening:2026-07-16`, publishes id **932** |
| ~19:53 | my chef agent **releases** the marker (not instructed by chef.md) |
| 19:53:28 | peer session `34a375e3-f7d7-41c6-befa-8c8a87b5497f` registers session-presence |
| 19:53:46 | peer claims `intent:unified-agent:chef-evening` (router PRE-CLAIM, CLAUDE.md §2.5) |
| ~19:54:0x | dispatcher `task_list_held({kind:"cowork-slot"})` → `count: 0` (marker free) |
| 19:54:56 | peer's unified-agent claims the **freed** marker (`claimed_at: 1784145296`) |
| ~19:55 | peer's agent publishes id **933** → duplicate |

Had the marker stayed held (chef.md L85 design intent, TTL=100800s/28h), the peer's agent
would have hit `claimed == false` → *"publish blocked — already published"* → EXIT without
sending. **The release is the direct proximate cause of the duplicate.**

### Secondary finding — election bypass

The peer session dispatched chef-evening via the **router intent PRE-CLAIM** path
(`intent:unified-agent:chef-evening`), not the cowork fire-election. The election lock
`cron:cowork:2026-07-15T19:45Z` had already been released by this dispatcher at Step 6
(normal exit path), so the election would not have blocked the peer either. The per-slot
token `cowork-slot:chef-evening` was likewise already released per spawn-fanout.md's
try/finally. That leaves the published marker as the ONLY guard spanning the publish
window — which is exactly why releasing it is fatal. Triage should consider whether the
router intent path should consult the cowork slot/election state at all.

## Raw evidence

Agent self-report (unified-agent, chef-evening dispatch) ended with:

> "Published marker released"

RAW verification via `task_list_held({kind: "cowork-slot"})` at 19:54Z:

```json
{"locks": [], "count": 0}
```

The marker `published:chef-evening:2026-07-16` was claimed ~19:52Z with `ttl_seconds=100800`
(28h). It **cannot** have expired two minutes later. It was explicitly released.

The publish itself is REAL, not fabricated — confirmed via `get_market_message_digest`:
MARKET message id **932** ("Thị trường hôm nay giảm nhẹ do áp lực từ khối ngoại…"),
matching the reported Block A narrative. This is a dedup defect, not a fabrication.

## The flow does NOT instruct this release

`docs/agents/unified-agent/flow/chef.md` contains **no** `task_release` for the marker:

- L66/L70 — build `MARKER_KEY` (per-window for multi-fire slots, per-date otherwise)
- L85 — "If `claimed == true`: proceed to Step 0 GATHER. **The marker is now held** —
  send_telegram in Step 7 will proceed."

The design is that the marker is held and TTL governs expiry (28h for daily slots), per
`spawn-fanout.md` § Published marker gate (FR-P2-7): *"the published marker prevents
duplicate sends if a spawn somehow executes twice."* The agent **improvised** the release.

## Impact

Releasing the marker immediately after publishing deletes the last line of defense against
a duplicate MARKET post. The per-work-item slot token (Step 4.6) is already released right
after spawn by design, so the marker is the ONLY surviving guard for the content window.

- `chef-evening` (daily `45 19 * * *`): bounded — won't re-match today. Risk is a peer
  session / session restart / drift re-fire inside the same VN date.
- `chef-intraday` (`13 2-8 * * 1-5`, fires up to 7×/day): higher exposure. Per
  FIX-CHEF-INTRADAY-MARKER-CADENCE the key is per-window (`…:<WORK_DATE>:<VN_HOUR>`);
  releasing it defeats dedup within that window too.

Prior art — this is the exact failure the gate was built to close:
`docs/signals/cowork-chef-doublepublish-2026-06-30.md` (FIX-A → chef same-tick mutex).

## ALREADY ON THE BOARD — do NOT mint a duplicate (added 2026-07-15T20:09Z, tick 20:00Z)

Board probe at tick 20:00Z. This defect is **already specced**; it was never prioritized.
Triage should **dedup-promote**, not mint:

| Board row | Lane | Relevance |
|---|---|---|
| `FIX-CHEF-PUBLISHED-MARKER-RELEASE` | BACKLOG | **Exact defect.** "chef.md cleanup releases published:`<slot>`:`<date>` marker post-publish — defeats F…". Today it fired for real. This row is the fix. |
| `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE` | BACKLOG | Asks to "confirm/refute chef-evening **07-14** duplicate-publish". **Today's ids 932+933 CONFIRM the class.** This row can move from investigate → fix. |
| `FU-CHEF-MARKER-INFLOW` | BACKLOG | chef.md self-enforces published-marker before send_telegram, per-cadence key. |
| `UC-CCA-P3` | BACKLOG | One published-marker-gate skill with mandatory release-on-no-publish. Note: "release-on-no-publish" is the *correct* inverse — do not let it re-introduce release-on-publish. |

**Recurrence count — this is a repeat, not a first sighting:**
- 2026-06-30 — `cow-20260630T0515-chef-doublepublish` (RESOLVED, drove the same-tick CHEF mutex FIX-A)
- 2026-07-14 — suspected, captured as the INVESTIGATE row above
- 2026-07-15 — **CONFIRMED** (ids 932+933), this handoff

Per `feedback_recurring_bug_escalation` (2+ occurrences → block), this warrants rank-1 banding
rather than another BACKLOG parking.

**Related prior signal (unverified fate):** `cowork-chefmarker-leak-2026-07-03T06:31:50Z`
(the *inverse* mode — marker leaked when it should have been released) went `READ` and was
cold-evicted to `docs/data/orch/archive/2026-07.json` with **no `origin_signal_id`
back-reference on any board row**. `FU-CHEF-MARKER-INFLOW` / `UC-CCA-P3` cover that topic, so it
may have been folded in without the back-ref — **not verified, do not assume it was dropped.**

## Counter-observation 2026-07-16T02:36Z — chef-intraday RETAINED the marker (1 sample, does NOT prove fixed)

Dispatcher tick 02:30Z (SILENT), `task_list_held({})` unfiltered, ~14 min after the 02:22Z
chef-intraday fire that published MARKET id **936**:

```json
{"task_id":"published:chef-intraday:2026-07-16:02","task_kind":"cowork-slot",
 "owner_agent":"unified-agent","claimed_at":1784168556,
 "expires_at":"2026-07-16T03:22:36.000Z","ttl_seconds":3600}
```

**The agent published AND kept the marker held** — i.e. it satisfied the invariant this handoff
is about (`published ⇒ marker retained, TTL is the only expiry path`). The multi-fire branch
(`chef.md` L60-67) picked the per-window key + 3600s TTL correctly, matching
FIX-CHEF-INTRADAY-MARKER-CADENCE.

**This is ONE observation and it does not establish that `FIX-CHEF-PUBLISHED-MARKER-RELEASE`
is fixed.** It cannot distinguish between:
- (a) the release behavior was corrected, and
- (b) the release is improvised agent-side and non-deterministic — today it simply didn't improvise.

The 19:52Z chef-evening incident above took the *single-fire* branch (L68-71); this sample took
the *multi-fire* branch. **Different code path ⇒ this sample carries no information about the
path that actually failed.** Do not let it downgrade the row's banding.

What it *is* good for: it answers part of the "next step" question below for one publisher/branch
pair, and it gives triage a known-good comparison case. Whoever picks up the row should diff the
two branches' post-publish cleanup rather than treat either observation as the general behavior.

## Suggested next step (po / dev-team triage)

Confirm whether other cowork publishers (alert-commander, fb-market-poster, digest-predict)
share the improvised-release behavior, then make the contract explicit and un-improvisable
in `chef.md` — e.g. an explicit "NEVER release the published marker; TTL is the only expiry
path" invariant next to the claim block at L85, since the current text states the marker is
held but never states that releasing it is forbidden.
