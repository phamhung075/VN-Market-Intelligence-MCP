# scripts/po-triage-20260823T1017Z-wip-deadlock-and-catchup-disposition.jq
#
# PO ruling 2026-08-23T10:17:06Z — three dispositions in ONE atomic write.
#
# Usage (the ONLY sanctioned invocation — CLAUDE.md § Orch-State Hot File):
#   jq -f scripts/po-triage-20260823T1017Z-wip-deadlock-and-catchup-disposition.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# ITEM 1 — WIP deadlock. in_progress[]=3 over the documented WIP=2 limit
# (docs/policies/dev-standards.md), shutting all four dev-team WIP pickers.
# All three rows are umbrella/tracking rows with ZERO work of their own.
#
#   (1a) UC-CCA-P3      -> DONE_VERIFIED, in_progress[] -> done_verified[].
#        Close condition stated verbatim in the row's own status_note was met
#        2026-08-15T00:00:28Z; all 9 children DONE_VERIFIED in cold archive.
#   (1b) UC-CDC-P1      -> status BLOCKED, IN PLACE in in_progress[].
#   (1c) FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58 -> status BLOCKED, IN PLACE.
#
# WHY (1b)/(1c) STAY IN in_progress[] INSTEAD OF MOVING TO backlog[]:
#   Both are genuinely BLOCKED (children/prereqs incomplete), so BLOCKED is the
#   semantically correct status, not a parking trick. `wip_in_progress`
#   (scripts/lib/devteam-eligibility.jq:115-118) excludes any in_progress[] row
#   whose status normalizes to BLOCKED, so both drop out of WIP accounting
#   immediately. That file's own comment documents BLOCKED-in-in_progress[] as a
#   schema-VALID "orthogonal sub-state". The write-side companion rule
#   (execute-tier.md § CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c)) would prefer the
#   row also MOVE out of in_progress[] — that move is attempted first and is
#   expected to hard-reject on defect D3 of
#   FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS:
#   measured this tick, UC-CDC-P1=13724B and WATCHLIST=17859B prose, both over
#   the 12000B ceiling, and moving from an UNGUARDED lane into a guarded one
#   (backlog/ready/review) makes liveBytes=0 at
#   scripts/orch-row-prose-ceiling-check.mjs:267, so :269 `candidateBytes >
#   liveBytes` hard-rejects a byte-identical move. Recorded, not worked around.
#
# ITEM 2 — TASK-COWORK-CATCHUP-2 DONE -> DONE_VERIFIED, done[] -> done_verified[].
#   NOT a "verify this row" ruling: the row was ALREADY QA-approved
#   2026-07-28T20:35:33Z (qa_verified_at + qa_verified_by=qa + a full
#   "[QA] Review Record ... APPROVED, DONE_VERIFIED" in review_note). Only the
#   `status` field was never advanced. All 4 cited commits RAW-verified this
#   tick as real ancestors of HEAD with scopes matching their claims. Unblocks
#   TASK-COWORK-CATCHUP-3/4/5, which cascade to 6/7/8/9/10.
#
# ITEM 3 — FIX-SIGNAL-INBOX-...-LITTER next_agent developer -> pm.
#   docs/agents/developer/flow/main.md Input line 12 + Step 0c + Step 3 read
#   ONLY `docs/handoffs/TASK_NNN.md`. No such file exists for this row, and
#   `architect_handoff` has ZERO readers fleet-wide (grep across docs/agents/,
#   scripts/, .claude/ returns only the jq that WRITES it). A developer
#   dispatched today would arrive with no readable spec.
#
# Idempotent: every mutation is keyed by exact row id and is a no-op if the id
# is already absent from its source lane.

