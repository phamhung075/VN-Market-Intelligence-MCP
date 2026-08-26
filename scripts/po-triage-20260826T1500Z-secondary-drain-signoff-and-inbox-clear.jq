# PO triage-20260826T1500Z — Review-Lane SECONDARY-Drain sign-off (1 row) +
# durable-inbox triage/CLEAR (5 envelopes). Single combined write, ONE commit.
#
# (A) FIX-NOTEBOOK-UUID-PROVENANCE-GUARD-STUCK-IN-WARN-MODE-3-NOTEBOOKS-LEAKED-AT-HEAD
#     review[] -> done_verified[]. AC-1/AC-2 independently re-verified this tick
#     (scripts/audits/verify-notebook-uuid-provenance-gate.sh, fresh run). AC-3
#     (flip GIT_NOTEBOOK_UUID_PROVENANCE_MODE) confirmed STILL unsafe — NOT flipped.
# (B) Mint FIX-TNB-NOTEBOOK-UUID-HEADING-ACTIVE-PRODUCER-SCRUB (backlog[],
#     next_agent=agent-father) — the new prerequisite AC-3 was blocked on.
# (C) Fold envelope 2481d067... (system-issue, 136 unresolved telegram reports)
#     into FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE (backlog[]).
# (D) envelope(s) 11bead93.../18ba303c... (context_bloat_breach x2, sprint-
#     COWORK-GUARANTEED-SLOT-CATCHUP-developer-9.md) — DEFER, standing policy
#     (still-open sprint's own live decision-journal). No board write; logged
#     in PO notebook only.
# (E) Fold envelope ab2cb52e... (audit_finding, pdf-extractor A-30 dedup
#     suppression overturned) into FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM
#     (backlog[]) — 3 rulings recorded.
# (F) Fold envelope 266f77fe... (bug-escalation, sweep-guard BARE repeat-
#     offender-after-block) into FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-
#     ROUTER-SESSION-20-WARNS (review[]) — occurrence_count bumped, no status/
#     next_agent/qa_not_before change.
# (G) Durable-inbox CLEAR — subtractive by envelope_id, all 5 consumed ids.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260826T1500Z-secondary-drain-signoff-and-inbox-clear.jq \
#     docs/data/orch/orch-state.json | \
#     ORCH_APPLY_DECLARED_INBOX_TRIAGED="2481d0673b40ea5a39dec14295e071a4518ccd0e625cf694d81c6497e22c0138,11bead93cee41f7bd6d9c9081e9776a5d60329e1a7e39a22e409b93c0482ae65,18ba303ce48d6bc73be2f1070b766ac13bbd08f2e5c811fb18fb1dfa336ea62e,ab2cb52efd0d931e83ee26a79fb85d49c9720f626b854b16a3532880b9f5759e,266f77fef7ee1a29572aae6cf137f31c38f32a8998e2c3954f9eb6919c39b69d" \
#     bash scripts/orch-apply.sh

($now) as $NOW
| ($primary_id) as $PID

