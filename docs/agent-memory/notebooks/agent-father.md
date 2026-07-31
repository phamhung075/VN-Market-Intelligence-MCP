# Agent Father — Notebook

## Clean (router-dispatched, PO manual-dispatch DRS-STRANDED-OFF-ALLOWLIST) 2026-07-31T02:36:00Z TE-T11
- Wired `step-0-cowork/SKILL.md` into 10 flow files (chef, market-watcher/cycle+eod,
  news-scout, alert-commander, bctc-analyst, digest-predict×3, unified-agent/market-bootstrap):
  collapsed the separate `cycle-bootstrap/SKILL.md` + `regime-extraction/SKILL.md` pointer
  lines into one `step-0-cowork` reference each (`§ 0b` bootstrap-only where a flow doesn't
  consume `$REGIME`; `§ 0b-0c` where it does). All flow-specific inline logic (news-scout/
  alert-commander shape-validation gates, news-fallback derivation, tick-snapshot conditional)
  left byte-for-byte untouched — savings come from eliminating the 2 separate SKILL.md file
  reads, not from that in-file prose, so touching it would add risk for zero extra saving.
- Excluded the audit's 11th listed file, `cowork-team/flow/tick-snapshot.md`: it makes raw
  `get_cycle_bootstrap`/`get_macro_snapshot` MCP calls to PRODUCE the shared tick-snapshot
  other agents' bootstrap reads consume — it never invokes cycle-bootstrap/regime-extraction
  as a skill reader. Grep matched it only because a fallback-comment sentence contains the
  string "cycle-bootstrap/SKILL.md". Applying the swap there would be a category error (writer
  vs reader), not a genuine adoption gap — real scope is 10 files, not 11.
- Corrected the DoD phrasing per audit_ref: every new pointer line reads "→ skill:
  step-0-cowork/SKILL.md § 0b[-0c]" — never claims the composite "embeds the same
  GATEWAY-BLIND/regime-fallback boundaries" (it POINTS to cycle-bootstrap's Error-handling SSOT).
- Post-edit grep: `step-0-cowork` adoption count 0→10 (`grep -rl step-0-cowork
  docs/agents/*/flow/*.md`); zero remaining `cycle-bootstrap/SKILL.md` or
  `regime-extraction/SKILL.md` PRIMARY pointers in the 10 touched files (one intentional
  secondary SSOT-reference in alert-commander).

## Clean (router-dispatched, po daily-triage maintenance-lane) 2026-07-31T01:52:02Z TE-T08
- `.claude/skills/commit-mutex/SKILL.md` 256L→82L: inverted to a lazy-load hot card per
  the established repo pattern (signal-dashboard/doc-heal-system/pdf all split the same
  way — hot SKILL.md + `reference.md`). New `.claude/skills/commit-mutex/reference.md`
  (79L) holds the backoff table/jitter formula, full push rebase-retry bash, and
  No-Heartbeat/TTL rationale — loaded only on genuine contention or a failed push.
- Kept verbatim on the hot card (po landmine 2026-07-31T0132, all correctness gates,
  not just the flagged one): INV-GATEWAY-1 scope note, C-2/C-2b fail-closed paths, the
  foreign-restore rule, and — the flagged one — the PATHSPEC-SCOPED commit gate
  (`git commit ... -- <paths>`, "NEVER bare"). Post-write grep confirmed `-- <path1>`
  present in the commit example and all 5 gate-name strings still on the hot card.
- Fixed 2 live stale cross-references my own renumbering (Step 3d-PUSH→2d, Steps 1-4→1-3)
  broke: `.claude/skills/commit-boundary/SKILL.md` RULE 4 + its DRY-mirror line,
  `.claude/skills/commit/SKILL.md` Step 2. Did NOT touch `scripts/git-hooks/pre-commit`
  line 38 (same stale "Step 3c" comment) — `scripts/` is outside my commit_zone; flagged
  for developer/dev-team, non-blocking (hook's gating logic doesn't depend on the label).
- Left historical citations (architecture briefs, decision journals, `docs/WORK.md`) with
  old line numbers/step letters untouched — dated point-in-time evidence records, not
  live pointers, matching how prior lazy-load splits in this repo handled the same class.
- Board-state discrepancy: dispatch prompt claimed `.task_board.in_progress[]` /
  `status:IN_PROGRESS`; live read found the row in `.task_board.backlog[]` /
  `status:BACKLOG` (`updated_by: "po (triage-20260731T0132)"`). Did not flip it —
  `orch-state.json` is outside agent-father's commit_zone; flagged for router/dev-team.

## Fix (dev-team S4 UNBLOCK dispatch) 2026-07-31T05:35:00Z FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY
- Implemented `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md` §3/§4
  verbatim, two files, zero prod code: `docs/agents/po/flow/triage-signals.md` `ci_red` row
  (mandatory FAILEDFILE pre-dedup read AC-1, FILE-scoped `dedup_key` primary key AC-2,
  anti-amnesty fence vs `FIX-MCP-SUITE-HEALTH-BASELINE` AC-3, 0-fail backstop AC-4) and
  `docs/agents/dev-team/flow/ci-health-probe.md` (Hard Constraint #2 layer-c text + Step CI-3
  clarifying NOTE, doc-accuracy only — CANON-SCRIPT `ci-health-probe.js` untouched).
