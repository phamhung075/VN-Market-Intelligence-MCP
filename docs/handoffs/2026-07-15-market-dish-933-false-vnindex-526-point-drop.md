# MARKET dish 933 published a false "VN-Index lost 526 points" — the duplicate is materially WRONG, not a benign repeat

**Detected:** 2026-07-15T20:47Z by cowork-team dispatcher (tick 20:30Z), RAW-verified against the
live MARKET store.
**Status:** PLAN-ONLY — no fix attempted, **nothing deleted from MARKET** (outward-facing; needs
user sign-off per `feedback_chef_releases_published_marker_enables_peer_double_publish`).
**Severity: HIGH — user-facing misinformation, currently live and unreviewed.**

## 1. The claim, verified

`get_unreviewed_market_messages({limit:6})` → id **933**, `from_agent: mcp-user`,
`sent_at: 2026-07-15 19:56:07`, `verdict: null` (unreviewed):

> "Thị trường đang chịu áp lực bán ròng từ khối ngoại, đặc biệt tập trung vào FPT (tech sector),
> với **VN-Index mất 526 điểm** từ mức trước."

*"…with VN-Index losing 526 points from the previous level."*

**Ground truth, same day:** VN-Index **1782.12, −25 pts, −1.36%**, `source_tier: 2`
— confirmed twice: `get_market_snapshot` (probed 20:0xZ, tick 20:00Z) and MARKET
`morning-briefing` id 928 ("📈 VN-Index: 1.782 (-25 / -1.36%)").

A 526-point drop would be **~29% in one session**. It did not happen. This is false, in the
user-facing channel, in plain Vietnamese, unreviewed.

## 2. The duplicate is the corrupted one — this is new information

Today's double-publish is already tracked (`UC-CCA-P3`, P0, cites "ids 932+933"). What that row
records is *duplication*. It does not record that the two dishes **differ in correctness**:

| id | sent_at | content | VN-Index treatment | verdict |
|---|---|---|---|---|
| **932** | 19:52:17 | "Thị trường hôm nay **giảm nhẹ** … VN-Index xuống mức thấp ba tháng" | no number cited; "slight decline" — **consistent with the real −1.36%** | **clean** |
| **933** | 19:56:07 | "…**VN-Index mất 526 điểm** từ mức trước" | cites the −526 artifact as fact | **FALSE** |

So the marker-release defect did not merely repeat a good dish. It let a **second, worse** dish
through — one that contradicts both reality and its own predecessor. Publishing 933 was strictly
harmful, independent of duplication.

This raises UC-CCA-P3's stakes: its impact line should read *"caused a user-visible duplicate **that
published a false ~29% index move**"*, not just *"double-publish"*.

### 2a. CORRECTION 2026-07-15T20:55Z — "the duplicate is the corrupted one" is WRONG

<!-- Corrected in place, not deleted: the reasoning error below is the point. -->

The § 2 heading and the table's "clean" verdict for 932 imply the two dishes were built on
**different data**, and that duplication is what let the bad figure through. **Both implications are
false.** The synthesis file each run wrote is preserved in git, and they can be compared directly:

| Run | cycle_id | wrote dish | `market_context.vn_index` | `vn_index_delta` |
|---|---|---|---|---|
| 1 (cowork-dispatched) | `evening-2026-07-15T19:45:00Z` (HEAD `f5b700ec1`) | **932** @19:52:17 | **1280.5** | **−526.13** |
| 2 (peer-router) | `evening-2026-07-15T19:55:20Z` (working tree) | **933** @19:56:07 | **1280.5** | **−526.13** |

`git show HEAD:docs/data/unified-agent-synthesis-2026-07-16-evening.json | jq .market_context` vs the
working-tree copy — **byte-identical macro block**. Both runs also self-reported
`quality_verdict: "degraded"`.

**What this changes:**

1. **932 is clean by narration accident, not by data.** It held the same false VN-Index and simply
   did not quote it. It is not evidence of a healthy path.
