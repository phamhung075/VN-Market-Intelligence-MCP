# FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP is done_verified but the claim is a silent no-op — payload passed as object where the tool requires a string

**Detected:** 2026-07-16T01:20Z, cowork dispatcher, ticks `01:00Z` + `01:15Z`.
**Status:** PLAN-ONLY. **Severity: MED** — not an outage (presence is advisory and never gates), but
(a) cowork sessions are invisible to cross-session presence rosters, and (b) a `done_verified` row
did not fix the thing it closed, so the board believes this is shipped.

**Prior-art check done before filing** (per `feedback_file_prior_art_check_before_minting_row`):
`docs/handoffs/2026-07-15-cowork-preflight-presence-claim-gap.md` describes a **different, now-fixed**
bug (heartbeat-without-claim → fresh-session false-`ERROR`). `TASK_1990` [DONE]. `TE-T21`/`UC-RDL-P4`
[BACKLOG] are unrelated refactors. **No open row covers this.** This is new.

## 1. Ground truth — verified with the WRITE tool, not inferred

`session-presence:d0ec32a5-…` absent from `task_list_held` on two consecutive ticks, while the
dev-team peer's row (`session-presence:69b0312e-…`) is present and heartbeating.

Not a read bug. Claiming it manually with a **string** payload:

```
task_claim(task_id="session-presence:d0ec32a5-…", task_kind="session-presence",
           owner_agent="cowork-dispatcher", owner_client_session="d0ec32a5-…",
           ttl_seconds=1800, payload="{\"agent_id\":\"cowork-dispatcher\",…}")
  → {"claimed": true}                       ← lock was genuinely absent
task_list_held({})  → count 6 → 7, row present, expires 01:50:49Z
```

So: the tool works, the read works, the lock is claimable. **The preflight's claim never persists.**

## 2. Root cause — object vs string, same script, 18 lines apart

`scripts/agents-flow/cowork-tick-preflight.sh`:

```bash
# Step 2 PRESENCE (line 138-140) — SILENTLY FAILS
presence_args=$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" \
  --arg host "$(hostname …)" \
  '{…, payload:{agent_id:"cowork-dispatcher", host:$host}}')     # ← payload = OBJECT

# Step 3 ELECTION (line 157-158) — PERSISTS CORRECTLY
payload_str=$(jq -cn --arg site "fire-election" --arg tick "$tick" '{site:$site, tick:$tick}')
election_args=$(jq -n … --arg payload "$payload_str" \
  '{…, payload:$payload}')                                        # ← payload = STRING
```

The author serialized the payload for the election and inlined a bare object for presence. The
contract is a string — `CLAUDE.md:8`: `payload='{"site":"router","intent":"<intent-key>"}'`; every
row in `task_list_held` stores `payload` as a string. The object fails validation → `presence_rc != 0`
→ **the entire `if [ $presence_rc -eq 0 ]` block is skipped**, including the re-entry heartbeat →
swallowed by the trailing comment *"Transport error on the claim itself falls through here too —
presence never gates."*

**One-line fix**, mirroring Step 3 exactly:
```bash
presence_payload=$(jq -cn --arg host "$(hostname 2>/dev/null || echo unknown)" \
  '{agent_id:"cowork-dispatcher", host:$host}')
presence_args=$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" \
  --arg payload "$presence_payload" \
  '{task_id:$tid, task_kind:"session-presence", owner_agent:"cowork-dispatcher",
    owner_client_session:$sess, ttl_seconds:1800, payload:$payload}')
```

## 3. Why qa went 6/6 green on a no-op — the fix's own design principle hides it

`FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP` (`82d32238b`, qa PASS 6/6, DJ-GATE-1) touched the script
**and** `cowork-tick-preflight.test.sh` (+95). Every presence assertion is about the **verdict**:

```
T3 presence claim transport error -> verdict SILENT, NOT ERROR (was gating)
T3 presence claim transport error -> exit=0 (SILENT)
T3-presence-fresh fresh-session claim -> verdict SILENT (not ERROR)
```

All three pass whether or not the lock lands. The tests stub `mcp_call` (test file lines 89-98) so
they never touch the store, and the property they assert — *presence never gates* — is **exactly the
property that makes a broken claim unobservable at the verdict layer**. There is no assertion of the
form "after preflight, `session-presence:<session>` is held."

**The fix traded a LOUD failure for a SILENT one.** The old bug announced itself with an `ERROR`
verdict every fresh session. The new state is invisible. The verdict is now correct and the mechanism
is dead — strictly worse for detectability. Cf. `feedback_passive_health_masks_dead_data`,
`feedback_fence_false_green`, `feedback_janitor_false_green_verify`.

## 4. Suggested fix scope (po/dev-team own this)

1. **The one-line payload fix** above.
2. **Add the missing assertion** — after a preflight run, assert `session-presence:<session>` is
   actually held. Requires a test that reaches the real store (or a mock that records claim args and
   asserts the payload is a string). Without it this regresses silently again.
3. **Reopen `FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP` or mint a follow-on** — it is `done_verified`
   against a mechanism that never worked. Board integrity: `done_verified` should not survive this.
4. **Class sweep — worth one row:** grep every `task_claim` call site for `payload:{…}` object
   literals. The two shapes coexisting 18 lines apart in one script suggests the string contract is
   not enforced anywhere. If the tool rejected malformed payloads *loudly* instead of letting callers
   swallow the rc, this would have surfaced in one tick.

## 5. Honest limits

- **Impact is genuinely small.** Presence is advisory (`main.md:144` "Always proceed — presence
  result is NEVER a gate"; presence-row expiry is liveness GC, never orphan-signal). Nothing
  published wrong, no tick mis-fired, no lock leaked. The cost is cross-session observability:
  a peer running the Phase A.5 presence roster cannot see cowork sessions.
- **Not verified:** that the tool's schema *rejects* object payloads — inferred from
  (claim-with-string ⇒ `claimed:true`) + (preflight-with-object ⇒ no lock) + rc-guard structure.
  A direct object-payload `task_claim` would confirm the error text. I did not run it: it would
  have overwritten the presence row I had just legitimately claimed.
- **My manual claim is a workaround, not a fix** — it expires 01:50:49Z and the next preflight will
  fail to renew it (the heartbeat is inside the skipped rc-guard), so presence goes dark again.
