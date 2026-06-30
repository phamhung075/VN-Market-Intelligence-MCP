# Confirmed double-publish — chef-morning + chef-intraday (2026-06-30 05:15Z tick)

**Reporter:** cowork-team dispatcher (main terminal), RAW-verified against MARKET channel
**Severity:** MEDIUM (user-facing redundant MARKET post; blocks cowork-team cron AC-6 "zero double-publish")
**Owner (suggested):** dev-mcp-server (cadence/pressure logic) + unified-agent flow (chef.md conditional-intraday)

## Evidence (RAW, not agent self-report)

`get_unreviewed_market_messages` confirms two near-duplicate CHEF dishes on MARKET, 57s apart:

| MARKET id | sent_at (UTC) | slot | content overlap |
|---|---|---|---|
| 920 | 2026-06-30 05:24:47 | chef-morning | VN-Index +3.55→1858.52, gold −48.90→4001.90, banking VCB/BID/CTG/VPB, RE VIC/VHM/KBC, VNM RSI 26.5, Quẻ 15 Khiêm, yield 7.05% vs 5% |
| 921 | 2026-06-30 05:25:44 | chef-intraday | banking VCB/BID/CTG/VPB Q2, RE Vingroup/Vinhomes, gold −48.9 risk-off, oil GAS +380%, USD/VND 26.106 |

Both valid (not fabricated) but substantially overlapping — reads to a user as two market briefings within one minute.

## Root cause (two independent gaps, both required for the double-post)

1. **stale_warning → legacy fallback bypassed the cadence gate.**
   At dispatch Step 4.2, `pressure-state.json.stale_warning == true` (value from the 05:09 emit). Per AC-P1-6-3 this forces `PRESSURE_MODE = legacy`, which skips Steps 4.3–4.5. In **adaptive** mode, Step 4.4 `evaluateCadence("chef-intraday", calendar="off-market", …)` → no policy row matches `off-market` → default `interval_minutes=240`; elapsed since last_fired (04:17:36) was only ~62 min < 240 → chef-intraday would have been **cadence-suppressed**. Legacy mode removed that suppression, so chef-intraday fired off its raw 05:13 cron tick.
   - NOTE: the *same* tick's Step 6.0 `emit_pressure_state` recomputed `stale_warning=false` — so the flag is **transiently** true, not permanently stuck. The transience is enough to non-deterministically flip mode and produce this double-post. Investigate why `emit_pressure_state` set `stale_warning=true` at 05:09 and false at 05:24 (~15 min apart, similar inputs).

2. **No same-tick CHEF mutual-exclusion.** Even under legacy mode, neither safety net deduped the pair:
   - Published-marker scheme keys the two slots **differently** — `published:chef-morning:2026-06-30` vs `published:chef-intraday:2026-06-30:12` (hour-bucketed) — so they are distinct "content identities" and never collide.
   - chef-intraday's conditional-intraday logic did **not** detect that the guaranteed morning dish published 0–1 min earlier and self-skip; it found 3 qualifying clusters and posted.

## Why it surfaces ~once/day

chef-intraday cron `13 2-8 * * 1-5` and chef-morning cron `15 5 * * 1-5` both floor to the **05:15** nominal tick once per weekday morning (the 05:13 intraday tick coincides with the 05:15 morning boundary). On every other intraday hour there is no morning slot to collide with.

## Recommended fixes (dev-team to evaluate; not prescriptive)

- **A (preferred, robust):** same-tick CHEF mutex — when a guaranteed chef slot (chef-morning) is in MATCHES for a tick, suppress non-guaranteed chef-* slots for that same tick regardless of pressure_mode. Closes the gap even when legacy mode is (correctly) active.
- **B:** chef-intraday self-skip guard — before posting, check whether a superseding chef dish published within the last N minutes (query MARKET / published markers across sibling chef slots, not just its own key) and self-skip.
- **C (root of gap 1):** stabilize `emit_pressure_state.stale_warning` so it doesn't transiently flip true and force legacy mode under normal conditions.

## Verification criteria for the fix

- On the next weekday 05:15Z tick (chef-morning + chef-intraday coincidence), MARKET receives exactly **one** CHEF dish.
- Forcing `stale_warning=true` no longer causes a second chef-* MARKET post at the same tick.

## Dispatch telemetry for this tick
`docs/signals/cowork-team-20260630T052439Z.json` (classification=FIRE, pressure_mode=legacy, matched_slots=[chef-morning,chef-intraday]).

## Update — 2026-06-30 06:21Z: confirmed `stale_warning` mechanism (live dispatcher observation)

