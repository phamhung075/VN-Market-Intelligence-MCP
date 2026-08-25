# =============================================================================
# SUPERSEDED — NEVER APPLIED. DO NOT RUN THIS FILE.
# =============================================================================
# Authored by the PO session dispatched at 2026-08-25T08:15:01Z, which died
# mid-run on the account-level weekly API quota (fleet outage 08:26Z -> 12:00Z)
# before it could pipe this through scripts/orch-apply.sh. Left untracked in the
# working tree; adopted 2026-08-25T12:30Z by session 036ceaf1 after every
# load-bearing claim in it was independently re-verified at source.
#
# WHERE ITS CONTENT WENT:
#   blocks (2)-(9)  -> scripts/po-triage-20260825T1230Z-inbox-folds-mints-and-
#                      adopted-0824Z-blocks.jq, APPLIED (commit of 2026-08-25).
#   block  (10)     -> same file, APPLIED, but ONLY together with a dangling-edge
#                      repair this file lacks: retiring TASK-DEVTEAM-IDLE-CHAIN-3-
#                      DRAIN-DURABILITY to archive[] breaks
#                      TASK-DEVTEAM-IDLE-CHAIN-4-TESTS-AC1-AC2-AC4's
#                      depends:["TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY"],
#                      which orch-validate Stage 1g then reports as MISSING
#                      (its resolver reads the 7 flat lanes + cold archive, NOT
#                      hot archive[]). Running block (10) as written below adds a
#                      dangling dependency edge.
#   block  (1)      -> DROPPED. Its premise ("stay in done[]/DONE; the updated_at
#                      bump deranks the row in the age-sorted candidate set") is a
#                      rotation, not a fix — and it is exactly what produced three
#                      consecutive wasted SECONDARY-drain picks on 2026-08-25
#                      (05:10Z, 08:15Z, 12:16Z). The row was instead moved to
#                      .task_board.archive[] (not in the claim script's candidate
#                      set at all) by scripts/po-triage-20260825T1226Z-decomposed-
#                      wrapper-cohort-to-archive.jq. Its VERIFIED FINDINGS were
#                      preserved verbatim onto the archived row's review_note.
#
# Its block (1) would now be a silent no-op anyway: the row it targets is no
# longer in .task_board.done[].
# =============================================================================

# scripts/po-triage-20260825T0824Z-branchguard-signoff-and-inbox.jq
#
# PO Review-Lane SECONDARY-Drain owner-triage + Step 0-SIG inbox routing,
# dispatched by dev-team tick 2026-08-25T08:07Z on the done[]-origin row
# FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR.
#
# ONE orch-apply.sh-gated write. Board mutations:
#  (1) PRIMARY row: NOT signed off. Stays done[]/DONE (correct terminal shape
#      for a pm-decomposed epic wrapper). Orphaned secondary_claimed_* stamps
#      dropped (this triage IS their resolution). review_note records the live
#      verification so the next reader is not in the position this one was.
#  (2) TASK-BRANCHGUARD-POSTCHECKOUT-HOOK: status_note records the measured
#      ready[] queue position that explains why delivery has not moved.
#  (3..7) FOLDS for 11 drained inbox envelopes (see per-block headers).
#  (8,9) MINTS: 2 genuinely-uncovered defects (subject-scanned, not keyword).
#  (10) RETIRE TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY -> archive[]
#       CANCELLED: its scope shipped 2026-08-08, verified at source.
#
# PROSE-CEILING DISCIPLINE (scripts/orch-row-prose-ceiling-check.mjs, 12000B,
# lanes backlog/ready/review, growth-only): live prose headroom measured
# BEFORE authoring each fold. FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-
# ROUTER-SESSION-20-WARNS had 64B headroom, so its fold is a BYTE-NEUTRAL
# numeric occurrence bump ONLY (31 -> 32, same digit count) with the prose
# evidence held in the decision journal instead. done[] is not a ceiling lane,
# so (1)'s review_note is unconstrained.

