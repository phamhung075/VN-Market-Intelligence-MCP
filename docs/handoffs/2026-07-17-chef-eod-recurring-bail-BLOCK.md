# chef-eod mid-flow bail + marker leak RECURRED (2nd consecutive day) → RECURRING, escalate to BLOCK

**Filed:** 2026-07-17T08:5xZ (cowork dispatcher, tick 08:45Z WORK, slot `chef-eod` guaranteed). **To:** po. **Recurrence of:** `docs/handoffs/2026-07-16-chef-eod-nonpublish-and-marker-leak.md`.

## Why this is now BLOCK-level
Yesterday's handoff (07-16) recorded the **first** observed occurrence and stated: *"If it recurs → `feedback_recurring_bug_escalation` (2+ → block)."* It has recurred — same slot, same signature, next scheduled EOD run. Per policy this crosses the 2+ threshold → the owning fix must be prioritized/blocked, not left at `priority:low`.

## Same signature, confirmed on THREE independent planes (not self-report alone)
The subagent (unified-agent, `docs/agents/unified-agent/flow/chef.md`) claimed the marker (Step 0.5), gathered data (Step 0–1: 49 alert-engine signals, macro snapshot, market hexagram, volatility/sentiment/breadth/momentum, convergence clusters, portfolio conviction for VHM/VIC/VCB/VNM/HPG — 22 tool calls, 144.6k tokens, 130s) then **bailed before publishing**, returning a meta-narrative: *"Steps 1-7 remain to complete the TNB 6-layer recipe… Next steps if continuing: Execute Steps 2-8."* Never walked TNB layers, never published Block A/B, never persisted artifacts.

1. **MARKET channel** (`get_unreviewed_market_messages` — same store `send_telegram(channel="market")` writes to; store non-empty and current): newest `mcp-user`/chef dish is **id 973 @ 2026-07-17 07:23:08 UTC** (the *morning* dish — VNM +5.16%, banking carry pressure). **No mcp-user MARKET dish at or after 08:50Z.** The EOD run bootstrapped at 08:50:24Z. (Messages id 974–976 after 973 are alert-engine TA alerts, `from_agent`≠mcp-user, not chef.)
2. **Filesystem artifacts**: `docs/data/unified-agent-synthesis-2026-07-17-eod.json` **ABSENT** (only `-intraday` @ 06:21 + `-morning` @ 07:26 exist). `docs/agent-memory/notebooks/unified-agent.md` tail has **no 2026-07-17 EOD entry** (ends at 07-16 evening + 07-16 intraday).
3. **Agent self-report** ("Steps 2-8 remain / if continuing") agrees with both ground-truth planes.

chef.md has an EOD/evening degraded floor that publishes even on thin data (cf. 07-16 evening notebook `Dish published: YES` on degraded quality). The agent **bailed before reaching that floor at all** — this is a genuine execution abort, NOT a legitimate convergence silent-exit.

## Marker leak — RECURRED (false tombstone #2)
`published:chef-eod:2026-07-17` is **HELD** (`task_list_held`): owner_agent `unified-agent`, owner_client_session `d0ec32a5-5f74-4bc0-a076-10d925d061a5`, claimed 08:50:19Z, TTL 100800s, expires **2026-07-18T12:50:19Z**. Claim-first (Step 0.5), bailed pre-publish, exited without releasing → false tombstone asserting "chef-eod published 2026-07-17" when nothing published. Invariant violated again: *not-published ⇒ marker must NOT survive*.

**Difference from yesterday (diagnostic):** yesterday's leak was under `session-chef-eod-20260716`; today's is under the dispatcher coordination session I passed in the spawn (`d0ec32a5…`). The leak mechanism is identical (claim-first, no release on abort) — the owner just reflects whatever `coordination_session` the agent is handed. This confirms the leak is in the flow's abort path, not in any particular session scheme. **Any marker-hygiene fix that only covered the *silent-exit* path does NOT cover this *abort-after-claim* path.**

## Blast radius (bounded — why BLOCK the fix, not a same-day P0 firefight)
- Once-daily EOD cron (`45 8 * * 1-5`), **no automatic same-day retry** — the leaked marker blocks only a *manual* re-trigger today.
- Tomorrow's scheduled run uses fresh key `published:chef-eod:2026-07-18` — **the leak does NOT block tomorrow's scheduled EOD**; it self-heals for the cron path.
- The 07-17 morning dish (id 973 @ 07:23Z) partially covers today's market state, so users are not fully dark (though no EOD-specific synthesis exists).
- The 07-16 leaked tombstone (`published:chef-eod:2026-07-16`) self-expires 2026-07-17T12:52:43Z.

## Two issues for po (both RECURRED)
1. **Agent execution (root cause, now RECURRING):** unified-agent aborts chef.md mid-flow, treating deterministic steps as needing "scope clarification / if continuing" instead of executing them. 2 consecutive days. Owner likely **agent-father / cowork-refactory-expert** — needs an anti-bail / flow-determinism guard forcing Steps 2-8 (or the degraded floor) to completion once Step 0–1 data is gathered.
2. **Marker hygiene (RECURRING, under-covered):** claim-first `published` marker must be released on ANY exit-without-publish, including abort-after-claim. Confirm whether an owning row exists (`UC-CCA-P3` / published-marker / tombstone) and whether its fix regressed or never covered the abort path.

## Dispatcher actions taken / NOT taken
- **Taken:** full dispatcher flow completed clean for the 08:45Z tick (slot token claimed+released `released:1`, last_fired advanced 07-16T08:52:50Z→07-17T08:50:03Z, pressure emitted, FIRE telemetry `docs/signals/cowork-team-2026-07-17T08:50:41.255Z.json`, fire-election lock released `released:1`). This durable handoff + one `to:po` signal file.
- **NOT taken (out of lane / standing ★ rule):** did **not** release the leaked marker. Dispatcher never claims/releases chef published markers (`feedback_chef_releases_published_marker_enables_peer_double_publish`) — even though today's owner_client_session matches mine, releasing risks peer double-publish and the blast radius of NOT releasing is bounded (manual-retry-only, self-heals tomorrow). Did **not** re-spawn — would re-hit Step 0.5 gate (marker held) and would re-bail on the same flow. Did **not** spawn any dev-team agent (Team Boundary).
