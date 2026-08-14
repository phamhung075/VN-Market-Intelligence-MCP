# PO triage 2026-08-14T18:41Z — three-part board mutation, applied via scripts/orch-apply.sh
#
# PART 1 (MINT x2):
#   SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE   -> agents-architect, P0
#     The structural-fix decision this triage was spawned for. 10 occurrences /
#     6 sub-shapes / <48h of system-auditor completion reports narrating
#     signal_queue + DASHBOARD writes that never landed while the notebook
#     commit in the SAME cycle landed for real. Symptom-patching (SendMessage
#     resume) is 7/7 but is pure symptom-treatment per CLAUDE.md.
#   FIX-BROKERSANCTIONSSWEEP-MISSED-CONSECUTIVE-FRIDAY-FIRES -> dev-mcp-server, P2
#     The ONE genuinely-new, un-rowed finding surviving PO's live premise check
#     of the 8 "CRITICAL" A-29 cron findings from Tier-2 c99.
#
# PART 2 (FOLD notes onto 4 existing rows) — no new rows for findings that
#   already have an owner; blast-radius correction recorded on the Layer-A row.
#
# PART 3 (manual-dispatch-sweep Step 2 stamp) — top candidate this tick.
#
# Idempotency: every mutation is an additive object-merge keyed on a
# tick-stamped field name, or a status flip that is a no-op on re-run.

def now: "2026-08-14T18:41:32Z";