2. **Deduplication would NOT have prevented this.** With one evening dish instead of two, whether
   the false figure reached users is a coin flip on how that run chose to narrate. `UC-CCA-P3` is
   still P0 on its own merits, but **fixing it does not fix this.** These are two independent
   defects, and § 6's ordering is what matters — the plausibility gate (item 3) is the one that
   actually stops the false claim.
3. **§ 3's sentence "Dish 932 evidently narrated from the former [tier-2]; 933 leaked the latter" is
   retracted.** Neither dish ever saw a tier-2 VN-Index. The corruption sits upstream of both, in the
   synthesis's own `market_context.vn_index` — which, despite sharing a name with
   `get_market_context()` (that returns the real 1782.12 at `source_tier: 2`), is a **different
   field built from the tier-4 macro path**. A name collision hid this.

### 2b. NEW — run 2 CLOBBERED run 1's synthesis file (same double-dispatch, worse blast radius)

Both runs write the **same path**, keyed `date_vn` + `dish_type` — **not** `cycle_id`:
`docs/data/unified-agent-synthesis-2026-07-16-evening.json`.

Run 1's synthesis survives **only because it was committed (`f5b700ec1`) before run 2 overwrote it**.
Had the commit landed seconds later, run 1 would be unrecoverable and the § 2a comparison above —
the evidence that corrects this very handoff — would not exist.

This is the predicted failure. After the tnb-audit near-miss (where the **Edit** tool's stale-read
check blocked a concurrent notebook clobber), the open question was what happens to an agent holding
**Write**, which has no such check. `unified-agent` holds `Write`. This is the answer: **silent
full-overwrite, no collision reported by either run.** Same day, same double-dispatch class, no luck
of the editor to save it. See `2026-07-15-tnb-audit-double-dispatch-unreachable-marker-gate.md`.

Cheap mitigation for triage to consider: key the synthesis filename by `cycle_id` (already in
`metadata`), so concurrent runs cannot collide on one path.

## 3. Provenance of the bad number

`docs/data/cycle-snapshot-20:21.json` → `macro_snapshot`:

```
vnIndex             = 1280.5
vnIndex_is_estimate = true
vnIndex_source_tier = 4          # lowest tier
vnIndexDelta        = -526.13
prevFetchedAt       = null       # ← delta computed against nothing
```

`1782.12 − 1280.5 ≈ 501.6`; the reported `−526.13` is an **estimate-vs-real-level artifact**, not a
day-over-day move. `prevFetchedAt: null` means the delta had no baseline to be a delta *of*.

Chef's own reasoning carried it verbatim — `docs/agent-memory/notebooks/unified-agent.md`:

- L51: "Macro context: VN-Index 1280.5 (down -526.13 from ref) … Carry regime UNKNOWN (is_estimate=true)"
- L68: "Macro context: VN-Index 1280.5 (down -526pp)"

Two source planes disagreed by 29% in the same cycle and nothing compared them:
`market_context` (tier 2, 1782.12, real) vs `macro_snapshot` (tier 4, 1280.5, estimate). ~~Dish 932
evidently narrated from the former; 933 leaked the latter.~~

> **RETRACTED (see § 2a).** The struck sentence was an inference, not a probe. Both runs' synthesis
> carried the tier-4 value; **neither dish ever saw the tier-2 plane.** The two-planes-disagree
> observation stands — the attribution of one dish to each plane does not. The word "evidently" was
> doing the work a `git show` should have done.

**`source_tier` is exactly the field that separates them** — the same field the reverted
alert-commander "self-heal" would have discarded by reusing the snapshot's bare-string
`market_context` (see `2026-07-15-alert-commander-self-edits-flow-doc-out-of-boundary.md` § 3).
That near-miss and this live defect are the same blindness, one tick apart.

## 4. Credit + correction — TNB found it first, and was half wrong

