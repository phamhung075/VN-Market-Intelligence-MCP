# scripts/po-ruling-20260824T0737Z-signalqueue-hygiene-triage.jq
#
# PO RULING — signal-queue hygiene triage, dev-team tick 2026-08-24T07:37Z.
# Router-supplied findings (status casing split / 75-row chef flood / 6 stranded OPEN rows)
# adjudicated against source. 13 signal_queue row mutations + 3 board-row enrichments +
# 1 mint. Row COUNTS conserved on signal_queue (118 in, 118 out); backlog +1.
#
# Usage:
#   jq -f scripts/po-ruling-20260824T0737Z-signalqueue-hygiene-triage.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Reusable pattern: dedup-check EVERY intended mint against the live board on the PAYLOAD,
# not the id token, BEFORE minting. Four of the five root causes this triage identified were
# already tracked (FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING,
# FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD, FIX-CCATO-NTG-ROWS-...,
# FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT) — the durable contribution is the EVIDENCE
# that makes them fixable plus the MECHANICAL reason nothing routed them, not a fifth row.

def NOW: "2026-08-24T07:37:00Z";
def BY:  "po";

def sigmap(f): .signal_queue.rows |= map(f);

# ── A. Signal-queue rulings ────────────────────────────────────────────────────

# A1 — FINDING 1. Lowercase "new" canonicalised to "NEW". Casing IS case-sensitive
#      (proved below) but casing was NOT the only barrier: to=ops has zero consumers.
sigmap(
  if .id == "po-decision-bug5468-2026-08-23T15:27:38Z" then
    .status = "NEW"
    | .po_ruling_20260824T0737Z = "CASING DEFECT CONFIRMED, AND IT IS NOT THE ONLY BARRIER. (1) Every live selector is byte-exact: scripts/agents-flow/cowork-tick-preflight.sh:360 select(.status==\"NEW\"), .claude/skills/signal-dashboard/dashboard-protocol.md:86/92 select(.to==$agent and .status==\"NEW\"), docs/agents/dev-team/flow/drain-signals.md:24 'Collect status=NEW rows'. jq == on strings is byte-exact, so \"new\" matched NOTHING for 16h. (2) It was also UNEVICTABLE: scripts/orch-cold-evict.sh:181 TERMINAL_SIGNAL_STATUSES=READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED,triaged,TRIAGED,RETRACTED matched at :583 with .status|IN($tsig_arr[]) — the file's own header at :164-166 states the match is EXACT-STRING, no case fold, and that a case-fold was DELIBERATELY rejected. So \"new\" was simultaneously unpickable and immortal. (3) Casing fixed here, but delivery is STILL structurally impossible: ops is absent from the cowork_signal_recipient set in docs/data/system-map.json (jq gives [po,tran-ngoc-bau,alert-commander,unified-agent]) and grep signal_queue across all 12 files of docs/agents/ops/** plus .claude/agents/ops.md returns ZERO hits — ops has no signal_queue selector anywhere in the fleet. Root causes tracked at FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING (consumer axis, enriched this tick) and FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES (producer axis, minted this tick). Row left NEW, not closed: its MITIGATION clause (reset reconcile_attempts if any of the 21-row cohort reaches >=6-7) is a standing, still-unactuated instruction."
  else . end
)
|

# A2 — FINDING 3, the CRITICAL. STILL TRUE at 2026-08-24T07:52Z. Already tracked.
sigmap(
  if .id == "sys-20260814T064300-a29m" then
    .status = "triaged"
    | .disposition = "FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .po_ruling_20260824T0737Z = "CONFIRMED STILL TRUE, 10 days later, and NOT explained by host suspension. get_cron_health (live, 2026-08-24T07:52Z, 7-day window) lists 84 jobs; monthlySignalQualityAudit and monthlySignalQualityAuditJob are BOTH absent — zero runs. The host-suspension hypothesis is REFUTED by that same report: deepFetchVpsJob 532 runs, schedulerWatchdogJob 266, askQueueCheckJob 222, all success, all with last_run today. The in-container scheduler is alive; this one job is not firing. Real root cause is job-specific and already documented on the tracking row: apps/mcp-server/src/scheduler/schedulerJobTable.ts:226-233 registers it with options:{timezone:'UTC', recoverMissedExecutions:false} — an explicit opt-out — against cron '0 0 1 * *' (cronConfig.ts:138), a ONE-INSTANT-PER-MONTH window. Any restart spanning that instant loses the month permanently, silently. Now THREE consecutive months lost (2026-06-01 last real fire; 07-01 and 08-01 missed). Tracking row expedited P2->P1 this tick. No mint — re-litigating a row that already names schedulerJobTable.ts:229 would be board bloat."
  else . end
)
|

