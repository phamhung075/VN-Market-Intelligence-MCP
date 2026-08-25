# PO triage-20260825T1230Z — Write B.
# Adopts the 08:15Z PO session's never-applied script
# (scripts/po-triage-20260825T0824Z-branchguard-signoff-and-inbox.jq) for
# envelopes 0-10, EVERY load-bearing claim independently re-verified at source
# by this session first (post-checkout hook absent from scripts/git-hooks/;
# .claude/worktrees/*/.git is ASCII text not a dir; main.md:136 glob verbatim;
# all fold targets resolved; both mint ids absent from the board).
# Its block (1) is DROPPED — that row is now task_board.archive[23] and its
# "stays in done[], the updated_at bump deranks it" premise is exactly the
# rotation that burned 3 picks today. Its verified FINDINGS are preserved onto
# the archived row and onto the child.
($now) as $NOW

# ── (1') PRIMARY carry-over — findings preserved on the ARCHIVED row ────────
| .task_board.archive |= map(
    if .id == "FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR" then
      del(.secondary_claimed_at, .secondary_claimed_by, .secondary_dispatch_target)
      | .triaged_at = $NOW
      | .triaged_by = "po/triage-20260825T1230Z (SECONDARY-drain owner-triage, carried over from the 08:15Z dispatch)"
      | .review_note = "[po 2026-08-25T12:30Z, carrying the 08:24Z session's live probe] NOT SIGNED OFF AS DELIVERED. WHAT WAS RE-VERIFIED AT SOURCE BY THIS SESSION, not inferred from the DONE status: (i) scripts/git-hooks/post-checkout DOES NOT EXIST — `ls scripts/git-hooks/` returns fixtures/ install.sh post-commit pre-commit pre-push and their .test.sh siblings, nothing else, and .git/hooks/ carries only the post-commit/pre-commit/pre-push symlinks. The AC-1(a) deliverable is unshipped and AC-4's two-agent live positive control has never run. The hazard (any agent honouring a `branch:` field hijacks every concurrent peer's commits) is STILL LIVE. (ii) BOTH children are ready[]/TODO, next_agent=owner=developer, untouched since pm wrote them 2026-08-23T13:38:01Z — 0/2 complete. WHY NOT DONE_VERIFIED: checkVerificationGate (apps/mcp-server/src/infrastructure/orchStateSchema.ts) hard-rejects DONE_VERIFIED without verification.raw_probe, and there is no probe to cite because nothing shipped — a fabricated probe is the only way to write that status, so it is not written. WHY NOT REOPENED TO ready[]: this row has BOTH a written pm closeout AND a populated children[], so reopening reproduces the exact defect that closeout ended. WHY archive[] AND NOT left in done[]: the 08:24Z session's plan was to leave it in done[] and let the updated_at bump derank it in the age-sorted candidate set — that is a rotation, not a fix, and it is precisely what produced three consecutive wasted SECONDARY picks on 2026-08-25 (05:10Z, 08:15Z, 12:16Z). archive[] is not in the claim script's candidate set at all. DELIVERY IS STALLED, NOT LOST — the answer is on the child, see TASK-BRANCHGUARD-POSTCHECKOUT-HOOK's own status_note. Do NOT re-triage this umbrella. TRIAGE DEBT DISCHARGED: the 08:15:01Z SECONDARY claim dispatched a PO session that died mid-run on the account-level weekly API quota (fleet outage 08:26Z->12:00Z, reported in the 12:00Z cowork-tick-telemetry envelope); this write is that owed triage."
    else . end
  )

# ── (2) child — measured queue position (adopted, re-measured this session) ──
| .task_board.ready |= map(
    if .id == "TASK-BRANCHGUARD-POSTCHECKOUT-HOOK" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .status_note = "[po 2026-08-25T12:30Z] DISPATCH-STARVATION MEASUREMENT, not a scope change. This row is the sole gate on its parent FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR (now task_board.archive[], closed-as-decomposed) being deliverable, and on its sibling TASK-BRANCHGUARD-ENFORCE-FLIP which depends_on it. Re-measured live this tick: array index 90 of 108 in ready[], 8 P0 rows ahead of it, priority P1. The Ready-Lane Consumer takes ONE row per turn and tiebreaks on ARRAY INDEX not age, so it is far out of reach on current ordering — which is why it has not moved since pm created it at 2026-08-23T13:38:01Z. Nothing blocks it technically: no depends_on, zone=scripts/git-hooks/, owner=next_agent=developer, deliverable fully designed in docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md, and PO re-confirmed this tick that scripts/git-hooks/post-checkout still does not exist. It needs a hand-dispatch or a re-rank, not more triage."
    else . end
  )

