# alert-commander-market runs at 240 min instead of 15 — dangling `policy_id` silently absorbed as the AC-P1-1-3 safe default

**Detected:** 2026-07-16T03:18Z by cowork-team dispatcher (tick 03:15Z, SILENT), investigating 5 consecutive silent ticks during VN market hours
**Status:** PLAN-ONLY — no fix attempted. Router/dispatcher does not implement.
**Severity: HIGH — partial regression of `FIX-ALERT-COMMANDER-DEAD-NO-SLOT` (2026-07-03, severity HIGH). The agent is not dead; it runs at 1/16 of its specified rate on the latency-sensitive path.**

## One-line

`cowork-schedule.json` points `alert-commander-market` at `policy_id: "alert-commander-market"`, which **does not exist** in `cadence-policy.json`. `evaluateCadence` absorbs the dangling reference via the AC-P1-1-3 safe default → **240 min**. The slot's specified cadence is **15 min**.

## Verified chain — every link is document- or execution-backed

| # | Link | Evidence |
|---|---|---|
| 1 | **Intent = 15 min** | `docs/agent-memory/decisions/sprint-FIX-ALERT-COMMANDER-DEAD-NO-SLOT.md` L23-26: "Cron: `*/15 2-8 * * 1-5`… **Cadence: 15 minutes**… **Policy: alert-commander-market**" |
| 2 | **Config references the policy** | `docs/data/cowork-schedule.json:456` → `"policy_id": "alert-commander-market"` |
| 3 | **Policy does not exist** | `grep -c "alert-commander" docs/data/cadence-policy.json` → **0**. `.policies` is a 19-element array defining only `gatherer-standard`, `chef-intraday`, `bctc-offmarket`. |
| 4 | **Dangling ref → 240** | `scripts/agents-flow/cadence-policy.js:71` — `// No matching rule → safe default (AC-P1-1-3…)` `return { interval_minutes: 240, _cron_fallback: false };` |
| 5 | **Runtime confirms** | `evaluateCadence("alert-commander-market","unknown","medium","low", loadCadencePolicy())` → **`interval_minutes: 240`** (executed 03:18Z) |
| 6 | **Observed behavior matches** | `last_fired: 2026-07-16T02:07:38Z`; ticks 02:15/02:30/02:45/03:00/03:15 all `slots: []`. 70 min elapsed vs 240 gate → not due. Next fire ≈ **06:07Z**. |

## The sharp edge — a missing policy is WORSE than no policy

`docs/REQ_DYN-WF-PHASE1.md`:

- **FR-P1-2 (L93):** *"`policy_id` … references a policy in `cadence-policy.json`. **If absent or null → slot uses legacy cron matching only** (backward-compatible default)."*
- **AC-P1-1-3 (L85):** *"Policy lookup with no matching rule → falls back to `interval_minutes=240` (safe default, never `null` for an unmatched rule)."*

So:

| slot config | effective cadence |
|---|---|
| **no** `policy_id` | cron → **15 min** ✅ |
| `policy_id` → **existing** policy | that policy's interval ✅ |
| `policy_id` → **non-existent** policy | **240 min** ⚠️ silently |

**Deleting the `policy_id` line would make this slot 16× faster.** AC-P1-1-3's default is correct for an *unmatched rule inside a real policy* (tier combo not covered). It is being asked to absorb a *config error* — a reference to a policy that was never authored — and it does so silently, with no warn, no fail-loud, no startup validation.

## Root cause — the 07-03 sprint declared two policies and never created them

`sprint-FIX-ALERT-COMMANDER-DEAD-NO-SLOT.md` § Affected Files (L54-57):

```
- docs/data/cowork-schedule.json (add 2 slots)
- docs/data/system-map.json (update sender_rules text)
- docs/agent-memory/decisions/sprint-...md (this file)
```

**`docs/data/cadence-policy.json` is not on the list.** The decision journal specifies `Policy: alert-commander-market` and `Policy: alert-commander-critical` (L26, L34) as if authoring them were part of the change. They were never added.

Its § Verification (L48-52) checked: JSON validity, both slots present via `jq`, system-map text, `last_fired` sentinel. **It never checked that the referenced policies resolve.** That is the process gap that let this ship — the same class as the row already on the board: `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` (dispatch-success ≠ delivery proof).