# A3 — FINDING 3. brokerSanctionsSweep: FALSE POSITIVE, detector threshold vs designed cadence.
sigmap(
  if .id == "sys-20260814T064301-a29s1" then
    .status = "RETRACTED"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .retraction_reason = "A-29 FALSE POSITIVE — 36h threshold applied to a QUARTERLY job. apps/mcp-server/src/scheduler/schedulerJobTable.ts:868-873 comment is explicit: 'Cron fires monthly (25th-31st Fri) but the job body applies a quarter-guard: only runs in March / June / September / December. Non-quarter Fridays record status=skipped in cron_job_runs.' Cron expr is '0 8 25-31 * 5' (cronConfig.ts:173). Last real fire 2026-07-31 is a non-quarter month; next real run is September. A 36h staleness threshold against a designed ~2160h cadence over-fires by ~60x. The detector reads last_fire without reading the job's own cadence or its skipped-status convention. Not a cron outage — a detector-side threshold defect. Sibling class of the already-tracked FIX-AUDITOR-DATATIER-CRONJOBRUNS-ADHOC-COUNT-NONDETERMINISTIC; recorded here rather than minted because one retraction is not yet a pattern (see the ragFtsRebuildCron sibling retracted in the same pass — TWO of the three A-29 rows in this batch are false positives, which IS the pattern; flagged to architect on the enriched OPEN-status row)."
  else . end
)
|

# A4 — FINDING 3. ragFtsRebuildCron: FALSE POSITIVE, job is deliberately default-OFF.
sigmap(
  if .id == "sys-20260814T064302-a29s2" then
    .status = "RETRACTED"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .retraction_reason = "A-29 FALSE POSITIVE — the job is DELIBERATELY DISABLED and cannot be stale. apps/mcp-server/src/scheduler/schedulerJobTable.ts:140 reads const ragFtsRebuildCronEnabled = (Bun.env.CRON_RAG_FTS_REBUILD_ENABLED ?? 'false').toLowerCase() === 'true' — default OFF. The adjacent comment at :131-139 (ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE) states the reason: the job shipped ahead of its capacity fix, FTS rebuild at ~56k rows OOMs the rag-service cgroup on every nightly 20:15 UTC fire, and it 'Stays false until RAG-FTS-BUILD-MEMORY-BOUND is verified fixed'. Last fire 2026-07-20 20:15 is the last fire BEFORE the safety gate landed. A staleness detector that reads last_fire without reading the enable flag will re-raise this every tick forever. NOTE: this retraction cites RAG-FTS-BUILD-MEMORY-BOUND read-only; no rag-service contact was made and no RAG row was touched — the live durability window sampling until 2026-08-24T14:37Z is undisturbed."
  else . end
)
|

# A5/A6 — FINDING 3. Both B-06 rows: condition no longer holds.
sigmap(
  if (.id == "sys-20260814T064303-b06") or (.id == "sys-20260814T160010-b06") then
    .status = "RESOLVED"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .disposition = "SELF-RESOLVED — re-probed live, condition gone. get_vps_service_health at 2026-08-24T07:5xZ: vn-bctc-fetch healthy, last poll 3m ago; all 5 VPS services healthy, 0 degraded. Corroborated by get_cron_health same tick: vpsServiceHealthJob 532 runs / 100% success / last_run 2026-08-24 07:50, vpsProxyWatchdogJob 40 runs / 100%. The 2026-08-14 cross-plane disagreement (proxy=ok, vn-bctc-fetch=unhealthy) and the 16:00Z timeout were transient and healed without intervention. No mint: nothing to fix, and a 10-day-old transient with no recurrence signal is not evidence of a standing defect."
  else . end
)
|

