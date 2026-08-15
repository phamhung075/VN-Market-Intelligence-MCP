# scripts/po-triage-20260815T0359Z-dcycle1-malformed-key-mint-and-folds.jq
#
# PO Step 0-SIG triage, dev-team tick 2026-08-15T03:53Z.
# Input : docs/data/orch/orch-state.json  (pipe through scripts/orch-apply.sh)
# Usage : jq -f scripts/po-triage-20260815T0359Z-dcycle1-malformed-key-mint-and-folds.jq \
#             --arg NOW "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#             docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Disposition of this tick's 17-entry durable inbox + 11 telegram reports (4897-4907):
#   MINT  x3 : D-CYCLE-1 malformed-key contract defect / decision-journal byte-cap
#              breach / stale fully-merged agent worktree
#   FOLD  x3 : routing-gap row, sweep-guard repeat-offender row, notebook-write
#              SKILL.md ctx-bloat row
#   NO-MINT  : the 10 well-formed auditor_cycle_loss ticks (one-time backlog drain
#              of the just-DONE_VERIFIED detector) + the SAME-FILE DIVERGENCE
#              bug-escalation (non-gating by construction).

.task_board.backlog += [
  {
    id: "FIX-AUDITOR-DCYCLE1-MALFORMED-KEY-SENTINEL-COLLAPSES-DISTINCT-LOSSES",
    type: "FIX",
    title: "D-CYCLE-1 marker-filename contract: the writer emits >=4 filename shapes, the sweep parser accepts exactly 1 -> every non-conforming loss collapses into ONE undiagnosable tick=malformed-key signal, and the surplus markers are ABORT-preserved on disk where .gitignore now hides them from every git-based verification",
    status: "BACKLOG",
    priority: "P2",
    size: "S",
    zone: "cross-service/",
    next_agent: "developer",
    owner: "po",
    created_at: $NOW,
    created_by: "po",
    source: "durable-inbox envelope auditor-cycle-loss:sys-20260815T021806-3f6c + telegram report 4899 (type=auditor_cycle_loss, WARN, from=system-auditor) — 1 of 11 D-CYCLE-1 emissions in the 2026-08-15T02:18:02Z-02:18:25Z live-fire burst.",
    dedup_key: "auditor:d-cycle-1|defect:marker-filename-contract-mismatch",
    dedup_checked: "backlog+ready+in_progress+review+qa scanned for /D-CYCLE|cycle lost|orphan.*marker|malformed/. FIX-AUDITOR-DURABILITY-STEP0B-DETECTION is DONE_VERIFIED (2026-08-15T03:01Z, commit 41d6b038f) and built this sweep — it is the PARENT, not a duplicate: its own ACs were about the detector never being INVOKED, and QA verified it on 'zero tracked marker files', which is structurally blind to this defect. CLEAN-STRANDED-REPO-STATE-20260806 (backlog) is a one-shot 2026-08-06 artifact sweep of 6 then-existing marker files, not a contract fix. FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES (backlog) is the plausible PRODUCER of orphaned markers, not the parser. No row owns the filename contract. Minted.",
    evidence: "(1) LIVE-VERIFIED RESIDUE — re-ran the sweep's own predicate verbatim at 2026-08-15T03:55Z, AFTER the 02:18Z sweep: `find docs/agent-memory -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20` returns 2 files that the sweep did not clear: `.auditor-cycle-markers-.tmp` (0B, mtime 2026-08-13) and `.auditor-cycle-markers-2026-08-13T03:20:16Z.tmp` (30B, mtime 2026-08-12T22:20Z). Both were on disk, stale, and matched at sweep time. (2) COLLAPSE CONFIRMED — docs/data/auditor-dedup-ledger.json holds exactly ONE key `auditor-cycle-loss:malformed-key` (ts 2026-08-15T02:18:06Z) while >=4 distinct malformed marker filenames existed in that window: ``(empty), `2026-08-13T03:20:16Z` (seconds form), `auditor-t1:2026-08-11T16:30Z` and `auditor-t1:2026-08-11T18:00Z` (lane-prefixed — both named verbatim in the commit-sweep-guard payload of envelope 09b006161009 at 02:23:09Z). Four distinct lost cycles, one signal, zero recoverable identity. (3) GIT-BLINDNESS — .gitignore:45 `docs/agent-memory/.auditor-cycle-markers-*.tmp` was added by commit fa02f6509 in the same fix; `git ls-files | grep -c auditor-cycle-markers` = 0 while 2 files sit on disk, so QA's DONE_VERIFIED evidence line 'zero tracked marker files' cannot see the residue and would read green forever. (4) SELF-PERPETUATION ACKNOWLEDGED AT SOURCE — commit 9b7a82074's own message states 'the other 2 ABORT-preserved malformed markers remain on disk, untracked, for the next real Tier-1 cycle's retry'; because the sentinel makes every malformed emit byte-identical, each retry re-collides on the same constant dedup_key. (5) FABRICATED PATH IN THE PAYLOAD — the emitted detail reads `orphaned .auditor-cycle-markers-malformed-key.tmp found stale`; no such file has ever existed, so an operator following the signal finds nothing.",
    root_cause: "Writer/reader disagree on the marker filename contract and neither side is enforced. WRITER: docs/agents/system-auditor/flow/main.md:251 `MARKERS_FILE=\"$PROJECT_ROOT/docs/agent-memory/.auditor-cycle-markers-${FIRE_TICK}.tmp\"` interpolates FIRE_TICK unvalidated, and FIRE_TICK has demonstrably taken at least 4 live shapes (boundary form, empty, seconds form, lane-prefixed cycle-tag). READER: scripts/auditor-durability-sweep.sh `_run_sweep_0b1` accepts exactly one case glob `[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]Z` and routes every other shape to the constant sentinel `fire_tick_swept=\"malformed-key\"`, which is then used as BOTH the summary text AND the dedup_key. main.md:243-246's AC-6a fail-loud guard covers ONLY the empty-FIRE_TICK case; the seconds form and the lane-prefixed form are still unguarded on the write side and still unrecoverable on the read side. Because a constant dedup_key is shared by unrelated losses, the emit for the 2nd..Nth malformed marker in a run is dedup-suppressed at E-1, returns ABORT e1-not-written, and the `rm -f` is (correctly) skipped — so the file is preserved for a retry that is structurally guaranteed to collide again.",
    acceptance: "AC-1 the sentinel must not be constant: derive a per-file discriminator (e.g. `malformed-key:<sha256 of basename, 8 chars>` or the raw basename itself) so N distinct malformed markers produce N distinct dedup_keys and N attributable signals. AC-2 the emitted `detail` must name the REAL file path found on disk, never a synthesised `.auditor-cycle-markers-malformed-key.tmp` that does not exist. AC-3 widen the reader to accept the shapes the writer actually produces (at minimum: seconds form `...THH:MM:SSZ` and lane-prefixed `<lane>:<tick>`), normalising to the boundary form, so these stop being malformed at all. AC-4 extend main.md's AC-6a fail-loud guard from 'FIRE_TICK empty' to 'FIRE_TICK does not match the canonical boundary regex' — close it at the writer so the reader stops having to guess. AC-5 REGRESSION PROOF, not a git check: `find docs/agent-memory -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20` returns ZERO files after two consecutive Tier-1 cycles. Do NOT accept `git ls-files`/`git status` as evidence — .gitignore:45 makes the residue invisible to both, which is exactly how this shipped. AC-6 add the case to scripts/auditor-durability-sweep.test.sh: 3 malformed markers of 3 different shapes in one sweep -> 3 signal_queue rows and 0 files left on disk.",
    non_goals: "NOT a re-litigation of FIX-AUDITOR-DURABILITY-STEP0B-DETECTION — that fix is correct and its 11-signal live-fire is the expected one-time drain of a 4-day marker backlog, not a regression. NOT about WHY cycles are being lost (that is FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES et al) — only about the sweep being unable to say WHICH cycle was lost, and being unable to finish. NOT a change to the 7-day dedup ledger window.",
    occurrence_count: 1,
    status_note: "[po/triage 2026-08-15T03:59Z] SECOND, SOFTER FINDING recorded here rather than split into its own row — D-CYCLE-1's summary text hard-asserts 'mid-run death', but an orphaned marker is equally produced by a cycle that COMPLETED and skipped its own final `rm -f \"$MARKERS_FILE\"` step (mandated at docs/agents/system-auditor/flow/main.md:1264). That skip-the-last-step pattern is live and separately tracked at FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES (backlog, 11th+ occurrence). The detector cannot discriminate the two, so all 11 WARNs sent on 2026-08-15 assert a cause they did not establish. Whoever takes this row should soften the wording to 'orphaned marker — cycle did not reach its own cleanup step (died mid-run OR skipped it)' unless a discriminator is added. Cheap, and it stops the signal from mis-directing the next investigator.",
    verification_gate: "find-based residue check green over 2 consecutive Tier-1 cycles (AC-5) — explicitly NOT a git-tracked-files check"
  },
  {
    id: "CLEAN-CTXBLOAT-DECISION-JOURNAL-COWORK-QA24-BYTECAP",
    type: "CLEAN",
    title: "context-bloat (sprint-decision-journal class): docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-24.md 38222B vs 36000B byte-cap at only 175L/600L line-cap — split, never prune",
    status: "BACKLOG",
    priority: "P3",
    size: "S",
    zone: "docs/agent-memory/decisions/",
    next_agent: "claude-manager-helper",
    owner: "claude-manager-helper",
    created_at: $NOW,
    created_by: "po",
    source: "durable-inbox envelope df7034368692, type=context_bloat_breach from context-bloat-backstop-hook, createdAt 2026-08-15T02:58:20Z; payload_ref docs/signals/processed/context-bloat-docs-agent-memory-decisions-sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-24-md-2026-08-15T025820Z.json. Routed per docs/agents/po/flow/triage-signals-longtail.md context_bloat_breach row (hand off to claude-manager-helper).",
    dedup_key: "context_bloat_breach|file:docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-24.md",
    dedup_checked: "backlog+ready+in_progress+review+qa scanned for /BLOAT|CTXBLOAT/. Five bloat rows exist and none targets a decisions/ file: FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS (hook logic), CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614 (notebooks/), CLEAN-SKILL-BLOAT-TASK-LOCK + CLEAN-CTXBLOAT-NOTEBOOK-WRITE-SKILL-215L-OVER-200L-CAP + CLEAN-CTXBLOAT-CRON-COWORK-TEAM-SKILL-242L-OVER-200L-CAP (skill files), FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT (orch-state.json). First fire for the sprint-decision-journal class. Minted.",
    evidence: "Live at 2026-08-15T03:56Z: `wc -lc` = 175 lines / 38222 bytes. Line count is 29% of the 600L cap while bytes are 106% of the 36000B cap — ~218 bytes/line, i.e. the overage is entirely long prose lines, the same driver FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT identified on the hot board file. Still actively appended: commit 41d6b038f (2026-08-15T03:01Z) added 12 lines.",
    acceptance: "AC-1 file back under 36000B. AC-2 the method is SPLIT (e.g. qa-24 -> qa-24 + qa-25, or a per-agent-cycle rollover), NOT prune: a sprint decision journal is an audit record and deleting entries destroys the evidence trail the .claude/skills/decision-journal SKILL exists to create. AC-3 state a verdict on whether the class caps are calibrated at all — 600L paired with 36000B implies a 60 B/line house style that prose-heavy journals will never honour; if the caps are wrong, say so and file the recalibration rather than shaving this one file.",
    non_goals: "Not a change to the context-bloat hook. Not a re-audit of the COWORK-GUARANTEED-SLOT-CATCHUP sprint's content.",
    occurrence_count: 1,
    verification_gate: "wc -c <= 36000 AND no journal entry removed (diff shows only relocation/split)"
  },
  {
    id: "CLEAN-STALE-WORKTREE-AGENT-AE9ED2CD-FULLY-MERGED-3D-IDLE",
    type: "CLEAN",
    title: "Stale agent worktree `.claude/worktrees/agent-ae9ed2cd6f04b3686` + branch `worktree-agent-ae9ed2cd6f04b3686`: 0 unmerged commits, tip is an ancestor of main, idle since 2026-08-12T17:12Z",
    status: "BACKLOG",
    priority: "P3",
    size: "S",
    zone: "cross-service/",
    next_agent: "qa",
    owner: "qa",
    created_at: $NOW,
    created_by: "po",
    source: "PO triage 2026-08-15T03:53Z — docs/agents/po/flow/main.md § Role in dev-team flow CLEAN rule ('flag any branch with 0 unmerged commits or stale worktree -> route to qa'). Surfaced by the dev-team spawn's `git branch` input.",
    dedup_key: "clean:stale-worktree|branch:worktree-agent-ae9ed2cd6f04b3686",
    dedup_checked: "backlog+ready+in_progress+review+qa scanned for /WORKTREE|BRANCH-CLEAN/. No row targets this branch or any worktree cleanup. Minted.",
    evidence: "`git rev-list --count main..worktree-agent-ae9ed2cd6f04b3686` = 0. `git merge-base --is-ancestor 4a6d2174c main` -> true (tip fully contained in main). Tip commit 4a6d2174c dated 2026-08-12 19:11:59 +0200; worktree directory mtime 2026-08-12 19:12 local — ~3 days idle. `git worktree list` shows it still registered and checked out, so the branch cannot be deleted without `git worktree remove` first.",
    acceptance: "AC-1 confirm no uncommitted/untracked work exists in .claude/worktrees/agent-ae9ed2cd6f04b3686 BEFORE removing anything — per the logged incident feedback_dead_worker_uncommitted_live_file_revert, a dead worker's uncommitted edits are real work and must be rescued, not swept. AC-2 confirm no live agent session owns it (idle >3d is suggestive, not proof). AC-3 `git worktree remove` then delete the branch. AC-4 `git worktree list` shows only the main checkout and `git branch` shows only main.",
    non_goals: "Do NOT `git branch -D` while the worktree is still registered. Do NOT check this branch out in the shared main working directory — feedback_subagent_branch_checkout_hijacks_shared_working_dir.",
    occurrence_count: 1,
    verification_gate: "git worktree list == 1 entry AND git branch == main only"
  }
]

