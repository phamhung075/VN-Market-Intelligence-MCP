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

## Suggested next step (po / dev-team triage)

Confirm whether other cowork publishers (alert-commander, fb-market-poster, digest-predict)
share the improvised-release behavior, then make the contract explicit and un-improvisable
in `chef.md` — e.g. an explicit "NEVER release the published marker; TTL is the only expiry
path" invariant next to the claim block at L85, since the current text states the marker is
held but never states that releasing it is forbidden.