`tran-ngoc-bau` (cycle c110) raised **F-VNINDEX-ESTIMATE-IMPLAUSIBLE-DELTA (MED-HIGH, NEW)** and
routed it to po at `docs/signals/tnb-20260715T202140Z.json`. Its snapshot-file forensics are
**correct and are the origin of this finding** — it identified tier-4/is_estimate/prevFetchedAt:null
unaided. Do not re-mint it; this handoff **corrects and confirms** it.

Two corrections, both traceable to TNB being MCP-blind (14 consecutive cycles — see
`2026-07-15-tnb-audit-double-dispatch-unreachable-marker-gate.md`):

1. **"Both of today's double-fired evening dishes cite 1280.5" — FALSE for 932.** 932 cites no
   index number and is narratively consistent with the real −1.36%. Only **933** carries it.
2. **TNB could not know whether it reached MARKET.** `read_telegram_reports` was unavailable to it,
   so "the dishes cite" was inferred from `unified-agent.md`'s internal *Macro context* line — the
   chef's reasoning, not its published output. The inference happened to be half-right. **This
   handoff supplies the missing RAW step:** the number is in the live MARKET store, in 933 only.

The severity moves **MED-HIGH → HIGH** on the strength of that confirmation: not "chef reasoned on a
bad figure" but "a false crash claim is live to users."

*Method note:* the first probe here used `read_telegram_reports`, which returned the **WORK**
channel (analysis-agent BCTC rows) and grepped clean for "526". That empty grep was **not**
evidence — wrong store, exactly `feedback_empty_read_is_not_evidence_confirm_tool_targets_store`.
`get_unreviewed_market_messages` is the MARKET store, and it found the string immediately.

## 5. Board dedup — checked (do NOT mint duplicates)

| Row | Lane | Relation |
|---|---|---|
| `UC-CCA-P3` | BACKLOG (P0) | owns the double-publish. **Enrich impact line per § 2** — do not mint a new dup row. |
| `CI-FRESH-01-FIX` | BACKLOG | "Is vnIndexRefresh running every 5min during market hours" — **plausible root cause**: if the refresh is dead, `macro_snapshot.vnIndex` serves the tier-4 fallback. Check this first; the fix may already be specced. |
| `FU-MACRO-SNAPSHOT-TIER-WORSTOF` | BACKLOG | `get_macro_snapshot` wrapper tier should be worst-of(carry,yield) — adjacent, does not cover vnIndex. |
| `FIX-MACRO-CARRY-YIELD-ESTIMATE-FLAG` | BACKLOG | is_estimate mis-flagged for carry/yield — same family, different field. |
| `MD-FUNC-01-FIX` | BACKLOG | get_market_snapshot VN-Index fields — the *tier-2* path, which was correct today. |

No row covers "a tier-4 estimate reached MARKET as fact with no plausibility gate."

## 6. Suggested next step (po triage)

1. **Decide on dish 933** — it is live and unreviewed. Deleting/correcting a user-facing MARKET
   message is **not** a router or agent decision (`feedback_chef_releases_published_marker_enables_peer_double_publish`).
   A correction post may be warranted given the claim is a fabricated 29% crash. **User sign-off
   required.** Interim, zero-risk option available to any reviewer:
   `review_market_message({id:933, verdict:"noise", note:"false VN-Index -526pt claim; tier-4 estimate artifact"})`
   — this labels it without touching what users already received.
2. **Root-cause the estimate path** — start at `CI-FRESH-01-FIX` (is vnIndexRefresh alive?). If the
   refresh is dead, every downstream `macro_snapshot` consumer has been reading 1280.5, not just chef.
3. **Add the plausibility gate** — a same-cycle cross-plane check (`macro_snapshot.vnIndex` vs
   `market_context` tier-2 price) diverging >5% must gap-token, never narrate. Precedent exists:
   `BAL-1f` / `FU-DE-SERVE-HONEST` added exactly this shape of implausible-value guard on the BCTC
   side. Related: `feedback_nonzero_values_need_plausibility_check`,
   `feedback_composite_score_masks_dead_detector_pruned_table`.