# ---- FOLD 1: routing-gap row — auditor_cycle_loss re-measured live, 3rd+ fold ----
| .task_board.backlog |= map(
    if .id == "FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED" then
      . + {
        updated_at: $NOW,
        updated_by: "po",
        po_occurrence_20260815T0359: "GUARD RE-MEASURED LIVE THIS TICK, AND auditor_cycle_loss JUST DEMONSTRATED THE COST. Ran guard_signal_type_coverage (docs/agents/po/flow/triage-signals.md § Regression verifier, verbatim) at 2026-08-15T03:57Z: FAIL rc=1, unrouted to=po types = [auditor_cycle_loss, repair_task_request]. (a) auditor_cycle_loss — GENUINE gap, already folded here on 2026-08-11T17:10Z and 2026-08-12T03:03Z; this is the 3rd fold and the first time it has cost real throughput: it produced ELEVEN .signal_queue rows and ELEVEN BUG-channel Telegram reports (ids 4897-4907) inside 23 seconds (02:18:02Z-02:18:25Z), all landing on the 'any unknown type -> log and skip' catch-all. Every one of them had to be dispositioned by hand this tick. (b) repair_task_request — NOT a gap, this is exactly the GUARD FALSE POSITIVE this row's own AC (b) already documents: the type has a full row in the Pipeline-A table, but $routed mirrors only the Pipeline-B tables while the jq scans every to==\"po\" row regardless of pipeline. Recording it so the next triager does not re-investigate it as a real gap. NOTE the FAIL set has SHRUNK from the 6-11 types recorded on 2026-08-08/08-12 to 2 — not because the routing was fixed, but because the older rows aged out of the hot queue. The gap is unmeasurable from the hot queue alone, which is itself an argument for the AC that extends the guard to drained signal files. Row is 9 days old, still BACKLOG, next_agent=architect."
      }
    else . end
  )