# ---------- ITEM 1a: UC-CCA-P3 close ----------
(.task_board.in_progress | map(select(.id == "UC-CCA-P3"))) as $ccaMatch
| (.task_board.in_progress | map(select(.id != "UC-CCA-P3"))) as $ipMinusCca
| ($ccaMatch | map(
    . + {
      status: "DONE_VERIFIED",
      next_agent: "pm",
      updated_at: "2026-08-23T10:17:06Z",
      updated_by: "po (WIP-deadlock ruling — umbrella close, all 9 children DONE_VERIFIED)",
      closed_at: "2026-08-23T10:17:06Z",
      verification: {
        raw_probe: {
          tool: "jq -c '[.done_tasks[] | select(.id|test(\"^UC-CCA-P3-\")) | {id,status}] | sort_by(.id)' docs/data/orch/archive/2026-08.json",
          args: "cold archive 2026-08.json .done_tasks[] filtered to this umbrella's 9 children — deliberately independent of the row's own status_note, which is the artefact that went stale",
          live_value_observed: "9/9 DONE_VERIFIED: UC-CCA-P3-FR1-FR2-SKILL, UC-CCA-P3-FR3-ALERT-COMMANDER, UC-CCA-P3-FR3-BCTC-ANALYST, UC-CCA-P3-FR3-CHEF, UC-CCA-P3-FR3-DIGEST-PREDICT, UC-CCA-P3-FR3-FB-MARKET-POSTER, UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP, UC-CCA-P3-FR3-TRAN-NGOC-BAU, UC-CCA-P3-FR5-CODE-GATE. Zero UC-CCA-P3-* rows remain in any of the 7 hot task_board lanes (checked separately). Last child verified 2026-08-15T00:00:28Z.",
          observed_at: "2026-08-23T10:17:06Z"
        }
      },
      po_closeout_20260823: "CLOSED DONE_VERIFIED by po 2026-08-23T10:17:06Z. This umbrella carries no work of its own. Its own status_note states the close condition verbatim: 'Once all 7 pass QA (DONE_VERIFIED) and join FR1-FR2-SKILL + FR5-CODE-GATE (already DONE_VERIFIED), this umbrella can close DONE per PO B1 Path-A ruling (single wave, all FRs shipped together).' That condition was MET at 2026-08-15T00:00:28Z. Nobody re-read it, so the row sat IN_PROGRESS a further 8 days consuming one of only two WIP slots and helping shut all four dev-team pickers. next_agent qa->pm: no QA work is outstanding (every child carries its own qa_verified_at); pm owns umbrella/sprint bookkeeping. LANE-MOVE SAFETY: in_progress[] and done_verified[] are BOTH outside PROSE_CEILING_LANES (backlog/ready/review), so this move cannot trip defect D3 (liveBytes=0 hard-reject) even though this row measures 12161B prose, over the 12000B ceiling. A demotion into backlog[] WOULD have been rejected — that is precisely why close-to-terminal was chosen over demotion, and the choice is evidence-driven, not a workaround."
    }
  )) as $ccaClosed

# ---------- ITEM 2: TASK-COWORK-CATCHUP-2 status desync ----------
| (.task_board.done | map(select(.id == "TASK-COWORK-CATCHUP-2"))) as $c2Match
| (.task_board.done | map(select(.id != "TASK-COWORK-CATCHUP-2"))) as $doneMinusC2
| ($c2Match | map(
    . + {
      status: "DONE_VERIFIED",
      next_agent: "pm",
      updated_at: "2026-08-23T10:17:06Z",
      updated_by: "po (Item 2 ruling — QA-verified-but-status-DONE desync, chain unblock)",
      closed_at: "2026-08-23T10:17:06Z",
      verification: {
        raw_probe: {
          tool: "git cat-file -t <sha> && git merge-base --is-ancestor <sha> HEAD && git show --stat <sha>, for each of c5e7c6747 fd5d4565e 64c41a6e0 d7330d539",
          args: "the 4 commits named in this row's own [QA] Review Record, re-verified independently against live git rather than trusted from the note — guarding against the known 'agent narrates unexecuted writes / fabricated PASS' class",
          live_value_observed: "4/4 real commits, all ancestors of HEAD eceb60bba, scopes match claims exactly: c5e7c6747 feat(...cowork-catchup-2) scripts/agents-flow/cowork-match-slots.js +25 / cowork-match-slots.test.js +131; fd5d4565e docs(...) docs/WORK.md + docs/agents/cowork-team/flow/match-slots.md; 64c41a6e0 chore(orch-state) in_progress->REVIEW; d7330d539 chore(memory/developer) notebook+journal. QA record is genuine, not fabricated.",
          observed_at: "2026-08-23T10:17:06Z"
        }
      },
      po_status_desync_ruling_20260823: "RULED by po 2026-08-23T10:17:06Z. THIS ROW WAS NEVER UNVERIFIED. It carries qa_verified_at=2026-07-28T20:35:33Z, qa_verified_by=qa, updated_by=qa, and a full '[QA] Review Record (direct-commit verify): APPROVED, DONE_VERIFIED' in review_note describing independent re-verification of all 4 commits on local main AND origin/main, a literal MD5 byte-identity diff for NFR-2, a self-run 43/43 test pass, an independently reproduced RED, and a live fallback-path exercise. Only the machine-readable `status` field was left at DONE. updated_at=2026-07-28T20:39:16Z is 3m43s AFTER qa_verified_at, so a later write did touch the row and still did not advance status — a partial application, not an interrupted one. IMPACT MEASURED, NOT INFERRED: deps_satisfied() (scripts/lib/devteam-eligibility.jq:278-281) requires every dep to string-equal 'DONE_VERIFIED'; plain DONE is explicitly insufficient. Running the real predicate against the live board this tick returned deps_satisfied=false for TASK-COWORK-CATCHUP-3/4/5 with depmap 'TASK-COWORK-CATCHUP-1=DONE_VERIFIED, TASK-COWORK-CATCHUP-2=DONE' — CATCHUP-2 was the SOLE unsatisfied dep on all three. 6/7/8/9 cascade behind 3/4/5, and 10 behind 9. Nine rows were dammed for 26 days by one field that disagreed with its own QA record. CATCHUP-1 was NOT missing — it resolves DONE_VERIFIED from cold archive 2026-07.json via archive_status_map(), so the cold-archive fallback is working correctly and is not implicated. Advancing status to DONE_VERIFIED ratifies QA's existing verdict; it does not manufacture a new one."
    }
  )) as $c2Fixed