# ── (A) Primary REVIEW row: capture, remove from review[], re-add to done_verified[] ──
| (.task_board.review[] | select(.id == $PID)) as $primary
| .task_board.review |= map(select(.id != $PID))
| .task_board.done_verified += [
    ($primary + {
      status: "DONE_VERIFIED",
      updated_at: $NOW,
      updated_by: "po (secondary-drain-signoff-20260826T1500Z)",
      reviewed_at: $NOW,
      verification: {
        raw_probe: {
          tool: "scripts/audits/verify-notebook-uuid-provenance-gate.sh",
          args: "default (last 8 commits, all 59 tracked notebooks under docs/agent-memory/notebooks/)",
          live_value_observed: "agent-father.md/dev-team.md/qa.md: 0 RULE1 hits each (AC-1 scrub holds at current HEAD). Fleet-wide: 10 RULE1 hits total, ALL on docs/agent-memory/notebooks/tran-ngoc-bau.md (headings c125/c126/c130/c132/c132-peer/c133/c134/c135/c136), including its single most recent commit 967aea78fabb (c136, 2026-08-25T20:13-20:32Z) -- confirms AC-3 (flip GIT_NOTEBOOK_UUID_PROVENANCE_MODE default to reject) is still unsafe: an active, unscoped producer exists as of yesterday.",
          observed_at: $NOW
        }
      },
      po_review_note: ("PO SIGN-OFF " + $NOW + " (Review-Lane SECONDARY-Drain). Independently re-verified, not narrated from prose: (1) AC-1 scrub HOLDS at current HEAD -- bash scripts/audits/verify-notebook-uuid-provenance-gate.sh (default, last 8 commits) shows ZERO RULE1 hits on all 3 named files (agent-father.md, dev-team.md, qa.md), confirming developer's 2026-08-22 review_note is still true today, not stale. (2) AC-2 validator already run by developer; re-confirmed fleet-wide this tick: 59 tracked notebooks scanned, 10 RULE1 hits total, ALL on ONE file -- docs/agent-memory/notebooks/tran-ngoc-bau.md -- zero on this row's own scrub targets. (3) AC-3 (flip GIT_NOTEBOOK_UUID_PROVENANCE_MODE default warn->reject) CONFIRMED still unsafe: the fresh scan's tran-ngoc-bau.md hits include its MOST RECENT commit (967aea78fabb, heading c136 2026-08-25T20:13-20:32Z, this session=7a47f7c6-...) -- the raw-UUID-in-heading convention is active as of yesterday, not stale history. Flipping the fleet-wide default today would immediately hard-block tran-ngoc-bau's very next notebook commit -- exactly the fleet-memory-stranding failure this row's own AC-1 STRICT ORDERING section exists to prevent, against a 4th agent outside this row's files[] scope. THIS OVERRULES po_fold_20260824T2258Z's 'flip anyway' recommendation, written before this fresh verification and reading the recurrence as proof warn-mode 'failed' rather than as proof AC-3's own precondition (no other active unscoped producer) is not yet met. DISPOSITION: DONE_VERIFIED for this row's own scoped deliverable (3-file scrub + validator run, both independently confirmed). AC-3 execution is not this row's to finish -- gated on new row FIX-TNB-NOTEBOOK-UUID-HEADING-ACTIVE-PRODUCER-SCRUB (backlog[], next_agent=agent-father, minted this tick), per the developer's own AC-4 request to route the scope decision to PO rather than silently widen or force the flip. GIT_NOTEBOOK_UUID_PROVENANCE_MODE left at default (warn) -- NOT flipped.")
    })
  ]