# A7 — FINDING 3. launchd_tracking_gap: correct on the letter, false on the premise.
sigmap(
  if .id == "sys-20260822T213754-audit-tracked-task-absent" then
    .status = "triaged"
    | .disposition = "FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .po_ruling_20260824T0737Z = "HALF-TRUE, AND THE HALF THAT IS TRUE DOES NOT MATTER. Literal claim verified: no board row with id FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD exists in any lane. But the row's PREMISE — that fleet-push exit-status 1 implicates launchd EXCONFIG — is the exact mis-attribution recorded in feedback_red_prepush_strands_fleet: pre-push runs TWO gates (tsc AND size-lint), and a red gate surfaces as exit-status 1 which then gets blamed on the launchd job. The real, current cause is tracked at P0: FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH (backlog, dev-mcp-server) — pushBctcLayoutHandler.ts is 252L against a 250L gate and is red RIGHT NOW, which is why this session is also forbidden to push. Three further siblings are tracked: FIX-SIZELINT-PREPUSH-SCANS-WORKING-TREE-NOT-PUSH-RANGE (P1), FIX-TASKCLAIM-LINT-SIGABRT-EXIT134-REJECTS-TENTH-OF-FLEET-PUSHES (P1), FIX-FLEET-PUSH-THRESHOLD-20-DESIGNS-IN-A-20-COMMIT-UNPUSHED-WINDOW (P1). Minting the id the auditor asked for would create a fifth row against a cause that is already 4-way covered. No mint. Detector-side note for whoever fixes A-32: 'tracked task ABSENT' asserted on an EXACT-ID lookup will fire forever whenever the cause is tracked under a different, better id — the predicate needs to search the cause, not the string."
  else . end
)
|

# A8 — the one genuinely NEW row. Already actioned by the auditor's own cycle.
sigmap(
  if .id == "sys-20260824T041052-44c9" then
    .status = "triaged"
    | .disposition = "FIX-AUDITOR-DCYCLE2-COMPLETION-EVIDENCE-PREDICATE-CANNOT-SEE-COMPLETED-CYCLES"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .po_ruling_20260824T0737Z = "ALREADY ACTIONED BY THE CYCLE THAT EMITTED IT — no residual work. docs/agent-memory/notebooks/system-auditor.md:6 (cycle c1003, 04:08-04:12Z) records 'Anomalies: 0 new | 1 folded (D-CYCLE-1: swept 1 stale orphaned marker from 2026-08-24T00:00Z prior-cycle loss)' and :76 grades it 'Durability note (INFO) ... No schedule gaps detected.' This signal (ts 04:10:52Z) is that same cycle's ledger entry, emitted mid-sweep: the marker was already gone when the row landed. Severity WARN overstates the auditor's own INFO grading. Underlying loss class is tracked twice — FIX-AUDITOR-DCYCLE1-MALFORMED-KEY-SENTINEL-COLLAPSES-DISTINCT-LOSSES (P2) and FIX-AUDITOR-DCYCLE2-COMPLETION-EVIDENCE-PREDICATE-CANNOT-SEE-COMPLETED-CYCLES (P1, cited here because a cycle that completed and was then read as lost is exactly its shape). The acute respawn-loop half is under active implementation this tick and was deliberately NOT touched by this triage. No mint."
  else . end
)
|

