# po-triage-20260826T0707Z-tier2cadence-preclaim-notbefore.jq
#
# PO Step 1 triage, dev-team tick 2026-08-26T07:07Z (session 036ceaf1).
# Board mutations for the 10-envelope pending_triage_inbox drain + 2 router findings.
# ALL row selection is BY ID, never by array index — a peer session mutated
# ready[] (109 -> 108) between this cycle's first read and this write.
#
# Owning flow doc: docs/agents/po/flow/triage-signals.md
# Registry pointer: docs/agents/po/flow/scripts-registry.md
#
# Invoke:
#   jq -f scripts/po-triage-20260826T0707Z-tier2cadence-preclaim-notbefore.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def NOW: "2026-08-26T07:29:40Z";

# ── 1. FOLD +1 (3rd measured confirmation, now on `po`) + P1->P0 + promote
#       backlog[] -> ready[]. Envelope 4428bf45 (recurring-bug, dev-team).
def preclaim_fold:
  .priority = "P0"
  | .status = "READY"
  | .owner = "architect"
  | .next_agent = "architect"
  | .dispatch_lane = "architect"
  | .occurrence_count = 3
  | .updated_at = NOW
  | .updated_by = "po (triage-20260826T0707Z)"
  | .po_occ3_20260826T0729Z =
      ("OCCURRENCE 3 + P1->P0 ESCALATION + backlog[]->ready[] PROMOTE, po 2026-08-26T07:29Z (triage-20260826T0707Z). "
       + "Envelope 4428bf45 (type=recurring-bug, from=dev-team, priority=low — the LOW priority is the envelope's, not this row's). "
       + "THIRD measured runtime confirmation in under 12 hours, and the first on `po` itself: intent:po:main + intent:po:triage were both claimed "
       + "ttl_seconds=600 at ~06:00:30Z; po ran 1,009,293ms (16m49s) and returned ~06:17:20Z; BOTH task_release calls returned ok:true released:0 "
       + "— i.e. already expired. Unguarded window ~7 minutes, during which session-presence held 2 live peer router sessions, either of which would "
       + "have read the key as free. Second po sample the same day: 937s. So po, like architect (22m50s) and agent-father (11m10s) already recorded on "
       + "this row, is unguarded for the TAIL OF ESSENTIALLY EVERY INVOCATION. "
       + "WHY P0 (not impact-this-time — no duplicate po was actually spawned): 3/3 sampled runs across 3 different agent types measured the guard "
       + "expired before the agent returned. This is not a tail risk, it is the steady state — the Phase B mutex is a duplicate-spawn ENABLER for the "
       + "majority of every long run, fleet-wide, on the router's own hot path. Same inversion shape as the already-recorded S2/ILC resume-key ttl=3600 "
       + "defect, but at 600s it fires far more often. "
       + "WHY PROMOTED TO ready[]: the row sat at backlog[582] of 597. DRS's in-band tiebreak is ARRAY INDEX, not age, so a P0 minted at the tail of "
       + "backlog[] ranks effectively last and would not have been reached. next_agent=architect is on the DRS-ratified allowlist, so ready[] is "
       + "genuinely dispatchable for it. "
       + "NEGATIVE CONTROL carried forward from the envelope, must survive into the fix: raising the ttl or heartbeating the intent lock MUST NOT make a "
       + "genuinely dead session's lock un-reclaimable — orphan reclamation via the presence/Phase-A reaper path has to keep working.");