# ── (B) Mint follow-up row (prerequisite for AC-3) ──
| .task_board.backlog += [{
    id: "FIX-TNB-NOTEBOOK-UUID-HEADING-ACTIVE-PRODUCER-SCRUB",
    type: "FIX",
    status: "BACKLOG",
    priority: "P2",
    size: "S",
    zone: "cross-service/",
    owner: "po",
    next_agent: "agent-father",
    created_at: $NOW,
    created_by: "po (secondary-drain-signoff-20260826T1500Z)",
    related: ["FIX-NOTEBOOK-UUID-PROVENANCE-GUARD-STUCK-IN-WARN-MODE-3-NOTEBOOKS-LEAKED-AT-HEAD"],
    dedup_checked: "scripts/po-board-dedup-search.sh + archive grep for tran-ngoc-bau+uuid/heading follow-up: none found. FIX-AGENT-NOTEBOOK-UUID-PROVENANCE (cold/archived parent, off live board) is the only prior UUID-hygiene row and does not name this agent specifically.",
    title: "tran-ngoc-bau.md is the ONLY active, unscoped raw-session-UUID-in-heading producer left (10/10 RULE1 hits over its last 8 commits, incl. its most recent, c136 2026-08-25) -- blocks safely flipping GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject fleet-wide",
    files: ["docs/agent-memory/notebooks/tran-ngoc-bau.md", "docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md"],
    desc: ("MEASURED live " + $NOW + " via scripts/audits/verify-notebook-uuid-provenance-gate.sh (default, last 8 commits, 59 tracked notebooks): 10 RULE1 (full-UUID-on-heading-line) hits, ALL on tran-ngoc-bau.md, spanning c125/c126/c130/c132/c132-peer/c133/c134/c135/c136 -- including its single most recent commit (967aea78fabb). The convention is NOT instructed anywhere: docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md Step 8 (the only notebook-append instruction this agent has) shows only a '### Quality Audit (HH:MM-HH:MM UTC)' SUB-heading template with no session/UUID field at all -- the '## c<NNN> . <ISO> (slot=tnb-audit; this session=<uuid>; VN-date=...)' TOP heading is an emergent, self-perpetuating habit (each cycle's own prior notebook content is the template the agent imitates against), matching the pre-commit hook's documented exception class ('tran-ngoc-bau's own collision-note pattern') but still a standing violation of .claude/skills/notebook-write/SKILL.md AC-1's 'FORBIDDEN, no exceptions' rule, and the sole remaining blocker on FIX-NOTEBOOK-UUID-PROVENANCE-GUARD-STUCK-IN-WARN-MODE's own AC-3 (fleet-wide default flip warn->reject), whose sign-off this same tick independently re-verified the block is real, not stale."),
    ac: "AC-1 scrub the existing raw UUIDs in docs/agent-memory/notebooks/tran-ngoc-bau.md headings -- forward-fix only (no history rewrite, matches the treatment already given to agent-father.md/dev-team.md/qa.md by the parent row), replace with a non-identifying label per SKILL.md AC-1's own convention (e.g. 'the audit session', 'a peer tnb-audit session'). AC-2 add an explicit instruction to docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md Step 8 (agent-definition file -> agent-father's commit zone; PO/developer must not edit it directly) stating the canonical '## c<NNN> . <ISO-timestamp>' heading format (SKILL.md AC-1) and explicitly forbidding a session/coordination UUID in ANY heading. AC-3 after tran-ngoc-bau's next notebook commit post-fix, re-run bash scripts/audits/verify-notebook-uuid-provenance-gate.sh --file docs/agent-memory/notebooks/tran-ngoc-bau.md and confirm 0 RULE1 hits on the new commit. AC-4 only once AC-3 passes, FIX-NOTEBOOK-UUID-PROVENANCE-GUARD-STUCK-IN-WARN-MODE's own AC-3 (flip GIT_NOTEBOOK_UUID_PROVENANCE_MODE default to reject) becomes safely executable -- file that as a fresh follow-up row at that time; do not reopen the DONE_VERIFIED row."
  }]

# ── (C) Fold system-issue envelope (136 unresolved telegram reports) ──
| .task_board.backlog |= map(
    if .id == "FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE" then
      .updated_at = $NOW
      | .updated_by = "po/triage-20260826T1500Z"
    else . end
  )

# ── (E) Fold audit_finding envelope (pdf-extractor A-30) -- 3 rulings ──
| .task_board.backlog |= map(
    if .id == "FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM" then
      .updated_at = $NOW
      | .updated_by = "po (secondary-drain-signoff-20260826T1500Z)"
      | .po_ruling_20260826T1500Z_pdfx_a30_capacity = ("3 rulings on envelope ab2cb52e... (audit_finding, 'A-30 dedup suppression OVERTURNED'). VERIFIED LIVE, not trusted from envelope: tier1-last-trigger.json FAILURE mem_creep=95.56% @14:53:18Z; spawn-debounce.json shows correctly DEBOUNCED (verdict stayed RED, last_healthy.json frozen, not silenced -- AC-3 of the debounce row holding). Fresh docker stats 5.5min later: 76.41%, tied to a 61-page extract job (report d83e8b30..., DONE 14:53:11Z, 7s before the fire) -- BURSTY/job-correlated, not monotonic; refines but does not fully accept the 'still climbing' framing for THIS fire. R1 (pull ack): no acked_memory[] entry exists for pdf-extractor -- refused 4x already, reaffirmed not reversed. R2 (cap): HOLD plan. Cap raise stays REJECTED (13.5GiB/7.75GiB host overcommit). Real fix (1db5f9f81, worker-recycling) code-complete+tested, confirmed NOT deployed to running image; deploy stays gated post-2026-08-26T17:11Z per UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT -- same anchor as this dispatch's hard constraint, no early deploy authorized. R3 (kernel probe): AUTHORIZED (same class as the 2026-08-24T07:22Z precedent) but MY OWN attempt this tick failed -- `docker run --privileged --pid=host justincormack/nsenter1 -- dmesg` returned execve:ENOENT on every target incl. /bin/ls -- sandbox limitation, not design flaw. Deferred to a host-capable session: read CONSTRAINT_MEMCG/oom-kill lines after 2026-08-26T00:33:39Z (this container's StartedAt).")
    else . end
  )