# ---- FOLD 2: sweep-guard repeat-offender — 3 more escalated=true fires, warns 27->30 ----
| .task_board.backlog |= map(
    if .id == "FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS" then
      . + {
        occurrence_count: 8,
        updated_at: $NOW,
        updated_by: "po",
        po_occurrence_20260815T0359: "OCCURRENCE BUMP 5 -> 8. THREE more escalated=true BARE fires reached the PO durable inbox this tick, all parsed at source per triage-signals.md (never off git show --stat): envelope 7397df9d 2026-08-15T01:55:23Z prior_warns=28 (3 staged files: qa decision journal + qa.md + orch-state.json); envelope 09b00616 02:23:09Z prior_warns=29 (SIXTEEN staged files spanning .gitignore, 7 auditor cycle-marker .tmp scratch files, system-auditor flow doc, the dedup ledger, orch-state.json, 4 scripts/ files and a .jq — i.e. an entire feature landing swept through one bare commit); envelope 72c0d991 03:01:35Z prior_warns=30. All three: mode=warn escalated=true threshold=3 outcome=blocked, actor=632721c2-41e4-4aff-8d06-a47cf80dc0d7 — the SAME session id as every prior occurrence and the same session running this triage. TRAJECTORY, which is the reason this stays P0: 20 warns at mint (08-14T13:37Z) -> 27 (08-14T22:55Z) -> 30 (08-15T03:01Z). Ten warns in ~13.5h, zero remediation, and the blast radius grew from 5 files to 16. The hook's escalation converged to hard-block a day ago and the offending call-site is still unidentified — which is precisely what this row's AC-4 predicted would happen while the payload names only the actor session and never the call-site. PROMOTED INTO THIS TICK'S PO BATCH."
      }
    else . end
  )

