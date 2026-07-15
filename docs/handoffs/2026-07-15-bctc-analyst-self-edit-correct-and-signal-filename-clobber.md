# bctc-analyst self-edited its flow docs — 2nd GUARD instance, but this time the content is CORRECT

**Detected:** 2026-07-15T21:20Z by cowork-team dispatcher, post-spawn RAW verification of
bctc-analyst cycle c089 (slot `bctc-analyst-slot-3`, tick 21:05Z).
**Status:** PLAN-ONLY. Edits **KEPT and committed** (`ac1b13268`) — deliberately NOT reverted.
**Severity: MED** — governance recurrence + one CONFIRMED data-clobber (below), nothing user-facing.

## 1. The recurrence — the audit target became a live instance in one tick

`GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` (BACKLOG, PLAN-ONLY, minted by po at 20:56Z
from `cow-20260715T201730`) closes with:

> SAME-PASS audit: grep frontmatter tools-vs-declared-boundary for market-watcher, news-scout,
> digest-predict, unified-agent, **bctc-analyst**, qa-responder

One tick later, **bctc-analyst** — named in that list — did it. Its frontmatter declares
*"Writes only to `docs/agent-memory/notebooks/bctc-analyst.md` … No other filesystem writes
permitted except `docs/analysis-briefs/{TICKER}.md` on mode=release and `data/bctc-analysis-cache/`."*
This **routine**-mode cycle also wrote:

- `docs/agents/tools/package/bctc-analyst.md` (mtime 21:15:48Z)
- `docs/agents/bctc-analyst/flow/stage-analyze.md` (mtime 21:15:50Z)

Both inside c089's window (21:06–21:16Z). Per `feedback_recurring_bug_escalation` (2+ → block),
the class now qualifies on its own. **2 instances, 2 agents, same day, ~1h apart.**

Not this cycle (excluded from the commit, attribution by mtime): `flow/cycle.md` (08:11Z) and
`analysis-briefs/{BID,FPT,MWG,VCB,VCI,VIC,VRE}.md` (08:11Z), `{BSR,DBC,VIX}.md` (07-13). Those are
an **earlier** cycle's footprint. c089's self-reported write list was accurate — it hid nothing.

## 2. The edits are CORRECT — this inverts the alert-commander precedent

alert-commander's flow-doc edit was reverted because its central claim was **false** (the snapshot's
`market_context` is a bare string, not the wrapper object). That revert cost nothing.

**This one costs something.** All three schema claims were probed against the live tools *before*
the keep/revert decision:

| Claim in the edit | Probe | Result |
|---|---|---|
| `get_pyramid_tier` param is `asset_class`, snake_case | `{"asset_class":"equity"}` | ✅ `{"tier":"equity","tier_description":"Listed equity — higher risk…"}` |
| …NOT `assetClass` | `{"assetClass":"equity"}` | ✅ Zod `invalid_type` **"Required"** path `["asset_class"]` |
| `get_sector_comparison` requires `code`, not `ticker` | `{"ticker":"FPT"}` | ✅ Zod **"Required"** path `["code"]` |
| `get_insider_signals()` bare fails; `code` required | `{}` | ✅ Zod **"Required"** path `["code"]` |

3/3 true, verbatim. **The docs were genuinely wrong.** Reverting would restore three doc bugs, each
costing a wasted tool call per cycle (c089 lost one to exactly this), and the discovery would
evaporate — the agent has no Bash and cannot commit.

**The governance objection to alert-commander was "unreviewed", not "written by an agent".** These
are now reviewed — by independent probe, not by the agent's say-so. That is the distinction that
should drive the policy: *review the content, don't blanket-revert the author.*

## 3. The GUARD row's proposed fix rests on a FALSE PREMISE — this is the material finding

The row's option (1):

> strip `Edit` (and `Write`, if full-overwrite notebook only needs `Write`) from agents whose
> **sole legitimate write is a notebook**

Their sole legitimate write is **not** a notebook. Every one of the seven "notebook-only" agents
routinely writes `docs/signals/*.json`, and those writes are **committed, by design, at scale**:

| agent | committed signal files |
|---|---|
| bctc-analyst | 52 |
| market-watcher | 40 |
| news-scout | 33 |
| alert-commander | 32 |
| tran-ngoc-bau | 23 |
| unified-agent | 20 |
| digest-predict | 7 |

**≈207 committed files that the frontmatter clause forbids.** The clause is not merely
*unenforceable* — it is **factually wrong about designed behavior**, and has been for months. It
describes a policy that the system's own signal-dashboard architecture contradicts.

Consequence for triage: fixing this by tightening enforcement against the *current text* would
break signal routing across the whole cowork fleet. **The frontmatter must be corrected to describe
reality first** (notebook + `docs/signals/` + agent-specific extras), and only then can any
enforcement mechanism be meaningful. An enforced-but-wrong boundary is worse than an ignored one.

Third item for the row, alongside its existing two:

3. **A legitimate channel for "agent discovers a doc bug."** This instance proves the violation can
   produce correct, valuable, otherwise-unobtainable work — the agent hit the Zod errors live and
   nobody else would have. A pure prohibition converts that into silent recurring waste. Route it:
   agent emits a doc-fix *proposal* signal (it already writes `docs/signals/`), agent-father applies.

