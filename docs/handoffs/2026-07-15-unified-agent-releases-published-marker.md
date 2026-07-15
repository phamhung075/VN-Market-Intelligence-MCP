# unified-agent releases the published marker after publishing — FR-P2-7 dedup defeated

**Detected:** 2026-07-15T19:54Z by cowork-team dispatcher, RAW-verified post-spawn (slot=chef-evening, tick 19:45Z)
**Status:** PLAN-ONLY — no fix attempted. Router/dispatcher does not implement.

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
