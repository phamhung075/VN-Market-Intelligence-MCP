# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

<!-- Entries 2026-08-23 09:30Z (FIX-SIGNAL-TYPE-ROUTING-GAP-bctc-image-fetch-degraded) and
     09:45Z (cowork-team Step 4.7 + 5.3 doc-truth pair) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260823.md on 2026-08-23
     (self-prune: 188L/16787B against the 200L line cap and the 12000B byte cap). Nothing
     deleted; full record in the archive file and git history. Same convention as the
     2026-08-12 prune noted above. -->

<!-- Entry 2026-08-23 14:23 (Keep/maintenance — CHECK6-FLEET-ROLLOUT-DEBUG-LOGGER-PROTOCOL)
     also split to docs/agent-memory/notebooks/archive/agent-father-archive-20260823.md
     on 2026-08-23, second prune of the same day (198L against the 200L cap). Nothing deleted. -->

<!-- Entries 2026-08-23T15:25Z (TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY), 2026-08-23T16:05Z
     (2 mid-task P0s from PO's CI-red triage), and 2026-08-24T13:35Z
     (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260825.md on 2026-08-25
     (AC-2 retention: current cycle + 2 prior = 3 sections ALWAYS; this Keep/maintenance
     write pushed the count to 6). Nothing deleted; full record in the archive file and git
     history. Same convention as the prior splits noted above. -->

## FIX 2026-08-25T03:05Z — FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW (P0, dispatcher: dev-team RLC)

Wired § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation into `docs/agents/dev-team/flow/main.md`
at the Session-Gate→Step-1 anchor (FIRST of ILC→SECONDARY-Drain→QA-Drain→Step1), calling the
already-shipped `scripts/devteam-backlog-claim-incident-lane-consumer.jq` verbatim, per architect brief
`docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md` §4d (sibling scripts row
`FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS` DONE_VERIFIED, commit `cd0039432`). Also updated
SECONDARY-Drain's own intro sentence (no longer physically first), one new Reusable Scripts bullet, one
Invariants clause naming all 3 concurrency budgets, size-justification header (+88L, 1279→1367).
Committed `94716bfe6` (main.md), pushed nowhere (standing push-disarm).
**LESSON — dispatcher live-caught 2 defects in the neighbour SECONDARY-Drain section MINUTES before
dispatching this row, and explicitly warned not to copy them:** (1) that section's readback queries
`.task_board.review[]` only, but its own claim script's stated candidate set is `review[] UNION done[]`
— a `done[]`-origin claim silently vanishes from a lane-named readback. (2) that section's spawn text
hardcodes a false `"status=REVIEW, branch:null"` premise. Neither is copied here: this section's own
readback is a generic all-`.task_board`-lane scan (`.task_board | to_entries[] | select(.value|type==
"array") | ...`), and its spawn text derives status/lane/claimed_by from the actually-picked row. Both
defects flagged in RETURN as a follow-up row against SECONDARY-Drain itself — not retrofitted here
(out of this row's own zone/scope). This task's own terminal-shape orch-state.json write (in_progress[]
-> review[], next_agent=qa, `.head` idle-reset) WAS committed directly (`c677e3ac9`) — the dispatching
tick's own instructions named this the allowed "ONE signal-queue DONE-mark per task dispatch" carve-out
in `FU-AGENT-FATHER-ORCH-SCOPE`, unlike the UNCOMMITTED precedent noted just above.

## FIX 2026-08-25T13:00Z — FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY (P0, dispatcher: router, task_board.backlog[485])

Closed the exact follow-up flagged in my own ILC entry immediately above. Router reproduced live
2026-08-25T12:37Z: SECONDARY-Drain's claim script (`scripts/devteam-review-claim-secondary-drain.jq`,
byte-unchanged, `review[] ∪ done[]` union is deliberate per its own header) correctly stamped a
`done[]`-origin row (`FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS`), but `docs/agents/dev-team/flow/main.md`'s
readback named `.task_board.review[]` only, so `picked` came back empty and the row was never
dispatched — no error, silent strand. Corroborated chronic (PO's 2026-08-25T12:30Z triage: all 3 of
that day's earlier picks were `done[]`-origin; `review[]`'s 25 rows have never once carried a
`secondary_claimed_*` stamp).

Fix: widened the readback to `.task_board | to_entries[] | select(.value|type=="array") | .key as $lane
| .value[] | select(...) | . + {_lane: $lane}` — copied the ILC section's own generic all-lane shape
verbatim rather than inventing a new one, per the dispatch instruction. Also fixed AC-7 (spawn-prompt
premise): dropped the hardcoded "stale review[]-lane row (status=REVIEW, branch:null)" / "Read its
status_note/review_note fields directly" text, now derives `_lane`/`status` from the picked row and no
longer assumes status_note/review_note exist on a done[]-origin pick. Size-justification header entry
appended (+14L, 1369→1383).

**Verification actually run (not narrated):** live jq repro against a scratch fixture reproducing the
router's exact stamped row — OLD `.task_board.review[]`-only filter returns empty (bug reproduced,
exit 0 no output); NEW all-lane filter returns the row with `_lane:"done"` (fix confirmed, exit 0).
Regression-checked a `review[]`-origin pick still resolves (`_lane:"review"`) and the no-match/no-op
case still returns empty cleanly. Ran the NEW filter against the live `docs/data/orch/orch-state.json`
(read-only) — exits 0, no jq errors, confirms `task_board`'s non-array keys (`head`,
`last_triaged_at`, ...) are correctly excluded by the `type=="array"` guard. Confirmed live that
`FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS` is still sitting in `.task_board.done[]` carrying the
router's exact stamp from the repro — left AS-IS (not manually dispatched): this lane re-picks the
same oldest eligible row every tick until it resolves (documented residual, unchanged), so the next
live dev-team tick will re-stamp it and this time the widened readback will actually find and dispatch
it to `po`. `scripts/audits/devteam-dispatch-gate-satisfiability.sh` does not test SECONDARY-Drain at
all (grep-confirmed, 0 matches for "secondary") — no existing regression suite covers this call site;
none broken by this change, none available to re-run as a fleet-level check.

