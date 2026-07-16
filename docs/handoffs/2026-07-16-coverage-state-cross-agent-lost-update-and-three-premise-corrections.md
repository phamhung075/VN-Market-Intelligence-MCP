# coverage-state.json: cross-agent lost update on an `_ssot:true` file — plus 3 corrections to premises already in flight

**Detected:** 2026-07-16T00:10–00:20Z by the cowork-team dispatcher, post-spawn RAW verification of
tick 00:00Z (4 slots: market-watcher, news-scout, bctc-analyst, alert-commander).
**Status:** PLAN-ONLY. **All 4 data guards HELD** — nothing false reached MARKET this tick.
**Severity: MED** — one confirmed silent data loss; the rest are corrections that *reduce* scope.

Read § 3 before implementing `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC`. Read § 5 before
acting on anything that says "dish 933".

## 1. CONFIRMED — two agents silently clobbered each other's coverage-state in one tick

`docs/data/coverage-state.json` is a **single shared blob**, not per-agent keyed:

```
_schema, _ssot, _updated_by, _updated_at, _eod_completed, tickers, sweep_config
_ssot: true      _updated_by: "news-scout"      _updated_at: "2026-07-16T00:08:30Z"
```

One `_updated_by`. One `_updated_at`. 58 tickers rewritten wholesale by each writer.

| time (UTC) | agent | event |
|---|---|---|
| ~00:08:2x | news-scout | reads coverage-state (baseline it later stamps: `00:08:30Z`) |
| **00:08:32** | **market-watcher** | **writes all 58 tickers** |
| **00:10:08** | **news-scout** | **writes all 58 tickers from its ~00:08:2x baseline** |

**market-watcher's write was silently reverted.** `git diff` = 60 insertions / 60 deletions. Neither
agent reported anything; neither *could* — each did exactly what its flow says.

**Why this instance is worse than the 3 prior members of the clobber class.** chef synthesis, tnb
notebook, and bctc signal files were all **one agent colliding with itself across time**. A
cycle_id in the key fixes those. This one is **cross-agent within a single tick**: news-scout and
market-watcher are different agents with different cycle_ids, both legitimately owning the same 58
tickers. **A cycle_id discriminator does not fix it** — it would just give each agent its own file
and destroy the shared-state semantics the `_ssot: true` flag is asserting.

This needs read-modify-write with a compare-and-swap, or per-agent sections merged on read — a
different fix from the filename class. Do not fold it into the filename row; it will be
mis-implemented. Precedent for the mechanism already exists in-repo: `scripts/orch-apply.sh`
CAS-guards exactly this hazard for `orch-state.json`, the other hot shared file.

Note the tool asymmetry (`feedback_router_intent_path_double_dispatches_cowork_slots`): both agents
hold `Write` (full overwrite, **no stale-read check**), so this class fails **silently**. Had either
used `Edit`, the stale-read check would have surfaced it. Ordering is arbitrary; today market-watcher
lost, tomorrow it is whoever finishes second.

## 2. All 4 data guards HELD — verified RAW, not by self-report

The dispatcher hand-injects a gap-token DATA GUARD into every spawn prompt because
`FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE` is unbuilt. This tick's `macro_snapshot` again served
`vnIndex=1280.5 / vnIndexDelta=-526.13 / dataSource=estimate / source_tier=4` — the exact artifact
behind the false "VN-Index mất 526 điểm" claim.

| agent | verdict | evidence |
|---|---|---|
| market-watcher | HELD | notebook grep: zero poison literals; macro line omits vnIndex |
| news-scout | HELD | poison appears **only** as `DATA-GAP: … KNOWN BAD`; signal `#8135` (impact=9, the one CHEF reads) carries **no** VN-Index number |
| bctc-analyst | HELD | no poison in c090 block |
| alert-commander | HELD | poison at L11/47/55/65 **all** quarantine labels: `GAPPED per DATA GUARD … NOT narrated/published` |

**alert-commander published nothing** — `get_unreviewed_market_messages` tops out at **932**
(`sent_at 19:52:17`), nothing newer; `task_list_held` shows **zero `published:*` markers**. Its
SILENT EXIT is confirmed against the store, not its say-so.

