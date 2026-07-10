<!-- size-justification: ~330L — covers root-cause re-verification, 2 empirically-confirmed exception cases, a corrected archive target, a newly-discovered schema gap (BLOCKED lane-coherence), and a 6-item PM decomposition for a 385-row data-hygiene + 2-script + 1-schema-file sprint. All sections load-bearing for PM atomization; no reuse benefit from splitting. -->

# Architecture Brief — BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP

**Date:** 2026-07-10
**Author:** architect
**Status:** DESIGN COMPLETE — handoff to PM (multi-task sprint, NOT single-shot)
**Task row:** `docs/data/orch/orch-state.json` `.task_board.ready[id=BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP]`
**Scope:** Data-quality + 2 scripts (`scripts/orch-cold-evict.sh`, new sweep driver) + 1 schema file (`orchStateSchema.ts`). PLAN/DESIGN — does not mutate orch-state.json (one exception noted in §7, deliberately NOT executed by architect).

---

## 0. TL;DR

PO's diagnosis is **confirmed accurate on every mechanical count** (root cause, 55/12/1 split, 129 total). Two corrections and one new blocking gap found during verification:

1. **D1's archive target is wrong.** PO named `docs/data/orch/archive/backlog-detail.json` — that file is the LIVE-task hot-stub/cold-detail split target (361/384 backlog rows already point there via `detail_ref`, still-open work), not a terminal-eviction sink. The correct target is `docs/data/orch/archive/<MONTH>.json` → `.backlog_detail[]` — a field that **already exists in the cold-file schema** (`scripts/orch-cold-evict.sh:323`) and has sat empty (`0` items) in every monthly archive since inception. This was clearly pre-planned and never wired up.
2. **NEW gap: `BLOCKED` status has no coherent lane anywhere**, under the *current* `LANE_ALLOWED_STATUSES` table — not in backlog, not in review, not in in_progress. 7 live rows (4 backlog + 3 review) can never pass lane-coherence in ANY lane without a schema change. This blocks D5's hard-fail flip until resolved — a new sub-task **D2.5** is required, needing PO ratification (mirrors the ADD-1 `READY` precedent).
3. **D0's "do not trust the label" caution is not theoretical** — a first-pass spot-check of 5 of the 55 "terminal" rows found **2 confirmed mislabels in opposite directions** (see §4): one row falsely `DONE` (live defect still reproducing today), one row falsely `BLOCKED` (sprint actually shipped 4/4 stages). This validates the router's instruction to err toward correctness over speed and confirms D0 cannot be a blind bulk operation.

Recommendation: **decompose into a PM-tracked multi-task sprint**, not a single-shot script. Sequencing in §8.

---

## 1. Root cause — CONFIRMED (live code read)

`scripts/orch-cold-evict.sh` (553L) evicts exactly 5 categories: `task_board.done[]`, `task_board.done_verified[]`, `task_board.active_sprints[]` (whole-sprint predicate), `sprint_goal.entries[]`, `signal_queue.rows[]/archive[]`. **It has no code path that ever reads `task_board.backlog[]`** (verified via full read, lines 125-347 — `compute_id_maps()` and `build_hot_temp()` enumerate exactly those 5 arrays, nothing else). Cross-checked against the original design doc, `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` §2: the sprint-eviction rule was scoped to `active_sprints[]` only from day one — task-level `backlog[]` terminal-status eviction was **never in scope of any prior brief**, not an implementation slip. `LANE_ALLOWED_STATUSES.backlog = {BACKLOG}` (the coherence table) shows the *intent* was always "backlog rows are always BACKLOG status" — terminal statuses landing there are 100% a status-flip-without-lane-move bug (matches `feedback_review_status_stuck_in_inprogress_lane_blocks_wip`), confirmed, not disputed.

## 2. Live count re-verification — matches PO exactly, plus one addition PO missed

Ran `bun scripts/orch-validate.mjs` live: **129 coherence warnings**, confirmed. Full histogram (`jq` against live `orch-state.json`, all 7 flat lanes):