# ── 2. FOLD 2 duplicate dashboard envelopes + ROOT CAUSE + re-owner + promote.
#       Envelopes bd663560 / bbe969a9 (auditor_cycle_missing, WARN, one shared
#       dedup_key auditor-cycle-missing:tier2:2026-08-26T04:00Z).
def tier2_rootcause:
  .priority = "P1"
  | .status = "READY"
  | .owner = "developer"
  | .next_agent = "developer"
  | .dispatch_lane = "developer"
  | .zone = "cross-service/"
  | .size = "S"
  | .type = "FIX"
  | .occurrence_count = 3
  | .dedup_key = "auditor:tier2-cadence|defect:spawn-gate-threshold-equals-alarm-threshold"
  | .title = ("Auditor tier-2 can never meet its documented 4h cadence: the SPAWN gate and the missing-cycle ALARM use the SAME 480-minute constant, "
              + "so a tier-2 cycle is structurally forbidden to run until the exact moment auditor_cycle_missing becomes eligible to fire — measured "
              + "effective cadence 8-13h (median ~10.5h) over the last 8 completions")
  | .updated_at = NOW
  | .updated_by = "po (triage-20260826T0707Z)"
  | .po_rootcause_20260826T0729Z =
      ("ROOT CAUSE MEASURED AT SOURCE + FOLD x1 (2 envelopes, 1 occurrence) + P2->P1 + owner agent-father->developer + backlog[]->ready[], "
       + "po 2026-08-26T07:29Z (triage-20260826T0707Z). "
       + "ENVELOPES: bd663560 (06:59:52Z) and bbe969a9 (07:00:16Z) are the SAME finding 24s apart under one shared dedup_key "
       + "'auditor-cycle-missing:tier2:2026-08-26T04:00Z' — counted as ONE occurrence, not two. "
       + "THE TWO HALVES, BOTH READ IN CODE, NOT INFERRED: "
       + "(a) ALARM SIDE — scripts/auditor-durability-sweep.sh:310 (_run_sweep_0b2): tier-2 cadence=14400s and the emit condition is "
       + "`if [ \"$gap\" -gt $(( cadence * 2 )) ]`, i.e. alarm when heartbeat age > 28800s = 480 min. "
       + "(b) SPAWN-GATE SIDE — scripts/agents-flow/auditor-tier1-probe.sh:1188 (_fresh_threshold_minutes_for_tier, tier 2 -> 480) feeding :1269 "
       + "(run_tiered_probe): `if age_min -le threshold_min -> SKIP-SPAWN`. "
       + "So the gate REFUSES to spawn a tier-2 cycle for exactly as long as the alarm stays silent, and the instant the alarm becomes eligible "
       + "(age > 480) the gate becomes eligible too. The two constants are the same number, 480, derived independently in two files as '2x cadence'. "
       + "CONSEQUENCE 1 — the documented 4h cadence is unreachable by construction: a tier-2 cycle can only spawn on a tick where age > 480min, so the "
       + "best achievable interval is 2 cron ticks (8h) and in practice 3 (12h). "
       + "CONSEQUENCE 2 — every tier-2 cycle is PRECEDED by at least one guaranteed auditor_cycle_missing WARN, because the durability sweep runs far "
       + "more often than the 4-hourly tier-2 cron and will always observe the >480min window before the next tick can close it. The WARN is a TRUE "
       + "POSITIVE about a real cadence miss whose cause is the gate, not a detector fault. "
       + "MEASURED, NOT ASSUMED — 8 consecutive tier-2 completions from `git log docs/data/auditor-tier2-last-healthy.json` (.last_healthy_at per "
       + "commit): 08-22T18:32:21Z, 08-23T07:57:01Z, 08-23T14:42:59Z, 08-24T02:44:09Z, 08-24T13:53:37Z, 08-24T18:32:39Z, 08-25T02:40:07Z, "
       + "08-25T12:17:07Z, 08-25T22:47:57Z. Intervals: 13h25m, 6h46m, 12h01m, 11h09m, 4h39m, 8h07m, 9h37m, 10h31m. Median ~10.5h against a documented "
       + "4h cadence; only ONE interval is under 8h (4h39m), which is the expected escape hatch — run_tiered_probe forces SPAWN whenever "
       + "checks_verdict != ALL_GREEN, bypassing the freshness gate entirely. Current live age at triage: last_healthy 08-25T22:47:57Z vs now "
       + "08-26T07:29Z = 8h42m, and the 02:33Z tick is on record as SKIP-SPAWN (commit 664ae9ee9, 'tier-2 + tier-3 ticks 2026-08-26 — both SKIP-SPAWN'). "
       + "WHY OWNER MOVED agent-father -> developer: the fix is in scripts/agents-flow/auditor-tier1-probe.sh and/or scripts/auditor-durability-sweep.sh. "
       + "`scripts/` is OUTSIDE agent-father's commit zone, so this row was unroutable to its previous owner for the whole time it sat in backlog[]. "
       + "WHY THE dedup_key CHANGED: it was 'auditor-tier2-cycle-missing-11h' — a bespoke per-WINDOW key. Per-window keys mint one row per observation "
       + "window and hide real coverage; the new key is subject-scoped so every future tier-2 cadence envelope folds here instead of minting. "
       + "ACCEPTANCE (AC): (1) The spawn-gate threshold and the alarm threshold must stop being the same number — either the gate spawns at <= 1x "
       + "cadence (240min) so the 4h cadence is actually achievable, or the documented cadence is corrected to match the gate and the alarm threshold "
       + "is moved above it. Pick one and make the two files cite each other. (2) Regression assertion: over any rolling 48h window with all checks "
       + "green, the observed interval between consecutive .last_healthy_at values in docs/data/auditor-tier2-last-healthy.json must be <= the declared "
       + "cadence x1.5. (3) Do NOT 'fix' this by widening the D-CYCLE-2 predicate — see the cross-reference note on "
       + "FIX-AUDITOR-DCYCLE2-COMPLETION-EVIDENCE-PREDICATE-CANNOT-SEE-COMPLETED-CYCLES; that would silence a true positive. "
       + "(4) Tier-3 uses the identical construction (_fresh_threshold_minutes_for_tier -> 2880 = 2x 24h vs cadence*2 in the sweep) and must be fixed in "
       + "the same pass or explicitly ruled out with evidence. "
       + "OPEN QUESTION for the implementer, recorded not resolved: two envelopes with an IDENTICAL dedup_key were emitted 24s apart, so run_emit_signal's "
       + "dedup did not suppress the second. That may be a separate emitter defect or may be two concurrent sweep invocations; not investigated here.");

