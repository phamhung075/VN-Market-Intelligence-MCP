Architecture Brief — market-watcher-eod / market-watcher-offhours Same-Tick Notebook Collision

Date: 2026-08-14T16:22:12Z
Task: FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-NOTEBOOK-COLLISION (P1, size S, owner agent-father,
DESIGN ONLY — implementation routes to agent-father)
Mode: DESIGN — `docs/data/cowork-schedule.json` field addition + new deterministic script (pure
function, mirrors an already-shipped precedent) + 2 flow-doc pathspec fixes. Zero production
code changed here.
Author: agents-architect

---

## 0. Dedup check + prior art

Grepped `docs/architecture-briefs/` for `market-watcher.*collision|notebook.*mutex|eod.*offhours`
— no prior brief covers this exact same-tick shape. Two adjacent, non-overlapping prior fixes
found and read in full:

- `docs/agents/market-watcher/flow/eod.md` Step D / `cycle.md` "Offhours self-commit"
  (`FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK`, 2026-08-06) already
  added a `task_claim(task_id="market-watcher-notebook:main", ...)` mutex around the **git
  add+commit** step in both flows, explicitly citing this exact tick collision as its rationale.
  It does not close today's incident (see §2) — it guards commit ORDERING, not the underlying
  file WRITE, and the two co-fired agents never contended on it in a way that changed the outcome.
- `docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md` — a
  same-week, same-agent-class brief, but a different problem entirely (cowork agents self-editing
  their own flow docs via `doc-self-heal`). Reviewed for overlap; none — not cited further.
- `docs/signals/cowork-chef-doublepublish-2026-06-30.md` (`FIX-COWORK-CHEF-SAMETICK-MUTEX`) is
  the load-bearing precedent this brief's fix generalizes — see §3.

## 1. Evidence (independently re-verified this cycle, not the router's self-report)

Router dispatch (2026-08-14T16:10-16:13Z tick) reported 3 confirmed impacts. All 3 independently
re-confirmed live against the repo, not trusted from the dispatch text:

- **`docs/data/cowork-schedule.json`** — `market-watcher-offhours` (`cron: "0 */4 * * *"`) and
  `market-watcher-eod` (`cron: "0 16 * * 1-5"`) both target `agent: "market-watcher"`, both route
  through `flow/main.md`, both landed identical `"last_fired": "2026-08-14T16:10:51Z"` — the same
  dispatcher tick spawned both slots concurrently. This is a structural collision (16:00 UTC is
  one of the six `*/4` boundaries on every weekday), not a rare drift-timing fluke.
- **Lost EOD notebook entry:** `git log --oneline -5 -- docs/agent-memory/notebooks/market-watcher.md`
  shows the latest entry is `23eed1755 chore(memory/market-watcher): offhours cycle 2026-08-14
  16:11 UTC` — the offhours slot's own commit. No EOD-authored entry exists anywhere in history or
  in the working tree diff. Confirmed lost, not merely uncommitted.
- **Wrong-file commit (RULE 2.5 violation):** `git show --stat 6cfdfb227` (message
  `chore(memory/market-watcher-eod): EOD notebook 2026-08-14 cycles 1`) touches
  `docs/agent-memory/notebooks/news-scout.md` only (+7 lines) — zero relation to its own stated
  content or agent. Confirmed: this is exactly the bare-`git commit`-sweeps-the-shared-index
  failure mode `commit-boundary/SKILL.md` RULE 2.5 and `commit-mutex/SKILL.md` Step 2c
  (PATHSPEC-SCOPED) were written to close (§4).
- **Surviving uncommitted outputs:** `git status --porcelain` still shows
  `docs/analysis-briefs/{DXG,VIC,VHM}.md` modified/untracked and
  `docs/signals/price_anomaly_20260814T1600.json` untracked — EOD's ledger and signal-file writes
  (a different output class, not the notebook) survived; only the notebook cycle-log entry — the
  one output BOTH slots write to the identical full-overwrite file — was lost.

## 2. Root cause