## 4. NEW — signal filenames are date-keyed, so intra-day cycles clobber each other

No board row covers this (checked: `FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER`,
`FU-BACKFILL-REAL-FILENAMES`, `FU-CTG-DISCOVERY-FILENAME-FILTER` — none match).

`docs/signals/bctc_signal_<TICKER>_<YYYYMMDD>_<mode>.json` is keyed **ticker + date + mode**. There
is no cycle discriminator, and bctc-analyst runs **4× daily** (cron `0 15,18,21,0` UTC). All four
cycles collide on one path. **39** such filenames exist in `processed/`.

**CONFIRMED clobber, same file, today:**

| commit | wall time | `signal_id` |
|---|---|---|
| `0bba4a817` | 2026-07-15 **03:20:47** | **9240** |
| `9a47b41d1` | 2026-07-15 **23:21:53** | **8120** |

`processed/bctc_signal_FPT_20260715_routine.json` — signal 9240's record was overwritten by 8120's.
Recoverable only from git history.

**The harm is not the lost artifact — it is a dropped escalation.** The drain reads these *files* to
route signals. If two cycles write the same filename between drains, cycle N silently destroys cycle
N−1's **unrouted** signal and it is never triaged. Today the hourly drain interleaved and nothing was
lost; a late or missed drain loses a signal with no error anywhere.

**This is the third instance of one root class today** — filenames keyed by *date* instead of
*identity*:

1. chef synthesis — `date_vn`+`dish_type` → run 2 clobbered run 1 (`Write`, silent).
2. tnb notebook — same collision, caught **only** by the `Edit` tool's stale-read check.
3. bctc signals — ticker+date+mode → 9240 overwritten by 8120.

Same one-line fix each time: **key the filename by `cycle_id`** (bctc already carries one; chef's is
already in `metadata`). Worth one row covering the class, not three.

## 5. OBSERVATION (mechanism UNPROVEN — do not treat as diagnosed)

`signal_id` **regressed 9240 → 8120** over 20 hours, same file, same tool, same sequence. A later
signal received a *lower* id, so ids 8120–9240 appear to be re-issued.

- **Reboot-restore hypothesis: REFUTED.** Today's incident
  (`docs/agent-memory/sessions/2026-07-15-incident-docker-vm-reboot-recovery.md`) was a **plain
  reboot**, and that doc states named volumes / the live SQLite DB are **PRESERVED** by one. No
  restore-from-backup occurred. Hypothesis dropped, not carried.
- **Parsimonious candidate, NOT verified:** SQLite `INTEGER PRIMARY KEY` without `AUTOINCREMENT`
  assigns `max(rowid)+1`, so deleting the highest rows makes the next insert **reuse** their ids.
  The drain prunes routinely (`9a47b41d1`: "3 pruned"). This would explain it exactly.
- **Why it was not probed further:** the live DB is a **named volume**, not `docs/signals/signals.db`
  — querying that file would be reading the wrong store
  (`feedback_live_db_is_named_volume_not_host_data`, `feedback_empty_read_is_not_evidence_confirm_tool_targets_store`).

**If** ids are reused, anything storing a `signal_id` as a cross-time reference can silently re-bind
to an unrelated later signal — worse than an orphan FK, because it looks resolved
(`feedback_auditor_orphan_fk_real_but_miscaused`, `feedback_auditor_signal_write_orphan_key`).
Cheap first check for whoever owns it: does the schema use `AUTOINCREMENT`?

## 6. c089's own result (unrelated to the above, all healthy)

- **VCB unblocked** — serves full data for the first time since c081 (confidence 75%, validation
  passed, B/S PASS 0.37% imbalance). Blocked cluster **14 → 13**.
- FPT financials byte-identical vs 9 prior cycles; KD signal flip GIU 38% → THẬN TRỌNG 13%, correctly
  judged too low-confidence to act on.
- HPG extraction defect unchanged (Operating Profit=0, NI > Gross Profit) — **no signal posted**,
  consistent with prior cycles. Correct restraint.
- `macro_snapshot.vnIndex` was gap-tokened per the dispatcher's spawn instruction and **never
  narrated** — the guard held.
- The 3 `esc-datacov:*:Q1-2026:ESC-3` claims returning `claimed:true` despite c088's future expiries
  are consistent with the reboot resetting lock state (`feedback_lock_orphaned_by_rebuild`, known
  class). The agent documented it correctly and did not overclaim.

## 7. Dispatcher actions taken

- Probed all 3 schema claims live **before** deciding; **kept** the edits and committed them with
  full provenance (`ac1b13268`), explicit paths only.
- **Excluded** `flow/cycle.md` — a *behavioral formula* (derive market_cap from charter_capital),
  not a verifiable schema fact, and from a different cycle. Left for agent-father/po.
- Committed the notebook on the agent's behalf (no Bash, explicitly requested pickup).
- Did **NOT** spawn agent-father or po (`cowork-team/flow/main.md:12,16`).
- Did **NOT** mint a board row — this refines `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC`
  (items § 3) and proposes **one** new row for the filename-key class (§ 4).