# ---------- apply ----------
| .task_board.in_progress = $ipMinusCca
| .task_board.done = $doneMinusC2
| .task_board.done_verified = (.task_board.done_verified + $ccaClosed + $c2Fixed)

# ---------- ITEM 1b: UC-CDC-P1 -> BLOCKED in place ----------
| .task_board.in_progress = (.task_board.in_progress | map(
    if .id == "UC-CDC-P1" then
      . + {
        status: "BLOCKED",
        blocked_by: ["UC-SDF-P2"],
        updated_at: "2026-08-23T10:17:06Z",
        updated_by: "po (WIP-deadlock ruling — WP-A complete, WP-B blocked)",
        blocked_reason: "WP-B depends on UC-SDF-P2, which is still BACKLOG/plan_only/next_agent=ba and unclaimed. WP-A is fully delivered.",
        po_wip_ruling_20260823: "RULED BLOCKED by po 2026-08-23T10:17:06Z, in place in in_progress[]. MEASURED: this row's three WP-A children TASK_2008a / TASK_2008b / TASK_2008c are ALL DONE_VERIFIED, cold-evicted to docs/data/orch/archive/2026-08.json, each verified 2026-08-23T08:46:47Z — i.e. WP-A finished roughly 90 minutes before this ruling and nothing updated the parent. Zero TASK_2008* rows remain in any hot lane. The row's own status_note already recorded the remaining scope: 'WP-B stays BLOCKED (depends on UC-SDF-P2)'. UC-SDF-P2 re-probed live this tick: still in backlog[], status BACKLOG, plan_only=true, next_agent=ba, unclaimed. So this parent has NO live work of its own and has had none since 08:46Z — it was consuming a WIP slot purely as a stale tracking row. next_agent stays pm (unchanged, deliberately): once UC-SDF-P2 clears, WP-B needs decomposition, which is pm's hop — pm is correct for the parent even though ba is correct for the blocker. WHY status=BLOCKED IN PLACE RATHER THAN A LANE MOVE: BLOCKED is the semantically true status, and wip_in_progress (scripts/lib/devteam-eligibility.jq:115-118) excludes BLOCKED rows from WIP accounting, so this frees the slot immediately; that file's own comment documents BLOCKED-inside-in_progress[] as a schema-VALID 'orthogonal sub-state'. The write-side companion rule (execute-tier.md § CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c)) would additionally move the row OUT of in_progress[]; that move was attempted and hard-rejects on defect D3 of FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS — this row measures 13724B prose (over the 12000B ceiling) and moving from unguarded in_progress[] into guarded backlog[] sets liveBytes=0 at orch-row-prose-ceiling-check.mjs:267, so :269 rejects a byte-identical move. Recorded as a known blocked follow-up, NOT worked around destructively. The lane move should be completed once D3 ships."
      }
    else . end
  ))