# ── 3. Discriminator note only — this row stays in backlog[], unchanged lane/owner.
def dcycle2_discriminator:
  .updated_at = NOW
  | .po_discriminator_20260826T0729Z =
      ("DISCRIMINATOR NOTE (no lane/owner/priority change), po 2026-08-26T07:29Z. This row's thesis is that D-CYCLE-2 fires for tiers that ARE running "
       + "(blind completion-evidence predicate). That thesis is CORRECT for the TIER-1 arm and MUST NOT be generalised to the tier-2 arm. "
       + "Measured this tick: the tier-2 auditor_cycle_missing WARN is a TRUE POSITIVE. docs/data/auditor-tier2-last-healthy.json genuinely reads "
       + "last_healthy_at=2026-08-25T22:47:57Z (8h42m stale at 07:29Z), the file is present and parseable, and the 02:33Z tier-2 tick is on record as "
       + "SKIP-SPAWN (commit 664ae9ee9). Root cause is the spawn gate, now owned by "
       + "FIX-AUDITOR-TIER2-CYCLE-MISSING-NO-COMPLETION-EVIDENCE-IN-11H (re-root-caused, P1, developer). "
       + "HAZARD THIS NOTE EXISTS TO PREVENT: whoever implements this row will be tempted to add a notebook fallback to the tier-2/3 arms so they stop "
       + "alarming. On tier-2 that would convert a correct alarm about a real 8-13h cadence miss into silence, and the cadence miss would then be "
       + "unobservable. Fix the gate first (or in the same pass); only then relax the tier-2 detector, and only with the cadence regression assertion "
       + "from that row's AC-2 in place.");