# A9 — FINDING 2(b). The 5 inverted CCATO rows that landed AFTER the 08-24T00:2xZ retraction
#      sweep. Same defect, same verdict — the earlier sweep was a one-shot, not a mechanism.
sigmap(
  if (.id | startswith("ntg-20260824T000000Z-technical_indicators-VNM-"))
     and (.payload.returned_value == "not found in database")
     and (.status == "READ")
  then
    .status = "RETRACTED"
    | .triaged_at = NOW
    | .triaged_by = BY
    | .retraction_reason = "INVERTED VERDICT — the row's own payload confirms the claim it accuses. payload.returned_value is 'not found in database', a VERBATIM member of .tool_null_markers in docs/data/claim-tool-map.json, which classify() at scripts/narrative-truth-gate.sh:268-271 maps to NULL (honest gap) and which the emit loop at :413-414 then skips (if v['result'] != 'FAIL': continue). chef's claim 'VNM khong co du lieu ky thuat phien nay' was CORRECT. The accusation comes from the hardcoded summary template at :421-423, which asserts 'returned non-null data' unconditionally without ever reading returned_summary. Identical verdict and reasoning as the 7 rows retracted at the 42-row mark on 2026-08-24T00:2xZ; these 5 arrived afterwards, which is the proof that the earlier retraction was a manual one-shot snapshot and not a mechanism. Tracked at FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID AC-4 (expedited to P0 this tick). 12 of 72 live ntg-* rows now carry this inversion, all 12 retracted."
  else . end
)
|

# ── B. Board rulings ──────────────────────────────────────────────────────────

def bmap(f): .task_board.backlog |= map(f);

# B1 — FINDING 2. EXPEDITE. The row was minted at 42 rows and called the emitter still live;
#      it has since more than doubled. Short note (row prose is 10582B against a 12000B ceiling).
bmap(
  if .id == "FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID" then
    .priority = "P0"
    | .updated_at = NOW
    | .updated_by = BY
    | .po_expedite_20260824T0737Z = "P1->P0 2026-08-24T07:37Z. RECURRED AND MORE THAN DOUBLED SINCE MINT. Re-measured live: 72 ntg-* rows, not 42. Git-traced 12 batches, not 3: ntg count 0(00:32 CEST) 18(00:49) 36(01:46) 42(01:58) 48(04:12) 54(04:24) 66(04:47) 72(05:47), i.e. 4 batches (+30 rows) landed AFTER this row was minted at 00:12:36Z, latest at 2026-08-24T03:47Z. Every one of the 72 still carries ts 2026-08-24T00:00:00Z to the second across 4h58m of wall clock — the ts-is-not-a-clock-read proof is now 12 batches strong. Grouping on payload.returned_value gives the SAME 4 findings at multiplicities 12/24/24/12 = 12 identical 6-row emissions (60 x12, 61 x24, 62.1 x24, 'not found in database' x12); 4 findings, 18x amplification. All 12 inverted rows now RETRACTED (7 on 08-24T00:2x, 5 this tick). AC-8's figure is stale: 60 rows to collapse, not 35. AC-7's future-ts note holds — no ntg-* row is age-evictable before 2026-08-25T00:00Z."
  else . end
)
|

# B2 — FINDING 3 CRITICAL. EXPEDITE the tracking row.
bmap(
  if .id == "FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD" then
    .priority = "P1"
    | .updated_at = NOW
    | .updated_by = BY
    | .po_expedite_20260824T0737Z = "P2->P1 2026-08-24T07:37Z. Third consecutive month now lost (2026-06-01 last real fire; 07-01, 08-01 missed) and re-confirmed live this tick: get_cron_health 7-day window lists 84 jobs and contains NEITHER monthlySignalQualityAudit NOR monthlySignalQualityAuditJob. This row is also the standing source of the ONLY CRITICAL in signal_queue (sys-20260814T064300-a29m, open 10 days, triaged to this row this tick) — leaving it at P2 keeps re-raising a CRITICAL the fleet then has to re-triage. The title's 'flipping recoverMissedExecutions alone is a PROVEN no-op' caveat is retained and unchallenged: expedited for scheduling, not re-scoped."
  else . end
)
|