**Two cowork slots for the same agent, same `flow/main.md` entry point, same full-overwrite
notebook target (`docs/agent-memory/notebooks/market-watcher.md`, `cycle.md` Step 5: "OVERWRITE
class ... Full-file replace each cycle; no section accumulation"), fire concurrently every
weekday at 16:00 UTC by construction of their two cron expressions.** This is not contention that
occasionally loses a race — it is a guaranteed daily double-spawn.

Two existing defenses do not close it:

1. `docs/agents/cowork-team/flow/match-slots.md` Step 4b already detects this exact shape
   (group-by-`agent_id`, ≥2 slots) but is explicitly WARN-only by design ("brief §5 R3: two
   genuinely different sub-flows... do NOT block spawns") and is documented as
   "policy-only — no runtime assertion; enforced by convention, not code check." It cannot and
   does not prevent the double-spawn.
2. The 2026-08-06 `market-watcher-notebook:main` `task_claim` mutex (§0) wraps only the
   **git add → git commit** critical section inside each flow, invoked AFTER `cycle.md` Step 5's
   raw `Write()` overwrite of the notebook file already happened, unguarded. Two concurrently
   spawned agent processes each independently overwrite the same path with no coordination at the
   write layer at all — whichever process's `Write()` call lands last on disk wins, and because the
   notebook is intentionally OVERWRITE-class (not append), the loser's content is not merged, it is
   gone. The commit-level mutex only orders WHO commits first; it cannot restore content that was
   never on disk to begin with by the time either committer reads the file.

**Independently confirmed second defect, same incident (fast-follow, §4):** neither
`eod.md` Step D nor `cycle.md`'s offhours self-commit passes a trailing pathspec on its
`git_commit_retry -m "..."` call. `git_commit_retry` (`docs/protocols/head-lock-self-cure.md` § F4)
is a thin retry wrapper around `git commit "$@"` — it adds no pathspec of its own. A bare
`git commit -m "..."` commits **whatever is currently staged in the shared index**, not only the
files this flow's own `git add` named — precisely the TOCTOU gap `commit-boundary/SKILL.md`
RULE 2.5 and `commit-mutex/SKILL.md` Step 2c (PATHSPEC-SCOPED, "NEVER bare") exist to close. This
is the direct mechanism behind commit `6cfdfb227` landing news-scout's unrelated +7 lines instead
of market-watcher-eod's own content (§1) — a second, independently reachable failure mode, not a
symptom of the first.

## 3. Recommended fix — PRIMARY: schedule-layer deterministic supersede-mutex

**Do not let the two slots ever co-appear in the same tick's spawn set.** This is a direct
generalization of an already-shipped, already-proven mechanism for the structurally identical
CHEF collision (`chef-morning`/`chef-intraday` both matching the 05:15 UTC tick,
`FIX-COWORK-CHEF-SAMETICK-MUTEX`, 2026-06-30): `scripts/agents-flow/cowork-chef-mutex.js`
exports a pure function `applyChefMutex(matches, scheduleSlots)`, invoked unconditionally inside
`cowork-match-slots.js`'s `finish()` (both legacy and adaptive pressure modes), which drops the
non-guaranteed sibling when a guaranteed CHEF slot and a non-guaranteed one collide in the same
tick. It has run in production on every tick since, is unit-tested
(`cowork-chef-mutex.test.js`), and was hardened once already against a real regression (the
`echo`-mangles-backslash-`\n` incident, `FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT`) — precisely the
kind of "prose-enforced guard silently regresses" failure class Step 4b's current WARN-only
posture already exhibits for market-watcher.

`market-watcher-eod` and `market-watcher-offhours` cannot reuse the `guaranteed` boolean as the
tie-break (both are `guaranteed: false`), so this needs a sibling mechanism with an **explicit,
declarative** priority instead of an inferred one:

**3a. Schema addition — `docs/data/cowork-schedule.json`:**
```jsonc
{
  "slot_id": "market-watcher-eod",
  ...
  "supersedes": ["market-watcher-offhours"]   // NEW — same-tick collision only; does not affect
                                                // any other tick where offhours fires alone
}
```
One-directional, opt-in, per-pair. No change needed to `market-watcher-offhours`'s own object.

**3b. New script `scripts/agents-flow/cowork-supersede-mutex.js`** (pure function, same
shape/contract style as `cowork-chef-mutex.js` — required-reading before implementing):
```js
/**
 * applySupersedeMutex(matches, scheduleSlots) → { matches, supersede_mutex_applied, dropped }
 * For every slot S in `matches` whose schedule row declares a non-empty `.supersedes` array:
 *   if any slot_id in S.supersedes is ALSO present in `matches`, drop those slot_ids from
 *   `matches` (S survives, its named victims do not). Order-preserving on survivors. Fails LOUD
 *   (error envelope + exit 1) on malformed input — same posture as applyChefMutex, this is the
 *   exact failure class ("silent-empty defeats the mutex") that class's own incident record
 *   documents; do not reproduce it here.
 */
```
- CLI entry point mirrors `cowork-chef-mutex.js`'s (reads schedule file-direct via
  `fs.readFileSync`, JSON stdin for `matches`) for symmetry/testability, but the LIVE call site
  (§3c) invokes it **in-process via `require()`**, never through a shell `echo`/`printf` pipe —
  this sidesteps the exact `echo`-backslash-corruption class `cowork-chef-mutex.js`'s own header
  comment warns about, by construction, not by discipline.
- Sibling test `scripts/agents-flow/cowork-supersede-mutex.test.js`: (1) both present → offhours
  dropped, eod survives; (2) only offhours present → no-op; (3) only eod present → no-op; (4) no
  `supersedes` field anywhere → no-op, `supersede_mutex_applied:false`; (5) malformed
  `matches`/`scheduleSlots` → fail loud, matches `applyChefMutex`'s own error-envelope contract.

**3c. Wire into `scripts/agents-flow/cowork-match-slots.js`'s `finish()`** (currently `L242-255`,
content-anchor not line-anchor — re-read live before patching):
```js
function finish(matches, extra) {
  const chefResult      = applyChefMutex(matches, scheduleSlots);
  const supersedeResult = applySupersedeMutex(chefResult.matches, scheduleSlots);   // NEW
  if (meta) {
    Object.assign(meta, {
      ...,
      chef_mutex_applied:      chefResult.chef_mutex_applied,
      supersede_mutex_applied: supersedeResult.supersede_mutex_applied              // NEW
    });
  }
  return supersedeResult.matches;
}
```
Runs on BOTH legacy and adaptive branches, both the WORK-path (`cowork-tick-preflight.sh` Step 6)
and the ERROR-fallback path (`match-slots.md` Steps 2+3) — identical unconditional-tail placement
as the CHEF mutex, for the same reason (neither pressure mode should be exempt).

