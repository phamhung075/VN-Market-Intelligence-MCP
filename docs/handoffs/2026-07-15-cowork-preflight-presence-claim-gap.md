# cowork-tick-preflight.sh — presence heartbeat without claim (fresh-session false-ERROR)

**From:** cowork-team (dispatcher, session f308af2a)
**To:** po
**Found:** 2026-07-15T18:36Z, live tick `2026-07-15T18:30Z`
**Severity:** MED — deterministic, self-healing, bounded to one tick per session; no incorrect publish.

## Symptom

Preflight returned `ERROR` on the first tick of a fresh session:

```json
{"verdict":"ERROR","tick":"2026-07-15T18:30Z","drift_min":3,"slots":[],"one_shots":[],
 "new_signals":0,"detail":"presence heartbeat ok=false (lock not held or expired) — fallback runs full presence claim"}
```

The tick then completed correctly via the documented ERROR fallback (full inline body from
Step 0a): presence claimed, election WON, no slots due, SILENT exit, lock released, no leak.
So this is a **cost and contract defect, not an outage**.

## Root cause

`scripts/agents-flow/cowork-tick-preflight.sh:127-138` heartbeats the presence lock but never
claims it:

```bash
# ---- Step 2: presence heartbeat ----
presence_args=$(jq -n --arg tid "session-presence:$session_id" ... )
presence_result=$(mcp_call "task_heartbeat" "$presence_args" 2>&1); presence_rc=$?
...
presence_ok=$(printf '%s' "$presence_result" | jq -r '.ok // false' 2>/dev/null)
if [ "$presence_ok" != "true" ]; then
  _emit_verdict "ERROR" ... "presence heartbeat ok=false (lock not held or expired) ..."
  return 1
fi
```

`task_claim` appears only at line 146, for the **election** lock (`cron:cowork:<tick>`) — never
for `session-presence:<session_id>`. The script's own header (line 13) states the intent:
`"2. Presence heartbeat (session-presence:<session>) — ERROR on ok=false"`. This is a design
drift, not a typo.

`docs/agents/cowork-team/flow/main.md` Step 0b.1 specifies the opposite — **claim-first,
heartbeat only on re-entry**:

```
presence_result = task_claim(task_id="session-presence:"+$CLAUDE_CODE_SESSION_ID,
                             task_kind="session-presence", owner_agent="cowork-dispatcher",
                             ttl_seconds=1800, payload={...})
if not presence_result.claimed:
  if presence_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    task_heartbeat(...)
# Always proceed — presence result is NEVER a gate.
```

On a fresh session no `session-presence:<uuid>` row exists yet, so the heartbeat returns
`ok=false` → `verdict=ERROR` → `return 1`.

## Impact

1. **Every new session's first tick burns the full LLM fallback** — precisely the cost
   TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 was built to remove (~80% of ticks collapse to one bash
   call; this reopens the expensive path once per session, plus once after any >30min presence lapse).
2. **The ERROR path leaves election-lock state undefined** by contract (`main.md` § JUMP-TO,
   ERROR row). Today the fallback's re-claim repaired it, but the ERROR verdict is the same
   channel used for genuine transport failures — so a real fault is indistinguishable from this
   routine false-ERROR.
3. **Presence is specified as never-a-gate**; the script makes it a hard gate. That is the
   contract inversion.

## Why it stayed invisible

Self-heals: once the fallback claims presence at `ttl_seconds=1800` (> the 900s tick interval),
subsequent heartbeats succeed and every later tick in that session returns clean SILENT. It
therefore reads as a one-off per session rather than a repeating defect. Re-breaks after any
presence lapse >30min.

## Proposed fix (small, one block)

Mirror `main.md` Step 0b.1 in Step 2 — claim-first, heartbeat on re-entry, never gate:

- `task_claim(session-presence:<session_id>, task_kind="session-presence",
  owner_agent="cowork-dispatcher", ttl_seconds=1800, payload={...})`
- If `claimed:false` **and** `current_holder.owner_client_session == session_id` → `task_heartbeat`.
- Proceed regardless of outcome. Presence must **never** emit `ERROR` — reserve that verdict for
  the election/transport failures that genuinely leave lock state undefined.
- Update the script header line 13 to match the corrected contract.

## Verification

- Fresh session (no prior presence row) → first tick returns `SILENT`/`WORK`, **not** `ERROR`.
- Re-entrant tick in same session → still `SILENT`/`WORK`; presence TTL renewed.
- Simulated presence-tool transport error → proceeds (non-gating), does not emit `ERROR`.
- Confirm no `cowork-slot` lock leak after each: `task_list_held(kind="cowork-slot")` → `count:0`.

## Prior art / related scars

- `feedback_chain_mutex_ttl_lapse_during_long_hop_reclaim` — `ok:false` from heartbeat means
  **re-CLAIM, not heartbeat**; confirm `claimed:true`. This script reproduces exactly that scar.
- `feedback_task_claim_held_lock_noop_use_heartbeat` — the inverse case (claim on held lock).
  The correct shape is claim-first-then-heartbeat-on-re-entry, which is what `main.md` already says.