# B3 — FINDING 1 + FINDING 3. ENRICH the existing architect row (thin at mint: no dedup_key,
#      no root_cause, no ac). Widened from OPEN-only to the whole unratified-status class.
bmap(
  if .id == "FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING" then
    .updated_at = NOW
    | .updated_by = BY
    | .dedup_key = "signalqueue_status_enum:unratified_values_unpickable_and_unevictable"
    | .root_cause = "TWO INDEPENDENT AXES, BOTH LIVE, NEITHER FIXED BY THE OTHER. (AXIS 1 — STATUS) .signal_queue.rows[].status has no enum anywhere in the write path: apps/mcp-server/src/infrastructure/orchStateSchema.ts:284 declares status: z.string() inside SignalRowSchema, and apps/mcp-server/src/infrastructure/orchStateStore.ts:47 declares it as 'NEW'|'READ'|'RESOLVED'|'PARTIAL'|'OPEN'|string — the trailing |string collapses the union to string, so tsc enforces nothing either. Every CONSUMER is byte-exact: pickers select(.status==\"NEW\") (cowork-tick-preflight.sh:360, signal-dashboard/dashboard-protocol.md:86/92, dev-team/flow/drain-signals.md:24) and the evictor uses .status|IN($tsig_arr[]) at orch-cold-evict.sh:583 against TERMINAL_SIGNAL_STATUSES=READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED,triaged,TRIAGED,RETRACTED (:181). Any value in neither set is BOTH unpickable AND immortal. (AXIS 2 — ADDRESSEE) every one of the affected rows is to:ops, and ops has NO signal_queue consumer at all: it is absent from the cowork_signal_recipient set in docs/data/system-map.json (live set is [po,tran-ngoc-bau,alert-commander,unified-agent]) and grep signal_queue over all 12 files of docs/agents/ops/** plus .claude/agents/ops.md returns ZERO hits. So even canonicalising a status to NEW does not deliver a to:ops row. FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT (ready, P1, agent-father) decomposed into per-consumer children for unified-agent, alert-commander, push-fanout and docs — there is NO ops child. The architect ruling this row needs is which of two: ratify ops as a recipient and give it a selector, or declare to:ops invalid and make producers address to:po (PO dispatches ops anyway)."
    | .evidence = "Re-measured live 2026-08-24T07:37-07:55Z. 118 signal_queue rows; status spread NEW=1 OPEN=6 READ=91 RETRACTED=7 new=1 triaged=12. SEVEN rows are in the unpickable+immortal class, not six as this row's title says: the 6 OPEN rows PLUS po-decision-bug5468-2026-08-23T15:27:38Z at lowercase \"new\", which is the same defect through a different value and proves the class is open-ended rather than a single bad literal. All 7 are to:ops. Oldest is 10 days (sys-20260814T064300-a29m, severity CRITICAL). orch-cold-evict.sh's own header at :164-166 records that a case-fold was CONSIDERED AND DELIBERATELY REJECTED ('would also silently admit any future accidentally-cased status this list has not explicitly ratified') — so a case-insensitive comparison is a ratified NON-fix and must not be proposed as one; the ratification has to happen at the producer. Detector-quality note surfaced by the same triage: of the three A-29 cron_fire_gap rows stranded here, TWO were false positives on inspection (brokerSanctionsSweep — 36h threshold against a quarter-guarded job, schedulerJobTable.ts:868-873; ragFtsRebuildCron — job is default-OFF behind an explicit safety gate, schedulerJobTable.ts:140) and only one was real. A dead-letter status is not the only cost of this defect: it also hid a 2-in-3 detector false-positive rate for 10 days."
    | .ac = [
        "AC-1 RULE ON to:ops FIRST — it is the load-bearing decision and it gates AC-2's shape. Either (a) ops becomes a real recipient (add it to cowork_signal_recipient in docs/data/system-map.json AND give it a selector, mirroring the existing FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER / FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER children of FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT — this row then becomes that epic's missing ops child), or (b) to:ops is declared invalid and producers are repointed to to:po. Do NOT ship a status fix without answering this: a correctly-cased NEW row addressed to an agent with no selector is still undelivered, just less obviously.",
        "AC-2 RATIFY THE STATUS SET AT THE PRODUCER, NOT WITH A CASE-FOLD. The consumer-side case-fold was already considered and rejected on the record (orch-cold-evict.sh:164-166). The enum belongs where every fleet write already passes: scripts/orch-apply.sh, via SignalRowSchema in apps/mcp-server/src/infrastructure/orchStateSchema.ts:284. Coordinate with FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES (developer) which owns that implementation half — this row owns the RULING on what the ratified set is, including whether OPEN survives at all.",
        "AC-3 DO NOT SILENTLY DROP. Same fail-mode hazard as the sibling CCATO row's AC-3: a validator that rejects a malformed-status row and loses it is strictly worse than the dead-letter it replaces. Reject loudly at the write, or coerce to NEW and stamp a greppable marker — never a silent drop, never an abort that loses the row.",
        "AC-4 DEAD-LETTER VISIBILITY, PERMANENTLY. Whatever the ratified set is, add a standing check that counts rows whose status is in neither the picker set nor TERMINAL_SIGNAL_STATUSES and surfaces a non-zero count. The 10-day strand happened because that number was never computed anywhere. A one-time cleanup without this check re-earns the same defect.",
        "AC-5 CLEAR THE 7 LIVE ROWS. All 7 are triaged/retracted/resolved as of 2026-08-24T07:37Z (po-decision-bug5468 deliberately left at NEW — its mitigation clause is still unactuated and it must not be evicted until to:ops delivery exists per AC-1). Confirm the other 6 reach cold archive on the next orch-cold-evict run and that none re-appears.",
        "AC-6 REGRESSION, ON A VALUE THE FIX WAS NOT WRITTEN FOR. Prove the gate on a THIRD unratified value (not OPEN, not lowercase new) — e.g. status:'Open' or 'pending'. A gate validated only on the two values that caused the incident is the shape recorded in feedback_fleetwide_gate_validated_on_one_file_optout_allowlist."
      ]
    | .po_ruling_20260824T0737Z = "SCOPE WIDENED + WHY NOTHING HAS ROUTED IT. Minted thin 2026-08-23T10:33Z (title only — no dedup_key, no root_cause, no ac) and un-dispatched for a day. The MECHANICAL reason is not priority: next_agent='architect' is a non-dev value, so the BOUNDED-1 NON-DEV-NEXT_AGENT GATE (docs/agents/dev-team/flow/main.md:640) holds it out of idle auto-pickup, and it is NOT plan_only, so the Supervised-Lane Sweep does not see it either. That combination is the documented residual gap: 'a row gated here WITHOUT plan_only is a tracked residual gap (no dedicated sweep lane yet)'. It needs DELIBERATE architect dispatch and will never self-promote. plan_only/supervised deliberately NOT set by this triage — flipping them to force SLS eligibility risks the null-dispatch_lane/unspawnable-head failure recorded in feedback_sls_primary_claim_null_dispatch_lane_yields_unspawnable_head, and hiding a routing gap behind a flag flip is not a fix. Title still says '6 rows' — the live count is 7 (the 7th is lowercase \"new\", not OPEN); title left as minted so the id stays greppable, corrected in .evidence."
  else . end
)
|