($now) as $NOW

# ── (1) PRIMARY — FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR ────
| .task_board.done |= map(
    if .id == "FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR" then
      del(.secondary_claimed_at, .secondary_claimed_by, .secondary_dispatch_target)
      | .updated_at = $NOW
      | .updated_by = "po"
      | .triaged_at = $NOW
      | .triaged_by = "po (review-lane secondary-drain owner-triage, dev-team tick 2026-08-25T08:07Z)"
      | .review_note = "[po 2026-08-25T08:24Z] NOT SIGNED OFF AS DELIVERED — and deliberately NOT reopened either. DISPOSITION: stays done[]/status=DONE, which is the CORRECT terminal shape for this row; the secondary_claimed_* stamps from the 08:15:01Z claim are dropped, this triage is their resolution.\n\nWHAT WAS ACTUALLY VERIFIED LIVE (nothing below is inferred from the DONE status): (i) BOTH children are ready[]/status=TODO, next_agent=owner=developer, untouched since pm wrote them at 2026-08-23T13:38:01Z — 0/2 complete; (ii) scripts/git-hooks/post-checkout DOES NOT EXIST on disk — `ls scripts/git-hooks/` returns install.sh, post-commit, pre-commit, pre-push plus their .test.sh siblings and fixtures/, nothing else, and `.git/hooks/` carries only the post-commit/pre-commit/pre-push symlinks. So the AC-1(a) deliverable is unshipped and AC-4's two-agent live positive control has never run against this repo. The underlying hazard (any agent honouring a `branch:` field hijacks every concurrent peer's commits) is STILL LIVE.\n\nWHY DONE_VERIFIED WOULD BE WRONG, TWICE OVER: (a) it is a false green — pm's own closeout note already says 'do not read this DONE as the underlying defect is fixed', and the live probe above confirms it; (b) it is schema-unwritable — checkVerificationGate() in apps/mcp-server/src/infrastructure/orchStateSchema.ts hard-rejects any DONE_VERIFIED row without verification.raw_probe{tool,args,...}, and there is no probe to cite because nothing shipped.\n\nWHY PLAIN DONE IS NEVERTHELESS SAFE TO LEAVE: deps_satisfied() in scripts/lib/devteam-eligibility.jq requires every dependency id to resolve to DONE_VERIFIED — plain DONE is explicitly NOT sufficient (that def's own header states it). So no downstream row is falsely unblocked by this row sitting at DONE. This is the exact hazard that the 2026-08-24 triage of FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT had to avoid, and it is avoided here by not touching the status.\n\nWHY NOT REOPEN TO ready[] (the 2026-08-24 precedent is deliberately NOT applied): scripts/po-triage-20260824T0000Z-secondary-drain-and-inbox.jq moved a done[] wrapper back into ready[] so scripts/devteam-wrapper-autoclose.jq (candidate set ready[] U in_progress[]) would become its reader. That row needed it — it had never been formally closed out and had an EMPTY children[]. This row has BOTH: a written pm closeout AND a populated children[]. Reopening it would reproduce precisely the defect pm's closeout ended ('leaving it in ready[] only re-routed it to pm every manual-dispatch sweep'), and it needs no autoclose reader because it is already closed. Delivery is tracked on the children, not here.\n\nWHY THIS WILL NOT RE-CONSUME A PICKER SLOT: scripts/devteam-review-claim-secondary-drain.jq sorts its review[] U done[] candidate set by age_epoch (updated_at // reviewed_at // created_at) ASCENDING and picks index 0. This write bumps updated_at to now, making this row the NEWEST of the 12 done[]+DONE candidates — it cannot be re-picked until all 11 others have been triaged past it.\n\nDELIVERY IS STALLED, NOT LOST — MEASURED, NOT ASSERTED: TASK-BRANCHGUARD-POSTCHECKOUT-HOOK sits at ready[] array index 90 of 108, with 8 P0 rows and roughly 40 P1 rows ahead of it in-band. The Ready-Lane Consumer dispatches ONE row per turn and its tiebreak is ARRAY INDEX, not age, so on current ordering this child is ~48 dispatch turns from being picked. TASK-BRANCHGUARD-ENFORCE-FLIP is correctly and intentionally blocked behind it: depends_on = [TASK-BRANCHGUARD-POSTCHECKOUT-HOOK, UC-RDL-P7-A], and UC-RDL-P7-A was confirmed live in ready[]/TODO this tick. NEXT ACTION FOR WHOEVER READS THIS: do not re-triage this umbrella — either dispatch TASK-BRANCHGUARD-POSTCHECKOUT-HOOK by hand or re-rank it within ready[]. Re-opening a triage on this row is wasted work; the answer is on the child."
    else . end
  )