4. **A delta against `prevFetchedAt: null` must not be emitted at all** — it is not a delta.

## 8. ⚠️ RETRACTED 2026-07-16T02:25Z — DO NOT ACT ON § 8 OR § 8.1. See § 8.2 for what is actually true.

> **§ 8 and § 8.1 below are WRONG and are kept only for provenance.** Their central claim — that
> `vnIndexDelta` is a "null-baseline artifact" that "must not be emitted" — is false. The delta is
> **correct**: it is `current − prior_session_close`. `prevFetchedAt: null` is a cosmetic reporting
> gap, not a missing baseline. **§ 6.4 rests on the same false premise and should be closed, not
> raised.** Read § 8.2 first. Do not build a guard from § 8/§ 8.1.

## 8. UPDATE 2026-07-16T02:10Z — the artifact MUTATED: loud → silent. § 6.4 just got harder to catch. [RETRACTED — see § 8.2]

Re-probed live at tick 02:00Z (`get_macro_snapshot`, VN market open). **The tier-4 vnIndex poison is
gone; § 6.4 is not.**

| field | 2026-07-15 20:21Z (§ 3) | 2026-07-16 02:05Z (now) |
|---|---|---|
| `vnIndex` | 1280.5 | **1782.12** |
| `vnIndex_is_estimate` | true | **false** |
| `vnIndex_source_tier` | 4 | **1** |
| `vnIndexDelta` | **−526.13** | **0** |
| `vnIndexDirection` | (n/a) | **"flat"** |
| `prevFetchedAt` | **null** | **null** ← unchanged |

**What was fixed:** the estimate path. `vnIndex` now serves a real tier-1 level, not the 1280.5
fallback. Whatever `CI-FRESH-01-FIX` (§ 5) was tracking appears to be healthy — worth confirming
before that row is worked, it may already be closable.

**What was NOT fixed — and is now worse to detect.** `prevFetchedAt` is *still* null and a delta is
*still* emitted against it. § 6.4 said such a delta "must not be emitted at all"; it is still emitted.
Only its **value** changed, because the subtrahend changed:

- **Yesterday:** real 1782.12 − estimate 1280.5 → `−526.13` → narrated as a 29% crash → **absurd on
  its face, and that absurdity is the only reason it was caught.**
- **Today:** the estimate is gone, so the arithmetic collapses to `0` → `direction: "flat"` →
  **perfectly plausible, and therefore invisible.** "VN-Index đi ngang" reads as a finding. It is not
  a finding; it is *no baseline*, wearing a finding's clothes.

This is the same trade as `FIX-COWORK-PRESENCE-CLAIM-PAYLOAD-OBJECT-VS-STRING`: a loud failure
replaced by a silent one, with the underlying mechanism untouched. Fixing the *input* (tier-4 → tier-1)
without fixing the *guard* (§ 6.4) did not make the system correct — it made it quiet. Cf.
`feedback_passive_health_masks_dead_data`.

**Triage consequence — § 6.4 should rise, not fall, now that § 6.2 looks done.** The natural read
("vnIndex is tier-1 again, this is resolved") is wrong and is the trap. A `0`/`flat` from a null
baseline is indistinguishable from a genuinely unchanged index, so no future reviewer will spot it by
eye the way 933 was spotted. **Ambiguity note, unresolved and cheap to settle:** 1782.12 is
byte-identical to yesterday's 20:00Z ground truth. At 5 minutes into a session that opens near prior
close this is expected — but it is *also* what a frozen value looks like. `prevFetchedAt: null` means
the snapshot cannot tell you which. Settle it before assuming the level is live.

**No row minted** (prior-art grep run first per `feedback_file_prior_art_check_before_minting_row`):
§ 6.4 of this handoff already owns the fix, and `BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL` (2026-06-24,
S2-DATA-HONESTY) — which has **no board row** — explicitly assumes "The VNIndex delta IS computed
(using `daily_ohlcv` prev-session close)". That premise is false as of this probe and should be
corrected when either item is picked up.