# ── 4. Terminal-shape repair only. Envelope 406eee29's mechanism is NOT this
#       row's mechanism, so occurrence_count is deliberately NOT bumped.
def notebookcompose_terminalshape:
  .owner = "developer"
  | .next_agent = "developer"
  | .dispatch_lane = "developer"
  | .updated_at = NOW
  | .updated_by = "po (triage-20260826T0707Z)"
  | .po_shapefix_20260826T0729Z =
      ("TERMINAL-SHAPE REPAIR + BLOCKER CLEARED, po 2026-08-26T07:29Z (triage-20260826T0707Z). No occurrence bump — see the discriminator below. "
       + "(a) This P0 has sat in review[] for 28 days with owner, next_agent AND dispatch_lane all ABSENT (not null-valued — the keys did not exist), so "
       + "no picker could resolve a target: the Review-Lane QA-Drain PRIMARY selector wants next_agent==qa, and the SECONDARY resolver would have "
       + "defaulted it to `po`, round-tripping it back to triage forever. Now explicitly developer. "
       + "(b) blocked_by=[FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED] is SATISFIED — that row is in done_verified[] with status DONE_VERIFIED. "
       + "The blocker is stale, not live; this row is dispatchable. "
       + "(c) DISCRIMINATOR — envelope 406eee29 ([notebook-immutability-guard] WARN on docs/agent-memory/notebooks/unified-agent.md, section "
       + "'## 2026-08-25T07:24Z — chef-intraday convergence scan (PUBLISHED)') is NOT an occurrence of this row and was deliberately NOT folded here. "
       + "This row's mechanism is the compose step REWRITING retained content (cosmetic re-render / paying cap debt) — a loss-risk mechanism. The "
       + "unified-agent case is the opposite: byte-for-byte APPEND-ONLY growth of a retained section (2375B -> 3261B -> 3657B across commits e3f16b6c6 / "
       + "ce78ac26c / 8bf872681 / 436b2e48a; every diff is pure addition, zero deletions, zero data loss). It was folded into "
       + "FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH instead, which owns the heading-level contract. Bumping occurrence_count here would have "
       + "contaminated this row's evidence base with a different defect.");

# ── 5. FOLD 2nd distinct manifestation + widen scope + promote. Envelope 406eee29.
def headingmismatch_fold:
  .status = "READY"
  | .owner = "agent-father"
  | .next_agent = "agent-father"
  | .dispatch_lane = "agent-father"
  | .occurrence_count = 2
  | .updated_at = NOW
  | .updated_by = "po (triage-20260826T0707Z)"
  | .po_occ2_20260826T0729Z =
      ("OCCURRENCE 2 — SECOND, STRUCTURALLY DIFFERENT MANIFESTATION + backlog[]->ready[] PROMOTE, po 2026-08-26T07:29Z (triage-20260826T0707Z). "
       + "Source: envelope 406eee29, bug-escalation from commit-sweep-guard, payload class [notebook-immutability-guard] (AC-2a WARN, mode=warn, "
       + "never blocks). Mint threshold for this payload class per triage-signals.md is 'SAME agent+section pair fires on >=2 SEPARATE cycles' and it "
       + "is MET: docs/agent-memory/notebooks/unified-agent.md, section '## 2026-08-25T07:24Z — chef-intraday convergence scan (PUBLISHED)', fired at "
       + "2026-08-26T04:21:47Z and again at 2026-08-26T06:24:29Z — two separate unified-agent cowork cycles 2h03m apart. Verified against the full "
       + "docs/signals/processed/ history of this payload class, which shows the pair appearing exactly twice and no third file. "
       + "WHY THIS ROW AND NOT A NEW ONE: same subject (notebook heading-level contract vs the '^## ' prune/immutability plane), so folding keeps ONE "
       + "open artifact per subject. But the manifestation is the COMPLEMENT of the one this row was minted for, and the acceptance criteria do not "
       + "currently cover it — hence the widening below. "
       + "ORIGINAL (occurrence 1, agent-father.md): ZERO '^## ' sections, all content under '### ' — prune cannot act at all and the AC-4 blank-state "
       + "fallback is armed to overwrite the file. "
       + "NEW (occurrence 2, unified-agent.md via docs/agents/unified-agent/flow/chef.md): '## ' sections DO exist (4 of them), but successive chef "
       + "cycles are being appended as '### <ts> — chef-intraday' SUB-BLOCKS nested inside an ALREADY-RETAINED '## ' section instead of opening a new "
       + "dated '## ' section. Measured at source: the retained section grew 2375B (commit e3f16b6c6, 04:23Z) -> 3261B (ce78ac26c, 06:21Z) -> 3657B "
       + "(436b2e48a, 08:24Z local); each diff is pure addition. Added inside it: '### 2026-08-26 04:13:00Z — chef-intraday (SILENT)' and "
       + "'### Cycle 2026-08-26T06:21Z (intraday) — SILENT'. "
       + "ZERO DATA LOSS SO FAR — this is explicitly NOT a loss report. Three real consequences that are still defects: "
       + "(1) The '## ' heading now MISDATES its own content: a section headed 2026-08-25T07:24Z '(PUBLISHED)' contains two 2026-08-26 SILENT cycles. "
       + "Every consumer that reads notebook state by '## ' heading timestamp — including the auditor's own _t1_latest_notebook_ts() completion-evidence "
       + "arm — now reads a wrong, stale instant for this agent. "
       + "(2) LATENT DATA LOSS, which is what makes this P1 rather than cosmetic: notebook-auto-prune drops the oldest WHOLE '## ' section. Because "
       + "three cycles are welded under one 2026-08-25-dated heading, the drop-oldest heuristic will take all three at once — including the SAME-DAY "
       + "cycles — in a single authorized-looking prune. The prune would be correct by its own contract and the loss would be invisible in review. "
       + "(3) It trips the AC-2a immutability guard on every subsequent write, adding permanent WARN noise to the bug-escalation channel and raising "
       + "the base rate that the triage rule for this payload class is trying to discriminate against. "
       + "NONDETERMINISM WORTH SAMPLING: the very next write DID open a proper new section ('## Chef Intraday Cycle 2026-08-26T07:13Z', live in the "
       + "worktree at triage time). So the behaviour alternates between correct and incorrect within one agent on one flow file — a QA gate for this "
       + "must sample repeatedly, not once. "
       + "ADDED ACCEPTANCE (AC-5, additive — original AC 1-4 unchanged and still in force): a notebook write MUST open a NEW '## ' dated section for a "
       + "NEW cycle and MUST NOT nest new-cycle content as '### ' sub-blocks under an already-retained '## ' section. Assert on docs/agents/unified-agent/"
       + "flow/chef.md Step 8b (the notebook/session header step) and on .claude/skills/notebook-write/SKILL.md's compose contract, and cover the "
       + "partial-mismatch case (some '## ' present, new content nested under a stale one) — the existing guard only covers the zero-'## ' case. "
       + "DISPATCH NOTE: next_agent=agent-father is OFF the DRS-ratified allowlist, so this row is reachable only by deliberate PO/router dispatch. "
       + "That is why it sat unrouted in backlog[] for 36 days (minted 2026-07-21, re-verified 2026-07-28, untouched since). Folded into this tick's "
       + "PO BATCH as the manual-dispatch-sweep pick.");