# ── (3) FOLD envelope d65af058 — sweep-guard bug-escalation ──────────────────
# BYTE-NEUTRAL numeric bump ONLY. Row prose measured 11936B of a 12000B ceiling
# (64B headroom) — 31 -> 32 is the same digit count so growth is exactly 0.
# Evidence held in the decision journal: NEW ACTOR c6581d0a at prior_warns=1/3,
# victim docs/agent-memory/notebooks/system-auditor.md — the defect is NOT
# confined to the single router session this row is named after. TRUE POSITIVE
# BY CONSTRUCTION per triage-signals.md (pre-commit exits before write_signal on
# mode=SCOPED, so the signal existing at all is the mechanism proof).
| .task_board.ready |= map(
    if .id == "FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS"
    then .occurrence_count = 32 else . end
  )

# ── (4) FOLD envelope 1826de7e finding_1 — routed_to label drift ─────────────
| .task_board.backlog |= map(
    if .id == "FIX-DEVTEAM-DRAIN-ROUTES-NON-PO-ENVELOPES-TO-PO-STEP0SIG" then
      .occurrence_count = 6
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_occurrence_6_20260825 = "OCCURRENCE 6, and it WIDENS this row by one axis. routed_to is wrong on a SECOND axis beyond the value defect this row owns: the LABEL SPELLING drifts between the two drain planes. FILE plane is deterministic — scripts/agents-flow/drain-signals.js:284 calls computeRoutedTo(type, from) and all 48 file-sourced envelopes carry the exact string 'PO Step 0-SIG'. DASHBOARD plane (queue-row READ-marking, flow §0a-D) is UNSCRIPTED — drain-signals.md §0a-1 states verbatim that the canonical script does NOT cover §0a-D — so the (type,from) lookup is re-derived by hand each tick and the spelling is whatever that tick's executor typed: 19 dashboard envelopes carry 'PO Step 0-SIG', 2 carry 'po-step-0-sig' (both drained_at 2026-08-25T04:41:11Z, from system-auditor + code-janitor). Blast radius today is LOW (routed_to is documented informational-only and PO Step 0-SIG re-reads the inbox as SSOT) but it is a latent trap for any future consumer that string-matches the field. FOLDED NOT MINTED on the reporter's own recommendation, verified: same field, same fix surface. Whoever works this row must fix BOTH the value and the spelling-determinism, and the only durable spelling fix is giving the queue plane a shared implementation instead of a hand-derivation. CORROBORATION for this row's own title: 12 of this tick's 29 inbox envelopes were addressed to=claude-manager-helper, not po."
    else . end
  )

# ── (5) FOLD envelopes 212b86bf + 3d19fe9f + fd38028f + 222ab4a6 — cycle-snapshot
# CONSOLIDATED. Row prose headroom measured 1107B, so the full 4-envelope chain
# lives in the decision journal and only the converged verdict is inlined.
| .task_board.backlog |= map(
    if .id == "FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK" then
      .occurrence_count = 2
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_fold_20260825 = "READ BEFORE DESIGNING. 4 self-correcting cowork envelopes (07:29/07:42/07:58/12:15Z); only the LAST holds. WITHDRAWN: 'structurally unhittable', 'reader ignores scheduled_utc'. HOLDS, re-read verbatim at source by PO 12:30Z: the reader's key derivation is PROSE IN TWO DISAGREEING LIVE COPIES — .claude/skills/cycle-bootstrap/SKILL.md:58 'round to nearest 5-min slot' vs .claude/skills/step-0-cowork/SKILL.md:39 'current UTC time as HH:MM' with NO rounding clause, while copy B's own header defers to A as SSOT and then restates it wrong. That makes the reader NON-DETERMINISTIC per cycle, not token-blind: c250 07:05 rounded HIT, c251 07:22 raw MISS, c252 07:35 rounded MISS, c253 07:45 nominal MISS. FIX SHAPE CHANGES: a writer-only move to the nominal key is NOT strictly hit-increasing — writer AND both skill copies must land together. Chain + 2 unverified inferences to confirm at source: docs/agent-memory/decisions/triage-20260825T1230Z-po.md."
    else . end
  )

# ── (6) FOLD envelope 61048600 — load-average comma-decimal, 6th occurrence ──
| .task_board.backlog |= map(
    if .id == "FIX-SPAWNFANOUT-LOAD-PARSE-COMMA-DECIMAL-TRUNCATION-AND-BAD-LC-ALL-REMEDY" then
      .occurrence_count = 6
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_occurrence_6_20260825 = "OCCURRENCE 6, reported in the 2026-08-25T08:08Z cowork tick telemetry: uptime yielded the comma-decimal '1,90' through the flow's parse. Verdict unaffected THIS tick only because 1.90 vs threshold 24 fails open — the truncation is silent whenever the load is genuinely near threshold, which is exactly when it matters. Remedy supplied by the reporter, recorded so the implementer does not re-derive it: `uptime | awk -F'load averages?:' '{print $2}' | awk '{v=$1; gsub(\",\",\".\",v); print v}'`. DO NOT pin LC_ALL=C — pinning it produces the concatenation garbage this row's own title already flags as the bad remedy."
    else . end
  )