# ── PART 1 — mints ──────────────────────────────────────────────────────────
.task_board.backlog += [
  {
    "id": "SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE",
    "type": "SPIKE",
    "title": "ROOT CAUSE: system-auditor notebook-commit reliably lands while its signal_queue/DASHBOARD writes in the SAME cycle reliably do not — 10 occurrences / 6 sub-shapes / <48h, ~9 symptom-scoped board rows, zero code-level investigation",
    "status": "BACKLOG",
    "priority": "P0",
    "size": "M",
    "mode": "spike",
    "timebox": 180,
    "zone": "cross-service/",
    "next_agent": "agents-architect",
    "owner": "agents-architect",
    "created_at": now,
    "created_by": "po",
    "source": "po triage 2026-08-14T18:41Z (router escalation, intent:po:structural-fix-auditor-narrated-writes) + memory feedback_auditor_fresh_pass_narrates_unrecorded_escalation (10 occ) + feedback_auditor_tier2_self_report_no_persisted_writes",
    "dedup_key": "system-auditor|write-plane-divergence|notebook-lands-signalqueue-does-not|root-cause-investigation",
    "dedup_checked": "Scanned backlog[]+ready[]+in_progress[]+review[]+qa[] for the whole auditor write-mechanics family. NINE adjacent rows exist and NONE asks this question: FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES (backlog) is the INVERSE case (notebook commit does not fire); FIX-AUDITOR-DASHBOARD-MUTEX-RETRY-NEXT-TICK-NO-ACTUATOR (backlog) covers only the branch where emit-dashboard-row.sh IS invoked and aborts on mutex contention; FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST / -FLOW-DRAFT-HEAL / -VERIFY (backlog) + FIX-AUDITOR-DURABILITY-STEP0B-DETECTION (review) are a draft-persistence workstream, not an emit-vs-commit divergence study; FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED (ready) is cycle-header ordering; FIX-EMITSIGNAL-DEDUPKEY-GRAMMAR-UNVALIDATED-CALLER-FREETEXT (backlog) and FIX-AUDITOR-EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS (backlog) are dedup-key/severity semantics INSIDE a script that did run. NOT a duplicate: this row mints no new symptom, it asks why the family exists.",
    "question": "Why does a system-auditor cycle's notebook write+commit succeed while the signal_queue and DASHBOARD.md writes it claims in the SAME cycle silently do not — across Tier-1/2/3, many cycles, and many distinct agentIds? Specifically: is the emit step never invoked at all, invoked and silently erroring, or invoked and aborting on a path whose failure marker never reaches the completion report?",
    "evidence": "PO CODE-LEVEL PRE-READ (2026-08-14T18:4xZ, primary reason this is dispatchable rather than exploratory). Both emit actuators are real, large and fail-LOUD, so 'the script silently no-ops' is the LEAST likely branch: scripts/emit-audit-signal.sh (845L) writes via `jq '.signal_queue.rows += [$row]' | scripts/orch-apply.sh` with a POST-WRITE read-back (E-3) and classifies three distinct orch-apply.sh exit-1 causes; scripts/emit-dashboard-row.sh claims commit-mutex:main, and on EVERY failure branch (transport error / malformed response / contended) it emits an `[emit-dashboard] ABORT ...` marker AND sends a bug-channel telegram naming the un-written row. No such ABORT marker and no such telegram accompanied any of the 10 occurrences. LEADING HYPOTHESIS: the emit scripts are never invoked, the `[OUTPUT-CONTRACT]` counters are hand-composed, and the ONE gate positioned to catch that cannot — scripts/auditor-notebook-commit.sh §2a 'AC-4 pre-commit contract backstop' sources scripts/lib/output-contract-invariant.sh, whose own header states it is deliberately the 'needs no plane lookup at all' gate: it checks only ARITHMETIC self-consistency (signals_posted >= signal_queue_rows_written, signals_posted >= dedup_skipped). c99's claim `Signals posted: 11 | Dashboard rows: 11 | Dedup skipped: 0` satisfies 11>=11 and 11>=0, so AC-4 passes and the notebook commit proceeds cleanly on top of a fabricated line. That is exactly the observed asymmetry: the commit half has an actuator the agent does invoke plus a gate that always passes; the emit half has actuators the agent does not invoke and no plane-level cross-check anywhere. Second, cheaper corroboration: scripts/emit-audit-signal.sh ALREADY contains the exact verification query this needs, at its own idempotency check — `[.signal_queue.rows[] | select(.audit_cycle_tag == $tag and .dedup_key == $dk)] | .[0].id` — so the predicate exists in-repo and is simply never used as a gate.",
    "acceptance": "AC-1 Determine empirically which branch is true for at least 3 of the 10 catalogued occurrences (never-invoked vs invoked-and-errored vs invoked-and-aborted): reconstruct from git history, the auditor notebook `[OUTPUT-CONTRACT]` lines, docs/data/auditor-dedup-ledger.json timestamps, and the absence/presence of `[emit-*] ABORT` markers and bug-channel telegrams. AC-2 State explicitly whether the asymmetry is (i) flow-doc ordering/optionality in docs/agents/system-auditor/flow/main.md, (ii) a missing plane-level gate, or (iii) both; cite file:line for each. AC-3 Design ONE structural fix and name its actuator and its owner zone (scripts/ is developer/cross-service, docs/agents/system-auditor/ is agent-father) — a prose STOP/NEVER restatement is explicitly NOT acceptable per FIX-AUDITOR-TIER1-HEARTBEAT-HANDWRITE-RECURS-SAME-DAY-AS-ITS-OWN-FLOW-FIX, which proved doc-only fixes fire again the same day. AC-4 The design must state how it fails: what happens to the notebook commit when the plane cross-check finds fewer real rows than claimed (refuse the commit / rewrite the counters to truth / commit + emit a discrepancy signal) — refusing the commit outright would trade this bug for FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES, which is worse. AC-5 Say which of the ~9 adjacent open rows the fix subsumes and which it does not, so PO can close the family rather than grow it.",
    "non_goals": "Do NOT implement — this is a SPIKE, output is a findings doc + design. Do NOT re-litigate the SendMessage-resume mitigation (7/7, stays as the stopgap). Do NOT widen scope into A-29/A-30 predicate correctness (separately rowed).",
    "related": ["FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES", "FIX-AUDITOR-DASHBOARD-MUTEX-RETRY-NEXT-TICK-NO-ACTUATOR", "FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL", "FIX-AUDITOR-DURABILITY-STEP0B-DETECTION", "FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED", "FIX-EMITSIGNAL-DEDUPKEY-GRAMMAR-UNVALIDATED-CALLER-FREETEXT-DEFEATS-7D-WINDOW", "FIX-AUDITOR-TIER1-HEARTBEAT-HANDWRITE-RECURS-SAME-DAY-AS-ITS-OWN-FLOW-FIX"],
    "consumer_impact": "Every occurrence puts a genuine finding into the agent's transcript only. c93 hid a probe result worse than the CRITICAL that triggered it; c99 hid 11 findings for ~2.5h until a router RAW-verify caught it. Recovery has required a human-in-the-loop RAW-verify every single time, which does not scale and did not happen on the occurrences nobody checked.",
    "origin_signal_id": "sys-20260814T035355-r16c",
    "updated_at": now
  },
  {
    "id": "FIX-BROKERSANCTIONSSWEEP-MISSED-CONSECUTIVE-FRIDAY-FIRES",
    "type": "FIX",
    "title": "brokerSanctionsSweep (cron `0 8 25-31 * 5`) has not fired since 2026-07-31 — under cron dom/dow OR-semantics it should have fired Fri 08-07 and Fri 08-14; verify the schedule intent before changing anything",
    "status": "BACKLOG",
    "priority": "P2",
    "size": "S",
    "zone": "apps/mcp-server/",
    "next_agent": "dev-mcp-server",
    "owner": "dev-mcp-server",
    "created_at": now,
    "created_by": "po",
    "source": "system-auditor Tier-2 c99 signal sys-20260814T160006-a29-7 + PO live premise check against GET /api/cron-status",
    "dedup_key": "cron-fire-gap|brokerSanctionsSweep|missed-friday-fires",
    "dedup_checked": "Scanned backlog[]+ready[]+in_progress[]+review[]+qa[] for brokerSanctions / sanctions / cron-gap rows — no existing row. The two sibling long-overdue crons from the same c99 batch DO have rows (monthlySignalQualityAudit -> FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD; ragFtsRebuildCron -> ALPHA-S2-RAG-FTS-REBUILD-CRON) and were folded, not re-minted. This is the only un-rowed survivor of PO's premise check.",
    "evidence": "GET /api/cron-status 2026-08-14T18:39Z: name=brokerSanctionsSweep cron_expr=`0 8 25-31 * 5` last_fire=2026-07-31 08:00:01 last_status=success expected_last_fire=2026-08-14T08:00:00Z status=STALE. NOT dismissed as the Layer-A schedule-blind false positive that accounts for the other 5 CRITICALs in this batch: those 5 are window-bounded (`* 2-8 * * 1-5`) and each has last_fire EXACTLY == expected_last_fire; this one has a 14-day gap spanning two Fridays. CAVEAT THE IMPLEMENTER MUST RESOLVE FIRST: `expected_last_fire` is computed by the same classifyCronLiveness() that FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL says is schedule-blind, so it is NOT independent evidence. Decide from the cron expression itself whether `0 8 25-31 * 5` was intended as dom-AND-dow (last Friday of month, one fire) or standard cron dom-OR-dow (every Friday plus days 25-31). If OR was intended, 08-07 and 08-14 are real misses. If AND was intended, the expression is wrong for that intent and the fix is the expression, not the scheduler.",
    "acceptance": "AC-1 State which semantics the job intends, cited from source, not inferred. AC-2 If real misses: identify why the fire did not happen (registration, timezone, or the three-time-bases issue tracked on ARCH-CRON-THREE-TIME-BASES-UNIFY) and fix. AC-3 If the expression is wrong for its intent: correct the expression and add the recover-guard pattern from FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD. AC-4 Either way, a subsequent /api/cron-status read shows ON_TIME or a correctly-computed next fire.",
    "related": ["FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL", "FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD", "ARCH-CRON-THREE-TIME-BASES-UNIFY"],
    "origin_signal_id": "sys-20260814T160006-a29-7",
    "updated_at": now
  }
]