**Interim protection is per-tick and manual.** The 02:00Z dispatcher passed alert-commander an
explicit DATA GUARD (do not state a VN-Index daily move; `delta=0/flat` is a null-baseline artifact).
That guard is a hand-written prompt string covering **one agent on one tick** — CHEF and
fb-market-poster fire on other ticks with no such guard and read the same field. § 6.3's plausibility
gate remains the only durable fix.

### 8.1 — `dataSource` is NOT the discriminator. Do not build the § 6.3/6.4 guard on it.

Contributed by alert-commander's 02:08Z cycle (notebook DATA GUARD #2), and it corrects a trap this
handoff itself sets. **Top-level `dataSource: "estimate"` describes the carry / investment-clock
composite — not the `vnIndex` field.** It reads `"estimate"` on *both* payloads below, so it
discriminates nothing:

| | 07-15 20:21Z (poisoned) | 07-16 02:05Z (tier-1 real) |
|---|---|---|
| `dataSource` (top-level) | `"estimate"` | `"estimate"` ← **unchanged, useless as a gate** |
| `vnIndex_is_estimate` | true | **false** |
| `vnIndex_source_tier` | 4 | **1** |

§ 3 and § 6.2 above cite `dataSource=estimate` alongside the per-field flags as if they were one
signal. They are not. A guard keyed on top-level `dataSource` would suppress **every** payload
including today's genuinely-live 1782.12, and a reader who trusts it concludes vnIndex is permanently
an estimate. **The authoritative per-field discriminators are `vnIndex_is_estimate` and
`vnIndex_source_tier`** — and for § 6.4 specifically, the discriminator is neither of those but
`prevFetchedAt == null`, which is orthogonal to all three and is the reason today's value is
simultaneously tier-1-correct and delta-broken.

**Provenance, stated honestly:** this is *not* independent corroboration of § 8. The dispatcher's
spawn prompt told the agent about the null-baseline artifact, so the agent restating it is my own
claim echoing back. What is genuinely the agent's is the `dataSource` disambiguation above. Its
second `get_macro_snapshot` (~1 min after mine, same tool) returning the same values rules out a
transient in my read — nothing stronger.

**The guard held, once.** alert-commander exited SILENT (0 fired, 7 suppressed, no `send_telegram`),
gap-tokened the VN-Index delta rather than narrating it, and promoted the rule into its own standing
notebook guard — so it now self-applies without a dispatcher prompt. That is one agent, self-taught,
by luck of being the one spawned on the tick I happened to probe. CHEF and fb-market-poster still
carry no such guard. Unchanged: § 6.3 is the only durable fix.

---

## 8.2 — CORRECTION 2026-07-16T02:25Z. The delta is fine. § 8, § 8.1, and § 6.4 are all wrong.

Two extra probes, 40 seconds apart, demolished § 8. **`vnIndexDelta = current − prior_session_close`.
It is correct. There is a baseline. It was never broken.**

**The evidence — back-solve the baseline (`baseline = current − delta`) from every reading available:**

| when | `vnIndex` | `vnIndexDelta` | ⇒ implied baseline |
|---|---|---|---|
| 07-15 04:10Z | 1788.52 | −18.11 | **1806.63** |
| 07-15 04:30Z | 1791.6 | −15.03 | **1806.63** |
| 07-15 20:09Z | 1280.5 *(tier-4 est.)* | −526.13 | **1806.63** |
| 07-16 02:05Z | 1782.12 | 0 | **1782.12** |
| 07-16 02:19:52Z | 1776.30 | −5.82 | **1782.12** |
| 07-16 02:20:34Z | 1776.24 | −5.88 | **1782.12** |