# ── (7) FOLD envelope a11149fb — context_bloat_breach, sprint journal ────────
| .task_board.ready |= map(
    if .id == "CHORE-PRUNE-SPRINT-COWORK-GUARANTEED-SLOT-CATCHUP-DECISION-JOURNAL" then
      .occurrence_count = 5
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_occurrence_5_20260825_DEFERRED_SIBLING = "OCCURRENCE 5 — a THIRD distinct file of the SAME sprint, disposition DEFER, exactly as occurrence 4 (qa-11). Signal: context-bloat-backstop-hook 2026-08-25T07:20:10Z on docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md, class=sprint-decision-journal, payload 190L/37153B. PREMISE RE-MEASURED RAW WITH wc, NOT READ OFF THE PAYLOAD: 192L/37194B at triage time, mtime AFTER the fire, i.e. still being written. Byte overage 1194B (3.3%); LINE axis clean at 192 of 600 — the byte-binds-alone asymmetry this row already documents twice. WHY DEFER: it is the live tip of a rolling numbered journal (dev-mcp-server -> -2 ... -> -6) and splitting a live tip races its editor; per feedback_ctxbloat_breach_on_live_sprint_file_defer, N breaches from ONE sprint are a SINGLE per-sprint deferral class, not N janitor candidates — hence a fold, not a third competing mint. SCOPE FENCE FOR claude-manager-helper: dev-mcp-server-6.md is deliberately NOT in files[]. DO NOT TOUCH IT. This row's actionable scope stays the FROZEN agent-father base file plus qa-21.md. RE-EVAL GATE, all three: (i) dev-mcp-server-6 rolled forward to -7 with a CAP-REACHED marker; AND (ii) the sprint concluded; AND (iii) still over 36000B at rest. Structural remedy stays with FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR — do not close this row as its duplicate."
    else . end
  )

# ── (8) FOLD envelopes 59e63b2f/75287f68 (dev-rag-service), 8d41773d/15645bf3
#      (tran-ngoc-bau), 55ecf74/03b807c4 (ba), 7f0b42a5/bce2ee7e (digest-predict)
# 8 notebook envelopes, 4 files, ALL already in this row's files[]. Row prose
# measured 11875B of 12000 — 125B headroom — so this is a NUMERIC BUMP ONLY
# (5 -> 6). Per-envelope evidence in docs/agent-memory/decisions/triage-20260825T1230Z-po.md.
| .task_board.backlog |= map(
    if .id == "CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION"
    then .occurrence_count = 6 else . end
  )

# ── (9) FOLD envelopes 017e4c91/08634338 — prune dropped newest dated section ─
# tran-ngoc-bau.md c135. Row prose 11863B of 12000 — 137B headroom — numeric
# bump ONLY (7 -> 8).
| .task_board.backlog |= map(
    if .id == "FIX-NOTEBOOK-AUTOPRUNE-AC6-SAMEDAY-TIE-PROCEEDS-AND-DROPS-LOADBEARING-SECTION"
    then .occurrence_count = 8 else . end
  )

# ── (10) FOLD envelope 4facdd5e — news-scout notebook never committed ────────
| .task_board.ready |= map(
    if .id == "TASK-OFFHOURS-SELFCOMMIT-FLOWDOC-REWIRE" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .po_corroboration_20260825 = "FRESH LIVE EVIDENCE, same-tick CONTROLLED CONTRAST — strengthens this row's AC2 (both call sites in ONE change). cowork tick 2026-08-25T12:00Z dispatched market-watcher and news-scout within the same second, both offhours, both required to persist a cycle notebook. market-watcher executed its Step 5 mutex commit d41596771, pathspec-scoped, touching exactly docs/agent-memory/notebooks/market-watcher.md, tree clean afterwards. news-scout listed the notebook under 'Files Modified' and reported 'Notebook c282 appended' but made NO COMMIT — the working tree still showed M docs/agent-memory/notebooks/news-scout.md. Same tick, same mode, same requirement, two prose recipes, one executed and one not: that is the divergence this row exists to remove, observed under control rather than inferred. NOTE this row's own note already cites an uncommitted c273 as its evidence — c282 is the NEXT instance, so the recipe is still intermittent 2 days later. Sibling TASK-OFFHOURS-SELFCOMMIT-SCRIPT (task_board.ready[85]) is the script half; brief docs/architecture-briefs/2026-08-23-newsscout-marketwatcher-offhours-selfcommit-mechanize.md."
    else . end
  )

