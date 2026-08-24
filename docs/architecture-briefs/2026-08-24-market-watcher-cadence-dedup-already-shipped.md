Architecture Brief — market-watcher-eod / market-watcher-offhours Cadence Collision:
Already Fixed, Live in Production — Row is a Duplicate, Recommend Dedup-Close

Date: 2026-08-24T19:25:40Z
Task: FIX-CADENCE-COWORK-DUP-MARKET-WATCHER (P1/high, SPRINT-S, owner agents-architect,
next_agent was agents-architect — this brief is that deliverable)
Mode: VERIFICATION — no new remedy proposed. Investigation found the requested remedy
(schedule-layer de-overlap) was already designed, implemented, QA-verified DONE_VERIFIED, and
is confirmed working in production, all before this row was even promoted to dispatchable.
Author: agents-architect

---

## 0. Dedup check — this row IS the duplicate

Before designing anything, checked whether this exact problem already had a brief. It does:
`docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md`
(same author, same incident — telegram 4887, 2026-08-14T16:17:29Z). That brief spawned two
board rows, both now `DONE_VERIFIED`:

| Row | Zone | Status | Commit | QA verified |
|---|---|---|---|---|
| `FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC` | `docs/data/cowork-schedule.json` + `docs/agents/**` (agent-father) | `DONE_VERIFIED` | `5918c55fe` | `2026-08-14T17:39:06Z` |
| `FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING` | `scripts/agents-flow/` (developer) | `DONE_VERIFIED` | `662d1fcc3` (+ `87e0554db` dev journal) | `2026-08-14T17:38:03Z`, QA re-ran all 4 test suites independently (32/32, 69/69, 25/25, 13/13) |

Both archived in `docs/data/orch/archive/2026-08.json`. **This row
(`FIX-CADENCE-COWORK-DUP-MARKET-WATCHER`) was PO-promoted 2026-08-15T00:40:22Z — roughly 7
hours AFTER the fix above was already shipped and QA-approved the same day (2026-08-14
~17:38Z).** Its own `po_promote_20260815T0040` note cites the identical telegram report
(4887, 16:17:29Z) as its basis — it is a second board entry for one incident whose fix had
already landed by the time this entry became dispatchable. Router's Design-Router Sweep
re-promoted/claimed it again 2026-08-23/24 without catching this, presumably because the two
already-closed rows are cold-evicted to `docs/data/orch/archive/2026-08.json` and a
non-terminal-lane-only scan does not see them (same class of blind spot as
`feedback_bespoke_perTick_keys_in_shared_json_hide_real_coverage` — coverage that lives in a
closed lane is invisible to a scan that only reads open lanes).

## 1. Re-verification this cycle — everything below is checked live, not cited from either
prior artifact

