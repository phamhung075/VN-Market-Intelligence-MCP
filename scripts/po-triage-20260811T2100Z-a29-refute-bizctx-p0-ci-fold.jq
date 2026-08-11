# po-triage-20260811T2100Z-a29-refute-bizctx-p0-ci-fold.jq
# PO triage disposition 2026-08-11T21:00Z (34 pendingSignals + 15 unresolved reports 4684-4698).
#  1. BUMP  FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING  P1->P0, occurrence_count 2->3 (tnb c126 RAW-verified 3rd instance)
#  2. REPRICE FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL P2->P1 — 2nd storm in 2 days, 8/8 of today's A-29 findings refuted live
#  3. FOLD  4 ci_red signals into the 3 EXISTING file-scoped rows (no new mint) + correct transport.ts 237L->265L
#  4. BUMP  FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE occ 47->48 (fallback-VND-2023-Q4)
#  5. CORROBORATE FIX-MARKETDB-WAL-SEQUENCE-STEPS-2-4-NO-OWNER (live locked-probe evidence)
#  6. FOLD  5 sweep-guard BARE escalated=true fires into FIX-COMMITCONVENTION-...-SWEEPGUARD-HARDBLOCK
#  7-10. MINT 4 new rows (sbvOmo error-string, cron-cowork-team SKILL bloat, tier1 heartbeat re-hand-write, refuted-finding feedback gap)
# Usage: jq -f scripts/po-triage-20260811T2100Z-a29-refute-bizctx-p0-ci-fold.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def NOW: "2026-08-11T21:00:00Z";