# ── (11) FOLD envelope 1f0a709c — code-janitor re-asks a decided question ────
# The DECISION this envelope asks for already exists on the board 3 times over
# (CLEAN-RETIRE-TEAM-TOOL-RECHECK-HEALTH-DOC-FAMILY-DEAD-REMOTETRIGGER-WRITER,
# CLEAN-RETIRE-TEAM-TOOL-RECHECK-WRITER, DECIDE-TEAM-TOOL-RECHECK-WRITER-DEAD-
# SINCE-06-23-RETIRE-NOT-REPLACE). The emitter keeps re-asking because it has no
# decision/liveness predicate — which is exactly this row. Fold there, not onto
# the CLEAN rows, so the recurrence lands on the row that can stop it.
| .task_board.backlog |= map(
    if .id == "FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .po_recurrence_20260825 = "RECURRENCE, and it is the cleanest possible demonstration of this row's own thesis. code-janitor emitted system-issue 2026-08-25T12:15Z asking, verbatim, for a decision_needed between 'replace the recheck job with a local cron' and 'retire the team-tool-recheck permanently'. THAT DECISION IS ALREADY MADE AND ALREADY ON THE BOARD, three times: CLEAN-RETIRE-TEAM-TOOL-RECHECK-HEALTH-DOC-FAMILY-DEAD-REMOTETRIGGER-WRITER (backlog, PO DECISION: retire, do NOT rebuild as a local cron), CLEAN-RETIRE-TEAM-TOOL-RECHECK-WRITER (backlog/BLOCKED, RETRACTED premise), and DECIDE-TEAM-TOOL-RECHECK-WRITER-DEAD-SINCE-06-23-RETIRE-NOT-REPLACE (backlog, owner code-janitor, dedup_key team-tool-recheck-writer-dead-decision). The sweep re-asks every run because the escalation is a HARDCODED string with no predicate over either the writer's liveness OR whether a ruling already exists — so the answer can never terminate the question. FIX SCOPE CONFIRMATION: the predicate this row asks for must gate on BOTH (a) writer liveness and (b) an existing board ruling; gating on (a) alone leaves this exact loop running, because the writer really is dead and always will be. NO NEW ROW MINTED for this envelope — 5 rows already crowd this subject and a 6th would be the defect, not the fix."
    else . end
  )

# ── (12) AMEND — SECONDARY-drain caller readback: today's live evidence + a
#        SECOND, previously unrecorded half of the same 4-line defect ────────
| .task_board.backlog |= map(
    if .id == "FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY" then
      .priority = "P0"
      | .occurrence_count = 2
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_evidence_20260825 = "STILL LIVE 2 DAYS LATER, RE-MEASURED, AND THE SCOPE GROWS BY ONE AC. (A) The readback is unchanged: docs/agents/dev-team/flow/main.md still reads `picked=$(jq -c ... '[.task_board.review[] | select(.secondary_claimed_at == $t ...)] | first // empty' ...)` while scripts/devteam-review-claim-secondary-drain.jq still builds review[] UNION done[]. (B) 2026-08-25 produced THREE done[]-origin claims — 05:10:44Z FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR, 08:15:01Z FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR, 12:16:42Z FIX-CHEF-PUBLISHED-MARKER-RELEASE — and all three were pm-decomposed epic wrappers with no residual work, i.e. the lane spent its entire day's budget on rows that cannot be actioned. Two of the three reached a PO only because the ROUTER hand-carried them out of band, which is also why this defect keeps looking survivable. (C) NEW, SECOND HALF OF THE SAME DEFECT, previously unrecorded — the SPAWN PROMPT is false for every done[]-origin pick. The Agent() context string in that same block hardcodes: 'is a stale review[]-lane row (status=REVIEW, branch:null ...)' and instructs 'Read its status_note/review_note fields directly'. For a done[]-origin row the lane is wrong, the status is wrong (DONE), and neither status_note nor review_note exists — those rows carry title/detail_ref/pm_closeout_note/architect_review_note instead. The receiving agent therefore reads two empty fields and reports the row as CONTENTLESS, which is what happened on the 12:16Z dispatch. Verified against the board: `description` is not a schema field here at all (5 of 568 backlog rows carry it; 810 of 810 non-sprint rows carry `title`), so any reader keyed on description/status_note will call a fully-documented row empty. NEW AC-7: the spawn prompt must be built from the PICKED ROW's own lane/status and must name fields that exist on it — never a hardcoded review[]/status=REVIEW premise. AC-5 is still unsatisfied: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS still sits in done[] carrying a 2026-08-23T13:39:19Z stamp with no dispatch. PRIORITY RAISED P1->P0: this is not a latent gap, it is a dispatch lane that has consumed 100% of its picks on non-actionable rows while 25 review[] rows have never once been picked. ROUTING NOTE FOR THE ROUTER: next_agent=agent-father is OFF the DRS-ratified allowlist [architect,ba,pm,po,agents-architect], so promoting this row to ready[] would NOT make it auto-dispatchable — it needs a manual/PO dispatch hop. Left in backlog[] deliberately rather than staged into ready[] where it would only add a 9th starved P0."
    else . end
  )