| Lane | Status | Count | Coherent? |
|---|---|---|---|
| backlog | BACKLOG | 259 | yes |
| backlog | TODO | 47 | **no** → D3 |
| backlog | DONE | 34 | **no** → D1 |
| review | REVIEW | 17 | yes |
| done | DONE | 15 | yes |
| backlog | CANCELLED | 12 | **no** → D1 |
| done_verified | DONE_VERIFIED | 11 | yes |
| backlog | DEFERRED | 11 | **no** → D3 |
| backlog | DONE_VERIFIED | 9 | **no** → D1 |
| backlog | REVIEW | 5 | **no** → D2 |
| backlog | BLOCKED | 4 | **no** → D2.5 (schema fix, zero data mutation) |
| review | BLOCKED | 3 | **no** → D2.5 (schema fix, zero data mutation) |
| backlog | IN_PROGRESS | 3 | **no** → D2 |
| review | DONE_VERIFIED | 1 | **no** → D1 |
| ready | READY | 1 | yes |

`55 (D1 backlog-terminal) + 12 (D2/D2.5 mislaned) + 1 (D1 review DONE_VERIFIED) + 58 (D3 TODO/DEFERRED) + 3 (D2.5 review BLOCKED, PO did not enumerate this one) = 129`. Exact match — PO's plan is right on substance, missed only the 3 `review[]` BLOCKED rows in its explicit list (they were implicitly inside the "129" total but not broken out).

**`active_sprints[].tasks[]` is NOT covered by `checkLaneCoherence()`** (by design — it only iterates the 7 flat lanes) — 1 `BLOCKED` task there is out of this sweep's scope, governed separately by the whole-sprint eviction predicate.

## 3. `SHG-2..5` handling — PO's fold is correct, one AC-staleness note

Read the 4 rows directly: all correctly `status:BACKLOG`, `folded_into:"BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP"`, `blocked_reason` set, not closed. Correct — do not touch until D5 lands. One note for whoever closes them: `SHG-5`'s literal AC ("uncomment exit 5 in validate.sh") is **stale wording** — that bash G-1..G-6 gate code was fully superseded by `SSOT-W1-BASH-SHIM` (`scripts/orch-state-validate.sh` is now a thin `exec bun orch-validate.mjs` shim; there is no "exit 5" left to uncomment). Its *intent* — promote lane-coherence from warn to hard-fail — is fully satisfied by D5 at the new location (`orch-validate.mjs:369-405`). Close as DONE_VERIFIED on D5 landing despite the wording drift (same pattern as the tasklock ticket I closed 2026-07-10T15:45Z — AC wording ≠ shipped field name, intent match is what counts).

## 4. Empirical spot-check — 2 confirmed exceptions (D0 is NOT a formality)

Sampled 5 of the 55 "terminal" rows + re-checked 1 of the 12 "mislaned" rows, using: git commit-hash verification where present, and a live-DB probe where the row makes a falsifiable data claim.

**Exception 1 — `FIX-BCTC-BANK-SUMMARY-MAPPING` (status=`DONE` in backlog[], but genuinely still open):**
Row title cites a concrete claim: CTG 2026Q1 `net_margin_pct=229157%`, `total_assets=0`. Live-probed the serving DB directly (`docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '...bun:sqlite...'`):
```
action_code=CTG period=2026Q1 net_margin_pct=229157.06 total_assets=0
total_liabilities=24735484770 validation_status=low_confidence
validation_notes="Accounting identity violated: ... mismatch 100.0%"
parsed_at=2026-07-10T07:51:33.648Z   ← re-parsed THIS MORNING, still broken
```
The exact defect the task describes is still live, re-confirmed by a same-day re-parse. Corroborating: its own review-lane sub-task `TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST` (status=`BLOCKED`) has a `status_note` timestamped `2026-07-10T03:39:51Z` (same day, from a qa review-drain sweep) independently RAW-probing the identical live row and confirming AC-6/AC-10 both still unmet, blocked on an ops re-ingest step. The parent `DONE` label is provably wrong. **Action: exclude from D1 eviction; do not close.** Re-label decision (BLOCKED vs stays BACKLOG pending ops) is a PO/PM call, not prescribed here.