# ---------- 1. HEADLINE: F-CHEF-BIZCTX-JOIN-MISS 3rd instance -> P0 ----------
.task_board.backlog |= map(
  if .id == "FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING" then
      .priority = "P0"
    | .occurrence_count = 3
    | .updated_at = NOW
    | .escalation_20260811 = "P1->P0 ON THE STANDING RULE, NOT ON NEW BLAST RADIUS. tnb-audit c126 (2026-08-11T20:30Z) delivered the first RAW-verified 3rd instance, which is the exact threshold PO itself set in its own c123/c124/c125 ACKs ('3rd consecutive day / 3rd ticker -> raise to P0'). Occurrences: c123 2026-08-06 EOD (VCB solo), c124 2026-08-07 EOD (VCB+DXG), c126 2026-08-11 evening (VCB+FPT). VCB present in all three."
    | .evidence_20260811 = "Verified against docs/data/unified-agent-synthesis-2026-08-11-evening.json (RAW synthesis, NOT the unified-agent notebook self-report — the row's own verification_gate demands RAW). (a) known_gaps[] still carries the token [gap:business_context_unavailable_signal_drain_archive]; (b) conviction_calls[] rationale for VCB ('Fair valuation (yield +1.70pp) undermined by USD/VND carry reversal pressure + FII outflow on banking sector; Kinh Dich Su (7) HOLD posture confirms caution') and for FPT ('Position underwater -11.33%; Khon hexagram patience signal; insufficient tech-sector earnings data') cite ZERO product/customer/ops/mgmt facts; (c) yet docs/signals/processed/bctc_signal_VCB_20260811_routine.json and bctc_signal_FPT_20260811_routine.json both carry _processed.processedAt=2026-08-11T18:20:54Z — 1h32m BEFORE the dish fired at 19:53:18Z — and both are fully populated (VCB: SOE bank lending/deposit/bancassurance, NII 17,421 ty VND, OCF/NI 1.37x; FPT: IT services/software export/telecom/education, ROE 28.3% vs sector 10.6%). PO independently re-confirmed the same four bctc_signal payloads (DXG/FPT/HPG/VCB) sitting in its OWN pendingSignals[] inbox this tick at createdAt 2026-08-11T18:08:03Z. (d) chef's us_macro_layer/valuation_layer text asserts 'bctc_signal archive block 14/16 watchlist tickers' — FACTUALLY FALSE for VCB and FPT specifically. The gap token is not a missing-data report, it is a wiring defect mislabelled as a data gap."
    | .status_note = ((.status_note // "") + " | 2026-08-11 PO: P0. occurrence_count=3. Standing escalation threshold CROSSED — see escalation_20260811/evidence_20260811. next_agent=ba unchanged (row is supervised:true, needs a spec not a mechanical cure). AC unchanged: BIZ_CTX_OK must evaluate true and per-ticker conviction_calls[].rationale must cite >=1 product/customer/ops/mgmt fact whenever an in-window populated bctc_signal_<TICKER>_*.json exists; re-test against the next dish carrying >=1 conviction call.")
  else . end)

# ---------- 2. A-29 STORM #2: reprice the already-minted root cause ----------
| .task_board.backlog |= map(
  if .id == "FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL" then
      .priority = "P1"
    | .updated_at = NOW
    | .occurrence_count = 2
    | .occurrence_2_20260811 = "SECOND STORM IN 2 DAYS. system-auditor emitted 8 more A-29 findings at 2026-08-11T18:22Z (reports 4686-4693: 6 CRITICAL + 2 WARN) to the BUG channel. PO refuted ALL 8 live against cron_job_runs inside vn-market-intelligence-mcp-mcp-server-1 (docker exec bun bun:sqlite, readonly). 8/8 map exactly onto sub-defects THIS ROW ALREADY NAMES, and 7 of the 8 job names are named verbatim in its own 2026-08-09 evidence field: (a) AC-1 schedule-blind age ladder — vpsProxyWatchdogJob last 2026-08-11 08:50:00, price-update-watchdog 08:50:00, vnIndexRefreshJob 08:55:00, taAlertNotifierJob 08:45:01; all four are market-hours cron ('*/N 2-8 * * 1-5') and their 2026-08-11 day-profile is BYTE-IDENTICAL to 2026-08-07 and 2026-08-10 (n=42/42/84/28 respectively, first fire 02:00:0x, last fire at the window edge). A 9.4-9.6h 'staleness' at 18:22Z is the overnight gap, i.e. correct behaviour, graded against a flat 0.1-0.4h 24/7 threshold. (b) AC-4 config-key enumeration — taAlertScanJob and bbAlertScanJob each have exactly 27 runs spanning 2026-04-23..2026-04-24 and NOTHING since, because they were merged into alertScanParallelJob (first run 2026-04-27 02:00:00, 1644 runs, last 2026-08-11 08:45:00, still healthy). They survive only as CRONS config keys at cronConfig.ts:89-92 with no registration of their own; the '2625.6h MISSED' figure is arithmetically exact and semantically meaningless. (c) AC-4 env-gate — ragFtsRebuildCronJob 2 runs (2026-07-19, 2026-07-20) then off by design (CRON_RAG_FTS_REBUILD_ENABLED default-false per ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE); must report DISARMED, not WARN. (d) AC-3 dom/dow OR-vs-AND — brokerSanctionsSweep 4 runs, last 2026-07-31 08:00:01, real next fire 2026-08-28, so 274.4h-vs-36h is the OR-semantics artefact this row already documents. ZERO genuine cron gaps in this batch (the one real gap from the 08-09 snapshot, monthlySignalQualityAudit, is not in it)."
    | .reprice_rationale_20260811 = "P2->P1 on RECURRENCE COST, not on blast radius — the not_blocking note stays true (every maligned job is firing on schedule, zero production data loss). What changed: this detector defect has now consumed two full PO triage cycles 2 days apart and put 6 CRITICAL rows on the BUG channel that a human reading that channel cannot distinguish from a real scheduler death. It also actively masks: the one genuinely stalled item in today's set, ragFtsRebuildCron, is real-but-deliberate, and any FUTURE real gap in these 8 names is now pre-classified as noise by two consecutive PO refutations. Priority reflects the alarm-channel poisoning, which compounds per storm."
    | .status_note = ((.status_note // "") + " | 2026-08-11 PO: P1 (was P2). Storm #2 refuted 8/8 live. Reminder from this row's own consumer_impact: do NOT patch system-auditor A-29 to compensate — A-29 correctly consumes GET /api/cron-status .status/.reason verbatim per docs/agents/system-auditor/flow/main.md Cron Fire Check; the endpoint is the defect.")
  else . end)

# ---------- 3. ci_red x4 -> FOLD into the 3 existing FILE-SCOPED rows ----------
| .task_board.backlog |= map(
    if .dedup_key == "ci_job:size-lint|file:apps/mcp-server/src/interface/mcp/transport.ts" then
        .updated_at = NOW
      | .title = "CI RED: size-lint — apps/mcp-server/src/interface/mcp/transport.ts baseline-tolerance-exceeded (126L->265L, upper 138L)"
      | .status_note = ((.status_note // "") + " | 2026-08-11T21:00Z PO fold, 4 further ci_red signals, FILE-SCOPED dedup hit (no new mint). Observed SHAs: 23320b686 (run 31513826899), 3f36a0d57 (run 31526263655), d3ebc7836 (run 31529082402), a2fd4b004 (run 31531356419). GROWTH: gh --log-failed reports 'baseline=126L actual=265L upper=138L' on all four runs — the file has grown 237L->265L since this row was written; title corrected. size-lint reports exactly 1 offending file of 1376 scanned, so this row alone accounts for the entire size-lint job failure.")
    elif .dedup_key == "ci_job:bun test|file:src/__tests__/ALLZERO-OHLCV-FETCH.test.ts" then
        .updated_at = NOW
      | .status_note = ((.status_note // "") + " | 2026-08-11T21:00Z PO fold, 4 further ci_red signals, FILE-SCOPED dedup hit (no new mint). Observed SHAs: 23320b686, 3f36a0d57, d3ebc7836, a2fd4b004. gh --log-failed on all four runs: '15093 pass / 40 skip / 3 fail', '=== FAILED FILES (2) ===' naming ONLY this file and FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL.test.ts. The per-file-isolation fail set is STABLE across all 4 HEADs — not flaky, not order-dependent.")
    elif .dedup_key == "ci_job:bun test|file:src/__tests__/FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL.test.ts" then
        .updated_at = NOW
      | .status_note = ((.status_note // "") + " | 2026-08-11T21:00Z PO fold, 4 further ci_red signals, FILE-SCOPED dedup hit (no new mint). Observed SHAs: 23320b686, 3f36a0d57, d3ebc7836, a2fd4b004. Same stable 2-file fail set across all 4 HEADs (see sibling row FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH).")
    else . end)

# ---------- 4. BCTC RECONCILE EXHAUSTED (report 4684) -> fold ----------
| .task_board.in_progress |= map(
  if .id == "FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE" then
      .occurrence_count = 48
    | .updated_at = NOW
    | .status_note = ((.status_note // "") + " | 2026-08-11T21:00Z PO fold, occ 47->48. Telegram report 4684 (message_id 5094, 2026-08-11T17:35:04Z): 'RECONCILE EXHAUSTED: VND 2023-Q4 — 0 rows across bctc_layout_units/bctc_table_rows/bctc_md_tables after 8 reconciliation passes (cap 8) ... report_id: fallback-VND-2023-Q4'. The report_id literally carries the fallback-<TICKER>-<YEAR>-<Q> shape this row is scoped to, so it is an in-class re-exhaustion, not a new defect. Its suggested action ('consider manual /api/trigger-pek-extract re-fire') is INVALID for this class per this row's own finding — 0/66 shells ever produced a layout_unit or table_row DB-wide, so a re-fire cannot succeed. The emission circuit-breaker tracked by SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD is what stops these reports; do not action 4684 individually.")
  else . end)

# ---------- 5. market.db locked (report 4685) -> corroborate the P0 WAL row ----------
| .task_board.qa |= map(
  if .id == "FIX-MARKETDB-WAL-SEQUENCE-STEPS-2-4-NO-OWNER" then
      .updated_at = NOW
    | .corroboration_20260811 = "Telegram report 4685 (message_id 5095, 2026-08-11T17:49:25Z): '[market-db-journal-guard] MARKET_DB_JOURNAL_MODE verdict=ERROR reason=probe_query_failed detail=ERROR:database is locked container=vn-market-intelligence-mcp-mcp-server-1 db=/app/data/market.db'. This is direct live evidence for this row's own premise: journal_mode is still wal and step 4 (checkpoint + flip back to DELETE) has never been performed, so the guard's own probe is now being locked out by the WAL writer it exists to police. Note the second-order effect — verdict=ERROR is NOT verdict=FAIL, so the guard currently degrades to unobservable rather than alarming; the WAL state is unmonitored while it persists. No new mint: this row already owns steps 2-4 and is the correct home."
    | .status_note = ((.status_note // "") + " | 2026-08-11T21:00Z PO: live corroboration attached (report 4685) — see corroboration_20260811. Row remains P0 in qa[] with a structurally unsatisfiable verification gate; this is the blocker to surface, not a new ticket.")
  else . end)

# ---------- 6. sweep-guard BARE escalated=true x5 -> fold into the tracked contradiction row ----------
| .task_board.qa |= map(
  if .id == "FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT-CONTRADICTS-LIVE-SWEEPGUARD-HARDBLOCK" then
      .occurrence_count = ((.occurrence_count // 0) + 5)
    | .updated_at = NOW
    | .status_note = ((.status_note // "") + " | 2026-08-11T21:00Z PO fold, +5 fires. Five bug-escalation signals this tick, all payload class '[sweep-guard] BARE commit about to absorb N staged file(s)', all actor=165f4245-6173-4054-87fd-c55bb626265f, all escalated=true / mode=warn / threshold=3 / outcome=BLOCKED, prior_warns walking 32->33->34->35->36 across 18:21Z/19:27Z/20:06Z/20:16Z/20:37Z. Per docs/agents/po/flow/triage-signals.md the escalated=true branch says 'open/append a bug-escalation FIX-class row, dedup-checked against the FIX-COMMIT-SWEEP-GUARD-* family first' — this row IS that home and no new mint is warranted, but the disposition has materially changed: outcome is no longer 'warn', it is 'blocked'. The hook is now hard-rejecting real commits from a live session, which is exactly the policy-vs-enforcement contradiction this row describes, now realised. Files caught in the 5 attempts: orch-state.json + 4 processed bctc_signal_*.json + cowork-team-*.json; pm-decision-2026-08-11.md + orch-state.json + SPIKE-BCTC-RECONCILE-EXHAUSTED handoff; market-watcher.md; system-auditor.md + DASHBOARD.md; system-auditor.md. Row is already in qa[] — this is a dispatch/close-out problem, not a diagnosis problem.")
  else . end)

# ---------- 7-10. NEW MINTS (idempotent) ----------
| .task_board.backlog |= (
    .
  + (if (map(.id) | index("FIX-SBVOMO-LIQUIDITY-CRON-ERROR-STRING-CONFLATES-TIMEOUT-AND-UNREACHABLE")) then []
     else [{
       id: "FIX-SBVOMO-LIQUIDITY-CRON-ERROR-STRING-CONFLATES-TIMEOUT-AND-UNREACHABLE",
       title: "sbvOmoLiquidityCronJob.ts:70 emits one error string for two distinct failure modes — a deadline-timeout (upstream alive, slow) and an unreachable host (upstream down) are indistinguishable at read time",
       type: "FIX", priority: "P3", status: "BACKLOG", zone: "apps/mcp-server/", size: "S",
       owner: "dev-mcp-server", next_agent: "dev-mcp-server", created_by: "po",
       created_at: NOW, updated_at: NOW, supervised: false, depends_on: null, blocks: null,
       origin_signal_id: "d2e712700b190a6a587684b903f8456fb9e52b073d5ddb22bad378c9830bb8cd",
       root_cause: "Reported by dev-team as an out-of-zone defect found during unrelated work (system-issue signal, priority LOW, 2026-08-11T17:56:09Z): 'sbvOmoLiquidityCronJob.ts:70 error string conflates deadline-timeout w/ unreachable'. Same diagnostic-collapse class as FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW (a failed and a genuinely-empty extraction become byte-identical at read time) — an operator reading the log cannot tell whether to raise the timeout or to page the upstream owner.",
       acceptance_criteria: "AC-1: the two paths emit distinguishable messages naming the failure mode and, for the timeout path, the deadline that was exceeded. AC-2: a regression test asserts both branches, RED at HEAD. AC-3: no behaviour change to the job's retry/scheduling — message-shape only.",
       not_blocking: "P3 — observability only, no data loss, no wrong values written. Reported LOW by its finder.",
       origin: "PO triage 2026-08-11T21:00Z, pendingSignals[] system-issue from dev-team"
     }] end)
  + (if (map(.id) | index("CLEAN-CTXBLOAT-CRON-COWORK-TEAM-SKILL-242L-OVER-200L-CAP")) then []
     else [{
       id: "CLEAN-CTXBLOAT-CRON-COWORK-TEAM-SKILL-242L-OVER-200L-CAP",
       title: "context-bloat: .claude/skills/cron-cowork-team/SKILL.md breaches BOTH caps (242L vs 200L, 14279B vs 12000B) — prune or split",
       type: "CLEAN", priority: "P3", status: "BACKLOG", zone: "cross-service/", size: "S",
       owner: "claude-manager-helper", next_agent: "claude-manager-helper", created_by: "po",
       created_at: NOW, updated_at: NOW, supervised: false, depends_on: null, blocks: null,
       dedup_key: "context_bloat_breach|file:.claude/skills/cron-cowork-team/SKILL.md",
       origin_signal_id: "bf10c02a68d72060acda797c04985b81479b99c40fbaa1be21502bb6eb29a458",
       root_cause: "context-bloat-backstop-hook fired 2026-08-11T17:27:31Z: class=skill-file reason='line-cap,byte-cap' overage=42L byte_overage=2279B. Same shape and same dedup_key convention as the already-open CLEAN-CTXBLOAT-NOTEBOOK-WRITE-SKILL-215L-OVER-200L-CAP; no existing row covers this file. This skill is re-armed after every session restart (CLAUDE.md /cron-cowork-team), so its size is paid repeatedly.",
       acceptance_criteria: "AC-1: file <=200L AND <=12000B, or split with a lazy-load pointer per the CLAUDE.md Lazy Load Pattern. AC-2: the /cron-cowork-team re-arm procedure still executes end-to-end from the trimmed file — verify by running it, not by reading it.",
       not_blocking: "P3 — hygiene. The other 3 context_bloat_breach signals this tick are already covered: 2x sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-15.md by FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR, 1x digest-predict.md by CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT.",
       origin: "PO triage 2026-08-11T21:00Z, pendingSignals[] context_bloat_breach"
     }] end)
  + (if (map(.id) | index("FIX-AUDITOR-TIER1-HEARTBEAT-HANDWRITE-RECURS-SAME-DAY-AS-ITS-OWN-FLOW-FIX")) then []
     else [{
       id: "FIX-AUDITOR-TIER1-HEARTBEAT-HANDWRITE-RECURS-SAME-DAY-AS-ITS-OWN-FLOW-FIX",
       title: "FIX-AUDITOR-TIER1-FLOW-HAND-WRITES-HEARTBEAT-FILE landed 2026-08-11 and the hand-write recurred TWICE the same day (18:44:58Z, 18:47:34Z) — a prose STOP/NEVER restatement is not an actuator and this class now has 4 confirmed fires against 2 successive doc-only fixes",
       type: "FIX", priority: "P1", status: "BACKLOG", zone: "cross-service/", size: "M",
       owner: "developer", next_agent: "architect", created_by: "po",
       created_at: NOW, updated_at: NOW, supervised: false, depends_on: null, blocks: null,
       dedup_key: "auditor-tier1-heartbeat|defect:prose-guardrail-does-not-hold-actuator-required",
       origin_signal_id: "4026deb20a9e7fbdad197ec8addbcdd71a1032aa8cfca366231ab5986d04eb10",
       root_cause: "Two bug-escalation signals this tick, both payload class '[heartbeat-guard] REJECT: docs/data/auditor-tier1-last-healthy.json staged content does not match the sole-writer shape (last_healthy_at + checks{6 keys, all PASS})', commit BLOCKED both times. This is the guard working correctly — the finding is that the WRITE keeps being attempted. Timeline: the 2026-07-29 SOLE-WRITER prose fix did not hold (2 hand-writes, c5/2026-08-08 and c34/2026-08-11); FIX-AUDITOR-TIER1-FLOW-HAND-WRITES-HEARTBEAT-FILE therefore added a STOP/NEVER restatement INSIDE the Tier-1 section (see the size-justification header of docs/agents/system-auditor/flow/main.md, entry dated 2026-08-11); that fix landed today and the hand-write fired twice more within hours. Three successive interventions have all been text-in-a-flow-doc. The one thing that has actually worked every time is scripts/git-hooks/pre-commit, which caught 4/4.",
       acceptance_criteria: "AC-1: the Tier-1 cycle has a POSITIVE path to a genuine heartbeat — it invokes scripts/agents-flow/auditor-tier1-probe.sh _write_heartbeat() (or an equivalent callable) rather than being told not to write; a guardrail that only forbids leaves the agent with an unmet need and it will keep improvising. AC-2: RED-at-HEAD reproduction — replay a Tier-1 ALL_GREEN cycle and show the current flow text still permits the hand-write path. AC-3: do NOT close this by adding more prose to docs/agents/system-auditor/flow/main.md; that is the intervention this row exists to record as failed. AC-4: keep the pre-commit guard — it is the only layer with a 4/4 record and must remain as defence in depth.",
       note_generalizable: "Class lesson for the fleet, not just this file: when the same defect recurs after a doc-only fix, the next fix must move the enforcement to an executable layer. Same shape as feedback_fleetwide_gate_validated_on_one_file_optout_allowlist.",
       origin: "PO triage 2026-08-11T21:00Z, pendingSignals[] bug-escalation x2 (heartbeat-guard payload class)"
     }] end)
  + (if (map(.id) | index("FIX-PO-REFUTED-DETECTOR-FINDING-HAS-NO-SUPPRESSION-FEEDBACK-CHANNEL")) then []
     else [{
       id: "FIX-PO-REFUTED-DETECTOR-FINDING-HAS-NO-SUPPRESSION-FEEDBACK-CHANNEL",
       title: "A PO refutation of a detector finding is written only into a board-row prose field and reaches no suppression layer, so the detector re-fires the identical refuted findings on its next cycle — 8 A-29 names refuted 2026-08-09 re-fired as 6 CRITICAL + 2 WARN BUG-channel alerts on 2026-08-11",
       type: "FIX", priority: "P1", status: "BACKLOG", zone: "cross-service/", size: "M",
       owner: "developer", next_agent: "architect", created_by: "po",
       created_at: NOW, updated_at: NOW, supervised: false, depends_on: null, blocks: null,
       dedup_key: "detector-feedback|defect:po-refutation-never-reaches-emit-suppression-layer",
       root_cause: "scripts/emit-audit-signal.sh dedups on (dedup_key, ts, sev) in docs/data/auditor-dedup-ledger.json — a 7-day RECENCY ledger with no verdict dimension. Live shape confirmed 2026-08-11: {'auditor-a29-fire-gap:vpsProxyWatchdog': {'ts':'2026-08-11T18:22:00Z','sev':3}}. There is nowhere in that record to express 'PO adjudicated this key FALSE POSITIVE on 2026-08-09, root cause tracked as FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL'. Consequence: PO's refutation is durable ONLY as prose inside the .refuted_premise / .evidence fields of a task_board row that the emitting script never reads. The detector is not malfunctioning — it has no channel through which the adjudication could reach it.",
       evidence: "2026-08-09T02:48Z PO refuted 23 of 24 non-healthy A-29 rows and minted FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL, naming vpsProxyWatchdog / taAlertNotifier / priceUpdateWatchdog / vnIndexRefresh / taAlertScan / bbAlertScan / brokerSanctionsSweep / ragFtsRebuildCron individually in its evidence and AC fields (see scripts/po-triage-20260809T0248Z-cron-fire-gap-refute-and-mint.jq). 2026-08-11T18:22Z: those same 8 names fired again, 6 at CRITICAL, to the BUG channel (reports 4686-4693). PO spent a second full triage cycle re-refuting them from the same cron_job_runs table and reached the same verdict, 8/8. Cost per storm: one PO cycle plus 6 CRITICAL rows on the human-facing alert channel; on 2026-08-09 it also cost a full ops investigation cycle (ops notebook, commit 02b456b4d) that reached a WRONG conclusion (container crash) before PO refuted it.",
       acceptance_criteria: "AC-1: a refutation is expressible in a machine-readable place the emitter reads — e.g. a suppressed_keys/adjudications section carrying {dedup_key, verdict, adjudicated_by, adjudicated_at, tracking_row_id, expires_at}. AC-2: a suppressed key is NEVER silently dropped — it downgrades to a single INFO-class line naming the tracking row, so a genuine regression on that key is still visible (fail-loud, mirrors the A-29b UNRESOLVED-JOIN discriminator contract already in docs/agents/system-auditor/flow/main.md). AC-3: suppression EXPIRES and must be renewed, and is auto-invalidated when the tracking row reaches a TERMINAL_SET status — a fixed detector must be allowed to fire again. AC-4: PO's triage flow gets the write step, so the adjudication is a side effect of triage rather than a second manual chore. AC-5: replay the 2026-08-11T18:22Z batch through the mechanism and assert 0 CRITICAL emitted, 8 INFO lines each naming FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL.",
       scope_warning: "This is a DETECTOR-FEEDBACK row, not a threshold-tuning row. Do NOT implement it by widening any check's thresholds, by extending the dedup ledger TTL, or by patching A-29 — FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL's own consumer_impact field explicitly forbids compensating inside A-29, and a longer TTL would suppress genuine regressions too.",
       origin: "PO triage 2026-08-11T21:00Z — second A-29 false-positive storm in 3 days"
     }] end)
  )

| ._updated_at = NOW
| ._updated_by = "po (triage 2026-08-11T21:00Z)"