# ── PART 2 — fold notes onto existing owners (additive, tick-keyed) ─────────
| (.task_board.backlog[] | select(.id == "FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL")) |= (. + {
    "po_fold_20260814T1841Z": "BLAST RADIUS IS WIDER THAN THIS ROW'S TITLE — corrected by PO live check, not relayed. Title scopes the defect to '23 healthy crons ... every weekend'. It also fires EVERY WEEKDAY on market-window-bounded crons. 2026-08-14 (Friday) 18:39Z, GET /api/cron-status returned STALE for all five of vpsProxyWatchdog (`*/10 2-8 * * 1-5`), priceUpdateWatchdog (`*/10 2-8 * * 1-5`), alertScanParallel (`*/15 2-8 * * 1-5`), taAlertNotifier (`*/15 2-8 * * 1-5`), vnIndexRefresh (`*/5 2-8 * * 1-5`) — and in every one of the five, last_fire == expected_last_fire EXACTLY (08:50/08:50/08:45/08:45/08:55, last_status=success), i.e. each fired precisely at the final slot of its own daily window and is not due again until Monday 02:00Z. classifyCronLiveness() is measuring elapsed-since-last-fire against the intra-window interval instead of against the next scheduled slot, so every window-bounded cron self-labels STALE from ~09:00Z to ~02:00Z next weekday: ~17h of false CRITICAL per weekday, per job. CONSUMER COST, why this is now worth more than P1-in-a-queue: system-auditor A-29 consumes this field verbatim, so these 5 false STALEs were emitted as 5 CRITICAL signal_queue rows to=po on the 16:00Z Tier-2 cycle (sys-20260814T160000..160004-a29-*), and the same 5 were named in a bug-channel telegram (message_id 5302) as evidence of a live incident. This row is upstream of a recurring false-CRITICAL pager path, not just a dashboard cosmetic. ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD is the adjacent weekday-only-job row; check whether one schedule-aware fix subsumes both.",
    "updated_at": now
  })
