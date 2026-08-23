# PO triage 2026-08-23T11:57Z — Step 0-SIG Pipeline-A dispositions for the
# remaining durable-inbox envelopes, routed strictly per triage-signals.md's
# Pipeline-A table. Every fold was dedup-checked against the NON-TERMINAL
# LANES (backlog+ready+in_progress+review+qa) before deciding fold-vs-mint.
def NOW: "2026-08-23T11:59:00Z";
def BY: "po/triage-20260823T1157Z";

# ── bug-escalation (commit-sweep-guard -> po). Payload leads with
#    "[sweep-guard] BARE commit about to absorb" => TRUE POSITIVE BY
#    CONSTRUCTION (never dispositioned off git show --stat). escalated=true
#    => REPEAT-OFFENDER-AFTER-BLOCK => FIX row required. Dedup hit on the
#    exact tracked row, which is 12469B and already OVER the 12000B prose
#    ceiling in ready[] — ANY prose growth would be rejected as net-new
#    growth, so this fold is a ZERO-BYTE numeric bump only (24 -> 25, same
#    digit width). The narrative for this occurrence lives in PO's notebook
#    and decision journal instead. Cf. FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-
#    OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS (D3) — this is that exact tax.
  (.task_board.ready[] | select(.id == "FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS"))
  |= (. + { occurrence_count: 25 })

# ── notebook_single_section_overage_breach x4 (2 distinct files, each fired
#    twice). Rule: dedup on payload.file, fold into the existing open
#    split/archive CHORE, never one row per fire. Dedup HIT — the existing
#    row already names both files in its own files[].
| (.task_board.backlog[] | select(.id == "CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION"))
  |= (. + { occurrence_count: 2, priority: "P1", updated_at: NOW, updated_by: BY,
      po_fold_20260823T1159Z: "FOLD x4, no new row minted. Four notebook_single_section_overage_breach envelopes this tick, all action_required=manual_split_to_archive, on 2 distinct files BOTH already named in this row's files[]: docs/agent-memory/notebooks/dev-rag-service.md (127L/23244B vs 200L/12000B caps — line count is FINE, bytes are ~1.94x cap) and docs/agent-memory/notebooks/digest-predict.md (45L/35214B — ~2.93x the byte cap on only 45 lines, i.e. ~782 bytes/line, WORSE than the ~573 B/line this row's own title records, so the anomaly is still growing). Each file fired exactly twice, ~40s apart, which is the hook re-firing within one write cycle rather than two independent breaches. The third file in this row's files[] (code-janitor.md) did not fire this tick. NOTE for whoever picks this up: digest-predict.md is ALSO separately tracked by CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT (ready[], claude-manager-helper) which is itself 12585B and over the prose ceiling — that row could not be folded onto at all this tick for exactly that reason. Deconflict the two rows before splitting, do not split the same file twice." })

# ── system-issue (code-janitor -> po). This envelope asks PO for a decision
#    ("decision_needed"), which is squarely PO's job, so it is ANSWERED here
#    rather than deferred. Premise verified before acting, per the rule.
| .task_board.backlog += [{
    id: "CLEAN-RETIRE-TEAM-TOOL-RECHECK-HEALTH-DOC-FAMILY-DEAD-REMOTETRIGGER-WRITER",
    type: "CLEAN", status: "BACKLOG", priority: "P3", size: "S",
    zone: "cross-service/", owner: "developer", next_agent: "developer",
    title: "PO DECISION: retire docs/agent-memory/health/team-tool-recheck-* permanently (do NOT rebuild it as a local cron) — writer died with the 2026-06-22 no-RemoteTrigger directive",
    created_at: NOW, created_by: BY,
    dedup_key: "system-issue:janitor-health-recheck-writer-retired",
    dedup_checked: "backlog+ready+in_progress+review+qa scanned for /RECHECK|TEAM-TOOL|REMOTETRIGGER/ and for the janitor prune-sweep family. FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE (backlog, P1, occurrence_count=6, 11559B) is the adjacent row but is about the sweep hardcoding a dead-writer premise, NOT about the retire-vs-replace product decision this envelope asks for. Minted as the decision record.",
    files: ["docs/agent-memory/health/", "scripts/memory-prune-sweep.sh"],
    desc: "ORIGIN: system-issue envelope from code-janitor, 2026-08-23T10:30:03Z, explicitly carrying `decision_needed`. FINDING (premise verified before acting, per triage-signals.md's system-issue rule): docs/agent-memory/health/team-tool-recheck-*.md has had no writer since 2026-06-23. Known cause is not a bug — the writer was cloud RemoteTrigger trig_019Q8D5xttjZn6iytx2Ld9dW, deliberately killed by the standing 2026-06-22 no-RemoteTrigger directive (feedback_no_remote_trigger_all_local.md). code-janitor offered PO two options: (a) migrate it to a local cron per that directive's migration rule, or (b) retire the recheck permanently and let memory-prune-sweep.sh's 30d rule drain the directory to empty. PO DECISION = (b) RETIRE. RATIONALE, on the record so this is not re-litigated: the recheck has produced nothing for 2 months with no observed consequence, so its value is unevidenced; and the fleet is currently carrying an ACTIVE cron non-recovery incident (FIX-CRON-NONRECOVERY-POST-HOST-SUSPENSION-TIER3-MORNINGBRIEFING-BACKTESTRUNS, P1 — tier-1/2/3 auditor cycles missing 103h/174h/206h, weeklyPortfolioReport MISSED, morningBriefing STALE +22 more), so adding a new cron to a scheduler that is demonstrably not firing its existing ones would manufacture a second dead job rather than restore a signal.",
    ac: ["AC-1 the retirement is recorded where the emitter can see it — code-janitor's own idempotency_note says re-runs of memory-prune-sweep.sh skip this write once any docs/signals/janitor-health-recheck-writer-retired-*.json exists. Write that marker. PO deliberately did NOT write it: PO's flow-doc signal-naming contract (docs/agents/po/flow/main.md) mandates the filename shape po-{ISO8601}.json for PO-emitted signals, which cannot satisfy the janitor's required glob — so the marker must be written by the zone owner, not faked by PO into a non-conforming name.", "AC-2 the marker's `type` field MUST be an already-routed Pipeline-A/Pipeline-B signal type. Do NOT invent a new type token: an unrouted type turns scripts/audits/guard-signal-type-coverage.sh red on the next push and auto-mints an undispatchable FIX-SIGNAL-TYPE-ROUTING-GAP-* row (that has now happened 4 times).", "AC-3 no local cron is created for team-tool-recheck; if a future tick proposes one, this row is the standing counter-decision and must be cited and overridden explicitly.", "AC-4 memory-prune-sweep.sh's 30d rule is confirmed to actually drain docs/agent-memory/health/team-tool-recheck-* to empty (observe the directory shrinking), rather than the family being deleted by hand in one pass."],
    baseline_pass: "ls docs/signals/janitor-health-recheck-writer-retired-*.json  # exists, parses as JSON, and its .type is present in the Pipeline-A or Pipeline-B routing table",
    related: ["FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE", "FIX-CRON-NONRECOVERY-POST-HOST-SUSPENSION-TIER3-MORNINGBRIEFING-BACKTESTRUNS"],
    detail_ref: "docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#memory-docs-hygiene-P3"
  }]