# ── 6. NEW MINT — router finding #2, independently re-verified by PO at source.
def notbefore_row:
  {
    id: "FIX-NOTBEFORE-DEFERRAL-GATE-ENFORCED-BY-ONE-OF-FOUR-DISPATCH-PICKERS",
    type: "FIX",
    status: "READY",
    priority: "P1",
    size: "S",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    dispatch_lane: "developer",
    dedup_key: "devteam-eligibility:is_gated_not_before|defect:imported-but-not-invoked-by-3-of-4-pickers",
    created_at: NOW,
    created_by: "po/triage-20260826T0707Z",
    updated_at: NOW,
    updated_by: "po (triage-20260826T0707Z)",
    title: ("The not-before deferral gate is DECORATIVE on 3 of 4 dispatch paths: all four pickers import scripts/lib/devteam-eligibility.jq but only "
            + "the QA-drain ever calls is_gated_not_before(), so stamping qa_not_before / next_recheck_not_before / qa_new_window_earliest_d1_close on a "
            + "row does not defer it on the ready, incident or secondary lanes"),
    status_note: ("AC: is_gated_not_before($now) is invoked by all four dispatch pickers, proven by a call-count assertion in a test that fails if any "
                  + "picker imports devteam-eligibility.jq without calling the predicate. Priority P1."),
    po_evidence: ("RAW-VERIFIED AT SOURCE by po 2026-08-26T07:29Z (triage-20260826T0707Z). Routed from a router flow-defect finding, then re-measured "
                  + "independently rather than accepted on trust — the router's counts reproduced exactly. "
                  + "Call counts of `is_gated_not_before` per picker, alongside the count of `devteam-eligibility` import references: "
                  + "scripts/devteam-review-claim-qa-drain.jq -> 2 calls (3 import refs); "
                  + "scripts/devteam-backlog-claim-incident-lane-consumer.jq -> 0 calls (2 import refs); "
                  + "scripts/devteam-backlog-claim-ready-lane-consumer.jq -> 0 calls (2 import refs); "
                  + "scripts/devteam-review-claim-secondary-drain.jq -> 0 calls (2 import refs). "
                  + "IMPORTING IS NOT ENFORCING — all four load the library, which is exactly why a reader auditing imports alone would score this GREEN. "
                  + "The predicate itself is sound and is defined at scripts/lib/devteam-eligibility.jq (def gate_not_before_keys / def "
                  + "is_gated_not_before($now)); it reads the three keys qa_not_before, next_recheck_not_before, qa_new_window_earliest_d1_close and "
                  + "returns true when any parses to a strictly later instant than $now. Nothing is wrong with the predicate — three of its four intended "
                  + "call sites simply never invoke it. "
                  + "LIVE CONSEQUENCE OBSERVED THIS TICK, not hypothetical: the router needed to defer a P0 ops row "
                  + "(FIX-MARKETDB-20260826-RESTORE-DROPPED-12205-FF5M-AND-54-EVIDENCE-ROWS-STILL-RECOVERABLE, ready[] head) past a peer session's "
                  + "db-data-integrity sweep window, and had to hold a task-lock busy-guard instead of stamping a not-before field — precisely because a "
                  + "gate field on a ready[] row would have been ignored by the ready-lane consumer. A deferral mechanism that forces callers to reach "
                  + "for an out-of-band lock is a mechanism that does not work. "
                  + "SIBLING, SAME INVARIANT, DIFFERENT CALL SITE — close together or explicitly rule out: "
                  + "FIX-WF2-NO-CHECKPOINT-TIMESTAMP-HOLD-NEXT-RECHECK-NOT-BEFORE (backlog[], po/developer) covers dev-team WF-2's should_hold having no "
                  + "time-based hold at all. Same 'not-before is unenforced' family; that row is the resume plane, this row is the claim plane. "
                  + "FALSE-GREEN RISK for whoever verifies this: do NOT assert on the presence of the import line, and do NOT assert that a gated row was "
                  + "skipped on a single tick — a row can be skipped for many other reasons. Assert on the call count per file, and separately on a "
                  + "fixture row that carries a future not-before value and IS otherwise fully eligible for each of the three lanes."),
    source_signal: "docs/signals/20260826T071950Z-notbefore-gate-honored-by-one-of-four-pickers.json"
  };