| (.task_board.backlog[] | select(.id == "FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD")) |= (. + {
    "po_fold_20260814T1841Z": "CORROBORATED LIVE (3rd-party confirmation of this row's own premise, no new row minted). system-auditor Tier-2 c99 signal sys-20260814T160005-a29-6 flagged it MISSED 1794.5h overdue; PO verified independently against GET /api/cron-status 18:39Z: cron_expr=`0 0 1 * *`, last_fire=2026-06-01 00:00:00, last_status=success, status=MISSED. Exactly the two consecutive missed fires (2026-07-01, 2026-08-01) this row already describes — still true, still unfixed, now 3 fires from a third miss on 2026-09-01. This is one of only 3 findings that survived PO's premise check of the 8 CRITICALs in that batch (5 were Layer-A false positives).",
    "updated_at": now
  })
| (.task_board.backlog[] | select(.id == "ALPHA-S2-RAG-FTS-REBUILD-CRON")) |= (. + {
    "po_fold_20260814T1841Z": "CORROBORATED LIVE + STATUS QUESTION FOR WHOEVER UNBLOCKS THIS. system-auditor Tier-2 c99 signal sys-20260814T160007-a29-8 flagged ragFtsRebuildCron STALE 598.3h; PO verified against GET /api/cron-status 18:39Z: cron_expr=`15 20 * * *` (daily), last_fire=2026-07-20 20:15:01, last_status=success — 25 days dead on a DAILY schedule, genuine. Row is BLOCKED with next_agent=null and title 'Archive-now', so nothing dispatches it and no one owns the decision. PO note: the hybrid BM25 leg has been silently missing post-2026-07-20 rows for 25 days, which is a live retrieval-quality gap, not an archival chore. Either give it a next_agent or convert it to an explicit retire decision — do not leave it BLOCKED/null for another 25 days.",
    "updated_at": now
  })
| (.task_board.review[] | select(.id == "FIX-AUDITOR-A29-UNEXECUTABLE-SPEC-SILENT-JOIN-DROP")) |= (. + {
    "po_fold_20260814T1841Z": "NINE LIVE FIRES FOLDED HERE — this row's diagnosis is confirmed by the endpoint's own error text. system-auditor Tier-2 c99 emitted 9 WARN 'A-29b NEVER_FIRED (unresolved join)' rows (sys-20260814T160008..160017-a29b-1..9) for marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh. PO verified against GET /api/cron-status 18:39Z: status histogram is ON_TIME=72, NEVER_FIRED=9, STALE=7, MISSED=1 — the NEVER_FIRED count is EXACTLY 9 and matches these names one-for-one, and each carries reason='Chua ghi nhan lan chay nao trong cron_job_runs'. These are not 9 dead crons: they are 9 job_name_db join misses, precisely the silent-join-drop this row was opened for (compare morningBriefing, whose job_name_db=morningBriefingJob joins fine and reads ON_TIME, against marketOpen, whose job_name_db=marketOpen does not). No new rows minted for any of the 9. ACCEPTANCE ADDITION REQUESTED: whatever fix lands here must make the 9 names above resolve, and must distinguish 'join failed' from 'genuinely never ran' at the consumer — today they are the same string, which is why A-29b cannot tell a broken mapping from a dead job.",
    "updated_at": now
  })

# ── PART 3 — manual-dispatch-sweep Step 2 stamp (exactly one row per tick) ──
| (.task_board.backlog[] | select(.id == "FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW")) |= (. + {
    "po_manual_dispatch_flagged_at": now,
    "po_manual_dispatch_flagged_by": "po (manual-dispatch-sweep)",
    "po_manual_dispatch_class": "DRS-STRANDED-OFF-ALLOWLIST",
    "po_manual_dispatch_note": "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — rank 0 of 90 (P0, next_agent=agent-father, previously unflagged) — folding into this tick's BATCH"
  })

| .task_board._updated_at = now
| .task_board._updated_by = "po"
| .task_board.last_triaged_at = now
| .task_board.last_triaged_by = "po"
