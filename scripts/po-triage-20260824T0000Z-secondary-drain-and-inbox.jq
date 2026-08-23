# scripts/po-triage-20260824T0000Z-secondary-drain-and-inbox.jq
#
# PO Review-Lane SECONDARY-Drain owner-triage, dispatched by dev-team tick
# 2026-08-23T23:07Z on FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT.
#
# Board mutations (ONE orch-apply.sh write — see main.md § Reusable triage scripts):
#  (1) TASK 1 — FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT: NOT signed off.
#      All 4 decomposition children resolve live to ready[]/status=TODO
#      (0/4 complete). Moved done[] -> ready[] as a real epic wrapper
#      (children[] populated) so scripts/devteam-wrapper-autoclose.jq
#      (ready[] U in_progress[]) becomes its reader and auto-closes it when
#      the children actually land. Orphaned secondary_claimed_* stamps
#      dropped (this triage IS their resolution).
#  (2) TASK 1b — the 4 children get next_agent/owner=agent-father; every
#      file they touch is under docs/agents/ or .claude/skills/, agent-father's
#      exclusive commit zone (docs/agents/agent-father/init.md:63). They had
#      NO next_agent at all, so zone-detect Tier-3 would have mis-routed them
#      to the generic `developer` placeholder.
#  (3) TASK 2 — mint FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY.
#  (4) TASK 3 — mint RC-1 (orch-apply CAS baseline) + RC-2 (qa-drain `|| true`)
#      per the dev-team CORRECTION envelope 68531dca's explicit ACTION REQUESTED.
#  (5) TASK 3 — mint FIX-TRIAGE-SIGNALS-PIPELINE-A-UNROUTED-TYPES so the 4
#      deliberately-held inbox envelopes have a durable owner.
#  (6) TASK 3 folds: sweep-guard repeat-offender occurrence bump, size-lint
#      fleet-push blocker premise re-measure, ba.md added to the notebook
#      byte-cap CLEAN row.
#
# NO lane counts change except the single done[] -> ready[] move plus 4 mints.