**Exception 2 — `FACTORY-INTERFACE-split-server-ts` (status=`BLOCKED` in backlog[], one of the "12 mislaned active" rows, but actually fully shipped):**
This is the exact sprint documented in project memory `project_bounded1_first_pickup_stale_backlog_hygiene_debt.md` as completed 4/4 stages. Confirmed independently via git log — all 4 commits are present and in this repo's actual history: `bce8be44b`, `821bbbeea`, `56f922c93`, `8c228ffa6` (the last of these is literally the most recent commit at session start, per the git-status banner). This row should never have been in the "relocate to correct active lane" bucket at all — it needs closing via the existing `scripts/devteam-close-task-done-verified.jq` generic closer (moves any-lane row → `done_verified[]`), not lane relocation.

**Non-exceptions confirmed clean (spot-check control group):** `SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE` (DONE, cross-checked against my own same-week notebook entry — genuinely closed with a real `handoff_ref` brief). `FIX-OHLCV-DAILY-AGGREGATOR-STALE` (CANCELLED, originally `FOLDED`, consolidated into `ARCH-CRON-SCHEDULER-RELIABILITY` — legitimate). 3 of the 13 rows carrying a `commit`/`dev_commits` field were spot-checked with `git log --oneline -1 <hash>` — all 3 resolve to real commits whose messages match the task (`ac8ad6c78`, `b69fef756`, `6d080acf2`).

**Conclusion:** error rate in this small sample is non-trivial (2/56 candidates checked, both real). D0 execution must run every one of the 56 backlog/review terminal-labeled rows through at least a mechanical corroboration pass, with **mandatory live-reprobe** for any row whose title makes a falsifiable data/infra claim (numbers, tickers, uptime, "N rows"). Blind bulk-evict on status label alone is not safe.

## 5. Existing reusable primitives (do not duplicate)

- `scripts/orch-cold-evict.sh` — extend (D4), do not fork. Already the sole eviction path; already one of 2 blessed `ORCH_APPLY_ALLOW_SHRINK` callers (no new bypass grant needed for D1/D4).
- `scripts/orch-apply.sh` + `scripts/orch-conservation-check.mjs` — already wired (Stage 2 of `orch-apply.sh`, confirmed live-read), matches PO's "already wired" mandate exactly. Every write in this sweep routes through the existing `jq | orch-apply.sh` idiom — no new write path.
- `scripts/devteam-close-task-done-verified.jq` — existing generic any-lane→`done_verified[]` closer (searches backlog/ready/in_progress/review/qa by id). Use this for Exception 2 (`FACTORY-INTERFACE-split-server-ts`) and any other D0-discovered false-negative (label says open/blocked, reality says done).
- `LANE_ALLOWED_STATUSES` in `apps/mcp-server/src/infrastructure/orchStateSchema.ts:412` — extend (D2.5), single SSOT already designed for exactly this kind of change (see ADD-1 `READY` precedent, same file).
- `docs/data/orch/archive/<MONTH>.json` `.backlog_detail[]` — dormant, reuse as-is for D1/D4's cold sink (§0.1).

## 6. D2.5 — NEW required schema decision (blocks D5)

`checkLaneCoherence()`'s `LANE_ALLOWED_STATUSES` table currently has no lane that accepts `BLOCKED`. Two designs considered:

- **Rejected: new `task_board.blocked[]` lane.** `TaskBoardSchema` is `.strict()` — adding a lane touches `TaskBoardSchema`, `collectAllTaskIds()`, `checkRefIntegrity()`'s `flatLanes` array, `orch-cold-evict.sh`'s lane enumeration, and every flow-doc/skill that iterates lanes (dispatch, dev-team promote). Large blast radius. Also loses context: an `in_progress` task going `BLOCKED` shouldn't lose its in-progress framing by being shoved into an undifferentiated bucket.
- **Chosen (recommend, PO to ratify): treat `BLOCKED` as orthogonal to lane** — extend the allowed-set of the 3 lanes it has actually been observed in:
  ```ts
  backlog:     new Set(["BACKLOG", "BLOCKED"]),
  review:      new Set(["REVIEW", "BLOCKED"]),
  in_progress: new Set(["IN_PROGRESS", "BLOCKED"]),
  ```
  Matches the enum's own definition ("BLOCKED — externally blocked, detail in verify_note") — a cross-cutting sub-state, not a lane. `qa`/`done`/`done_verified`/`ready` are deliberately left unchanged (never observed there in the wild; "done but blocked" is semantically contradictory).