During the 06:15Z **silent** tick, `emit_pressure_state` returned `stale_warning: true` again — this time NOT mid-chef-run but after ~57min of quiet (no `cycle_snapshot_promoted` since the 05:24Z chef run). This pins down the mechanism behind root-cause gap 1:

- `stale_warning` tracks **cycle-snapshot age vs `_staleness_threshold_minutes=20`** (`cadence-policy.json`).
- In quiet off-market / low-cadence windows no agent runs → no snapshot promotion → snapshot ages past 20min → `stale_warning=true` on the next emit. It self-corrects to `false` the instant any agent (e.g. a chef run) promotes a fresh snapshot.
- The flag is therefore **deterministic, not random** — true whenever >20min elapses without a snapshot refresh.

**Implication for the fix:** suppressing `stale_warning` (recommended fix C) is the WRONG lever — the flag is correctly reporting stale data. The robust fix is **A (same-tick CHEF mutex)**: legacy mode must still dedupe guaranteed-vs-conditional chef slots within one tick, because legacy mode WILL be entered legitimately whenever pressure data is stale. The double-publish is a property of legacy-mode **cadence-bypass**, not of the `stale_warning` flag.

**Today's sequence (no double-publish — the 05:15 coincidence tick had already passed):**
- 05:24Z chef run → snapshot promoted → `stale_warning=false`. Ticks 05:30–06:15 all ran **adaptive** with the cadence gate active; at 06:15 chef-intraday was correctly cadence-suppressed (elapsed 3379s < 3600s).
- 06:21Z emit → snapshot now ~57min old → `stale_warning=true` → the **06:30Z tick will read legacy mode**. 06:30 has no cron match (no risk); the next chef match is 07:13, genuinely due (elapsed ~109min > 60min) → one legitimate intraday dish, no collision.

## CORRECTION — 2026-06-30 06:51Z: the 06:21Z mechanism claim above is FALSIFIED (retracted)

**RAW evidence contradicting the cycle-snapshot-age hypothesis (observed live across three consecutive silent-tick emits):**

| emit wall-time | gap since previous `emitted_at` | `cycle_snapshot_promoted` | `cycle-snapshot.promoted_at` | snapshot age | returned `stale_warning` |
|---|---|---|---|---|---|
| 06:21:10Z | ~57 min (prev = 05:24Z) | false | null | ~57 min | **true** |
| 06:36:26Z | ~15 min (prev = 06:21Z) | false | null | ~72 min | **false** |
| 06:51:29Z | ~15 min (prev = 06:36Z) | false | null | ~87 min | (false — adaptive) |

The cycle-snapshot got **monotonically more stale** (57→72→87 min, never promoted, `promoted_at` stayed null) yet `stale_warning` flipped **true→false**. A cycle-snapshot-age predicate would have kept it `true`. **So the "stale_warning tracks cycle-snapshot promotion age vs 20min" claim in the 06:21Z section above is wrong — I retract it.**

**Better-fitting hypothesis (inference from 3 data points — dev-team MUST confirm against the `emit_pressure_state` source, do not trust this black-box read):** `stale_warning` tracks **pressure-state emit recency** — roughly `(now − previous pressure-state.emitted_at) > _staleness_threshold_minutes(20)`. The two `true`/`false` outcomes fit the inter-emit gap (57min→true, 15min→false) far better than snapshot age.

**Operational root cause this implies (more actionable than the original gap-1 framing):** `stale_warning` goes `true` when **pressure-state emits become sparse (a >20min gap)** — which happens precisely when **silent ticks skip the mandatory Step 6.0 `emit_pressure_state`**. The 57min gap behind the 06:21Z `true` lines up with ticks 05:30/05:45/06:00 not having emitted. When every tick (silent included) runs Step 6.0 — as the flow mandates and as the dispatcher did at 06:30/06:45 — emit recency stays fresh and `stale_warning` stays `false`, keeping adaptive mode (cadence gate) active. **The spurious legacy fallback is therefore likely a self-inflicted artifact of skipping Step 6.0 on silent ticks, not a property of the market data being stale.**

**Fix recommendation is UNCHANGED — fix A still stands, and a fix D is added:**
- **A (same-tick CHEF mutex)** remains the robust closer regardless of which mechanism is real — legacy mode (however entered) must still dedupe guaranteed-vs-conditional chef slots within one tick.
- **D (new, cheap, addresses the corrected root cause):** guarantee Step 6.0 `emit_pressure_state` fires on **every** tick including silent ones (it is already specified as un-skippable in `telemetry.md` Step 6.0) — this alone keeps `stale_warning` honest and prevents the spurious legacy fallback that opens the double-publish window.
- **C (suppress `stale_warning`)** remains the wrong lever; the flag is a useful staleness signal, just not the one the 06:21Z section described.