# ── (2) child — record the measured queue position ──────────────────────────
| .task_board.ready |= map(
    if .id == "TASK-BRANCHGUARD-POSTCHECKOUT-HOOK" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .status_note = "[po 2026-08-25T08:24Z] DISPATCH-STARVATION MEASUREMENT, not a scope change. This row is the sole gate on its parent FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR being signable, and on its sibling TASK-BRANCHGUARD-ENFORCE-FLIP (which depends_on it). Measured live this tick: array index 90 of 108 in ready[], with 8 P0 rows and ~40 P1 rows ahead in-band; the Ready-Lane Consumer takes ONE row per turn and tiebreaks on ARRAY INDEX not age, so it is ~48 dispatch turns out on current ordering — which is why it has not moved since pm created it at 2026-08-23T13:38:01Z. Nothing is blocking it technically: no depends_on, zone=scripts/git-hooks/, owner=next_agent=developer, deliverable fully designed in docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md. It needs a hand-dispatch or a re-rank, not more triage."
    else . end
  )

# ── (3) FOLD — sweep-guard bug-escalation (envelope d65af058) ───────────────
# BYTE-NEUTRAL numeric bump ONLY: this row's live prose measured 11936B of a
# 12000B ceiling (64B headroom). 31 -> 32 is the same digit count, so the
# growth-only guard cannot trip. Prose evidence held in the decision journal:
# NEW ACTOR c6581d0a at prior_warns=1/3 (victim: system-auditor.md notebook),
# i.e. the defect is NOT confined to the single router session this row is
# named after. TRUE POSITIVE BY CONSTRUCTION per triage-signals.md's own rule
# (pre-commit exits before write_signal on mode=SCOPED, so the signal existing
# at all is the mechanism proof).
| .task_board.ready |= map(
    if .id == "FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS"
    then .occurrence_count = 32 else . end
  )

# ── (4) FOLD — routed_to label drift (envelope 1826de7e finding_1) ──────────
| .task_board.backlog |= map(
    if .id == "FIX-DEVTEAM-DRAIN-ROUTES-NON-PO-ENVELOPES-TO-PO-STEP0SIG" then
      .occurrence_count = 6
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_occurrence_6_20260825T0824 = "OCCURRENCE 6, and it WIDENS this row's scope by one axis. The router's 2026-08-25T07:07Z dev-team tick reports that routed_to is wrong on a SECOND axis beyond the value defect this row already owns: the LABEL SPELLING itself drifts between the two drain planes. The FILE plane is deterministic — scripts/agents-flow/drain-signals.js:284 calls computeRoutedTo(type, from) and all 48 file-sourced envelopes carry the exact string 'PO Step 0-SIG'. The DASHBOARD plane (queue-row READ-marking, flow §0a-D) is UNSCRIPTED — drain-signals.md §0a-1 states verbatim that the canonical script does NOT cover §0a-D — so the (type,from) lookup is re-derived by hand each tick and the spelling is whatever that tick's executor typed: 19 dashboard envelopes carry 'PO Step 0-SIG', 2 carry 'po-step-0-sig' (both drained_at 2026-08-25T04:41:11Z, from system-auditor + code-janitor). Blast radius today is LOW (routed_to is documented informational-only and PO Step 0-SIG re-reads the inbox as SSOT) but it is a latent trap for any future consumer that string-matches the field. FOLDED NOT MINTED on the reporter's own recommendation, which PO verified: same field, same fix surface. Whoever works this row must fix BOTH the value and the spelling-determinism, and the only durable spelling fix is giving the queue plane a shared implementation instead of a hand-derivation."
    else . end
  )