# ── (13) AMEND — pm decompose-closeout parent: the done[]-lane cohort ────────
| .task_board.review |= map(
    if .id == "FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .po_donelane_cohort_20260825 = "[po/triage-20260825T1230Z] FOURTH SHAPE OF THE SAME DEFECT, measured, and now remediated at the data level. This row's own status_note already flags 'STILL OPEN, REPORTED-NOT-FIXED (brief §7): 8 wrapper rows with children[] and no hold_reason armed for premature autoclose; 2 rows with pm_decomposition_complete:true sitting open in ready[] with no closed_at'. There is a THIRD population it does not name: 8 wrappers that pm's 2026-08-23T13:38-13:41Z closeout wrote into .task_board.done[] with status=DONE and next_agent UNSET. done[] is a LIVE candidate lane for scripts/devteam-review-claim-secondary-drain.jq (candidate set = review[] status==REVIEW UNION done[] status==DONE, filtered effective_next_agent != qa, with null/absent -> 'po'), so every one of those 8 became a permanent, non-actionable SECONDARY-drain candidate that burns the lane's single pick per tick. All THREE of 2026-08-25's picks were from this cohort (05:10:44Z, 08:15:01Z, 12:16:42Z) while review[] holds 25 rows of which not one has ever carried a secondary_claimed_* stamp. PO moved all 8 to .task_board.archive[] this tick (status DONE unchanged — archive[] is outside both LANE_ALLOWED_STATUSES and checkVerificationGate, so nothing false is asserted), which drains the symptom. THE CAUSE IS STILL THIS ROW: the mint/closeout contract must set next_agent (or an explicit terminal marker) on the wrapper itself, and it must not park a decomposed wrapper in a lane that a dispatcher treats as a work queue. Sibling FIX-PM-3E-CLOSEOUT-SCRIPT-LANE-AGNOSTIC (task_board.ready[93]) is the script half and should inherit the same constraint."
    else . end
  )

