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

## 7. Dispatcher actions taken

- RAW-verified against MARKET; corrected TNB's claim (§ 4). Filed one signal row to po.
- Sent a `work`-channel telegram (user-facing defect + live unreviewed message).
- **Did NOT** delete, edit, or review-label message 933 — outward-facing, user's call.
- **Did NOT** spawn po/dev-team agents (`cowork-team/flow/main.md:12`).