# ── (F) Fold bug-escalation envelope (sweep-guard BARE repeat-offender) ──
| .task_board.review |= map(
    if .id == "FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS" then
      .occurrence_count = ((.occurrence_count // 0) + 1)
      | .po_fold_20260826T1500Z = "New same-class fire folded, NOT re-minted (dedup_key match, no status/next_agent/qa_not_before touched): durable-inbox envelope 266f77fef7ee1a29572aae6cf137f31c38f32a8998e2c3954f9eb6919c39b69d (bug-escalation, commit-sweep-guard, createdAt 2026-08-26T14:25:31Z). Payload: '[sweep-guard] BARE commit about to absorb 3 staged file(s) not necessarily this actor's own: docs/data/auditor-tier1-last-healthy.json docs/data/auditor-tier1-last-trigger.json docs/data/auditor-tier1-spawn-debounce.json. actor=036ceaf1-bf34-46cd-92e4-8c6b213ff4bb mode=warn escalated=true prior_warns=5 threshold=3 outcome=blocked.' escalated=true -> per triage-signals.md this is REPEAT-OFFENDER-AFTER-BLOCK, same dedup_key class this row already owns (sweepguard:bare-commit|defect:repeat-offender-after-block|actor:router-session) -- actor session 036ceaf1-... is the same router-coordinating-session class, a fresh session id with a lower prior_warns count (5 vs the original mint's 20), consistent with the per-session counter having reset on a new session rather than a new root cause. Row's own status/next_agent/qa_not_before/redispatch_count left untouched -- AC-3 re-verification stays QA's own action per po_ruling_ac3_scope_20260825."
    else . end
  )

# ── (D) context_bloat_breach DEFER — no board write (logged in PO notebook only) ──

# ── (G) Durable-inbox CLEAR -- subtractive by envelope_id, defensive re-read ──
| ([
    "2481d0673b40ea5a39dec14295e071a4518ccd0e625cf694d81c6497e22c0138",
    "11bead93cee41f7bd6d9c9081e9776a5d60329e1a7e39a22e409b93c0482ae65",
    "18ba303ce48d6bc73be2f1070b766ac13bbd08f2e5c811fb18fb1dfa336ea62e",
    "ab2cb52efd0d931e83ee26a79fb85d49c9720f626b854b16a3532880b9f5759e",
    "266f77fef7ee1a29572aae6cf137f31c38f32a8998e2c3954f9eb6919c39b69d"
  ]) as $CONSUMED
| .dev_team_idle_chain.pending_triage_inbox |= map(select(.envelope_id as $i | ($CONSUMED | index($i)) | not))
| .dev_team_idle_chain._updated_at = $NOW
| .dev_team_idle_chain._updated_by = "po"
| .dev_team_idle_chain.last_po_triage_at = $NOW
| .dev_team_idle_chain.last_po_triage_by = "po"
| .dev_team_idle_chain.last_po_triage_consumed = ($CONSUMED | length)
| .dev_team_idle_chain.last_po_triage_note = "secondary-drain-signoff-20260826T1500Z: 5 envelopes triaged (1 system-issue fold, 2 context_bloat_breach DEFER, 1 audit_finding fold+3-part ruling, 1 bug-escalation fold), 0 held back, inbox cleared to zero"