The baseline is **rock-stable within a day and rolls at the day boundary**: 1806.63 all through 07-15
(= the 07-14 close), 1782.12 all through 07-16 (= the 07-15 close — the very value § 8 flagged as
"suspiciously byte-identical to yesterday's 20:00Z"). It is *supposed* to be identical to yesterday's
close. That is what a prior-close baseline **is**. § 8 read the mechanism working correctly as evidence
of a freeze.

**What § 8 got wrong, and why.** § 8 saw exactly one reading — `delta: 0` with `prevFetchedAt: null` —
and inferred "no baseline ⇒ the delta is meaningless." But `delta: 0` was the **degenerate case**:
five minutes after the open, the index was sitting *exactly* on the prior close, so `current − baseline`
genuinely equalled zero. **A single reading cannot distinguish "no baseline" from "baseline happens to
equal current."** § 8 picked the alarming interpretation and wrote three paragraphs of theory on it.
Two more probes — cost: 40 seconds — separated the two hypotheses immediately.

The § 8 table is also arithmetically incoherent on its own terms and I did not check it: it claims
"real 1782.12 − estimate 1280.5 → −526.13", but that subtraction yields **+501.62**. The real
subtraction is `1280.5 − 1806.63 = −526.13`. Had I checked my own arithmetic, § 8 would not exist.

**Also falsified: the fetch-to-fetch hypothesis.** My first correction guessed the baseline was "the
previous fetch's value." Prediction for the 02:20:34 probe: `1776.24 − 1776.30 = −0.06`. Observed:
**−5.88**. Killed on the spot. Recording it because it was wrong for the *same* reason § 8 was — a
mechanism inferred from too few points.

### What this means for the board

- **§ 6.4 ("a delta against `prevFetchedAt: null` must not be emitted at all — it is not a delta")
  is FALSE and should be CLOSED, not raised.** It *is* a delta. Acting on § 6.4 would delete a
  correct, useful field. This is the single most important line in this document now.
- **`prevFetchedAt: null` is real but COSMETIC and LOW severity.** The baseline exists and is right;
  only its *timestamp* is unsurfaced. The genuine (minor) cost: a consumer cannot verify from the
  payload *which* close it is diffing against, so if the baseline ever did go stale, nothing would
  reveal it. Worth a small row — "populate `prevFetchedAt` with the baseline's session date" — not
  the P0-adjacent treatment § 8 implied.