- Used byte-exact line-indexed extraction (python, scratch-only) rather than manual retype —
  the brief's replacement text is a very long single-line prose row with em-dashes/curly quotes;
  programmatically verified `git diff` matches the brief's own text byte-for-byte on all 3 edits.
- `size-lint` gate check: `ci-health-probe.md` grew 157L→163L; header still declares 157L but
  file is baseline-grandfathered with +/-10%/min-5L tolerance (172.7L upper bound) — PASS, no
  header update needed (brief itself flagged "no line-count budget concern").
- AC-5 retro-sweep note (already closed by po this cycle) re-checked live, not re-derived: a
  NEW ci_red fired since ratification (run 30606511365, frontend-eslint + size-lint failures)
  but that's a SEPARATE already-tracked pair of rows (FIX-CI-FRONTEND-ESLINT-BUNLOCK-*,
  FIX-CI-SIZELINT-MACRO-VMT-*), not a regression of the 3 files AC-5 covers — evidence stands.
- Board row was already ratified (po_goahead stamped, plan_only:false) and left in review[]
  deliberately per dispatch note (agent-father off DRS allowlist). Flipped next_agent
  agent-father→qa in place (no lane-move — status stays REVIEW, only next_agent changed) per
  repo precedent (`FIX-SWEEPGUARD-*`/`2026-07-13-FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE`: even
  pure flow-doc/bash fixes route through qa's RAW clause-content read, not self-closed by
  the implementer).
- POST-COMMIT CATCH: RAW-re-read after pushing found a live `po_changes_requested_20260731T0523`
  note filed 05:23:57Z (before my 05:28:22Z commit, missed at session-start read) — the brief's
  §3 predicate I copied verbatim used a status-token enum (TODO/IN_PROGRESS/REVIEW/BLOCKED) that
  structurally excludes BACKLOG/READY lanes; live-measured 395/633 (62.4%) open rows invisible.
  Fixed both `ci_red` dedup checks + the pre-existing identical defect on `repair_task_request`
  in the same file, 2nd commit — never ship a known-defective spec even after first push.

## Fix (dev-team dispatch) 2026-07-31T15:05:00Z FIX-COWORK-SPAWNFANOUT-NO-SESSION-ID-IN-LEAF-ENTRY-PROMPT
- `spawn-fanout.md` Step 5.2: neither ENTRY_PROMPT branch nor IDENTITY_PREAMBLE ever carried a
  session id — `refine_bctc_md`'s no-Bash SELF-IDENTITY GUARD EXITs before claiming without one
  (recurred 2x live, 2026-07-30/31). Fixed by appending `SESSION_ID_LINE` (cowork-team's own
  resolved `$CLAUDE_CODE_SESSION_ID`, substituted BEFORE dispatch — never the unresolved token
  text handed to the spawned LLM session) to `ENTRY_PROMPT` in BOTH branches, uniformly (matches
  router's own unconditional precedent, avoids a 6th "no producer" recurrence via allowlist).
- `slot.trigger_prompt` in `cowork-schedule.json` untouched (confirmed zero diff) — new
  `scripts/agents-flow/cowork-spawn-entry-prompt-session-id.test.js` (7/7, RED confirmed against
  pre-fix content) statically asserts both branches append the line; sibling
  `cowork-schedule-consistency.test.js` (9/9) and `cowork-match-slots.test.js` (43/43) unaffected.

## Fix (dev-team S79 tier-1 dispatch) 2026-07-31T15:19:08Z FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW
- `manual-dispatch-sweep.md` Step 1's `po_manual_dispatch_flagged_at` exclusion was PERMANENT
  (stamp/dispatch not atomic) — any row whose BATCH was deferred (WIP cap) became invisible to
  every future sweep forever. Live: `TE-T12`, flagged 06:56:27Z, still BACKLOG ~8h later.
- Fixed with a bounded staleness window (`flag_reentrant($now_epoch; 14400)`, 4h) — fresh stamp
  stays excluded, stale stamp is re-admitted exactly like unflagged. Chose this over a Step-3
  "fold highest-priority stale row when Step 2 stamps nothing" fallback: smaller/more mechanical,
  reuses the `$now_epoch` arg the script already computed but never used. Same-tick double-BATCH
  stays structurally impossible regardless (Step 1 computes its candidate list once, before Step
  2 stamps). `docs/policies/dev-standards.md:504-526` mirror updated in lockstep.
- Verify script: `G-ALREADY-FLAGGED` negative control switched from a hand-typed stale-dated
  fixture (would have gone stale itself and started FALSE-passing the wrong branch as this repo's
  clock advanced) to a relative-fresh timestamp computed via jq `todateiso8601` off `$NOW_EPOCH`
  — portable, no BSD/GNU `date` divergence. New `M-STALE-FLAGGED-REENTRANT` positive control
  (same offset math, past the window) — this is the check that would have failed pre-fix.
- Live-replayed Step 1's exact jq against the real board (read-only, no orch-apply.sh call):
  `TE-T12` now surfaces top-ranked with `reflag:true`, confirming the re-admission path fires on
  the actual stranded row, not just the synthetic fixture.
- DID NOT flip the board row `in_progress[]→review[]` myself — own init.md `commit_zone.excluded`
  names `orch-state.json` "NEVER in agent-father commits except the ONE allowed signal-queue
  DONE-mark", and `.head.active_task_id` at write time was a sibling task's id anyway (not mine).
  Supplied the exact `orch-apply.sh` transform (no `.head` sync — condition not met) in RETURN.