# ── (14) MINT envelope d1bbc0f8 — DATA-tier history trail (adopted verbatim
#        from the 08:24Z session; PO re-confirmed both mint ids absent and
#        re-read scripts/db-integrity-history-append.sh:73-75,92 this session) ─
| .task_board.backlog += [{
    id: "FIX-DBINTEGRITY-HISTORY-FINDINGS-MEMBERSHIP-FREE-JUDGMENT-AND-MULTITABLE-TABLE-FIELD",
    type: "FIX", size: "M", priority: "P2", status: "BACKLOG",
    zone: "scripts/", owner: "developer", next_agent: "developer",
    created_at: $NOW, created_by: "po/triage-20260825T1230Z (adopted from the 08:24Z PO session that died on the API quota before it could apply its own write)",
    updated_at: $NOW, updated_by: "po",
    dedup_key: "datatier:history-findings-membership-unstable-and-multitable-table-field",
    origin_signal_id: "router-datatier-history-trail-20260825T080555Z",
    files: ["scripts/db-integrity-history-append.sh"],
    title: "DATA-tier integrity history trail has two independent soundness defects: findings[] MEMBERSHIP is unconstrained free judgment (identical underlying counts produced 7 findings at 07:30:26Z and 1 at 07:59:48Z), and the per-finding `table` field accepts a comma-joined multi-table string that flows unvalidated into both the dedup key and the emitted signal's check-id",
    root_cause: "scripts/db-integrity-history-append.sh trusts the LLM-supplied entry body wholesale. (a) MEMBERSHIP: nothing constrains which observations enter .findings[] — line 63 only counts them — so a finding's ABSENCE from the trail is ambiguous between 'checked, clean' and 'checked, not recorded'. Measured 2026-08-25 findings[] length by scan ts: 04:30:50Z=0, 05:03:23Z=7, 05:41:12Z=1, 07:00:48Z=4, 07:30:26Z=7, 07:59:48Z=1, while the four underlying counters were IDENTICAL across the 07:30 and 07:59 sweeps (ohlc_violations=336, scale_gt100x=0, vnindex_cache_rows=1, low_confidence_reports=52). (b) TABLE FIELD: line 73 reads `table` raw; line 75 passes it to the dedup check as --table \"$table\" and line 92 interpolates it into --check-id \"${table}-${CLASS_TXT}\". A live instance is the verbatim two-table string 'price_alerts, alert_engine_records', which yields a composite dedup key and a composite check-id that can never match either single-table row.",
    evidence: "Router raw-verification of the 07:59:48Z DATA sweep — no detector caught either defect. Source lines re-read and confirmed at 2026-08-25T12:30Z by a second PO session: scripts/db-integrity-history-append.sh:73-75 and :92.",
    ac: "(AC-1) findings[] membership becomes decidable: either the script derives entries mechanically from the counters it already has, or absence is made explicit (an emitted 'checked-clean' record per counter) so absence is never ambiguous. Prose telling the LLM to be consistent is a rejection — that is what is already in place. (AC-2) `table` is validated to a single known table name before it reaches --table or --check-id; a multi-table finding must fan out to one finding per table, not concatenate. Reject at the gate with a loud error rather than silently composing a key. (AC-3) Positive control on the exact live instance: feed a finding carrying 'price_alerts, alert_engine_records' and assert it either fans out to two single-table findings or fails loud — never produces a composite key. (AC-4) Replay the 07:30:26Z and 07:59:48Z counter sets and assert identical inputs now yield identical findings[] membership.",
    dedup_checked: "Scanned by SUBJECT across every task_board array lane for /db-integrity-history|history-append|findings\\[\\]|integrity-history/i -> 4 hits, all read: FIX-DRAIN-PAYLOADREF-UNBOUNDED-INLINE-SIZE-GATE (payload_ref inline SIZE), FIX-DBINTEGRITY-SIGNAL-PAYLOADREF-WHOLE-ACCUMULATOR (hardcoded --payload-ref target), FIX-DBINTEGRITY-VERDICT-LABEL-UNBOUND-BYPASSES-DEDUP-AND-SIGNAL-ACTUATOR (the VERDICT half of line 73's conjunct), FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED (done_verified). None owns membership or the table VALUE. Second scan for /multi.?table|comma.joined|membership|--table/i over hot board AND archive/2026-06|07|08.json -> zero relevant rows. Exactly one other row carries a 'datatier:' dedup_key prefix and it is the verdict row. BOUNDARY vs that verdict row, explicit: line 73 gates on `verdict == \"REAL\" && -n table`. The verdict row owns the FIRST conjunct (an unbound label letting a real finding skip the actuator). THIS row owns the SECOND conjunct's VALUE plus the upstream question of whether the finding entered findings[] at all. Do not fold them. Re-verified absent from the board at 2026-08-25T12:30Z before this mint landed.",
    related: ["FIX-DBINTEGRITY-VERDICT-LABEL-UNBOUND-BYPASSES-DEDUP-AND-SIGNAL-ACTUATOR"],
    baseline_pass: null
  }]