# ── (5) FOLD — cycle-snapshot chain (envelopes 212b86bf, 3d19fe9f, fd38028f,
#      plus the promoter/token-contract findings inside telemetry 61048600) ──
# Live prose headroom measured at 1107B — this note is kept under it.
| .task_board.backlog |= map(
    if .id == "FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK" then
      .occurrence_count = 2
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_fold_20260825T0824 = "READ BEFORE DESIGNING. cowork-team self-corrected this diagnosis TWICE in 30min (07:29Z -> 07:42Z -> 07:58Z); only the LAST holds. WITHDRAWN: 'structurally unhittable' and 'reader is uniformly token-blind'. HOLDS: the reader is NON-DETERMINISTIC. Four consecutive cycles, one agent, one flow: c250 tick=07:05 probed 07:05 (rounded) HIT; c251 tick=07:22 probed 07:22 (raw) MISS; c252 tick=07:30 probed 07:35 (rounded) MISS; c253 tick=07:45 probed 07:45 (NOMINAL) MISS. Writer drift stable +4-5min. Which key gets used is decided per-cycle by the model — neither the SKILL nor the flow names scheduled_utc (grep 0 hits). FIX-SHAPE CORRECTION: a writer-only move to the nominal key is NOT inert but also NOT strictly hit-increasing — it trades c250-style coincidental hits for deterministic ones, so writer+reader must land together. TWO UNVERIFIED INFERENCES, confirm at source first: (a) cycle-snapshot-latest.json is 4468B while every Step 4.7 snapshot is ~16.6KB with the same 4 toplevel keys, so the promoter likely BUILDS its own payload rather than copying — if so there is nothing to unify, only a third semantic to delete; emit_pressure_state's source has still not been read; (b) spawn-fanout.md's Consumer Contract derives the window key from the token's leading 10 chars = the DATE only, so the contract does not COVER the snapshot case at all — extend it to the time portion before wiring anything."
    else . end
  )

# ── (6) FOLD — load-average comma-decimal, 6th occurrence (envelope 61048600) ─
| .task_board.backlog |= map(
    if .id == "FIX-SPAWNFANOUT-LOAD-PARSE-COMMA-DECIMAL-TRUNCATION-AND-BAD-LC-ALL-REMEDY" then
      .occurrence_count = 6
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_occurrence_6_20260825T0824 = "OCCURRENCE 6, reported in the 2026-08-25T08:08Z cowork tick telemetry: uptime yielded the comma-decimal '1,90' through the flow's parse. Verdict unaffected THIS tick only because 1.90 vs threshold 24 fails open — the truncation is silent whenever the load is genuinely near threshold, which is exactly when it matters. The reporter supplied a verified remedy, recorded here so the implementer does not re-derive it: `uptime | awk -F'load averages?:' '{print $2}' | awk '{v=$1; gsub(\",\",\".\",v); print v}'`. DO NOT pin LC_ALL=C — pinning it is what produces the concatenation garbage this row's own title already flags as the bad remedy."
    else . end
  )