## Blast radius — one slot, not two

| slot | specified | effective | verdict |
|---|---|---|---|
| `alert-commander-market` | 15 min (`*/15 2-8 * * 1-5`) | **240 min** | ⚠️ **16× degradation** |
| `alert-commander-critical` | 240 min (`0 */4 * * *`) | 240 min | ✅ benign — intent coincides with the default |

Only the market slot is harmed. Its stated purpose (decision journal L22) is *"Catch position-danger and watchlist-opportunity events during market hours"* — the most latency-sensitive path in the fleet. The 6-hour market window (02:00-08:59Z) admits **~2 fires instead of ~24**.

## What is NOT established — do not overstate this

- **No missed alert has been demonstrated.** The slot is event-driven with all-condition (AND) gates and silent exit is normal and correct (decision journal L27). A suppressed *tick* is not a suppressed *alert*. This handoff establishes **exposure/latency**, not proven loss: a position-danger event can now go unsurfaced for up to 4 h instead of ≤15 min.
- **Whether any real event fell in a gap is unknown** and would need a cross-check of alert-eligible events against the fire windows since 2026-07-03.
- **The adaptive/legacy interaction is unverified here.** Per `reference_isstale_stale_warning_forces_legacy`, a stale pressure emit forces *legacy* (fixed-cron) mode, which would bypass the policy and restore 15 min. Tick 02:15Z ran **adaptive** (`isStale=false`, emit age 11.2 min), so the 240 gate is live now. **Hypothesis worth checking, not asserted:** healing the emitter (`FU-PRESSURE-EMIT-DARK`, lane `done`) may be what *activated* this degradation, meaning it would have been masked whenever the emitter was dark. Triage should confirm before building on it.

## Prior art checked — nothing to dedup against

- Board scanned across all lanes (`backlog, ready, in_progress, review, qa, done, done_verified`) for `cadence|policy_id|alert-commander|CADENCE` → **no row covers a dangling policy reference.**
- Nearest neighbours, all distinct:
  - `FIX-CADENCE-COWORK-DUP-MARKET-WATCHER` — cron *overlap* double-fire, not a missing policy.
  - `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` — `last_fired` bumped on dispatch not delivery; **same family** (a gate satisfied by the wrong evidence) but a different mechanism.
  - `FU-PRESSURE-EMIT-DARK` [done] — emitter dark → fleet fell back to legacy cron. Relevant to the hypothesis above.
  - `FEAT-SEVERITY-OVERRIDE-SURFACING` [backlog] — references `FIX-ALERT-COMMANDER-DEAD-NO-SLOT` as its pair; that sprint is the one being partially regressed here.
- `FIX-ALERT-COMMANDER-DEAD-NO-SLOT` exists only as a completed decision journal + `docs/signals/router-alert-commander-dead-20260703.md`; **no open board row.**

## Suggested next step (dev-team / po triage — router does not implement)

1. **Fix the instance** — author the two missing policies in `docs/data/cadence-policy.json`: `alert-commander-market` at `interval_minutes: 15`, `alert-commander-critical` at `240`, matching the decision journal. (Alternatively delete `policy_id` from the market slot to fall back to cron — but that discards tier-awareness and is a workaround, not the fix.)
2. **Fix the class — this is the definitive part.** A dangling `policy_id` must not be silently absorbed. Options, in preference order:
   - **Validate at load:** `loadCadencePolicy` / matcher startup asserts every `policy_id` in `cowork-schedule.json` resolves to a rule in `cadence-policy.json`; unresolvable → fail-loud per `docs/protocols/fail-loud-protocol.md`.
   - **Distinguish the two cases in `evaluateCadence`:** "policy exists but no rule matched this tier combo" (→ 240 is genuinely safe) vs **"policy_id not found at all"** (→ config error; warn + fall back to *cron*, matching FR-P1-2's absent-policy behavior, so a typo degrades to the documented default rather than to 16× slower).
   - Note AC-P1-1-3's DV test (`REQ_DYN-WF-PHASE1.md:86`) asserts the unmatched-rule path only; a new AC for the unresolvable-policy path is needed or the fix will regress.
3. **Sweep for other dangling refs** — diff `[.slots[].policy_id]` against `[.policies[].policy_id]` and add that diff as a standing check. Today only the two alert-commander ids dangle, but nothing prevents the next one.