# ── (15) MINT envelope 1826de7e finding_2 — gcc-preflight worktree-lock glob ──
# Every claim re-verified at source THIS session: .claude/worktrees/agent-
# ae9ed2cd6f04b3686/.git is a regular file (`file` -> "ASCII text"), and
# docs/agents/dev-team/flow/main.md:136 carries the glob verbatim.
| .task_board.backlog += [{
    id: "FIX-DEVTEAM-GCCPREFLIGHT-WORKTREE-LOCK-GLOB-DEAD-CODE",
    type: "FIX", size: "S", priority: "P3", status: "BACKLOG",
    zone: "docs/agents/dev-team/", owner: "agent-father", next_agent: "agent-father",
    created_at: $NOW, created_by: "po/triage-20260825T1230Z (adopted from the 08:24Z PO session, claims independently re-verified)",
    updated_at: $NOW, updated_by: "po",
    dedup_key: "devteam:gcc-preflight-worktree-lock-glob-matches-zero-files",
    origin_signal_id: "devteam-tick-20260825T0707Z-finding-2",
    files: ["docs/agents/dev-team/flow/main.md"],
    title: "dev-team gcc-preflight's worktree-lock expiry sweep is dead code as written: `for each f in .claude/worktrees/*/.git/*.lock` can never match, because in a LINKED worktree .git is a FILE (a gitdir: pointer), not a directory — the real lock dir is .git/worktrees/<name>/",
    root_cause: "docs/agents/dev-team/flow/main.md:136 assumes .git is a directory inside a linked worktree. It is not: git writes a 128-byte ASCII `gitdir:` pointer file there and keeps the per-worktree admin dir (where *.lock actually lives) under the MAIN repo's .git/worktrees/<name>/. The glob therefore expands to nothing on every tick and the sweep has never done anything.",
    evidence: "Reported by the router executing the dev-team tick 2026-08-25T07:07Z. Re-verified independently at 2026-08-25T12:30Z: `.claude/worktrees/agent-ae9ed2cd6f04b3686/.git` is a regular file, `file -b` reports 'ASCII text'; `.git/worktrees/agent-ae9ed2cd6f04b3686/` exists and is currently clean of *.lock; docs/agents/dev-team/flow/main.md:134-138 carries the T6 block and the glob verbatim.",
    ac: "(AC-1) Resolve the per-worktree admin dir properly — via `git rev-parse --git-dir` from inside the worktree, or by following the gitdir: pointer — never by assuming .git is a directory. (AC-2) Keep the pattern anchored to GIT lock names. Do NOT naively widen to `find .claude/worktrees -name '*.lock'`: that broader form matches `bun.lock` at the worktree root, and the worktree agent-ae9ed2cd6f04b3686 holds 11 days of uncommitted work — deleting bun.lock there would destroy real content. The narrow-but-dead glob is the only reason that has not already happened; widening is the WRONG fix. (AC-3) Positive control: create a real lock under .git/worktrees/<name>/ and assert the sweep sees it, then assert the same sweep does NOT match bun.lock.",
    dedup_checked: "Subject-scan across every task_board array lane for /worktree.?lock|gcc-preflight|lock expiry/i -> ZERO rows, re-run 2026-08-25T12:30Z. The reporter's own scan agreed and noted its 'T6' keyword hits were generic-token over-match on task numbering in unrelated epics; reproduced that conclusion independently rather than adopting it.",
    status_note: "P3 BY CONSTRUCTION, and the reason is worth keeping: this branch has been INERT since it was written, not misfiring. Nothing is currently broken by it; the risk is that someone 'fixes' it by widening the glob (see AC-2). Priority reflects impact, not confidence — the diagnosis is fully verified.",
    baseline_pass: null
  }]

# ── (16) MINT envelope 47ed0689 — producer cadence exceeds consumer TTL ──────
| .task_board.backlog += [{
    id: "FIX-NEWSSCOUT-PRODUCER-CADENCE-4H-EXCEEDS-AGENTSIGNALS-TTL-2H-CONSUMER-BLIND",
    type: "FIX", size: "M", priority: "P1", status: "BACKLOG",
    zone: "cross-service/", owner: "po", next_agent: "architect",
    created_at: $NOW, created_by: "po/triage-20260825T1230Z (Pipeline-A wiring-gap-measured fold)",
    updated_at: $NOW, updated_by: "po",
    dedup_key: "cowork-bus:producer-cadence-exceeds-consumer-signal-ttl|pair:news-scout->alert-commander",
    origin_signal_id: "cowork-team-wiring-gap-measured-20260825T1215Z",
    files: ["docs/data/system-map.json", "docs/agents/news-scout/flow/main.md", "docs/agents/alert-commander/flow/main.md"],
    title: "news-scout's producer cadence (4h) is DOUBLE the agent_signals TTL (2h), so alert-commander-market is structurally blind to news-scout on roughly a third of its 28 weekday fires — the bus is empty by construction, not by failure",
    root_cause: "MEASURED END-TO-END by the cowork dispatcher on the 2026-08-25T12:00Z tick, not inferred. agent_signals is a rolling 2h TTL window, not an accumulating log: signal 11340 created ~08:08:08Z carries expiry 2026-08-25 10:08:08, same for 11341. The producer news-scout runs slots news-scout-offhours (cron '0 */4 * * *') and news-scout-sentiment (cron '30 1 * * 1-5'). The consumer alert-commander-market runs cron '*/15 2-8 * * 1-5' = 28 fires per weekday, each querying a 2h window. A 4h producer cadence against a 2h consumer window means that for every producer period there is a ~2h stretch in which NO news-scout signal can be in the window, so a consumer fire in that stretch sees an empty bus and cannot distinguish it from 'no news'. This retro-explains an empty-bus cycle observed 15 minutes before the measurement.",
    ac: "(AC-1) State and fix the invariant explicitly: for every producer/consumer pair on agent_signals, producer cadence MUST be <= the consumer's query window, or the consumer must be given a durable last-known-good fallback. Pick one and say which. (AC-2) Do NOT fix this by silently widening alert-commander's query window alone — that trades blindness for staleness and must be an explicit, argued choice, not an incidental one. (AC-3) SWEEP, do not point-fix: enumerate every producer/consumer pair on agent_signals from docs/data/system-map.json and report which other pairs violate the same invariant. A one-pair fix that leaves the class open is a rejection. (AC-4) Positive control: a consumer fire landing in the previously-blind stretch must observe the producer's most recent output (or an explicit, labelled 'stale, produced at T' record) — never an empty result indistinguishable from 'no news'.",
    dedup_checked: "2026-08-25T12:30Z, scanned by SUBJECT across all task_board lanes (scripts/po-board-dedup-search.sh, --all-lanes) for /cadence.*TTL|TTL.*cadence|producer.*consumer.*window|news.?scout.*alert.?commander/i -> 4 hits, all read and all rejected: FIX-FB-WEEKEND-MARKER-KEY-SATURDAY-ANCHOR (fb-poster weekend marker key), FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW (cron re-arm liveness), FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP (dispatcher-down catch-up), FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE (published:* MUTEX marker TTL vs its own slot cadence). The last is the nearest neighbour and is NOT a duplicate: it is about a mutex marker outliving its cadence and BLOCKING a dispatch; this row is about a DATA signal expiring before the next one is produced and starving a consumer. Opposite direction, different mechanism, different table.",
    status_note: "Routed to architect rather than developer because AC-3 makes this a class question over docs/data/system-map.json's producer/consumer graph, not a single cron edit.",
    baseline_pass: null
  }]

