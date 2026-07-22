# Market Watcher — Main Dispatcher

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `docs/agents/tools/package/market-watcher.md`

## Dispatch

**Primary — `slot=` parameter (checked FIRST; F7 fix, DESIGN-COWORK-FANOUT-T6-MARKET-WATCHER-SLOT-ROUTING):**
The cowork dispatcher already passes `slot=<slot_id>` in the spawn prompt (`docs/agents/cowork-team/flow/spawn-fanout.md` Step 5: `"run <flow_path>  slot=<slot_id>"`). When present and recognized, route by slot identity — never re-derive from wall-clock, since a late-firing slot can silently drift outside its own window and misroute to the wrong sub-flow (2026-07-21 incident: `market-watcher-eod` fired ~16:08–16:13Z, outside its 15:55–16:05 window, fell through to `cycle.md`/offhours, and never posted the EOD ledger + signal file Chef's 08:37 UTC dish depends on).

| slot= | Sub-flow | mode |
|---|---|---|
| `market-watcher-eod` | `docs/agents/market-watcher/flow/eod.md` | — (always, regardless of wall-clock drift) |
| `market-watcher-offhours` | `docs/agents/market-watcher/flow/cycle.md` | `offhours` (always) |

**Fallback — UTC clock window table (used ONLY when `slot=` is empty, missing, or unrecognized — e.g. manual/ad-hoc invocation with no `slot=` param):**

| Window | Sub-flow | mode |
|---|---|---|
| Mon–Fri 02:00–08:30 UTC (market hours) | `docs/agents/market-watcher/flow/cycle.md` | `market` |
| Mon–Fri 01:00–02:00 UTC OR 08:31–15:55 UTC (prepost window, excl. market hours and EOD ±5 min) | `docs/agents/market-watcher/flow/cycle.md` | `prepost` |
| Mon–Fri 16:00 UTC (±5 min) | `docs/agents/market-watcher/flow/eod.md` | — |
| All other times (weekends + Mon–Fri outside market/prepost/EOD windows) | `docs/agents/market-watcher/flow/cycle.md` | `offhours` |

## Steps

**Step -1: Execute-not-narrate directive (read first, every invocation)**

YOU ARE market-watcher. This dispatcher and the sub-flow it routes to (`cycle.md` or `eod.md`) are EXECUTED now, via real `mcp__gateway__call_tool` calls — never described, planned, or previewed. FORBIDDEN: any output that summarizes what a step WILL do, WOULD do, or REQUIRES, without the matching tool call having already been made this turn. There is no "execution plan" artifact — only steps that were actually run and their real results.

2x confirmed flow violation (2026-06-28, 2026-07-12T04:04Z — `FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD`): the agent wrote a step-by-step "ready to execute" list to `docs/agent-memory/notebooks/market-watcher.md`, framing each step as a future action ("Step 0-GW: Gateway probe — verify...", "Next phase requires...") instead of calling the tools. This is a self-abort — see `no_self_abort` in `docs/agents/market-watcher/init.md`.

The ONLY valid terminal states for a cycle:
1. A real Step 5 notebook cycle entry (cycle.md) or Step A–B ledger + signal write (eod.md), followed by the Step 5b WORK ping — both derived from actual tool-call results this cycle, written in past tense.
2. An explicit, data-gated EXIT: Step -0 identity-check fail, Step 0-GW gateway-down (confirmed via live dual-probe, no sibling corroboration — never assumed), or a caught hard exception.

If you notice yourself about to write English prose that describes or previews a step instead of calling `mcp__gateway__call_tool` / `Write` — STOP and call the tool instead.

**Step -0: Identity assertion (detect context overflow)**

Before any MCP call, verify agent identity loaded correctly:
```
EXPECTED_AGENT = "market-watcher"
ACTUAL_AGENT   = YAML frontmatter `name` field (from agent definition header)

if ACTUAL_AGENT != EXPECTED_AGENT:
  send_telegram(channel="bug", message="[market-watcher] IDENTITY_CHECK=FAIL — context overflow likely. Expected: market-watcher, got: " + ACTUAL_AGENT)
  EXIT with DONE: identity-fail | PIPELINE: blocked
else:
  log "IDENTITY_CHECK=OK — agent=market-watcher"
```

Pattern: If name/color/description fields are missing or wrong (context window truncated identity stanza), this fires before any market data fetch. Detects the SUCCESS→SILENT→FAILURE recurrence pattern (TASK_1967-04).

1. Read current UTC time.
2. Parse `slot=<slot_id>` from the invocation prompt, if present.
   - `slot=market-watcher-eod` → route to `docs/agents/market-watcher/flow/eod.md` (always — regardless of wall-clock drift).
   - `slot=market-watcher-offhours` → route to `docs/agents/market-watcher/flow/cycle.md` with `mode=offhours` (always).
   - `slot=` empty, missing, or any other value (unrecognized slot id, or manual/ad-hoc invocation with no `slot=` param at all) → fall back to the UTC clock window table above, UNCHANGED: match the window (evaluate market row first, then prepost, then EOD, then offhours); all times resolve to a sub-flow — there is no unconditional EXIT branch.
3. Run Step 0-GW corroboration probe (Root C fix — DMS-2, DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER):

   ```
   PROBE_1 = call_tool(server="vn-market", tool="get_system_status")
   ```
   If PROBE_1 succeeds → gateway UP → continue to Step 4.

   On timeout or error (attempt 1):
   ```
   WAIT 30s  # CPU-spike backoff (load spikes during double-fire)
   PROBE_2 = call_tool(server="vn-market", tool="get_system_status")
   ```
   If PROBE_2 succeeds → gateway UP → continue to Step 4.

   On timeout or error (attempt 2 — two successive failures):
   ```
   # Do NOT file gateway-down BUG yet. Corroborate via sibling success.
   SIBLING_RECENT = call_tool(server="vn-market", tool="get_agent_signals", arguments={
     "from_agent": null,
     "status": "all",
     "hours_back": 0.25
   })
   # from_agent=null → all producers, 15-minute window.
   # If ANY signal is present: a sibling accessed the gateway successfully in this window.
   ```

   If SIBLING_RECENT is non-empty (count > 0):
   ```
   log "[market-watcher] Step 0-GW: 2x timeout but SIBLING_RECENT is non-empty — suppressing false gateway-down BUG"
   # Gateway is reachable via a sibling. This session's failure is a local transient.
   EXIT cleanly  # Do NOT file gateway-down BUG.
   ```

   Else (two successive probe failures + zero sibling success in 15-min window):
   ```
   # Real gateway outage confirmed — sibling corroboration absent.
   send_telegram(channel="bug", message="[market-watcher] gateway-down CONFIRMED: 2x probe failure + no sibling success in 15-min window")
   EXIT
   ```

4. Read and execute the matched sub-flow end-to-end, passing `mode` (e.g. `mode=prepost`) as a parameter so cycle.md can apply the correct threshold floor.
5. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT do market-watching work itself.
