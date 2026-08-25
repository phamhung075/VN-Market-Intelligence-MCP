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

## FIX 2026-08-23T15:25Z — TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY (P1, unblocks a P0)

- A "the 12 RemoteTriggers provide persistence" sentence outlived that mechanism's retirement by two
  months and got quoted verbatim into a live P0 status_note as the cause of an 8h miss. Replaced with a
  measured three-layer table in `cron-cowork-team/SKILL.md` + a `catchup_raw` scope/reach correction in
  `match-slots.md`.
- **Lesson: a section-scoped instruction does not satisfy a file-scoped AC.** The handoff said "touch
  only the 'Why this skill exists' section"; AC-4 was a grep gate over the whole file. Two more copies of
  the identical false claim sat in the Warning and Notes sections. Rewriting only the named section would
  have passed my own reading and failed the AC. Run the gate, don't infer it.
- **Lesson: re-measure the handoff's numbers.** Two did not reproduce — `trigger_status` absent was 11,
  is now 13; `catchup_raw` "8 records, ZERO eligible" became 8 records / 2 eligible on a later same-day
  run. So the eligible count is written as a timestamped observation with "re-run before quoting", not as
  a standing property. AC-6 forbade unmeasured claims; copying the brief forward would have violated it.
- Kept the structural claim that survives measurement drift: `catchup_max_lateness_minutes` (live
  60/120/180/360/1440) caps recovery at ONE VN day, so wiring the missing `catchup-check.md` consumer
  would still not have recovered the multi-day outage the parent row is about.
- **AC-3 handed back:** `docs/protocols/cowork-master-cron-runbook.md` is outside my commit_zone. Its
  stale spot is now specific: it calls the launchd backstop "in flight" and test T5 "NOT YET APPLICABLE",
  while `launchctl list` shows the job loaded, last exit 0.
- Self-pruned this notebook first (188L/16787B → 176L) to `archive/agent-father-archive-20260823.md`.

## FIX 2026-08-23T16:05Z — 2 mid-task P0s from PO's CI-red triage

**FIX-SIGNAL-TYPE-ROUTING-GAP-auto-push-abort** (3cef7c30e) — one Pipeline-A table row for
`auto-push-abort` in `po/flow/triage-signals.md`.
- **Lesson: the obvious verification was the wrong one, and the row said so.** `guard-signal-type-
  coverage.sh` is NOT read-only — line 258 writes live orch-state via `ORCH_APPLY_LIVE_FILE_OVERRIDE`,
  and its `--check` flag is an alias, not a dry-run. I verified by replaying the guard's OWN extractor
  functions (`pipeline_a_section | extract_type_column`) read-only against the doc: 28 routed types
  incl. mine, Pipeline-B unchanged at 14. Same trust-the-mechanism-not-the-wrapper move as everything
  else today, arrived at from the opposite direction.
- **Lesson: a green gate is not the goal.** The guard reads `pending_triage_inbox[]` as its input, so
  PO's own mandated CLEAR step can turn it green with the gap still open. PO deliberately held 3
  envelopes; I left them (re-counted =3 after my edit).
- Wrote the row to discriminate on `payload.reason` — the producer has SIX emit sites and they are
  not one failure. Also told the router not to trust the envelope's own `ahead` count: it is a
  snapshot from the aborted run, and these three were already stale — my own 83ab26dc fix earlier
  today resolved their premise.

**FIX-PM-3E-FAILLOUD-HOTFIX** (04ee05faa) — jq refuse-guards + real `exit 1` tails in pm Step 3e.
- **Lesson (third time today): fixing only what the brief names ships a fix that cannot run.** The
  brief had two defects. Executing the block found a third: both branches iterate `.tasks` unguarded
  and 2 of 19 live `active_sprints[]` have no `tasks` key, so jq died "Cannot iterate over null" at
  exit 5 — Step 3e's SUCCESS path was structurally unrunnable on today's board. Shipping the
  fail-loud tails alone would have made every invocation refuse loudly and still never work.
- Why the old form looked healthy for 3 occurrences: `... | .[0]` is `null` on a miss and
  `null + {status:"DONE"}` is VALID jq, so branch A appended a synthetic id-less row to `done[]` and
  the write succeeded; branch B's `map(if .id == $sid ...)` is a silent no-op, exit 0.
