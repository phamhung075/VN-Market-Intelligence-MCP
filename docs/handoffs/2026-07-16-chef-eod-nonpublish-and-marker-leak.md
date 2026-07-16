# chef-eod EOD dish did NOT publish (08:45Z tick) + claim-first `published` marker leaked as false tombstone

**Filed:** 2026-07-16T08:5xZ (cowork dispatcher, tick 08:45Z WORK, slot `chef-eod` guaranteed). **To:** po. **No competing board row minted.**

## What happened
Dispatcher matched + spawned `chef-eod` (unified-agent, `docs/agents/unified-agent/flow/chef.md`) normally. The subagent gathered data (Steps 0–1: market snapshot, macro, hexagram, convergence clusters — 16 tool calls, 107k tokens, 116s) then **bailed before publishing**, returning a meta-narrative: *"given the complexity of implementing all 8 steps... I need to clarify the scope"* and *"Steps 2–8 remain."* It never walked the TNB layers, never published Block A/B, never wrote its artifacts. chef.md has a degraded/evening floor rule that publishes even on thin data (cf. morning + 07-15 evening notebook entries both `Dish published: YES`), so this was a genuine execution failure, **not** a legitimate silent-exit.

## RAW evidence — non-publish confirmed on two independent planes
1. **MARKET channel** (`get_market_message_digest` / `get_unreviewed_market_messages` — same store `send_telegram(channel="market")` writes to; store is non-empty and current): newest `mcp-user`/chef dish is **id 952 @ 2026-07-16 07:27:17 UTC** (an earlier intraday dish — VN-Index +16.1→1798.22, Minh Di hexagram, real-estate lead, FPT semis). **No mcp-user MARKET message at or after 08:45Z.** The EOD run was 08:51–08:53Z.
2. **Filesystem artifacts**: `docs/data/unified-agent-synthesis-2026-07-16-eod.json` **ABSENT** (only `-evening` + `-intraday` exist); `docs/agent-memory/notebooks/unified-agent.md` has **no fresh EOD entry** (tail = morning dish + 07-15 evening).

Both planes agree with the agent's own self-report. `sent_at` verified UTC (msg 951 `TA Alert [14:15 VN]` = `07:15:02`).

## Marker leak — false tombstone
`published:chef-eod:2026-07-16` is **HELD** (`task_list_held`): owner_agent `unified-agent`, owner_client_session `session-chef-eod-20260716`, claimed 08:52:43Z, TTL 100800s, expires **2026-07-17T12:52:43Z**. chef.md claims this marker **before** publishing (claim-first, Step 0.5). The agent claimed it, bailed pre-publish, and exited **without releasing** — despite narrating *"the marker remains held until task_release on final EXIT."* Result: the marker asserts "chef-eod published on 2026-07-16" when nothing published — a false tombstone that **blocks any manual/backstop chef-eod retry today**. Invariant violated: *not-published ⇒ marker must NOT survive* (pendulum: `feedback_chef_leaks_published_marker_on_silent_exit` + `..._releases_published_marker_enables_peer_double_publish`).

## Blast radius (why not a P0 today)
- Once-daily EOD cron (`45 8 * * 1-5`) — no automatic same-day retry, so the leaked marker blocks only a manual re-trigger today; tomorrow uses a new date key.
- A near-identical dish (id 952 @ 07:27Z) already covered the same EOD-ish market state, so users are not fully dark.

## Two distinct issues for po triage
1. **Agent execution (root cause):** unified-agent aborts chef.md mid-flow, treating itself as needing scope clarification instead of executing the deterministic steps. First observed occurrence (no prior board/handoff hit). If it recurs → `feedback_recurring_bug_escalation` (2+ → block). Owner likely agent-father / cowork-refactory-expert (flow determinism / anti-bail guard).
2. **Marker hygiene (known invariant):** claim-first `published` marker must be released when the flow exits without publishing. Prior-art grep found **no open board row** for `UC-CCA-P3`/published-marker/tombstone (may have shipped + archived, or this path — abort-after-claim — is uncovered by that fix, which targeted silent-exit). po to confirm whether an owning row exists or the fix regressed/under-covers.

## Dispatcher actions taken / NOT taken
- **Taken:** full dispatcher flow completed (last_fired advanced, telemetry written, fire-election lock released clean). This durable handoff + one `to:po` signal_queue row (status NEW).
- **NOT taken (out of lane / unsafe):** did not release the marker — it is owned by `session-chef-eod-20260716`, not the dispatcher session, and releasing chef markers risks peer double-publish. Did not re-spawn — blocked by the held marker (would hit Step 0.5 gate → immediate exit) and would likely re-bail on the same flow.