# ---------- ITEM 1c: FIX-SYSTEM-MAP-WATCHLIST -> BLOCKED in place ----------
| .task_board.in_progress = (.task_board.in_progress | map(
    if .id == "FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58" then
      . + {
        status: "BLOCKED",
        blocked_by: [
          "TASK_001-WATCHLIST-WRITE-THROUGH-INFRA",
          "TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON",
          "TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX"
        ],
        next_agent: "qa",
        updated_at: "2026-08-23T10:17:06Z",
        updated_by: "po (WIP-deadlock ruling — pm decomposition already complete, parent awaits children)",
        blocked_reason: "Decomposition complete; parent awaits its three children. Not dispatchable work.",
        po_wip_ruling_20260823: "RULED BLOCKED by po 2026-08-23T10:17:06Z, in place in in_progress[]. THE HOP THIS ROW WAS WAITING FOR HAS ALREADY HAPPENED. next_agent read 'pm', but the row's own pm_decomposition_note records 'PM decomposed into 3 subtasks (2026-08-22T17:45Z)' and all three children are live on the board right now, measured this tick: TASK_001-WATCHLIST-WRITE-THROUGH-INFRA (ready[], READY, next_agent=dev-mcp-server), TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON (backlog[], BLOCKED on TASK_001, next_agent=developer), TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX (ready[], READY, next_agent=generic-developer). The parent therefore had no pm work left and was holding a WIP slot on a stale field. next_agent pm->qa: the only remaining parent-level action is final sign-off against AC-1..AC-4 once the children land. blocked_by set to the three children so the block is machine-readable rather than prose. SIDE FINDING, NOT FIXED HERE (outside decision scope, routed instead): the three handoff files docs/handoffs/TASK_001-WATCHLIST-WRITE-THROUGH-INFRA.md, TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON.md and TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX.md exist on disk but are UNTRACKED in git — pm authored the decomposition and never committed the artefacts, so the specs the children point at are absent from HEAD and would vanish on any clean checkout. WHY status=BLOCKED IN PLACE RATHER THAN A LANE MOVE: identical D3 constraint to UC-CDC-P1 — this row measures 17859B prose, the largest of the three in_progress[] rows, so a move into guarded backlog[] hard-rejects at orch-row-prose-ceiling-check.mjs:267-269 with liveBytes=0. BLOCKED status alone removes it from wip_in_progress (devteam-eligibility.jq:115-118), which is the outcome that matters. Lane move deferred to after D3 ships."
      }
    else . end
  ))

# ---------- ITEM 3: signal-inbox next_agent developer -> pm ----------
| .task_board.ready = (.task_board.ready | map(
    if .id == "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER" then
      . + {
        next_agent: "pm",
        updated_at: "2026-08-23T10:17:06Z",
        updated_by: "po (Item 3 ruling — next_agent corrected to the decomposition hop)",
        po_next_agent_ruling_20260823: "RULED by po 2026-08-23T10:17:06Z: next_agent developer -> pm. The board field disagreed with its own author's RETURN ('NEXT: pm'). ROOT CAUSE MEASURED, not stylistic: docs/agents/developer/flow/main.md declares its Input as 'docs/handoffs/TASK_NNN.md with [Architect] Brownfield Findings' (line 12) and both Step 0c (delta-read handoff, path docs/handoffs/TASK_NNN.md) and Step 3 ('Read docs/handoffs/TASK_NNN.md first') hard-require that file. No handoff file exists for this row — `ls docs/handoffs/ | grep -i signal-inbox` returns zero matches this tick. Worse, `architect_handoff` is a WRITE-ONLY field: grepping architect_handoff across docs/agents/, scripts/ and .claude/ returns only scripts/architect-20260823-orch-prose-ceiling-row-handoff.jq, the jq that WRITES it, plus stale worktree copies of orch-state itself. Zero flow doc and zero dispatch script READS it. So a developer dispatched on this row would arrive with no readable spec at all and the 18530B brief would simply never be opened. CONFIRMED DISPATCHABLE BEFORE THE FIX: running the live predicate returned effective_next_agent=developer, deps_ok=true, supervised=false, plan_only=false — the misroute was armed, not theoretical. WHAT I DID NOT CHANGE, AND WHY: the sibling row FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS keeps next_agent=pm — already correct. The two rows are now consistent at pm, but NOT because consistency was the goal: they are consistent because both independently need a decomposition hop. Note both briefs' own §5/§6 name `developer` as the eventual ZONE OWNER (cross-service/), and that remains right — 'who ultimately implements' and 'what is the next hop' are different questions, and the architect answered the first while the board field must answer the second. pm decomposes, emits docs/handoffs/TASK_*.md, then a developer is correctly dispatchable."
      }
    else . end
  ))
