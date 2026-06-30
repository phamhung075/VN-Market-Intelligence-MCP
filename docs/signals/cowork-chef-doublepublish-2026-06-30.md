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

## DATA POINT — 2026-06-30 07:24Z: emit-gap predicate ALSO does not cleanly fit (4th observation)

Live `emit_pressure_state` at the 07:15Z tick (processed 07:24:15Z) returned **`stale_warning=true`**, `cycle_snapshot_promoted=false`. Updated table:

| emit time | prev `emitted_at` | emit gap (min) | snapshot promoted | snapshot age | `stale_warning` |
|---|---|---|---|---|---|
| 06:21:10Z | 05:24Z | ~57 | false | ~57 | **true** |
| 06:36:26Z | 06:21:10Z | ~15.3 | false | ~72 | false |
| 06:51:29Z | 06:36:26Z | ~15.1 | false | ~87 | false |
| 07:05:24Z | 06:51:29Z | ~13.9 | false | ~102 | false |
| 07:24:15Z | 07:05:24Z | **~18.85** | false | ~121 | **true** |

**This 18.85min gap → `true` breaks the "clean 20min emit-gap" hypothesis** from the 06:51Z correction (a 20min threshold predicts `false` at 18.85min). And snapshot-age was already ruled out (false at 72/87/102min). **Neither simple predicate fits all five points.** The true threshold appears to sit between ~15.3 (false) and ~18.85 (true) min — lower than 20 — OR the predicate is composite, OR the server clock differs by a couple minutes from wall-clock. **dev-team MUST read the `emit_pressure_state` source; do not build a fix on any black-box emit-gap guess including this one.**

**Why the gap stretched to 18.85min even though every tick emitted (sharpens fix D):** the 07:00Z and 07:15Z ticks BOTH ran the mandatory Step 6.0 emit, yet the emits landed at 07:05 and 07:24 — ~19min apart — because each fire processes some minutes after its nominal tick (processing-latency jitter: +5min then +9min on a 15min cadence → 15+4=19min emit-to-emit). **So fix D ("emit on every tick") is necessary but NOT sufficient** if staleness is emit-gap-based with a ~20min (or tighter) threshold: consecutive late fires can cross it with no skipped tick. **Robust corollary to fix D:** measure staleness against the **nominal `tick_id`** (15min apart by construction) rather than wall-clock `emitted_at`, OR widen the threshold to comfortably exceed (cadence 15min + worst-case per-tick processing jitter). **Fix A (same-tick CHEF mutex) remains the unconditional closer** — it does not depend on resolving this predicate at all.

**Operational impact today: none.** This `stale_warning=true` will push the 07:30Z tick into legacy mode, but 07:30 has no cron match; the only same-tick chef-morning+chef-intraday coincidence (the actual double-publish trigger) is the 05:15Z tick, already passed. The last intraday cron today is 08:15Z with no morning slot to collide with → no AC-6 risk for the remainder of 2026-06-30.

**RAW-confirmed single dish (post-spawn verification, 07:26Z):** `get_unreviewed_market_messages` shows MARKET **id 923** @ 07:25:59Z as the *only* chef dish for the 07:15Z tick (VIC +1.1%, banking VCB/BID/CTG, gold −2.96σ, USD/VND 26106, VNM oversold — real content, not fabricated). No sibling chef post within the window. This bounds the defect empirically: even under the conditions that *would* trigger legacy mode next tick, a non-collision intraday tick produces exactly one dish. The double-publish is a property of the **05:15Z guaranteed+conditional same-tick coincidence** (ids 920+921), not of legacy mode or chef behavior in general — which is why **fix A (same-tick CHEF mutex)** is the targeted closer.

## DATA POINT — 2026-06-30 08:07Z: silent-fast vs FIRE-late emit gap trips staleness (6th observation, tightest bracket + clean cause)

Live `emit_pressure_state` at the 08:00Z tick (a **FIRE** tick — `news-scout-offhours` + `market-watcher-offhours`, both due on the `0 */4` offhours cadence) returned **`stale_warning=true`**, `cycle_snapshot_promoted=false`. Extended table (gap = wall-clock between consecutive `emitted_at`):

| emit time | prev `emitted_at` | emit gap (min) | tick type | `stale_warning` |
|---|---|---|---|---|
| 07:36:08Z | 07:24:15Z | ~11.9 | silent | false |
| 07:50:28Z | 07:36:08Z | ~14.3 | silent | false |
| 08:07:29Z | 07:50:28Z | **~17.0** | **FIRE (2 spawns)** | **true** |

**Tightens the threshold bracket to [~15.3 false → ~17.0 true]** (was [15.3 → 18.85]) — strongly implying the staleness cutoff is **≈16 min, well below 20**. This is the **cleanest instance yet of the fix-D-insufficiency mechanism** from the 07:24Z section, and it pins the *cause* concretely: the 08:00Z tick emitted **~7.5 min past nominal** because it did real work (claim 2 slot tokens, `get_cycle_bootstrap` + `get_macro_snapshot`, spawn 2 background agents, atomic `last_fired` write), while the prior 07:45Z **silent** tick emitted fast (~5 min past nominal). **silent-fast → FIRE-late emit timing = ~17 min apart on a nominal 15 min cadence, with ZERO skipped ticks.** Every tick ran the mandatory Step 6.0 emit, yet staleness still tripped — re-confirming **fix D ("emit every tick") is necessary but NOT sufficient.** The corollary is now twice-evidenced: **key staleness on the nominal `tick_id` (15 min apart by construction), not on wall-clock `emitted_at`** — OR widen the threshold to exceed `cadence(15) + worst-case fire-tick processing jitter(~8)`. **dev-team MUST still confirm against the `emit_pressure_state` source — black-box read.** **Fix A (same-tick CHEF mutex) remains the unconditional closer.**

**Operational impact today: none.** This `stale_warning=true` pushes the 08:15Z tick into legacy mode, but at 08:15Z **only chef-intraday matches** (cron `13 2-8`; the chef-morning `15 5` guaranteed slot does NOT match) — no guaranteed+conditional same-tick coincidence → at most one dish → **no AC-6 double-publish risk**. 08:15Z is the last intraday cron of 2026-06-30.

**Recovery confirmed (08:15Z emit) — staleness SELF-HEALS within one tick.** The very next tick's emit at **08:21:20Z** (gap from 08:07:29Z = **~13.9 min**, back below the ~16 min cutoff) returned **`stale_warning=false`**. So one late FIRE tick poisons **exactly one** following tick (which reads legacy), then the flag clears on the next emit. **Blast radius = 1 tick, non-cascading, self-recovering** — which caps the *severity* of the fix-D gap at LOW (a transient single-tick legacy-mode flip, never a stuck-legacy state). The danger is therefore narrow but real: it bites only if the *single poisoned tick* happens to be a guaranteed+conditional CHEF coincidence (e.g. the 05:15Z morning+intraday overlap) where legacy mode skips cadence/mutex suppression. Today's poisoned tick (08:15Z) was not such a coincidence → zero impact. **Fix A (same-tick CHEF mutex, suppression-mode-independent) still required** precisely because it closes the case regardless of which mode the poisoned tick lands in.