**Durability improvement, unprompted:** alert-commander wrote the guard into its own notebook as a
`STANDING RULE (2026-07-16)`. It now survives without dispatcher injection — but notebooks are
**full-overwrite each cycle**, so it persists only while the agent keeps re-copying it. Better than
a prompt string; still not a gate.

## 3. § 3 of the bctc handoff is CONFIRMED LIVE — and the GUARD row's fix would break the fleet

The prior handoff argued from a *file count* that `docs/signals/` writes are designed behavior. That
was inference. **This tick observed it directly.** bctc-analyst c090 reported:

> **Files written (all within scope):** … `docs/signals/bctc_signal_FPT_20260716_routine.json`,
> `docs/signals/bctc_signal_VCB_20260716_routine.json`

Its frontmatter permits **only** the notebook, `analysis-briefs/{TICKER}.md` on release-mode, and
`data/bctc-analysis-cache/`. **`docs/signals/` is not in that list** — and the agent believes it is.

**The two mechanisms are PARALLEL, not alternative.** The same cycle *also* posted DB signals
`8137`/`8138` via `post_agent_signal`. The DB rows and the files are **separate artifacts**. This
resolves the open question from the prior handoff (`cycle.md:179` `call_tool` vs `eod.md:29` direct
write): **both, always, in one cycle.**

`GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` option (1) is:

> strip `Edit` (and `Write` …) from agents whose **sole legitimate write is a notebook**

Applied as written this **breaks signal routing for the whole cowork fleet** and, separately, kills
coverage rotation: `coverage-state.json` has **no MCP tool** (`get_coverage_state` → `-32602 not
found`), so `Write` is the *only* mechanism. Strip it and the sweep silently stops — no error, no
signal, just a rotation that never advances.

**The frontmatter must be corrected to describe reality first** (notebook + `docs/signals/` +
`docs/data/coverage-state.json` + agent-specific extras). An enforced-but-wrong boundary is worse
than an ignored one.

**De-escalation datapoint:** bctc-analyst did **not** self-edit flow docs this cycle
(`find docs/agents/bctc-analyst docs/agents/tools/package -newermt 00:00` → empty). c089's self-edit
was a one-off discovery, **not** per-cycle behavior. The row's urgency should drop accordingly.

## 4. § 4 INVERTS — the cycle_id already exists; the fix is a rename, not a new field

`FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (P1) was minted on my claim that signal filenames lack a
cycle discriminator. **The payload already has one:**

```json
{"signal_id": null, "cycle_id": "20260716-0000", "ticker": "FPT", "mode": "routine"}
```

Filename: `bctc_signal_FPT_20260716_routine.json` — date-keyed, `cycle_id` **present but unused**.
bctc runs 4×/day (`0 15,18,21,0` UTC); all four collide on one path.

The fix is **cheaper than the row implies**: thread an already-computed field into the filename. No
new plumbing. Re-estimate before scheduling.

(Also observed, not chased: `signal_id: null` at write time — the drain appears to populate it when
routing to `processed/`. Consistent with the prior handoff's § 5 id-regression observation, which
remains UNPROVEN and should not be diagnosed from this.)

## 5. RETRACTION — "dish 933 is still live and unreviewed" is FALSIFIED. Do not act on it.

I have carried this across several context windows as a pending item. **It is not unreviewed.** Two
independent tools agree:

- `get_unreviewed_market_messages` → highest id is **932**.
- `get_market_message_digest` (7-day unreviewed) → exactly **5** rows: `928, 929, 930, 931, 932`.

**No 933.** It was either already reviewed or never existed at that id. No available tool reads a
reviewed message by id, so I **cannot** distinguish those — and did not guess.

**The id attribution in `feedback_router_intent_path_double_dispatches_cowork_slots` is also
suspect.** That memory records "MARKET double-publish ids 932+933" from a chef-evening
double-dispatch. The raw row says:

```
id 932 | from_agent: "mcp-user" | message_type: "user_ask_reply" | sent_at 2026-07-15 19:52:17
content: "Thị trường hôm nay giảm nhẹ do áp lực từ khối ngoại…"
```

Not a chef dish. Not from unified-agent. And the text is **correct** ("giảm nhẹ" = fell slightly).
The *double-publish* finding may still be sound — but its **ids are wrong**, and anyone who goes
looking for the false claim at 932/933 will not find it.

**Action for whoever owns this:** re-ground the ids before touching `UC-CCA-P3` or the 933 review
item. The zero-risk interim I previously proposed (`review_market_message({id:933, verdict:"noise"})`)
should **not** be run — it would stamp a verdict on a message I can no longer prove says what I
claimed.

## 6. The cross-plane gate has THREE corroboration sources — my "impossible" claim was wrong

Last tick I recorded that a cross-plane VN-Index check was **impossible** because the market was
closed and tier-2 `market_context` carries no VN-Index figure. **True of `market_context`; wrong as
a general claim.** Three independent sources carried the real value while the snapshot served 1280.5:

| source | tier | value |
|---|---|---|
| MARKET msg **928** (`morning-briefing`, 2026-07-15) | 1 | **`VN-Index: 1.782 (-25 / -1.36%)`** |
| news article (news-scout, this tick) | 2 | `VN-Index 'thủng' mốc 1.800` |
| real close (per the 933 correction) | — | ~1782, −1.36% |

The strongest one is **in the same channel a false claim would be published to**, from
`morning-briefing`, at tier-1, every trading day. A publisher comparing its `macro_snapshot.vnIndex`
against the day's morning-briefing figure would have caught 1280.5 instantly — a ~500-point,
~28% divergence.

`FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE` is **cheaper and more available than scoped**. It does
not need a live market or a new fetch path.

Root cause still unaddressed: `fetchedAt: 2026-07-16T00:05:32Z` (**fresh**) on a **dead** value,
with `signals.carry.fetched_at_source: 2026-06-26` (20 days stale) — passive health masking dead
data (`feedback_passive_health_masks_dead_data`). `CI-FRESH-01-FIX` (is `vnIndexRefresh` alive?)
remains the likely live root cause. **4 consecutive ticks served the identical artifact.**

## 7. RETRACTION — the re-fire handoff's § 4 is FALSE. `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE` must be re-scoped.

Yesterday's handoff
(`2026-07-15-cowork-tick-refire-election-lock-does-not-span-its-tick.md` § 4) claimed a re-fire on a
slot-bearing tick would **re-spawn every agent**, resting on
`feedback_cowork_matcher_legacy_no_lastfired_dedup`. I flagged it INFERRED and demanded someone
probe it. **Probed. It is false.**

`scripts/agents-flow/cowork-match-slots.js`:

```js
function isSuppressedByBoundaryDedup(nowUnix, lastFired, cron) {
  if (lastFired == null) return false;
  const nominalTick = snapToCronBoundary(nowUnix, cron);
  return lastFiredUnix >= nominalTick;          // already fired this boundary ⇒ SUPPRESS
}
function legacyCandidates(candidates, nowUnix) {   // ← the LEGACY path
  return candidates.filter(sl => !isSuppressedByBoundaryDedup(nowUnix, sl.last_fired, sl.cron))
```

Header line 10: *"legacy (default): cron-match **+ last_fired boundary dedup**"*. Shipped by
**UC-CDC-P3** (`e69f2ca4e`, done_verified, qa PASS 8/8) as SSOT across **both** legacy return points.
**The tick-keyed tombstone § 5 proposed as the fix already exists at slot level.**

**Why I got it backwards — the trap worth keeping.** I cited the memory by its **filename**
(`..._no_lastfired_dedup`). The file is **internally contradictory**: its `description` and body
line 12 describe the pre-UC-CDC-P3 world ("*returns last_fired in output but NEVER filters on it*"),
while its 2026-07-14 addendum says the root-cause fix was *"routed to dev-team"* — and UC-CDC-P3 is
that fix landing. A memory's name and description can be two commits staler than its own addendum.
**Read the body, then verify against code, before resting a severity claim on it.**

### The residual hazard is REAL but is a different, cheaper bug

`last-fired.md` `AC-P1-7-1`: *"last_fired written **after successful spawn**"*. Step order is
**5 (spawn) → 5b (stamp last_fired) → 6**, while `cowork-slot:<slot_id>` is released in try/finally
**right after the spawn attempt**:

| re-fire lands | `cowork-slot:<slot_id>` | `last_fired` | outcome |
|---|---|---|---|
| during Step 5 | **held** → `claimed:false` | stale | safe — skipped |
| **[release → Step 5b]** | **released** | **still stale** | **DOUBLE SPAWN** |
| after Step 5b | released | `>= nominal_tick` | safe — suppressed |

One unguarded gap: **guard #2 drops before guard #4 rises.** Same one-line invariant as the other
three members of the class — *the guard that must span the work is released when the work ends* —
but the fix needs **no new mechanism**: **stamp `last_fired` before releasing `cowork-slot`**
(i.e. move Step 5b's write inside the try/finally, ahead of the release). This preserves
`AC-P1-7-2` (spawn failure ⇒ no stamp), since the stamp still happens only on spawn success.

**Re-scope the P1 row accordingly:**

- It is **not** "add a tick tombstone" — one exists.
- It **is** "close the `[cowork-slot release → last_fired stamp]` window", plus the separate
  (genuine, unfixed) fact that `cron:cowork:<TICK>` does not span its own tick.
- **Blast radius drops from "re-spawns every agent" to "wastes a dispatcher pass, plus a narrow
  double-spawn race."** The 21:30Z instance proves re-execution, **not** double-spawn — that tick had
  `slots: []`, so it exercised neither dedup path and remains evidence of nothing about spawning.
- **P1 is likely too high.** Re-rank on the corrected radius.

## 8. Dispatcher actions taken

- RAW-verified all 4 agents against the **store**, not their self-reports. Caught **one false
  negative in my own probe**: `get_market_messages` does not exist (`-32602`); a grep over its error
  output printed nothing and read as "no new messages." Re-probed with the real tool
  (`get_unreviewed_market_messages`) before certifying the publisher
  (`feedback_empty_read_is_not_evidence_confirm_tool_targets_store`).
- Committed 4 notebooks + 2 bctc signal files on the agents' behalf — bctc-analyst and
  alert-commander both hold **no Bash** and explicitly requested pickup (standing gap: ~37 cycles for
  alert-commander, c078–c090 for bctc). Explicit paths only.
- Filed **one** consolidated signal row to po. **Cost stated honestly:** the SILENT gate was
  **closed** (`signal_queue` total rows = 0), so this row **reopens** it and costs ~3 WORK ticks
  until po's ~01:07 drain. Filed anyway — § 3 and § 5 are corrections that prevent harm, which
  outweighs 47 minutes of gate-open. This is *not* the "marginal cost zero" argument from the
  2026-07-15 handoff; that applied only because the gate was already open.
- Did **NOT** mint board rows, spawn po/agent-father/dev-team (`cowork-team/flow/main.md:12,16`),
  run `review_market_message`, or push.
- **Caught a false positive in my own pre-commit guard.** A UUID-*shape* grep flagged
  `alert-commander.md`; the hits are `write_alert_verdict` **verdict IDs** (`CTG f33a49fb…`,
  `PNJ 78bdc684…`, `VCB 8c1460f7…`) — server-issued domain data the agent needs to re-verify pending
  alerts, and already committed at HEAD by design. Blind-scrubbing on shape would have **destroyed
  the verdict-tracking chain**. `feedback_agent_commits_session_uuid_into_notebook` is about
  **session** ids specifically; the correct probe is a match against `$CLAUDE_CODE_SESSION_ID`, not
  the UUID shape. Re-probed targeted → clean.
- **Observed, NOT actioned (peer file, dev-team's to own):** that targeted probe found the *real*
  leak class live in `docs/agent-memory/notebooks/dev-mcp-server.md` L5/19/33 — the dev-team session
  id `69b0312e-…` written into a notebook 3×, a confirmed recurrence of
  `feedback_agent_commits_session_uuid_into_notebook`. **Not touched** — peer-dirty file outside this
  dispatcher's scope (`feedback_router_commit_captures_dirty_board`), and cross-team routing is a
  signal row, not an edit (`cowork-team/flow/main.md:14`). Flagged here for dev-team/po pickup.
