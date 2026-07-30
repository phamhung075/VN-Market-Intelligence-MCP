# Decision Journal — PO Triage ruling 2026-07-30T09:06Z · po

**Agent:** po
**Started:** 2026-07-30T09:06:00Z
**Why a standalone ruling file:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po.md` is 75158 B / 625 L —
already over BOTH the 36000 B and 600 L caps. Appending would deepen a live breach
(`feedback_ctxbloat_breach_on_live_sprint_file_defer`). Uses the existing standalone-ruling
precedent `ruling-20260725T1101Z-devteam-idle-chain-po.md`.

---

## STEP po-1 — close LAYER2, REFUSE to close its parent P0
**task_id:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2 (+ parent FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD)
- what-considered: (a) close both, per the parent's own stated unblock condition; (b) close LAYER2 only.
- chose (b). LAYER2's own ACs verify clean at source (4 skill sites pathspec'd, 3 init.md RULE 2.5 refs).
  But the parent's objective is `GIT_SWEEP_GUARD_MODE=reject`, and that is unreachable: 39 bare
  `git commit -m` sites remain in docs/agents/ + .claude/skills/, and the highest-frequency actuator
  in the fleet — `scripts/agents-flow/dev-team-tick-preflight.sh:454-455`, `git add` then BARE commit,
  twice hourly — was in NO LAYER's scope because all three arms scoped flow-docs and skills, not scripts.
- why-change: the parent's unblock condition was written before agent-father's scope deferral existed.
  Closing on it would close a 4x-recurring P0 with its objective unmet and the guard inert forever.

## STEP po-2 — unstrand a P0 with a one-field write
**task_id:** SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD
- what-considered: (a) mint a new row for the telegram reconcile flood; (b) find prior art first.
- chose (b), and prior art existed: this P0 already owns it. Its title says "SPIKE (plan-only)" while
  `plan_only` was `null` — invisible to SLS (needs both flags) AND BOUNDED-1 (rejects supervised).
- why-change: no new row. The 3-day "unaddressed" telegram flood was a DISPATCH defect, not a triage gap.
- decisive check: refused the "self-resolved" reading. Producer wrote once at 2026-07-28T11:06:59Z and the
  breaker's last fire was 11:11Z — the silence is the alarm resetting, not a fix. 45.8h stale vs a 48h
  threshold = ~2h from re-tripping.

## STEP po-3 — settle a question the row had already answered
**task_id:** FIX-PUSH-DELIVERY-ERROR-RATE-ALERT
- what-considered: single-FIX vs ba->architect split (5 BOUNDED-1 declines on this exact prose).
- chose: architect splits. Not a judgement call — `zone` was already `multi`, and po/flow/main.md defines
  `multi` as "architect must split". 5 dispatcher cycles were spent on a question the zone field answered.
- why-change: removed the prose from the title (it WAS the blocker) + set supervised+plan_only so SLS
  can route it. P2->P1: two undetected outages (07-04 RCA 69h, 07-15 gateway origin), 26 days open.

## STEP po-4 — ratify DRS design; refuse two of three widenings
**task_id:** FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE
- Q1 allowlist: RATIFIED NARROW. agent-father excluded — its rows edit the files that define every other
  agent (fleet-wide blast radius), and its most recent supervised dispatch made a unilateral scope
  deferral whose follow-up was never minted. That is exactly the judgement an unattended lane cannot make.
  ops excluded (infra-mutating; repeated destructive-fallback history). qa excluded (wrong mechanism).
- Q2 system-auditor: NO. 0 live rows ⇒ unfalsifiable by construction, nothing to dry-run
  (`feedback_gate_widening_recommendation_requires_actuator_dry_run`).
- Q3 unconditional-`.head`-overwrite row: YES, mint now. 3 call sites verified from source, sibling already
  has a live dry-run showing silent clobber, and `.head` is occupied THIS TICK by a running supervised task.
- added input the brief lacks: 41 rows carry supervised=true + plan_only!=true (4 P0). Some have a DEV
  next_agent, so they are outside the brief's non-dev set yet still invisible to both lanes. DRS as
  specified would not pick them up. Implementer must reconcile or explicitly scope out.

## STEP po-5 — release WF-2 hold on independent basis, not the relay
**task_id:** FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD
- what-considered: (a) stamp on the coordinator's RAW-verify report; (b) verify myself first.
- chose (b). Stamping on a relayed verdict makes the supervised gate vacuous — PO is the ratifier of record.
- verified: brief 27867 B, commit d4ac06223 real, and `_build_row_json()` really is a single choke point
  (defined :321, called once :468) so the provenance hardcode cannot be bypassed.
- corrected the relay: it described the provenance hardcode and tier1-probe breadcrumb as already in place.
  Neither is — grep finds no `provenance` in emit-audit-signal.sh and no AUD-CP-1/breadcrumb in
  tier1-probe.md. Correct for a design brief; recorded so the implementer does not assume half shipped.
- added AC: verify the breadcrumb lands OUTSIDE the verdict-mapping span. tier1-probe.md:167-171 already
  burned this project once with a tautological veto that pre-empted the severity map.
- confirmed release by RUNNING dev-team's own predicate: `SHOULD_HOLD=false`. Did not assume the key matched.

## STEP po-6 — SLA/telegram flood: verified fixed, refused to mint
- what-considered: minting FIX rows for the recurring `sbv_fx` / `signal_quality_audit` / bctc SLA breaches.
- chose: mint NOTHING. `get_sla_status` live = 5/5 ok. The `signal_quality_audit` 48h->30d threshold
  correction is commit 88863a82d (06:23Z today) and IS deployed — grepped `43200` inside the running
  container, image built 08:27:58Z. bctc likewise 10080. The class was fixed ~30 min before this triage.
- why-change: a 3-day-old telegram backlog read as "ongoing systemic issue" was largely a fixed defect's
  historical exhaust. Residue is 266 unresolved reports (not 20 — the tool's limit hid the true extent),
  newest 2026-07-30T03:30Z, and that volume is burying genuinely new alerts (audit-output-contract,
  signal-outcome-resolution liveness). Receiver-side gap already tracked: FIX-TELEGRAM-REPORT-ACK-STATUS-
  STOP-RESURFACE (P3), FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE (P1/ready).