This is a 1-file, ~3-line code change plus updating the doc-comment block above it (lines 392-400). **Requires PO sign-off before merge** — same class of decision as ADD-1 (`READY` — "PO ratified option-a 2026-06-27T08:35:40Z"). Once landed, the 7 live BLOCKED rows become coherent **with zero data mutation** (they already sit in backlog/review).

## 7. What architect did NOT execute (left for PM-dispatched execution)

Per role boundary (`not_my_job: task breakdown`, `NEVER write production code`) and given the confirmed size (385-row backlog, 2 script/schema changes, PO-gated decision), architect did not: run any write against live `orch-state.json`, implement the `orch-cold-evict.sh` extension, or close Exception 2. All findings above are handoff-ready (commit hashes, exact live-probe commands, and exact file:line targets included) so the executing agent does not need to re-derive them.

## 8. Decomposition — recommend PM opens a multi-task sprint (not single-shot)

| # | Task | Risk | Depends on | Notes |
|---|---|---|---|---|
| **D3** | Normalize 58 backlog `TODO`/`DEFERRED` rows → `status:BACKLOG`, preserve old value in `verify_note` (append, don't clobber existing). Single `jq \| orch-apply.sh` write. | LOW — pure relabel, no data claim, matches validator's own auto-fix hint text verbatim. | none | Run first — cheapest, biggest warning-count drop (129→71). |
| **D2.5** | PO ratify §6 design; dev extends `LANE_ALLOWED_STATUSES` (3 lines) + doc-comment. | LOW | PO ratification | Zero data mutation once landed — resolves 7 warnings for free. |
| **D4** | Extend `scripts/orch-cold-evict.sh`: new Pass-1 category scanning flat lanes `{backlog, review, qa, in_progress, ready}` (NOT done/done_verified — already handled) for `TERMINAL_SET` status; new cold sink = existing dormant `.backlog_detail[]` field in monthly archive; add idempotency read (`COLD_BACKLOG_DETAIL_IDS`) mirroring existing pattern; add a migration-time `--exclude-ids` param (or exclude-file) so the FIRST live run can skip D0-flagged false-positives like Exception 1 — this is a one-time migration safety valve, not a permanent feature. New test file `scripts/test/orch-cold-evict-tests.sh` (no prior test existed for this script) mirroring the fixture/hash-proof style of `orch-apply-wrapper-tests.sh`: (a) backlog terminal row evicted correctly to `.backlog_detail[]`, (b) BLOCKED/REVIEW/IN_PROGRESS rows NOT evicted (non-terminal), (c) `--exclude-ids` honored, (d) idempotent re-run, (e) conservation guard still trips on runaway shrink, (f) `--dry-run` preview includes new category. | MEDIUM — code change to a script already handling the SSOT write path; must not regress existing done/done_verified/sprint eviction. | none (parallel with D0) | Zone: `scripts/` — routes to generic `developer` per zone-detect Tier-2 (root/scripts span), not a single `dev-<svc>`. |
| **D0** | Per-row triage of the 56 backlog/review terminal-labeled rows: Tier 1 (13 rows have `commit`/`dev_commits`/`done_commits` in `backlog-detail.json` — mechanical `git log --oneline -1 <hash>` corroboration), Tier 2 (remaining ~43 — `git log --all --grep=<id>` + read `status_note`/`resolution_note`), Tier 3 (MANDATORY live-reprobe for any row with a falsifiable data/infra claim in its title — regex for numbers/tickers/dates). Seed the exclude-list with **Exception 1** (`FIX-BCTC-BANK-SUMMARY-MAPPING`, evidence in §4 — do not re-verify, already proven open). Also verify the 8 D2-relocate candidates (5 REVIEW + 3 IN_PROGRESS in backlog[]) with the same rigor — one of the 12 originally-scoped "mislaned active" rows (**Exception 2**, `FACTORY-INTERFACE-split-server-ts`) already proven to need `devteam-close-task-done-verified.jq` instead of relocation; the 8 D2 candidates were not sampled and could contain siblings of that pattern. | MEDIUM-HIGH — the one step explicitly requiring judgment, not mechanical. | none (parallel with D4) | Script-assisted, not 56 manual turns — see `docs/architecture-briefs` §4 methodology. Output: adjudicated JSON list (confirm-terminal / exclude / relabel). |
| **D1** | Run the D4-extended `orch-cold-evict.sh` against the D0-confirmed set (excludes Exception 1 and any other D0-flagged false positives). Close Exception 2 via `devteam-close-task-done-verified.jq`. Relocate the D0-confirmed subset of the 8 D2 candidates (review-status → `review[]`, in_progress-status → `in_progress[]`) via a small jq lane-move transform. | LOW (mechanical once D0/D4 land) | D0, D4 | The actual "sweep" execution. |
| **D5** | Once `bun scripts/orch-validate.mjs` reports 0 coherence warnings live: flip `orch-validate.mjs`'s Stage-1b block (lines ~369-405) from warn-print-only to hard-fail (`process.exit(2)`), mirroring the existing Stage-1c/1d pattern exactly (same file, same shape, ~10 line change). Then close `SHG-2/3/4/5` DONE_VERIFIED (§3 wording note). | LOW (small, well-precedented diff) | D3, D2.5, D1 all landed + 0 warnings confirmed live | Verification gate is literal: re-run the validator, confirm exit still 0 with an ACTUAL schema violation injected as a negative-path test (mirrors `negative_path_corrupts_ssot` hazard — test in a throwaway fixture, never the real file). |

**Suggested reusable driver name** (per PO's `scripts/orch-backlog-hygiene-sweep.sh` mandate): keep this as the **D1 execution wrapper only** (orchestrates: call extended `orch-cold-evict.sh` with the D0 exclude-list, call the jq lane-move for D2, call the jq closer for exceptions) — not a reimplementation of D4's eviction logic. `--dry-run` mode inherited for free from `orch-cold-evict.sh --dry-run` plus a `jq` dry-preview for the D2 lane-moves.

## 9. Verification gate (unchanged from router's ask, restated precisely)

1. `bun scripts/orch-validate.mjs` → `0 coherence warning(s)` in stdout, exit 0.
2. `SHG-2/3/4/5` all `status:DONE_VERIFIED` in `task_board.done_verified[]`.
3. A fresh BOUNDED-1/drain-signals pick lands on a genuinely-open row (spot-check by dispatcher, not architect — outside this brief's execution).
4. Negative-path proof for D5: feed a fixture with a deliberate lane-coherence violation through `orch-validate.mjs` post-flip → confirm non-zero exit (proves the hard-fail actually fires, not just that warnings hit zero by coincidence).

## 10. Standard Detection

```
BUG-FIX / REFACTOR (in-zone, no new primitives) / MAINTENANCE:
  → BUILD-STANDARD: not-applicable (skip)
```
Zone: `cross-service` (scripts/) + single-file touch in `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (D2.5). PM: route D4/D1 to generic `developer` (zone-detect Tier-2: root/scripts span multiple services), route D2.5's schema-file change to `dev-mcp-server` (single in-zone file).

## 11. Risk flags

- **R-CRIT-1 (mitigated by design):** blind bulk-evict of the 55/56 without D0 would have silently archived at least 1 genuinely-open P1 data-integrity defect (Exception 1) — sequencing D0 before D1 in §8 is load-bearing, not optional.
- **R-HIGH-1:** D4 modifies the sole SSOT write-eviction script — any regression risks corrupting the already-working done/done_verified/sprint eviction paths. Mitigate: new test file is mandatory before D4 merges (§8 D4 row), run against a throwaway fixture per existing `ORCH_APPLY_LIVE_FILE_OVERRIDE` idiom, never the live file.
- **R-MED-1:** D2.5 is a schema-semantics decision (which lanes may host `BLOCKED`) — do not let dev/PM silently pick without PO ratification; flag explicitly in the PM handoff.
- **R-LOW-1:** evicting terminal backlog rows leaves their `backlog-detail.json` prose entries orphaned (harmless — that file is not schema/ref-integrity checked in that direction) — optional cleanup, not gating.