def bump_occ: (.occurrence_count // 0) + 1;

($now) as $NOW
| ["FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM",
   "FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS",
   "FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER",
   "FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER"] as $kids

# ── (1) lift the parent out of done[] ───────────────────────────────────────
| (.task_board.done | map(select(.id == "FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT")) | .[0]) as $parent
| if $parent == null then error("parent row not found in done[]") else . end
| .task_board.done |= map(select(.id != "FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT"))
| .task_board.ready += [
    ($parent
     | del(.secondary_claimed_at, .secondary_claimed_by, .secondary_dispatch_target)
     | .status = "READY"
     | .children = $kids
     | .owner = "agent-father"
     | .next_agent = "agent-father"
     | .updated_at = $NOW
     | .updated_by = "po"
     | .triaged_at = $NOW
     | .triaged_by = "po (review-lane secondary-drain owner-triage)"
     | .status_note = "NOT SIGNED OFF — po resolved all 4 decomposition children on the LIVE board 2026-08-24T00:0xZ: FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM, FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS, FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER, FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER are ALL ready[]/status=TODO, 0/4 complete, untouched since pm decomposed them 2026-08-14T01:35Z (10 days). A DONE_VERIFIED sign-off here would be a false green and would falsely satisfy FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT's `depends` on this id. DISPOSITION: reassigned next_agent=agent-father (all 4 children touch docs/agents/ or .claude/skills/ only) and moved done[] -> ready[] with children[] populated, which makes this a real epic wrapper: BOUNDED-1's EPIC-WRAPPER GATE will never auto-claim it as atomic work, and scripts/devteam-wrapper-autoclose.jq (candidate set = ready[] U in_progress[], never backlog[]) is now its reader and will close it out automatically once all 4 children reach a TERMINAL_SET status. It had NO reader at all while parked in done[]. The orphaned secondary_claimed_* stamps from the 2026-08-23T23:26:16Z claim were dropped — that claim was never dispatched (see FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY) and this triage is its belated resolution."
    )
  ]

# ── (2) make the 4 children dispatchable ────────────────────────────────────
| .task_board.ready |= map(
    if (.id as $i | $kids | index($i)) != null then
      . + { owner: "agent-father",
            next_agent: "agent-father",
            updated_at: $NOW,
            updated_by: "po",
            routing_note: "next_agent stamped by po 2026-08-24 (review-lane secondary-drain triage of parent FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT). This row carried NO next_agent for 10 days; its `zone` value is a bare label (cowork-team/docs/unified-agent/alert-commander), not an apps/<service>/ path, so zone-detect's Tier-3 fallback would have mis-routed it to the generic `developer` placeholder. Every file in .files[] is under docs/agents/ or .claude/skills/ — agent-father's exclusive commit zone per docs/agents/agent-father/init.md:63. Exception noted, not hidden: FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM also touches docs/data/cowork-schedule.json, which is OUTSIDE that zone list — coordinate that one file rather than assuming the grant." }
    else . end)

# ── (3)(4)(5) mints ─────────────────────────────────────────────────────────
| .task_board.backlog += [
  {
    id: "FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY",
    type: "FIX",
    status: "BACKLOG",
    priority: "P1",
    size: "S",
    zone: "docs/agents/dev-team/flow/",
    owner: "agent-father",
    next_agent: "agent-father",
    created_at: $NOW,
    created_by: "po (review-lane secondary-drain triage 2026-08-24)",
    updated_at: $NOW,
    dedup_key: "secondary-drain:caller-readback-lane-blind|file:docs/agents/dev-team/flow/main.md",
    origin_signal_id: "5f66e56e99191bf3d5afb0213be082b9abac1887693b0fbe3308084a48c34d52",
    title: "Review-Lane SECONDARY-Drain is silently dead for review[]: the claim script picks from review[] UNION done[], but main.md's read-back reads review[] only — a done[]-origin pick stamps the board, returns picked=empty, and dispatches nothing",
    desc: "VERIFIED AT SOURCE by po 2026-08-24, both halves read directly, not inferred. (a) scripts/devteam-review-claim-secondary-drain.jq builds its candidate set as `[ (.task_board.review // [] | ... status==\"REVIEW\"), (.task_board.done // [] | ... status==\"DONE\") ]` and stamps secondary_claimed_at/_by/_dispatch_target IN PLACE on whichever lane the pick lives in — widened 2026-08-08 by FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (archive/2026-08.json, DONE_VERIFIED), architect brief docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md §2 Component 2. (b) Its ONLY caller, docs/agents/dev-team/flow/main.md § Review-Lane SECONDARY-Drain, still reads the result back with `picked=$(jq -c --arg t \"$NOW\" --arg by \"dev-team (review-lane secondary-drain)\" '[.task_board.review[] | select(.secondary_claimed_at == $t and .secondary_claimed_by == $by)] | first // empty' ...)` — review[] ONLY. So whenever the oldest candidate is a done[]-origin row the script stamps it, the caller sees picked empty, the whole `if picked is non-empty` block (outer task_claim + Agent() spawn) is skipped, and nothing is logged: the failure is byte-identical to 'nothing eligible'. LIVE MEASUREMENT 2026-08-24T00:0xZ: 36 eligible SECONDARY candidates (16 review[]/status=REVIEW + 20 done[]/status=DONE, all next_agent != qa). ZERO of the 16 review[] rows has EVER carried a secondary_claimed_* stamp. All 3 stamps on the live board are done[]-origin and none was ever dispatched: FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES (2026-08-13T16:23:30Z, target po, stranded 11 days), FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS (2026-08-23T13:39:19Z, target po, still stranded), FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT (2026-08-23T23:26:16Z — dispatched ONLY because the router hand-carried it to po out-of-band, never by this lane). SELF-PERPETUATING: age_epoch sorts on `updated_at // reviewed_at // created_at` and the 8 oldest candidates are all done[]-origin (oldest UC-CCA-P2-SKILL-GW-GATE 2026-08-14T12:40:05Z), and a done[] row never leaves DONE precisely because the sign-off reader it needs is the thing that never gets spawned. Same lane-blind defect class main.md has already fixed three times: FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND, FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE, FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND (all three resolve DONE_VERIFIED in docs/data/orch/archive/2026-08.json).",
    generic_mandate: "Widen the CALLER's read-back to the same lane set the script it invokes already writes to. Do NOT narrow the script back to review[]-only — the done[] half is a shipped, DONE_VERIFIED feature (FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION) and done[] rows genuinely need this lane as their only DONE_VERIFIED producer.",
    ac: [
      "AC-1 docs/agents/dev-team/flow/main.md § Review-Lane SECONDARY-Drain's `picked=` query scans review[] AND done[], e.g. `[ (.task_board.review[]?), (.task_board.done[]?) ] | map(select(.secondary_claimed_at == $t and .secondary_claimed_by == $by)) | first // empty`. The read-back lane set must be justified in-file against the claim script's own candidate-set construction, so the next widening of either side cannot silently desync again.",
      "AC-2 NEGATIVE CONTROL — a review[]-origin pick still dispatches exactly as before. Prove it on a scratch copy, never against the live file (the claim script's own 2026-08-01 dry-run convention).",
      "AC-3 POSITIVE CONTROL — a done[]-origin pick now yields non-empty `picked` and reaches the outer task_claim + Agent() spawn. `picked.secondary_dispatch_target` must be honoured verbatim; the resolver already maps null/absent/\"dev-team\" -> \"po\".",
      "AC-4 LIVE EVIDENCE OF DRAIN, not just a green read: after landing, at least one of the 16 currently-eligible review[] rows must acquire a secondary_claimed_* stamp AND a matching dispatch. A stamp with no dispatch is the exact symptom this row exists to kill and must not be reported as a pass.",
      "AC-5 RE-DRIVE THE TWO STRANDED CLAIMS. FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES and FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS both still sit in done[] carrying undispatched stamps (dev-team escalation 2026-08-23T22:02:02Z: 'the two older done[] stamps were left untouched and still need routing to po'). Either let the fixed lane pick them up on its own next tick, or hand-route them to po — but do not close this row while either is still stamped-and-unread.",
      "AC-6 The silent-failure mode itself is closed: when a claim actuates but the read-back finds nothing, the flow must log a distinguishable line. 'stamped but not dispatched' must never again be byte-identical to 'nothing eligible'."
    ],
    files: ["docs/agents/dev-team/flow/main.md"],
    reference_only_files: [
      "scripts/devteam-review-claim-secondary-drain.jq",
      "scripts/lib/devteam-eligibility.jq",
      "docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md"
    ],
    not_duplicate_of: "FIX-DONELANE-DEVTEAM-FLOWDOC-PROSE-SYNC (ready[], agent-father, P2, created 2026-08-08 by architect) is the nearest neighbour and is NOT a duplicate — it EXCLUDES this defect by its own text: 'Non-blocking documentation/audit-trail sync ... zero bash/call-site changes in main.md, so the mechanism is fully live the instant that row lands.' That premise is FALSE and is exactly the bug: the call site IS a bash block in main.md and it IS review[]-only, so the mechanism has never been live for review[] rows. That row's AC(2) only asks for one clarifying prose sentence in this same section; it does not touch the `picked=` query. Land both; whoever takes this one should also strike the false 'zero bash/call-site changes' sentence from that row. FIX-DONELANE-SECONDARY-DRAIN-BLIND-TO-ACTIVE-SPRINTS-NESTED-DONE-TASKS (backlog, developer) is a third, disjoint gap on the SCRIPT side (candidate set omits active_sprints[].tasks[]); it would not fix the caller. All three ids resolved live on the board before this row was minted.",
    verification_gate: "qa sign-off against AC-1..AC-6; AC-4 requires live board evidence, not a dry-run.",
    baseline_pass: true
  },
  {
    id: "FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ",
    type: "FIX",
    status: "BACKLOG",
    priority: "P0",
    size: "M",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    created_at: $NOW,
    created_by: "po (triage of dev-team CORRECTION envelope 68531dca, 2026-08-24)",
    updated_at: $NOW,
    dedup_key: "orch-apply:cas-window-misses-caller-read-transform-gap",
    origin_signal_id: "68531dca05f022a240858d2fc6ced44f863ba60e567587c38722304aa1e5d8dc",
    title: "orch-apply.sh's CAS window opens AFTER the caller's jq already read the file, so a stale full-document candidate silently reverts a peer's lane-move — and nothing downstream catches it because conservation compares magnitudes, which a revert preserves",
    desc: "VERIFIED AT SOURCE by po 2026-08-24: scripts/orch-apply.sh captures MTIME_BEFORE at line 116 ('CAS: capture live file mtime BEFORE reading stdin'), i.e. when orch-apply STARTS — which in the mandated pipeline `jq '<transform>' orch-state.json | bash scripts/orch-apply.sh` is AFTER the caller's jq has already read the file. A candidate built from a read taken minutes earlier therefore applies with MTIME_BEFORE == MTIME_AFTER and no mismatch. Timeline from the dev-team CORRECTION (2026-08-23T21:37Z tick): T0 peer jq reads (qa=2) | T1 our orch-apply writes (qa=7) | T2 peer orch-apply starts, MTIME_BEFORE=T1 | T3 peer renames, MTIME_AFTER=T1 -> MATCH -> applies -> qa back to 2. A concurrently-running pm subagent's unrelated done[] -> done_verified[] write (commit 54f0cf9b4) carried a full-document candidate built minutes earlier and restored the stale qa[]/review[] arrays wholesale; `git show 54f0cf9b4 -- docs/data/orch/orch-state.json | grep <row-id>` is EMPTY for all 5 clobbered ids — pm never mentioned them, it just carried a stale copy of the whole array. NOTHING DOWNSTREAM CATCHES IT: scripts/orch-conservation-check.mjs compares MAGNITUDES (task_total 769 == 769) and a lane REVERT preserves every count; Zod passes; the dup-key validator passes; there is no lane-placement invariant anywhere in the write path. The file is left CLEAN. Attribution warning carried forward from the same envelope: three qa sessions independently concluded the QA-Drain PRIMARY claim 'never actuated' and recommended a dispatcher-side actuation FIX row — that inference is WRONG (the claim DID actuate; picked_batch was read back non-empty from the live file, qa[] went 2 -> 7) and no such row was minted. Their journals qa-S185, qa-S187 and sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-27 carry the wrong attribution and should be annotated.",
    generic_mandate: "Let the CALLER supply the baseline. orch-apply.sh must compare against the mtime/hash the caller observed at jq time, not against its own start-of-process reading. Do NOT 'fix' this by banning concurrent board writers — the hazard is the width of the caller's read->transform gap, not the number of writers; 4 concurrent qa sessions wrote the same board that tick with zero mutual clobbering.",
    ac: [
      "AC-1 orch-apply.sh accepts a caller-observed baseline (env var or flag carrying mtime/content-hash read at jq time) and CAS-compares against THAT, falling back to today's behaviour only when the caller supplies nothing.",
      "AC-2 Regression fixture reproducing the exact T0..T3 interleave above must exit 2 (CAS mismatch) with the caller baseline supplied, and — as the negative control — must still exit 0 for a non-overlapping sequential write.",
      "AC-3 Add a lane-placement invariant the conservation checker can actually see: a candidate that moves a row BACKWARD out of a lane it did not itself name must be rejected or loudly flagged. Magnitude-only conservation is provably blind to this class (task_total was identical across the whole incident).",
      "AC-4 Callers migrated in the same change, or a tracked follow-up per caller. The wrapper is mandatory fleet-wide (CLAUDE.md § Orch-State Hot File), so a baseline nobody passes is a no-op.",
      "AC-5 Do NOT report this fixed on the strength of a green run alone — a green run is the SYMPTOM-FREE state this bug already produces. Prove the guard FIRES on the fixture in AC-2."
    ],
    files: ["scripts/orch-apply.sh", "scripts/orch-conservation-check.mjs"],
    verification_gate: "qa sign-off against AC-1..AC-5; AC-2 and AC-5 require a failing-then-passing fixture, never an exit-code-only report.",
    baseline_pass: true
  },
  {
    id: "FIX-DEVTEAM-QADRAIN-PIPE-SWALLOWS-CAS-ABORT-NO-RETRY",
    type: "FIX",
    status: "BACKLOG",
    priority: "P1",
    size: "S",
    zone: "docs/agents/dev-team/flow/",
    owner: "agent-father",
    next_agent: "agent-father",
    created_at: $NOW,
    created_by: "po (triage of dev-team CORRECTION envelope 68531dca, 2026-08-24)",
    updated_at: $NOW,
    dedup_key: "qadrain-headdecoupled:orchapply-pipe-or-true-swallows-exit2",
    origin_signal_id: "68531dca05f022a240858d2fc6ced44f863ba60e567587c38722304aa1e5d8dc",
    title: "QA-Drain head-decoupled call site ends its orch-apply pipe with `|| true` and has no retry, so a genuine CAS exit-2 abort is discarded and the tick degrades to a silent no-op",
    desc: "VERIFIED AT SOURCE by po 2026-08-24: docs/agents/dev-team/flow/main.md § Review-Lane QA-Drain — Head-Decoupled Invocation (jump:qa-drain-headdecoupled) runs `jq ... -f \"$PROJECT_ROOT/scripts/devteam-review-claim-qa-drain.jq\" docs/data/orch/orch-state.json | bash \"$PROJECT_ROOT/scripts/orch-apply.sh\" || true` and then reads picked_batch back from the live file. orch-apply.sh documents exit 2 as 'CAS mtime mismatch — concurrent writer detected; caller should retry' (scripts/orch-apply.sh:68) and its own header says the caller should retry — but `|| true` discards that exit status entirely and there is no retry at this site. Today the bug is mostly latent because the CAS window itself is too narrow to fire (see FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ); the moment that row lands and CAS starts firing correctly, this line becomes an active silent-drop: the abort is swallowed, picked_batch comes back empty, and the tick produces a no-op indistinguishable from 'nothing eligible'. Raised by dev-team as ROOT CAUSE 2 of the 2026-08-23T21:37Z incident CORRECTION — 'real, separate, same line'. Deliberately NOT dep-gated on the orch-apply row: dropping `|| true` and adding retry-on-exit-2 is independently correct today.",
    generic_mandate: "Handle exit 2 explicitly at this call site: retry-on-exit-2 with a bounded budget, and log loudly when the budget is exhausted. Do not blanket-remove `|| true` from every pipe in the file without checking each site's own semantics — audit the sibling sites and state the verdict per site.",
    ac: [
      "AC-1 The qa-drain-headdecoupled orch-apply pipe no longer swallows a nonzero exit. Exit 2 triggers a bounded retry; a non-2 nonzero exit is logged, never silently ignored.",
      "AC-2 Exhausting the retry budget emits a distinguishable log line, so a CAS-aborted tick can never again read as 'nothing eligible'.",
      "AC-3 Audit the sibling `|| true` orch-apply pipes in this same file (at minimum § Review-Lane SECONDARY-Drain's own pipe) and record a per-site verdict — fix or justified-as-is. Do not silently generalize.",
      "AC-4 NEGATIVE CONTROL: a normal exit-0 tick behaves exactly as today, no extra spawn and no extra board write."
    ],
    files: ["docs/agents/dev-team/flow/main.md"],
    reference_only_files: ["scripts/orch-apply.sh", "scripts/devteam-review-claim-qa-drain.jq"],
    related: ["FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ"],
    verification_gate: "qa sign-off against AC-1..AC-4.",
    baseline_pass: true
  },
  {
    id: "FIX-TRIAGE-SIGNALS-PIPELINE-A-UNROUTED-TYPES",
    type: "FIX",
    status: "BACKLOG",
    priority: "P1",
    size: "S",
    zone: "docs/agents/po/flow/",
    owner: "agent-father",
    next_agent: "agent-father",
    created_at: $NOW,
    created_by: "po (Step 0-SIG triage 2026-08-24)",
    updated_at: $NOW,
    dedup_key: "signal-type-registry-gap:recurring-bug",
    title: "3 live Pipeline-A signal types have no routing row in docs/agents/po/flow/triage-signals.md — 4 inbox envelopes are being held back uncleared because clearing them would turn signal-type-coverage-guard green without the gap being fixed",
    desc: "MEASURED BY PO 2026-08-24 by replaying guard-signal-type-coverage.sh's OWN Pipeline-A extraction read-only against the live doc (the guard script itself was deliberately NOT invoked — it is not read-only, it mints backlog rows through ORCH_APPLY_LIVE_FILE_OVERRIDE, and its `--check` flag is an accepted-and-ignored no-op alias, not a dry-run; that misleading flag is separately tracked as FIX-GUARD-SIGNAL-TYPE-COVERAGE-CHECK-FLAG-MISLEADING-NOT-DRYRUN). Live inbox = 36 envelopes / 13 distinct types; 10 route, 3 do not: (1) `recurring-bug` — 2 envelopes, from dev-team, ZERO literal occurrences anywhere in triage-signals.md or triage-signals-longtail.md; (2) `sprint_registry_dangling_ids` — 1 envelope, emitted by scripts/orch-validate.mjs:862 (Stage 1h), ZERO occurrences; the superficially similar `sprint_registry_unresolved_journal_ids` row is a DIFFERENT emitter (scripts/agents-flow/decision-journal-archive.sh) and does not cover it; (3) `system_issue` UNDERSCORE — 1 envelope, from system-auditor, severity CRITICAL. Only the HYPHEN form `system-issue` has a real routing row (triage-signals.md:39). The underscore form appears in that file ONLY inside the `**CORRECTION` measurement stats table at line 72, which guard-signal-type-coverage.sh's pipeline_b_section() parser deliberately SKIPS for exactly this reason — so it is not routed and must not be treated as routed. A prior dev-team signal already requested this fix and was drained to docs/signals/processed/signal-type-routing-gap-recurring-bug-and-flowdoc-template-2026-08-23T155638Z.json WITHOUT ever producing a board row; this row is that missing durable artifact.",
    generic_mandate: "Add real Pipeline-A routing rows. For `system_issue` decide deliberately between an alias row next to `system-issue` and fixing the system-auditor emitter to send the hyphen form — an alias is cheaper but leaves two spellings live forever. Do NOT satisfy this row by editing the CORRECTION stats table: the guard skips that block by construction, so a 'fix' there is invisible to the guard and to PO alike.",
    ac: [
      "AC-1 triage-signals.md's Pipeline-A table carries a real routing row for `recurring-bug` and for `sprint_registry_dangling_ids`, each naming its emitter, its dedup key and its disposition.",
      "AC-2 `system_issue` (underscore) is resolved deliberately — alias row OR emitter fix — and the choice is justified in-file.",
      "AC-3 Verify by replaying the guard's own extractor read-only (the awk/grep pipeline in pipeline_a_section + extract_type_column) and showing the 3 types now appear in the parsed set. NEVER verify this by the guard's exit code in either direction: green can mean the envelopes were cleared rather than routed, and red can mean unrelated drift.",
      "AC-4 The 4 held envelopes (2x recurring-bug, 1x sprint_registry_dangling_ids, 1x system_issue) are still in .dev_team_idle_chain.pending_triage_inbox[] and must be routed by the new rows on a subsequent PO tick — not cleared as part of this fix.",
      "AC-5 If scripts/audits/guard-signal-type-coverage.sh's self-filing fallback has since minted FIX-SIGNAL-TYPE-ROUTING-GAP-* siblings for `sprint-registry-dangling-ids` or `system-issue` (this row's dedup_key only matches the `recurring-bug` slot), fold them into this row rather than working them separately."
    ],
    files: ["docs/agents/po/flow/triage-signals.md"],
    reference_only_files: [
      "scripts/audits/guard-signal-type-coverage.sh",
      "scripts/orch-validate.mjs",
      "docs/signals/processed/signal-type-routing-gap-recurring-bug-and-flowdoc-template-2026-08-23T155638Z.json"
    ],
    verification_gate: "qa sign-off against AC-1..AC-5.",
    baseline_pass: true
  }
]

# ── (6) folds ───────────────────────────────────────────────────────────────
| .task_board.ready |= map(
    if .id == "FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS" then
      # occurrence_count ONLY. This row is already 11968B against
      # ORCH_ROW_PROSE_CEILING_BYTES=12000, so it cannot absorb ANY new inline
      # prose (a first attempt at a full fold note aborted the write at
      # 12552B). Occurrence 28 = inbox envelope 43e35b3a, 2026-08-23T23:16:19Z,
      # escalated=true prior_warns=10 outcome=blocked, actor
      # 007e33e4-b453-4bb3-8ab1-ef31495906a3, victim file
      # docs/agent-memory/notebooks/system-auditor.md. Detail lives in the po
      # notebook + this script header, NOT inline on the row.
      . + { occurrence_count: bump_occ }
    else . end)
| .task_board.backlog |= map(
    if .id == "FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH" then
      . + { occurrence_count: bump_occ,
            updated_at: $NOW,
            status_note: ((.status_note // "") + " || PREMISE RE-MEASURED AGAIN BY PO 2026-08-24 (Step 0-SIG, 5 more auto-push-abort envelopes, all reason=push-fail, dedup_key auto-push-abort:push-fail — folded here, zero re-mints): `git fetch origin main` then `git rev-list --count origin/main..HEAD` = 95 ahead, `git rev-list --count HEAD..origin/main` = 0 behind. The envelopes' own ahead snapshots (49/58/73/82/92) were all stale as the routing row warns. docs/agent-memory/sessions/fleet-push.log confirms the SAME gate on all 4 most recent attempts: tsc passes, then `[size-lint] FAIL — apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts — baseline-tolerance-exceeded (baseline=228L actual=252L upper=250L)` -> `[pre-push] BLOCKED`. Backlog has grown 46 -> 95 unpushed commits since this row was minted; still P0, still one 2-line trim or baseline bump, and it now also gates every CI-green verification on the board.") }
    else . end)
| .task_board.backlog |= map(
    if .id == "CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION" then
      . + { files: ((.files // []) + ["docs/agent-memory/notebooks/ba.md"] | unique),
            occurrence_count: bump_occ,
            updated_at: $NOW,
            dedup_key: "notebook_no_valid_drop_candidate_breach:multi-file",
            fold_note: "po Step 0-SIG 2026-08-24: 6 notebook_no_valid_drop_candidate_breach envelopes (ba.md x2, dev-rag-service.md x2, digest-predict.md x2) + 2 notebook_prune_dropped_newest_dated_section envelopes (ba.md) folded here rather than re-minted, per the routing rows' dedup-on-payload.file rule. dev-rag-service.md and digest-predict.md were already in .files[]; ba.md was NOT covered by this row nor by CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT, so it is added here — same failure shape (non_sentinel_section_count=1 against sentinel sections, 58L/12439B vs 200L/12000B caps). The underlying design defect stays tracked on FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE (ready[])." }
    else . end)

| .task_board.last_triaged_at = $NOW
| .task_board.last_triaged_by = "po (review-lane secondary-drain owner-triage + Step 0-SIG)"
| ._updated_at = $NOW
| ._updated_by = "po"