# ────────────────────────────────────────────────────────────────────────────
# Apply. Selection is BY ID throughout.

(.task_board.backlog | map(select(.id == "FIX-PRECLAIM-INTENT-KEY-TTL-600-EXPIRES-UNDER-LONG-RUNNING-AGENT")) | .[0] | preclaim_fold) as $preclaim
| (.task_board.backlog | map(select(.id == "FIX-AUDITOR-TIER2-CYCLE-MISSING-NO-COMPLETION-EVIDENCE-IN-11H")) | .[0] | tier2_rootcause) as $tier2
| (.task_board.backlog | map(select(.id == "FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH")) | .[0] | headingmismatch_fold) as $heading
| .task_board.backlog |= map(
    select(.id != "FIX-PRECLAIM-INTENT-KEY-TTL-600-EXPIRES-UNDER-LONG-RUNNING-AGENT"
       and .id != "FIX-AUDITOR-TIER2-CYCLE-MISSING-NO-COMPLETION-EVIDENCE-IN-11H"
       and .id != "FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH")
    | if .id == "FIX-AUDITOR-DCYCLE2-COMPLETION-EVIDENCE-PREDICATE-CANNOT-SEE-COMPLETED-CYCLES"
      then dcycle2_discriminator else . end)
| .task_board.review |= map(
    if .id == "FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS"
    then notebookcompose_terminalshape else . end)
| .task_board.ready = (.task_board.ready + [$preclaim, $tier2, $heading, notbefore_row])
| .task_board.last_triaged_at = NOW
| .task_board.last_triaged_by = "po (triage-20260826T0707Z)"
| ._updated_at = NOW
| ._updated_by = "po"