# B4 — MINT (one, and only one). Producer-side half. Dedup-checked against the whole board on
#      payload: FIX-SIGNALQUEUE-DUP-ID-GUARD, FIX-SIGNALQUEUE-TRIAGED-NO-EXIT-TRANSITION,
#      FIX-SIGNALQUEUE-OPEN-STATUS-... and the RECEIVER-DELIVERY-CONTRACT family all checked
#      and none covers write-time status validation. See po_not_a_duplicate.
.task_board.backlog += [{
  "id": "FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES",
  "type": "FIX",
  "title": "SignalRowSchema declares status as z.string() with no enum, so orch-apply.sh accepts any status literal — a value in neither the picker set nor TERMINAL_SIGNAL_STATUSES is simultaneously invisible to every consumer and immortal against every prune; 7 live rows are in that state today, one CRITICAL and 10 days old",
  "zone": "cross-service/",
  "priority": "P1",
  "status": "BACKLOG",
  "size": "S",
  "next_agent": "developer",
  "owner": "po",
  "depends": [],
  "supervised": false,
  "plan_only": false,
  "baseline_pass": true,
  "created_at": NOW,
  "created_by": BY,
  "updated_at": NOW,
  "updated_by": BY,
  "dedup_key": "orchapply_writetime_validation:signalrow_status_enum",
  "source": "PO signal-queue hygiene triage, dev-team tick 2026-08-24T07:37Z. Router found one row at lowercase \"new\" and asked whether the match is case-sensitive; it is, and the same read found six more rows at OPEN with the identical two-sided failure. Every predicate below read at source this tick.",
  "root_cause": "There is no write-time validation of .signal_queue.rows[].status anywhere. apps/mcp-server/src/infrastructure/orchStateSchema.ts:284 — SignalRowSchema declares status: z.string(), sitting two lines below severity: z.string() whose adjacent comment (:281-282) explicitly defers the same enum ('canonical enum enforced post-signal-cleanup'), so this is a known-deferred gap rather than an oversight. apps/mcp-server/src/infrastructure/orchStateStore.ts:47 declares status: \"NEW\"|\"READ\"|\"RESOLVED\"|\"PARTIAL\"|\"OPEN\"|string — the trailing |string makes the union structurally equal to string, so the type gives readers a false impression of a closed set while enforcing nothing. scripts/orch-apply.sh delegates all schema checking to scripts/orch-validate.mjs, which imports that same Zod schema, so the fleet's single gated write path admits any string. Consequence is two-sided and that is what makes it a black hole rather than mere noise: (a) INVISIBLE — every consumer matches byte-exactly (cowork-tick-preflight.sh:360 select(.status==\"NEW\"); signal-dashboard/dashboard-protocol.md:86 and :92; dev-team/flow/drain-signals.md:24), and (b) IMMORTAL — the evictor at orch-cold-evict.sh:583 matches .status|IN($tsig_arr[]) against the :181 default READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED,triaged,TRIAGED,RETRACTED. A value outside both sets can never be read and can never be removed.",
  "evidence": "Measured live 2026-08-24T07:37-07:55Z on 118 rows. Status spread: NEW=1, OPEN=6, READ=91, RETRACTED=7, new=1, triaged=12. Seven rows (the 6 OPEN + po-decision-bug5468-2026-08-23T15:27:38Z at lowercase \"new\") are in the unpickable+immortal class; all 7 are to:ops; the oldest, sys-20260814T064300-a29m, is severity CRITICAL and has been stranded 10 days. The lowercase row is the sharper proof: it was written by PO's own decision-recording path 16h earlier, so the defect does not require a rogue producer — the fleet's sanctioned writers can hit it. Note that \"triaged\" (12 rows) and \"RETRACTED\" (7) are ALSO lowercase/ad-hoc-cased values that were only rescued retroactively, by adding both case variants as literal entries to TERMINAL_SIGNAL_STATUSES in FIX-COLDEVICT-TERMINAL-SIGNAL-STATUSES-OMITS-TRIAGED-RETRACTED (2026-08-08) after 226 of 248 rows (91%) had already become unevictable. That fix is the precedent AND the warning: the same class has now recurred with new values, because the 2026-08-08 fix widened the allowlist instead of closing the producer.",
  "files": [
    "apps/mcp-server/src/infrastructure/orchStateSchema.ts",
    "apps/mcp-server/src/infrastructure/orchStateStore.ts",
    "scripts/orch-validate.mjs",
    "scripts/orch-apply.sh",
    "scripts/orch-cold-evict.sh"
  ],
  "ac": [
    "AC-1 DO NOT CASE-FOLD THE CONSUMERS. Read scripts/orch-cold-evict.sh:164-172 before writing any code: a case-insensitive comparison was considered there and DELIBERATELY REJECTED, on the record, because it 'would also silently admit any future accidentally-cased status this list has not explicitly ratified'. A case-fold is a ratified non-fix for this exact class. The ratification must happen at the write.",
    "AC-2 ENUM AT SignalRowSchema. Replace status: z.string() at apps/mcp-server/src/infrastructure/orchStateSchema.ts:284 with an explicit enum. Derive the members from live data plus the two SSOT docs, do not invent them: .claude/skills/signal-dashboard/SKILL.md:83 ratifies triaged and RETRACTED as PO-only extended statuses; :91 names the full terminal set. OPEN's membership is NOT this row's call — it is the open architect question on FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING (AC-2 there). Ship the mechanism so that adding or removing a member is a one-line change, and take OPEN's disposition from that row rather than guessing.",
    "AC-3 GRANDFATHER, DO NOT BREAK THE FLEET. A hard enum applied to the live file rejects the next write from every agent if ANY existing row is non-conforming. Mirror the growth-only pattern already used by scripts/orch-row-prose-ceiling-check.mjs: a pre-existing non-conforming row is a non-blocking WARN; only a NET NEW non-conforming value hard-rejects. Without this the first write after deploy wedges the fleet-wide hot file.",
    "AC-4 FAIL LOUDLY, NEVER DROP. A rejected row must surface with a distinct greppable marker naming the offending id and value. Never silently coerce and never abort in a way that loses the row — same fail-mode hazard as FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID AC-3.",
    "AC-5 SAME TREATMENT FOR severity, OR AN EXPLICIT REFUSAL. severity: z.string() at :283 carries a comment deferring the identical enum, and live data already holds legacy P1/WARN/MEDIUM alongside the canonical five. Either enum it in the same pass or record in the RETURN why it is deliberately out of scope. Do not leave the comment claiming a future cleanup that no row tracks.",
    "AC-6 REGRESSION ON AN UNSEEN VALUE. Prove the gate against a value neither incident produced — status:'Open' or 'pending', not OPEN and not lowercase new. A gate validated only on the values that caused the incident is the shape recorded in feedback_fleetwide_gate_validated_on_one_file_optout_allowlist."
  ],
  "po_not_a_duplicate": "Dedup-checked against every non-terminal lane on the PAYLOAD, not id tokens. Four near neighbours, none covering write-time status validation: (1) FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING (backlog, P1, architect) — the CONSUMER/design half, and the deliberate counterpart of this row: it rules on WHAT the ratified set is and on the to:ops addressee question, this row implements the gate that makes any ruling stick. Enriched with root_cause/evidence/ac in the same triage; the two are explicitly cross-referenced and neither closes the other. (2) FIX-SIGNALQUEUE-DUP-ID-GUARD (backlog, developer) — id-uniqueness at the same choke point, orthogonal dimension: all 7 affected rows have unique ids and would pass it untouched. (3) FIX-SIGNALQUEUE-TRIAGED-NO-EXIT-TRANSITION (backlog, high, architect) — lifecycle question about what follows 'triaged', i.e. transitions BETWEEN ratified statuses; this row is about admitting unratified ones in the first place. (4) FIX-COLDEVICT-TERMINAL-SIGNAL-STATUSES-OMITS-TRIAGED-RETRACTED (landed 2026-08-08) — the direct precedent: it fixed the identical class by WIDENING the consumer allowlist, which is exactly why the class recurred 16 days later with two new values. Read it first; this row exists because that fix was applied at the wrong end.",
  "verification_gate": "(a) Paste the ratified enum and cite where each member came from — SKILL.md line or live-data count — no invented members. (b) Show the AC-3 grandfather path exercised: a live-shaped doc containing a pre-existing non-conforming row must WRITE with a WARN, not reject. (c) Show a NET NEW non-conforming row hard-rejecting, with the AC-4 marker in the output. (d) AC-6 negative control on a third, unseen value. (e) Re-run the live measurement and show the dead-letter count (rows in neither the picker set nor TERMINAL_SIGNAL_STATUSES); state the number explicitly rather than asserting zero. (f) READ-ONLY ON EFFECTS: no Telegram from any test run, no write to the live docs/data/orch/orch-state.json outside the normal gated path."
}]
|

# ── C. Stamps ─────────────────────────────────────────────────────────────────
.signal_queue._updated_at = NOW
| .signal_queue._updated_by = BY
| .signal_queue.last_triaged_at = NOW
| .signal_queue.last_triaged_by = BY
| .task_board.last_triaged_at = NOW
| .task_board.last_triaged_by = BY