# ── sprint_registry_unresolved_journal_ids (decision-journal-archive -> po).
#    Unrouted type; routed here via the ROUTE-BY-`to` fallback (to=po
#    resolves). Dedup guard ran first, no match. The finding as delivered is
#    untriageable BY CONSTRUCTION, which is itself the defect worth fixing.
| .task_board.backlog += [{
    id: "FIX-DECISIONJOURNALARCHIVE-UNRESOLVED-ID-SIGNAL-OMITS-DERIVATION-SOURCE-UNTRIAGEABLE",
    type: "FIX", status: "BACKLOG", priority: "P2", size: "S",
    zone: "cross-service/", owner: "developer", next_agent: "developer",
    title: "decision-journal-archive reports unresolved sprint-registry journal ids WITHOUT the path it derived each id from — the two ids it reported exist nowhere in the repo, so the signal cannot be triaged by anyone",
    created_at: NOW, created_by: BY,
    dedup_key: "sprint_registry_unresolved_journal_ids:derivation-source-missing",
    dedup_checked: "backlog+ready+in_progress+review+qa scanned for /SPRINT-REGISTRY|DECISION-JOURNAL|JOURNAL-ID/. No match. Minted.",
    files: ["docs/signals/processed/sprint-registry-unresolved-ids-d143efd118229094-2026-08-23T112758Z.json"],
    desc: "ORIGIN: sprint_registry_unresolved_journal_ids envelope, decision-journal-archive -> po, 2026-08-23T11:27:58Z, payload {unresolved_count: 2, ids: [\"ACTIVE-ONE-agent\", \"CLOSED-ONE-agent\"], action_required: \"triage_derived_ids_with_no_orch_record\"}. PO ATTEMPTED THE REQUESTED TRIAGE AND IT IS NOT POSSIBLE FROM THE ARTIFACT — that is the finding. Measured this tick: (1) a full scalar-path scan of docs/data/orch/orch-state.json returns exactly 2 hits for either id, and BOTH are the envelope's own payload.ids[0]/[1] — there is no sprint, task, journal reference or archive entry anywhere on the board; (2) `ls docs/agent-memory/decisions/` matches no file containing either id; (3) `grep -rn` across scripts/ matches neither id; (4) the only other file on disk containing them is the signal's own processed copy. So the emitter asked PO to triage ids whose ORIGIN IS UNLOCATABLE from anything the emitter shipped. SECONDARY OBSERVATION, deliberately flagged as a hypothesis and NOT asserted as root cause: the shape of the names (ACTIVE-ONE-agent / CLOSED-ONE-agent — a matched ACTIVE/CLOSED pair with an ordinal word) is textbook test-fixture naming, so the most likely explanation is that the scanner is deriving ids from fixture or synthetic journal input rather than live data. The fix must confirm or refute that from the code, not from this row.",
    ac: ["AC-1 every id in the signal payload carries the SOURCE it was derived from (file path + line, or the registry key + lane), so the receiving agent can reach the evidence without re-deriving it. An id with no provenance must not be emittable.", "AC-2 determine and state whether ACTIVE-ONE-agent / CLOSED-ONE-agent came from fixture/test input. If yes, the scanner must exclude test-fixture paths from its live scan and this whole signal class was a false positive — say so explicitly rather than closing quietly.", "AC-3 if they came from real data, name the real source and the reason it has no orch record; that is a genuine registry gap and needs its own row.", "AC-4 regression: a synthetic unresolved id emitted by the scanner carries a resolvable, existing source path (opt-IN allowlist verifier, not opt-out)."],
    baseline_pass: "the emitted signal's payload.ids[] entries each carry a source path; `test -e` on each source path succeeds",
    status_note: "Low volume (first observed fire) but zero-cost to fix and the current shape guarantees every future fire is also untriageable. Type sprint_registry_unresolved_journal_ids is itself unrouted on Pipeline A — folded into FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire's umbrella_scope this tick; routed here in the meantime via the table's ROUTE-BY-`to` fallback."
  }]