**1a. Current cron values** (`docs/data/cowork-schedule.json`, read directly, not from the
row's stale PO note):
```
market-watcher-eod:      cron "0 16 * * 1-5"   (unchanged)
market-watcher-offhours: cron "0 */4 * * *"    (unchanged)
```
Structurally still collide at every weekday 16:00 UTC tick, exactly as originally reported —
the cron values have NOT drifted. The mitigation is not a cron change; see §1c.

**1b. Schedule-layer mitigation is live:** `market-watcher-eod.supersedes: ["market-watcher-offhours"]`
is present on the live schedule row.

**1c. Actuator is live and wired:** `scripts/agents-flow/cowork-supersede-mutex.js` exists,
exports `applySupersedeMutex(matches, scheduleSlots)`; `scripts/agents-flow/cowork-match-slots.js`
`finish()` (all 3 return points — legacy L275, legacy-fallback L287, adaptive L368, confirmed
by grep) chains it unconditionally after `applyChefMutex`. Ran the live test suite this cycle:
`node scripts/agents-flow/cowork-supersede-mutex.test.js` → **32 passed, 0 failed, exit 0**
(re-run today, not trusted from the 08-14 QA record).

**1d. Live production evidence — today's tick, not a simulation:** today (2026-08-24) is a
Monday, an eod-cron trading day. Git history of the notebook shows:
```
3c3f18bc6 2026-08-24 18:06:59 +0200  chore(memory/market-session-eod): notebook 2026-08-24 EOD cycle 1
4f3c5b23e 2026-08-24 14:06:09 +0200  chore(memory/market-watcher): offhours cycle 2026-08-24 12:04 UTC
```
i.e. offhours' last commit before the 16:00Z tick is 12:04 UTC — **no offhours commit exists
at 16:00/16:0xZ today**, and `cowork-schedule.json`'s own `market-watcher-offhours.last_fired`
field independently reads `2026-08-24T12:04:50Z` (not advanced to 16:xx), while
`market-watcher-eod.last_fired` reads `2026-08-24T16:04:52Z`. Two independent planes
(git-committed notebook history and the schedule file's own bookkeeping) agree: at today's
16:00Z tick, only `market-watcher-eod` fired; `market-watcher-offhours` was dropped from the
match set exactly as the supersede mutex is designed to do. This is the fix working, observed
live, not inferred from the shipped code alone.

**1e. Secondary defect (RULE 2.5 bare-commit pathspec, brief §4 of the 08-14 doc) is also
fixed:** `docs/agents/market-watcher/flow/eod.md` Step D and `docs/agents/market-watcher/flow/cycle.md`
offhours self-commit both now carry trailing explicit pathspecs on their `git_commit_retry`
calls (confirmed by direct grep, both cite `FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC`
inline). The `6cfdfb227` wrong-file-commit failure mode from the original incident cannot recur
via this path today.

**1f. Doc updates from the 08-14 brief's §3d are also live:** `pressure-cadence.md` Step 4.5d
and `match-slots.md` Step 4b both carry the supersede-mutex pointer text as specified.

## 2. Remedy choice — answering the router's framing directly

The row asked me to weigh **de-overlap** (shift a cron) vs **per-slot notebook target** (split
the file) and recommend one primary. The shipped fix is a third, better-shaped variant of
"de-overlap" that the 2026-08-14 brief already designed and that is now live:

**Declarative same-tick supersede-mutex** (`market-watcher-eod.supersedes:
["market-watcher-offhours"]`, resolved in `cowork-match-slots.js finish()` before spawn-fanout)
achieves de-overlap's goal — the two slots never co-fire — **without shifting either cron at
all**. This is strictly better than literal cron-shifting for this pair:

- **vs. de-overlap (shift a cron):** de-overlap would require picking a new time for one slot
  and verifying no downstream consumer depends on the old timing. The supersede-mutex needs
  no such check — `market-watcher-eod`'s cron is untouched, still fires at exactly 16:00Z, so
  there is zero timing-drift risk to any consumer by construction, not merely by verification.
  (I did verify anyway: `fb-market-poster/flow/daily.md`, `weekly-recap.md`,
  `weekly-prediction.md`, and `init.md` all read `docs/agent-memory/notebooks/market-watcher.md`
  by fixed path — none reference a specific fire-time, only the file's content, so even a
  literal de-overlap would likely have been safe, but it's moot: nothing moved.)
- **vs. per-slot notebook target (split the file):** rejected for the same reason the 08-14
  brief gave, re-confirmed live this cycle — the same 4 files above read `market-watcher.md`
  as ONE fixed path; splitting would permanently multiply that surface to fix a scheduling
  collision that has nothing to do with the notebook's own shape. The supersede-mutex removes
  the race at its source (the two writers can no longer both exist in one tick's spawn set),
  which is root-cause-complete without touching the OVERWRITE-class single-file convention at
  all.

**Recommendation: no new remedy needed.** The already-shipped schedule-layer supersede-mutex
IS the correct primary remedy for this exact collision shape, it is live, tested (32/0 today),
and independently confirmed working on today's real 16:00Z tick.

## 3. One genuine (non-blocking) loose end found this cycle

`docs/data/cowork-schedule.json` → `market-watcher-eod._note` still reads: *"Field is INERT
until scripts/agents-flow/cowork-supersede-mutex.js ships + wires into
cowork-match-slots.js finish() (sibling row FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING)."*
This is now stale — both conditions it names have been true since 2026-08-14T17:23:17Z (commit
`662d1fcc3`). Not a functional defect (the mutex runs regardless of what the `_note` string
says), but it will mislead the next reader who checks this file into re-litigating a question
that's already settled. `docs/data/cowork-schedule.json` is `_maintained_by` agent-father via
brief only — flagging so agent-father can fold in a one-line `_note` text update (replace
"Field is INERT until..." with "LIVE since 2026-08-14T17:23:17Z, commit 662d1fcc3 +
5918c55fe, QA DONE_VERIFIED — see docs/data/orch/archive/2026-08.json") whenever it next
touches this file. Not worth a dedicated dispatch on its own; bundling is fine.

## 4. What I deliberately did not do

- Did not re-open or re-verify `FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK`
  (currently `review[]`) — explicitly out of scope per the row's own instructions (distinct
  eod.md caveat defect, not the schedule collision).
- Did not re-investigate the `alert-commander-market`/`alert-commander-critical` residual-risk
  note from the 08-14 brief §6 (same-agent multi-slot shape, lower severity because
  alert-commander's notebook write is APPEND-class not OVERWRITE-class) — already flagged
  there for system-auditor/agent-father awareness, no action requested, and out of scope for
  a market-watcher-titled row.
- Did not edit `docs/data/cowork-schedule.json` myself — per hard constraint, it is
  agent-father's file via brief only; §3 above is the brief-level flag for that.
- Did not implement anything — nothing left to implement for the core ask.

## 5. Standard Detection + handoff

**BUILD-STANDARD: not-applicable** (verification-only cycle; zero production changes proposed
or made by this brief).

**Zone:** none touched by this brief beyond `docs/architecture-briefs/` and this notebook.

**Recommended board action (PO's call, not mine to execute):** close
`FIX-CADENCE-COWORK-DUP-MARKET-WATCHER` as duplicate/already-resolved, citing this brief +
the two `DONE_VERIFIED` rows in §0 as evidence, rather than routing to agent-father for fresh
implementation work. The §3 `_note` staleness item can ride along as an optional one-line
fast-follow whenever agent-father next touches `cowork-schedule.json`, or be dropped if PO
judges it not worth a dedicated entry.

## RETURN
DONE: Verification complete — remedy already shipped 2026-08-14 (commits `662d1fcc3` +
`5918c55fe`), confirmed live and working against today's (2026-08-24) real 16:00Z tick.
Recommending dedup-close over new implementation.
ZONE: none (verification-only; no production files touched)
NEXT: po (dedup-closure decision on this row, citing `FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC` + `FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING`, both `DONE_VERIFIED`) | agent-father (optional, non-blocking: §3 stale `_note` text fold-in)
PIPELINE: continue