- **`BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL` was RIGHT ALL ALONG.** § 8 declared its premise ("the VNIndex
  delta IS computed using `daily_ohlcv` prev-session close") "falsified by my probe." It is **true**.
  My probe was underpowered; that handoff's author had it correct in June. Its actual scope —
  `oilUsdDelta` / `goldUsdDelta` / `usdVndDelta` all `null`, all directions `"unknown"` — is
  **confirmed still broken this tick** and is the real, untouched bug in this area. It still has no
  board row. That is the thing worth minting, and it is *not* about vnIndex.
- **dish 933's root cause is now fully attributed and is CLOSED-worthy:** a tier-4 **estimate**
  poisoned the `vnIndex` **input** (1280.5 against a real 1806.63 close ⇒ −526.13). The arithmetic
  did its job on garbage input. § 6.2 fixed the input. **§ 6.3's plausibility gate remains the right
  and only durable fix** — a ±29% one-day move should never have reached MARKET regardless of which
  field was wrong. That conclusion survives; it just no longer has § 8's fake urgency behind it.
- **The § 8 "frozen vs live" ambiguity is RESOLVED — the index is LIVE.** It moved 1782.12 → 1776.30
  → 1776.24 across 15 minutes under observation.

### Contamination — two committed artifacts carry the false claim

1. **This document, § 8 + § 8.1** — banner-retracted above.
2. **`docs/agent-memory/notebooks/alert-commander.md`, "DATA GUARD #2"** (committed `04469f5dd`) —
   states the delta is a "missing baseline" artifact and instructs "gap-token if `prevFetchedAt` is
   null." Since `prevFetchedAt` is *always* null, that rule **permanently suppresses a correct field**.
   Worse, it lives in the agent's *carry-over* section, so it self-applies every cycle without a
   dispatcher prompt. Corrected in the same commit as this section.

   Provenance, stated plainly: **the dispatcher seeded this error.** The 02:00Z spawn prompt handed
   alert-commander the false null-baseline claim; the agent adopted it and promoted it to a standing
   rule. § 8.1 then praised it as the agent being "self-taught." It was the agent faithfully learning
   my mistake. A wrong guard propagates exactly as fast as a right one, and gains credibility on the
   way — § 8.1 cited the agent's adoption as corroboration of the very claim I had fed it, having
   already noted one paragraph earlier that it *couldn't* be corroboration. The note was right and I
   drew the wrong conclusion from it anyway.

**Cost of the error, honestly:** near-zero in published output — alert-commander exited silent and
CHEF got the corrected guard at 02:22Z before writing anything. The cost was to the board: a false
P0-adjacent framing on § 6.4, a true handoff (`BA-FIX-…-DELTAS-NULL`) wrongly discredited, and a
self-replicating bad rule in an agent's memory. All three are corrected as of this section.

---

## 8.3 — 02:23Z: the corrected guard was handed to CHEF, and CHEF published against it anyway. § 6.3 is now proven, not argued.

**MARKET msg 936 (`chef-intraday`, 02:23:26Z) is live, unreviewed, and contains a false claim.**
Not deleted, edited, or review-labelled — outward-facing, the user's call (same standing as msg 933).

| claim in dish 936 | raw ground truth | verdict |
|---|---|---|
| "giảm nhẹ 0.3%", VN-Index 1776.85 | −5.88 vs prior close 1782.12 = −0.33% | ✅ **correct** |
| "20 mã… RSI < 30" | 16 `ta_oversold` in the alert store; ~18 incl. msg 934 TA signals (D2D, PPC) | ⚠️ minor overcount |
| **"giá dầu cũng tăng thêm"** *(oil rising further)* | `oilUsdDelta: null`, `oilUsdDirection: "unknown"`; Brent 85.47 (02:08) → 85.26 (02:20); briefing 934 shows Brent **↓**; **CHEF's own synthesis JSON says `oil $85.26 (level)`** | ❌ **FALSE — and self-refuted** |
| "tin tức tích cực từ Mỹ (Big Tech tăng)" | **NOT VERIFIED — see below. Do not treat as established.** | ⚠️ **unverified** |

### The oil claim — airtight, and the agent's own artifact is the witness

**The spawn prompt said, verbatim:** *"`oilUsdDelta`, `goldUsdDelta`, `usdVndDelta` — ALL null, all
directions `"unknown"`. These genuinely have no baseline. Do NOT state a move/direction for oil, gold,
or USD/VND. Levels only."*

CHEF **complied perfectly in its structured layer.** `unified-agent-synthesis-2026-07-16-intraday.json`:

```json
"vn_macro_layer": "VN-Index -0.33% intraday (1776.85), USD/VND at 26,070 (level),
                   oil $85.26 (level), gold $4,041.40 (level). Carry regime suppressed."
"known_gaps": [ ..., "[gap:oil_gold_usdvnd_no_delta]" ]
"quality_verdict": "degraded"
```

Every field correctly tagged `(level)`. Gap logged. Quality self-marked DEGRADED.

Its **notebook** — a second, independently written artifact — says the same thing:

```
- Macro: VN-Index 1776.85 (-0.33%, intraday), USD/VND 26,070 (level only, no delta),
         Oil 85.26 (level), Gold 4041.4 (level). Carry unavailable per DSI-INV-1.
```

**Then the prose rendered "oil (level)" as "giá dầu cũng tăng thêm" and sent it to MARKET.** No
external evidence is needed to convict this: **three internal artifacts say "level", one published
dish says "rising"**, all written by the same agent within seconds of each other. The agent knew.

**This localises the defect precisely — and it is the most useful thing on this page for § 6.3:**
the guard survived GATHER, survived CLUSTER, survived all six TNB layers, survived the quality gate,
and **died in the last step, between synthesis and `send_telegram`.** The data layer was clean the
whole way. **⇒ § 6.3's gate belongs exactly there: code-level, pre-send, comparing the outgoing prose
against the synthesis JSON's own gap tokens.** That gate is cheap, it is deterministic, and it would
have caught this — the ground truth it needs is already sitting in a file the agent wrote itself.

**Scope: the gate cannot be VN-Index-only.** Msg 933 was vnIndex; msg 936 is **oil**. Same invariant,
different field: *no direction/move claim may be published when the matching `*Delta` is null or the
source tier is 4.* Gate the invariant across every macro field, not the one that broke first.

### The "US Big Tech rally" claim — I overclaimed. Downgrading to unverified.

I first called this "unsourced + self-contradictory" and said so in a `work`-channel telegram at
02:26Z. **Both halves are weaker than I claimed, and one is plain wrong:**

- **"Self-contradictory with `[gap:L2_US_macro_absent]`" — WRONG.** Layer 2 is *US macro indicators*
  (the JSON is explicit: `"us_macro_layer": "[gap: PMI/EFFR-IORB unavailable]"`). A **news headline**
  about Big Tech is a different layer entirely. Flagging PMI/EFFR absent while citing a news item is
  **not** a contradiction. I built that argument out of two tokens that merely both contained the
  word "US".
- **"Unsourced" — NOT ESTABLISHED.** CHEF cites `news_mention high 2026-07-16 01:19`, and
  alert-commander independently saw three HIGH `news_mention` rows for GAS/PLX/BSR at that time. It
  characterised them as "oil-price-positive", which is not "US Big Tech rally" — but **I could not
  read the article bodies** (`get_alerts` caps at 20 and the 01:19 rows have aged out), so I cannot
  rule out that the underlying article mentions both. **Absence from my view is not absence.**

**What IS verifiable and does matter** — stated without the overreach:
the claim lives in the **structured** layer, not just the prose, as the stated rationale for **three
MEDIUM-conviction BUY calls** (GAS, PLX, BSR), each carrying `pillars_aligned_count: 2`. The US rally
is **one of those two pillars**. If it doesn't hold, the count drops to 1 and the BUY basis with it.
That makes it load-bearing for a user-facing recommendation and **worth someone checking who can read
the 01:19 article bodies.** It is flagged here, not filed, and not asserted as false.

*(Correction sent to the `work` channel at 02:31Z. Recording this in the same document that retracts
§ 8 is the point: I made the § 8 mistake — inference from insufficient data — again, inside the very
section documenting it, ~20 minutes later. Under time pressure, with the lesson freshly written, on a
live user-facing defect. The pull toward the alarming read is not something you notice yourself doing.)*

**Also worth one row, small:** msg 936's language quality — "cổ phiếu **dâu** khí" (should be *dầu
khí*; "dâu" = mulberry) and "dòng **nước** ngoài" (should be *khối ngoại* / *dòng vốn ngoại*;
literally "foreign water flow"). This is user-facing Vietnamese in the MARKET channel. Cf.
`feedback_market_report_plain_vietnamese`.

**Unverified, flagged not asserted:** the Kinh Dịch claim ("Quẻ Khiêm… toàn cát", 64% confidence). I
did not probe `get_market_hexagram` to confirm the hexagram or the "toàn cát" reading, so I am not
calling it either way — noting only that `feedback_chef_kinhdich_confab` records prior confabulation
in exactly this element, and that it sits in a dish already carrying two unsourced claims.

## 7. Dispatcher actions taken

- RAW-verified against MARKET; corrected TNB's claim (§ 4). Filed one signal row to po.
- Sent a `work`-channel telegram (user-facing defect + live unreviewed message).
- **Did NOT** delete, edit, or review-label message 933 — outward-facing, user's call.
- **Did NOT** spawn po/dev-team agents (`cowork-team/flow/main.md:12`).