# ── (7) FOLD — context_bloat_breach, sprint journal (envelope a11149fb) ─────
# Live prose headroom measured at 2254B.
| .task_board.ready |= map(
    if .id == "CHORE-PRUNE-SPRINT-COWORK-GUARANTEED-SLOT-CATCHUP-DECISION-JOURNAL" then
      .occurrence_count = 5
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_occurrence_5_20260825T0824_DEFERRED_SIBLING = "OCCURRENCE 5 — a THIRD distinct file of the SAME sprint, disposition DEFER, exactly as occurrence 4 (qa-11). Signal: context-bloat-backstop-hook 2026-08-25T07:20:10Z on docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md, class=sprint-decision-journal, payload 190L/37153B. PREMISE RE-MEASURED RAW WITH wc, NOT READ OFF THE PAYLOAD: 192L / 37194B at triage time, mtime AFTER the fire, i.e. still being written. Byte overage 1194B (3.3%); LINE axis clean at 192 of 600 — the same byte-binds-alone asymmetry this row already documents twice. WHY DEFER: it is the live tip of a rolling numbered journal (dev-mcp-server -> -2 ... -> -6, 90 files in this sprint family on disk) and splitting a live tip races its editor; per feedback_ctxbloat_breach_on_live_sprint_file_defer, N breaches from ONE sprint are a SINGLE per-sprint deferral class, not N janitor candidates — hence a fold, not a third competing mint. NOTE the active_sprints[] object for this sprint does not exist, so the sprint-open test must use live board rows as proxy, same as occurrence 4. SCOPE FENCE FOR claude-manager-helper: dev-mcp-server-6.md is deliberately NOT in files[]. DO NOT TOUCH IT. This row's actionable scope remains the FROZEN agent-father base file plus qa-21.md. RE-EVAL GATE, all three: (i) dev-mcp-server-6 rolled forward to -7 with a CAP-REACHED marker; AND (ii) the sprint has concluded; AND (iii) it is still over 36000B at rest. Structural remedy stays with FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR (decision-journal-archive.sh fires on sprint-close, never on the byte cap) — do not close this row as its duplicate."
    else . end
  )