# ---- FOLD 3: notebook-write SKILL.md ctx-bloat — row's own numbers are stale ----
| .task_board.backlog |= map(
    if .id == "CLEAN-CTXBLOAT-NOTEBOOK-WRITE-SKILL-215L-OVER-200L-CAP" then
      . + {
        occurrence_count: 2,
        updated_at: $NOW,
        updated_by: "po",
        po_occurrence_20260815T0359: "SECOND FIRE, AND THE FILE HAS GROWN 17% WHILE THIS ROW SAT IN BACKLOG. New context_bloat_breach envelope f087b608 (2026-08-15T00:28:50Z) reports 245L/15058B. PO re-measured live at 2026-08-15T03:56Z: 251L / 15807B. Compare this row's own title and mint measurement of 2026-08-11T17:10Z: 215L / 13016B. So +36 lines / +2791 bytes in under 4 days, i.e. the overage against the 200L/12000B cap has gone from 15L/1016B to 51L/3807B — nearly 4x. The row's title is now materially wrong and should be re-titled on pickup. Folded per triage-signals.md dedup discipline, not re-minted. STANDING OBSERVATION for whoever owns cap enforcement: the cap is REPORTED but not ENFORCED — nothing prevented four days of further growth on a file the hook was already flagging, and this skill is loaded by essentially every notebook-writing agent every cycle, so the overage is paid fleet-wide per cycle."
      }
    else . end
  )

| .task_board.last_triaged_at = $NOW
| .task_board.last_triaged_by = "po"