# ── (17) RETIRE — TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY, scope shipped ──
| (.task_board.backlog | map(select(.id == "TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY")) | .[0]) as $stale
| if $stale == null then . else
    .task_board.backlog |= map(select(.id != "TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY"))
    | .task_board.archive += [
        ($stale
         | .status = "CANCELLED"
         | .updated_at = $NOW
         | .updated_by = "po"
         | .closed_at = $NOW
         | .cancel_reason = "SUPERSEDED — scope already shipped. This row proposed reordering drain-signals §0a-1 and §0a-D to durable-append-before-destructive. FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN landed exactly that on 2026-08-08: docs/agents/dev-team/flow/drain-signals.md now batch-builds envelopes, does ONE orch-apply.sh-gated append to .dev_team_idle_chain.pending_triage_inbox, and only on that write's success performs the destructive mv/fingerprint/DB-INSERT (§0a-1) or the NEW->READ flip (§0a-D, combined atomically with its own append in the same write); on failure every signal is retained untouched for retry. Verified by reading the live file, not the changelog claim — the ordering is present in the §0a-D block and again in the §0a-1 numbered steps, and the header records the 150L->216L change. Originally flagged as possibly-stale by the router in its 2026-08-25T07:07Z dev-team tick report ('flagging for your check, not asserting it'); the 08:24Z PO session checked and confirmed, and that finding is carried here. Retired rather than left in backlog[] where it would keep consuming dedup scans and manual-dispatch sweep slots for work that is done.")
      ]
  end

# ── (18) DANGLING-EDGE REPAIR for (17) ──────────────────────────────────────
# TASK-DEVTEAM-IDLE-CHAIN-4-TESTS-AC1-AC2-AC4 carries depends:["TASK-DEVTEAM-
# IDLE-CHAIN-3-DRAIN-DURABILITY"]. Retiring -3 to archive[] would make that edge
# resolve to MISSING in orch-validate Stage 1g (its resolver reads the 7 flat
# lanes + cold archive, NOT hot archive[]) — caught by diffing Stage 1g live vs
# candidate, NOT assumed. Re-point it at the row that actually shipped -3's
# scope: FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN, DONE_VERIFIED in
# docs/data/orch/archive/2026-08.json .done_tasks[]. This is strictly better than
# leaving it: the old edge pointed at a BACKLOG row that would never be worked,
# so this row was permanently unsatisfiable; deps_satisfied() requires
# DONE_VERIFIED and the new target has it.
| .task_board.backlog |= map(
    if .id == "TASK-DEVTEAM-IDLE-CHAIN-4-TESTS-AC1-AC2-AC4" then
      .depends = ["FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN"]
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_dep_repoint_20260825 = "[po/triage-20260825T1230Z] depends re-pointed TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY -> FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN in the same write that retired -3 as SUPERSEDED. -3's entire scope (durable-append-before-destructive ordering in drain-signals.md §0a-1/§0a-D) shipped under P2A on 2026-08-08, verified by reading the live flow doc. P2A resolves DONE_VERIFIED in docs/data/orch/archive/2026-08.json .done_tasks[], so deps_satisfied() — which demands DONE_VERIFIED and treats plain DONE as insufficient — is now genuinely SATISFIED for this row. It was previously blocked forever behind a BACKLOG row nobody would ever work. Do not read this as a scope change: the test instruments this row owns (AC-1 fairness, AC-2 durability negative control, AC-4 satisfiability extension) are unchanged and still unbuilt."
    else . end
  )