# ── (8) MINT — DATA-tier history trail (envelope d1bbc0f8, router-authored) ──
| .task_board.backlog += [{
    id: "FIX-DBINTEGRITY-HISTORY-FINDINGS-MEMBERSHIP-FREE-JUDGMENT-AND-MULTITABLE-TABLE-FIELD",
    type: "FIX",
    size: "M",
    priority: "P2",
    status: "BACKLOG",
    zone: "scripts/",
    owner: "developer",
    next_agent: "developer",
    created_at: $NOW,
    created_by: "po/triage-20260825T0824Z",
    updated_at: $NOW,
    updated_by: "po",
    dedup_key: "datatier:history-findings-membership-unstable-and-multitable-table-field",
    origin_signal_id: "router-datatier-history-trail-20260825T080555Z",
    files: ["scripts/db-integrity-history-append.sh"],
    title: "DATA-tier integrity history trail has two independent soundness defects: findings[] MEMBERSHIP is unconstrained free judgment (identical underlying counts produced 7 findings at 07:30:26Z and 1 at 07:59:48Z), and the per-finding `table` field accepts a comma-joined multi-table string that flows unvalidated into both the dedup key and the emitted signal's check-id",
    root_cause: "scripts/db-integrity-history-append.sh trusts the LLM-supplied entry body wholesale. (a) MEMBERSHIP: nothing constrains which observations enter .findings[] — line 63 only counts them — so a finding's ABSENCE from the trail is ambiguous between 'checked, clean' and 'checked, not recorded'. Measured 2026-08-25 findings[] length by scan ts: 04:30:50Z=0, 05:03:23Z=7, 05:41:12Z=1, 07:00:48Z=4, 07:30:26Z=7, 07:59:48Z=1, while the four underlying counters were IDENTICAL across the 07:30 and 07:59 sweeps (ohlc_violations=336, scale_gt100x=0, vnindex_cache_rows=1, low_confidence_reports=52). (b) TABLE FIELD: line 73 reads `table` raw; line 75 passes it to the dedup check as `--table \"$table\"` and line 92 interpolates it into `--check-id \"${table}-${CLASS_TXT}\"`. A live instance is the verbatim two-table string 'price_alerts, alert_engine_records', which yields a composite dedup key and a composite check-id that can never match either single-table row.",
    evidence: "Router raw-verification of the 07:59:48Z DATA sweep — no detector caught either defect. Source lines re-read at triage time and confirmed: scripts/db-integrity-history-append.sh:73-75 and :92.",
    ac: "(AC-1) findings[] membership becomes decidable: either the script derives entries mechanically from the counters it already has, or absence is made explicit (an emitted 'checked-clean' record per counter) so absence is never ambiguous. Prose telling the LLM to be consistent is a rejection — that is what is already in place. (AC-2) `table` is validated to a single known table name before it reaches --table or --check-id; a multi-table finding must fan out to one finding per table, not concatenate. Reject at the gate with a loud error rather than silently composing a key. (AC-3) Positive control on the exact live instance: feed a finding carrying 'price_alerts, alert_engine_records' and assert it either fans out to two single-table findings or fails loud — never produces a composite key. (AC-4) Replay the 07:30:26Z and 07:59:48Z counter sets and assert identical inputs now yield identical findings[] membership.",
    dedup_checked: "2026-08-25T08:24Z — PO independently re-ran the coverage scan by SUBJECT rather than trusting the reporter's own (the report's coverage_scan_method claimed all 15 lanes + 3 archive months + backlog-detail, 6 hits rejected). PO scan across every task_board array lane matching /db-integrity-history|history-append|findings\\[\\]|integrity-history/i returned 4 hits, all read: FIX-DRAIN-PAYLOADREF-UNBOUNDED-INLINE-SIZE-GATE (payload_ref inline SIZE), FIX-DBINTEGRITY-SIGNAL-PAYLOADREF-WHOLE-ACCUMULATOR (hardcoded --payload-ref target), FIX-DBINTEGRITY-VERDICT-LABEL-UNBOUND-BYPASSES-DEDUP-AND-SIGNAL-ACTUATOR (the VERDICT half of line 73's conjunct), FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED (done_verified, notebook wiring). None owns membership or the table VALUE. A second scan for /multi.?table|comma.joined|membership|--table/i over the hot board AND archive/2026-06|07|08.json returned zero relevant rows. Exactly one other row carries a 'datatier:' dedup_key prefix and it is the verdict row. BOUNDARY vs that verdict row, stated explicitly per the reporter's own not_covered_by: line 73 gates on `verdict == \"REAL\" && -n table`. The verdict row owns the FIRST conjunct — an unbound label letting a real finding skip the actuator. THIS row owns the SECOND conjunct's VALUE plus the upstream question of whether the finding entered findings[] at all. Do not fold them.",
    related: ["FIX-DBINTEGRITY-VERDICT-LABEL-UNBOUND-BYPASSES-DEDUP-AND-SIGNAL-ACTUATOR"],
    baseline_pass: null
  }]