Committed `183e1ad8f` (main.md only, explicit pathspec on both `git add` and `git commit -F -- <path>`),
pushed nowhere (standing push-disarm, 360+ commits unpushed). Left undone: no regression verifier
script for this call site exists or was created (out of scope — scripts/ is outside agent-father's
commit_zone; flagging as a fast-follow candidate, not silently assumed covered).

## Keep (maintenance) 2026-08-25T13:01Z — scheduled cron tick, zero escalations

- Trigger: scheduled (`cron-agent-father` tick, orphan+roster sweep). Pre-Check gate (`git diff
  --name-only HEAD~3..HEAD` at cycle start, commits `c3f3901b8`/`7cc234af9`/`7a0404657`) touched
  zero `.claude/agents/*.md`/`docs/agents/*/flow/*.md` → Steps 1-2 (orphan+roster scan) SKIPPED
  per CADRAT-3 routing (empty scan-orphans output by construction, not a probe failure — router's
  own `task_list_held(kind="orphan-signal")` also returned 0 at gate time). Steps 3-5
  (sweep-fixes) + 5b (team-tool-recheck) ran unconditionally.
- **Scanned:** 41 real agent init.md cards (47 `docs/agents/*/` dirs minus `shared`/`tools`
  non-agent dirs, minus `semble-search` — pointer doc, no `agent:` YAML root — minus 3
  structurally-INIT-MISSING dirs `cowork-team`/`dev-news-fetch`/`dev-team`, unchanged from the
  2026-08-23T14:23Z baseline count).
- **Checks #1 (fail-loud-protocol) / #2 (Error Boundary, one-hop+dispatch-table resolved, run
  live not assumed) / #3 (boundary_rules) / #4 (flow.default path resolves) / #6
  (debug-logger-protocol):** 41/41 PASS, all five.
- **Check #5 (version staleness, >90d):** 1 FAIL — `market-analyst` pinned `"2026-05-25"` (92d
  stale). Auto-fixed: bumped to `"2026-08-25"` (Step 4 table: mechanical, no manual authoring
  implied).
- **Step 5b (team-tool-recheck):** zero drift vs the 2026-08-23T14:23Z report (2-day gap in the
  daily cadence — first re-run since). Same 6 CRITICAL (Bash-present-by-construction) findings,
  same honestly-qualified descriptions, positive control (alert-commander) held. Mechanical
  enforcement still 0/0. Report: `docs/agent-memory/health/team-tool-recheck-2026-08-25-1259.md`.
- **Stale notebooks (Step 5, informational only):** 11/47 not committed in >30d (oldest 3 tied at
  115d: `idea-forge.md`/`market-analyst.md`/`semble-search.md`).
- **Escalations: 0. Orphans: N/A (Steps 1-2 gated off this cycle).**
- Self-pruned this notebook (176L, 6 sections after this write's own append → 3 retained, 3
  oldest split verbatim to `archive/agent-father-archive-20260825.md`) before landing, per AC-2's
  always-3 steady state.
- **Lesson:** none new — a clean, low-signal sweep confirms the fleet stayed guide-compliant
  across the 2-day cadence gap; the only drift found was ordinary version staleness on one agent,
  caught and fixed mechanically by the check that exists for exactly this.