- 22/22 on a fixture replay of the literal shipped block, incl. AC-5's control proving the pre-fix
  `|| echo` tail exits 0 on a rejected write.

## FIX 2026-08-24T13:35Z — FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT (P0, half 2/2)

Wired the shipped `spawn_decision`/`signature` fields (half 1, commit `820b52759`, live-verified via a
full `auditor-tier1-probe.test.sh` re-run: 264/264 GREEN, incl. the exact worked-example signature
`mem_creep:vn-market-intelligence-mcp-pdf-extractor-1`) into the actually-armed cron prompt.
- `.claude/skills/cron-detect-loop/register.md` L84 (Job 2): fields list now names `spawn_decision`,
  `signature`. Byte-preserved the ALL_GREEN passive-health-masking sentence verbatim (diffed —
  untouched). Replaced only the old bundled `Otherwise (verdict=FAILURE, OR stale-ALL_GREEN, OR
  unreadable) -> spawn` OR-clause: stale-ALL_GREEN/unreadable keeps its old terse spawn consequence
  (arm 2, untouched in effect); `verdict=FAILURE` now forks into an `Else` branch that reads
  `spawn_decision` directly — `DEBOUNCED` -> log + no spawn, `SPAWN` or missing/unparseable -> spawn
  (AC-2 fail-open stated as its own explicit clause, not implied). Added a dated pointer note above the
  CronCreate block (mirrors the file's own changelog convention) citing the brief + commit.
- `docs/agents/system-auditor/flow/tier1-probe.md`: added the AC-3 top-of-file pointer right after the
  existing L20-28 "NEVER write heartbeat" restatement, same style — debounce is cadence-only, every
  A-xx check here still runs at full fidelity whenever the subagent DOES launch.
- AC-4 RAW-verified, not asserted: `grep -n "spawn_decision\|signature" docs/agents/system-auditor/
  flow/main.md` → zero matches (exit 1). Confirmed `main.md`'s Tier Dispatch needs no edit — the
  pre-gate JSON is read only by the cron prompt.
- AC-5 confirmed by reading: `.claude/commands/crons/cron-system-auditor.md`'s own header already says
  "Manual/ad-hoc reference only" and intentionally omits the pre-gate — no change needed, unchanged.
- Verification: traced the new prompt text by hand against 3 real JSON shapes — a live ALL_GREEN run
  (`bash scripts/agents-flow/auditor-tier1-probe.sh`, heartbeat age ~0min), and FAILURE+SPAWN /
  FAILURE+DEBOUNCED transitions (both proven live by the T-DEBOUNCE-1 test case, corroborated with a
  throwaway scratch repro). All three branch correctly.
- **Live-cron caveat, stated because the prompt for this row demanded it:** Job 2 is registered in
  THIS router session from the OLD register.md text — editing the file does NOT re-arm a running
  session's cron (CronCreate is session-scoped, confirmed elsewhere in this same file's own "Why this
  skill exists" section). The debounce stays functionally inert on the LIVE tick until the session
  re-arms (`/cron-detect-loop`, which only re-creates jobs Step 1 finds MISSING — re-arming Job 2
  specifically needs a `CronDelete`+`CronCreate` cycle, not just a re-run of the skill as-is). Re-arm
  IS safe mid-flight: AC-2's fail-open means the worst case during a swap window is a tick still
  spawning under the OLD unconditional `verdict=FAILURE -> spawn` clause — identical to today's
  behavior, never a false suppression. I hold no CronList/CronCreate tools (agent-father's tools
  package is `bootstrap`-only) so I could not query or actuate this myself — flagged to the router.
- orch-state.json write (ready[]->review[], owner/next_agent=qa) executed via `scripts/orch-apply.sh`
  but left UNCOMMITTED per my own zone exclusion (FU-AGENT-FATHER-ORCH-SCOPE: orch-state.json is
  router-owned, not an agent-father commit target outside the one signal-queue DONE-mark carve-out) —
  same split as the sibling half's own `d490fef11 chore(orch): ...backlog[]->review[]` commit, done
  separately from its `fix(scripts/agents-flow)` commit.

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