# ── (9) MINT — gcc-preflight T6 worktree-lock glob (envelope 1826de7e f2) ────
| .task_board.backlog += [{
    id: "FIX-DEVTEAM-GCCPREFLIGHT-WORKTREE-LOCK-GLOB-DEAD-CODE",
    type: "FIX",
    size: "S",
    priority: "P3",
    status: "BACKLOG",
    zone: "docs/agents/dev-team/",
    owner: "agent-father",
    next_agent: "agent-father",
    created_at: $NOW,
    created_by: "po/triage-20260825T0824Z",
    updated_at: $NOW,
    updated_by: "po",
    dedup_key: "devteam:gcc-preflight-worktree-lock-glob-matches-zero-files",
    origin_signal_id: "devteam-tick-20260825T0707Z-finding-2",
    files: ["docs/agents/dev-team/flow/main.md"],
    title: "dev-team gcc-preflight's worktree-lock expiry sweep is dead code as written: `for each f in .claude/worktrees/*/.git/*.lock` can never match, because in a LINKED worktree .git is a FILE (a gitdir: pointer), not a directory — the real lock dir is .git/worktrees/<name>/",
    root_cause: "docs/agents/dev-team/flow/main.md:136 assumes .git is a directory inside a linked worktree. It is not: git writes a 128-byte ASCII `gitdir:` pointer file there and keeps the per-worktree admin dir (where *.lock actually lives) under the MAIN repo's .git/worktrees/<name>/. The glob therefore expands to nothing on every tick and the sweep has never done anything.",
    evidence: "Reported by the router executing the dev-team tick 2026-08-25T07:07Z; PO re-verified every claim at source 2026-08-25T08:24Z: `.claude/worktrees/agent-ae9ed2cd6f04b3686/.git` is a 128B regular file, `file` reports 'ASCII text'; the documented glob expands to zsh 'no matches found'; `.git/worktrees/agent-ae9ed2cd6f04b3686/` exists and is currently clean of *.lock.",
    ac: "(AC-1) Resolve the per-worktree admin dir properly — via `git rev-parse --git-dir` from inside the worktree, or by following the gitdir: pointer — never by assuming .git is a directory. (AC-2) Keep the pattern anchored to GIT lock names. Do NOT naively widen to `find .claude/worktrees -name '*.lock'`: PO confirmed that broader form matches `bun.lock` at the worktree root (package-lock.json and pnpm-lock.yaml also live there), and the protected worktree agent-ae9ed2cd6f04b3686 holds 11 days of uncommitted work — deleting bun.lock there would destroy real content. The narrow-but-dead glob is the only reason that has not already happened; widening is the WRONG fix. (AC-3) Positive control: create a real lock under .git/worktrees/<name>/ and assert the sweep sees it, then assert the same sweep does NOT match bun.lock.",
    dedup_checked: "2026-08-25T08:24Z — PO subject-scan across every task_board array lane for /worktree.?lock|gcc-preflight|lock expiry/i returned ZERO rows. The reporter's own scan agreed and explicitly noted that its 'T6' keyword hits were generic-token over-match on task numbering in unrelated epics — PO reproduced that conclusion independently rather than adopting it. Genuinely uncovered.",
    status_note: "P3 BY CONSTRUCTION, and the reason is worth keeping: this branch has been INERT since it was written, not misfiring. Nothing is currently broken by it; the risk is that someone 'fixes' it by widening the glob (see AC-2). Priority reflects impact, not confidence — the diagnosis is fully verified.",
    baseline_pass: null
  }]

# ── (10) RETIRE — TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY, scope shipped ──
| (.task_board.backlog | map(select(.id == "TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY")) | .[0]) as $stale
| if $stale == null then . else
    .task_board.backlog |= map(select(.id != "TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY"))
    | .task_board.archive += [
        ($stale
         | .status = "CANCELLED"
         | .updated_at = $NOW
         | .updated_by = "po"
         | .closed_at = $NOW
         | .cancel_reason = "SUPERSEDED — scope already shipped, verified at source 2026-08-25T08:24Z. This row proposed reordering drain-signals §0a-1 and §0a-D to durable-append-before-destructive. FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN landed exactly that on 2026-08-08: docs/agents/dev-team/flow/drain-signals.md now batch-builds envelopes, does ONE orch-apply.sh-gated append to .dev_team_idle_chain.pending_triage_inbox, and only on that write's success performs the destructive mv/fingerprint/DB-INSERT (§0a-1) or the NEW->READ flip (§0a-D, combined atomically with its own append in the same write); on failure every signal is retained untouched for retry. PO read the live file, not the changelog claim: the ordering is present in the §0a-D block and again in the §0a-1 numbered steps, and the header records the 150L->216L change. Flagged as possibly-stale by the router in its 2026-08-25T07:07Z dev-team tick report ('flagging for your check, not asserting it'); PO checked and confirms. Retired rather than left in backlog[] where it would keep consuming dedup scans and manual-dispatch sweep slots for work that is done.")
      ]
  end