**3d. Doc updates (documentation-no-op pattern, mirrors § Step 4.5c exactly):**
- `docs/agents/cowork-team/flow/pressure-cadence.md` — new **Step 4.5d — Same-agent
  notebook-collision mutex (supersede)**, worded identically to the existing 4.5c "SUPERSEDED —
  runs in-script" section, pointing at this brief as the historical incident record and stating
  the invariant: *"a slot with a non-empty `supersedes` array, when matched in the same tick as
  any slot it names, drops those named slots before spawn-fanout ever sees them."*
- `docs/agents/cowork-team/flow/match-slots.md` Step 4b — add one sentence: declared `supersedes`
  pairs are resolved deterministically in-script before this WARN check ever runs; Step 4b's WARN
  stays live as-is (unmodified) as the safety net for any future UNDECLARED same-agent collision
  (it will simply never fire for the market-watcher-eod/offhours pair again post-fix, since they
  will no longer co-occur in `MATCHES`).

**3e. Optional hardening (agent-father's call, not required for the fix to be correct):**
extend `scripts/agents-flow/cowork-schedule-consistency.test.js` with a static assertion that
every `supersedes` entry names a real `slot_id` present elsewhere in the same file — same spirit
as that test's existing `trigger_prompt`/`flow_path` consistency check, prevents a future typo'd
`supersedes` value from silently no-op'ing.

This fix is root-cause-complete on its own: once the two slots structurally cannot co-appear in
one tick's `MATCHES`, there is no second concurrent `market-watcher` process to race against —
both the lost-notebook-entry failure (§2.1) and the wrong-file-commit failure (§2.2, this
specific incident's proximate trigger) stop occurring for this pair, without touching the
notebook's OVERWRITE-class write semantics or its single-file identity at all.

## 4. SECONDARY fix (fast-follow, flagged explicitly by the router) — RULE 2.5 pathspec violation

Independent of §3 — a genuine defect on its own, since it exposes market-watcher's notebook
commits to ANY concurrently-committing peer in the shared working tree (this incident's own
`6cfdfb227` swept in news-scout's change, not another market-watcher slot). Fix: add the trailing
explicit pathspec, per `commit-boundary/SKILL.md` RULE 2.5 / `commit-mutex/SKILL.md` Step 2c
("PATHSPEC-SCOPED — NEVER bare"), to both call sites:

- `docs/agents/market-watcher/flow/eod.md` Step D:
  ```bash
  git add docs/agent-memory/notebooks/market-watcher.md docs/agent-memory/notebooks/news-scout.md
  git_commit_retry -m "chore(memory/market-session-eod): notebook YYYY-MM-DD cycles N" \
    -- docs/agent-memory/notebooks/market-watcher.md docs/agent-memory/notebooks/news-scout.md
  ```
- `docs/agents/market-watcher/flow/cycle.md` "Offhours self-commit":
  ```bash
  git add docs/agent-memory/notebooks/market-watcher.md
  git_commit_retry -m "chore(memory/market-watcher): offhours cycle YYYY-MM-DD HH:MM UTC" \
    -- docs/agent-memory/notebooks/market-watcher.md
  ```
`git_commit_retry` passes `"$@"` straight through to `git commit`, so appending `-- <paths>` after
the `-m` argument requires no change to the wrapper itself (`docs/protocols/head-lock-self-cure.md`
§ F4) — confirmed by reading its definition, not assumed.

## 5. Why not Option A (split notebook file per slot) or Option C (mutex around the raw write)

Both considered per the dispatch's own framing; neither is recommended as primary:

- **Option A (give `market-watcher-eod` its own notebook target, e.g.
  `market-watcher-eod.md`):** rejected as primary. `market-watcher`'s notebook is a genuine
  single-file identity elsewhere in the system — `docs/agents/fb-market-poster/flow/daily.md:102`
  and `init.md:62` read `docs/agent-memory/notebooks/market-watcher.md` directly by path as ONE of
  its 4 fixed daily-recap inputs ("Anomalies"); splitting the file would require that consumer
  (and any other future one) to merge two paths instead of reading one, permanently, to fix a
  scheduling collision that has nothing to do with the notebook's own shape. The root cause is
  "two writers raced on one tick," not "one file cannot represent two slots" — §3 removes the race
  itself, which removes the need for a second file entirely.
- **Option C (task_claim mutex around `cycle.md` Step 5's raw `Write()` call itself, not just the
  commit):** rejected as primary. It would prevent a torn/interleaved write, but the notebook is
  deliberately OVERWRITE-class (`cycle.md` Step 5: "Full-file replace each cycle; no section
  accumulation," ≤80L hard cap) — whichever writer acquires the lock SECOND still fully replaces
  the first writer's content, since there is no merge step. Mutex-only trades "possible corrupted
  interleave" for "guaranteed clean loss of whichever cycle loses the lock race" — it does not
  preserve the EOD cycle's content any better than today, it just makes the loss deterministic
  instead of racy. It also adds always-on lock plumbing to a write path (every `cycle.md` Step 5,
  many times a day) that currently has zero coordination cost, to guard against a collision that
  only genuinely exists once a day, at one specific tick — §3 eliminates the collision at its
  source instead.

Both remain viable, independent defense-in-depth measures agent-father/PO could layer in later if
a genuinely NEW same-agent, same-notebook collision shape is discovered elsewhere; neither is
necessary once §3 ships.

## 6. Residual risk — flagged, not in scope here

`alert-commander-market` (`*/15 2-8 * * 1-5`) and `alert-commander-critical` (`0 */4 * * *`) share
the identical same-agent multi-slot collision SHAPE at 04:00/08:00 UTC weekdays (both within the
02:00-08:59 market-hours window `alert-commander-market` also covers). Checked this cycle:
`alert-commander`'s own notebook write is **APPEND class**
(`docs/agents/alert-commander/flow/stage-dispatch-log.md:73`, via `notebook-write/SKILL.md` AC-2
retention — keep last 3 `## ` sections), not OVERWRITE class — a same-tick collision there risks
at worst an interleaved/duplicate append, not a full-file content loss. Materially lower severity
than this incident; flagging for system-auditor/agent-father awareness only, no action requested
in this brief. The `supersedes` mechanism in §3 is intentionally opt-in/declarative (never
inferred from cron frequency or the `guaranteed` flag), so shipping it here has zero effect on
alert-commander or any other slot pair unless a future author explicitly opts a pair in — confirmed
this cycle that no other same-agent multi-slot pair in the live schedule (`news-scout`'s 2 slots,
`bctc-analyst`'s 4, `refine_bctc_md`'s 4) shares a colliding tick today.

## 7. Standard Detection + handoff

**BUILD-STANDARD: not-applicable** (bug-fix/design spec, in-zone, no new service, no new DDD
layer — one schedule-data field + one new pure-function script mirroring an existing shipped
pattern + two flow-doc pathspec edits).

**Zone:** `docs/data/cowork-schedule.json` (data) + `scripts/agents-flow/` (new script + test,
developer-zone per the same TE-T02/S1-S20 precedent `agents-architect` cites elsewhere — this
brief does not author code) + `docs/agents/cowork-team/flow/` (2 doc updates, agent-father zone)
+ `docs/agents/market-watcher/flow/` (2 pathspec edits, agent-father zone).

**Files to create/modify:**
| Action | Path | Owner |
|---|---|---|
| MODIFY | `docs/data/cowork-schedule.json` (add `supersedes` to `market-watcher-eod`) | agent-father |
| CREATE | `scripts/agents-flow/cowork-supersede-mutex.js` (§3b) | developer |
| CREATE | `scripts/agents-flow/cowork-supersede-mutex.test.js` (§3b) | developer |
| MODIFY | `scripts/agents-flow/cowork-match-slots.js` (`finish()` wiring, §3c) | developer |
| MODIFY | `docs/agents/cowork-team/flow/pressure-cadence.md` (Step 4.5d, §3d) | agent-father |
| MODIFY | `docs/agents/cowork-team/flow/match-slots.md` (Step 4b note, §3d) | agent-father |
| MODIFY (optional) | `scripts/agents-flow/cowork-schedule-consistency.test.js` (§3e) | developer |
| MODIFY | `docs/agents/market-watcher/flow/eod.md` (Step D pathspec, §4) | agent-father |
| MODIFY | `docs/agents/market-watcher/flow/cycle.md` (offhours self-commit pathspec, §4) | agent-father |

Note: this brief spans both an `agent-father` zone (docs/agents/**, cowork-schedule.json as
agent-behavior data) and a `developer` zone (scripts/agents-flow/**, code). Per the same
`po_routing_ruling_20260721` artifact-class split other recent briefs from this notebook have
applied (e.g. the 2026-08-14 dev-team `.head` brief), agent-father should implement the
docs/data-only pieces (schema field, 2 doc updates, 2 pathspec edits) directly and route the
script CREATE/MODIFY pieces (§3b/§3c, optionally §3e) to a `developer` task — flagged here so PO
can split/mint accordingly, not silently dropped.

## RETURN
DONE: Technical design complete — `docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md`
ZONE: docs/data/cowork-schedule.json + scripts/agents-flow/ + docs/agents/cowork-team/flow/ + docs/agents/market-watcher/flow/
NEXT: agent-father (schema field + 2 doc updates + 2 pathspec fixes, §3a/§3d/§4) | developer (new script + test + match-slots.js wiring, §3b/§3c, via PO split)
PIPELINE: continue
