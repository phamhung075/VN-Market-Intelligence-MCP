# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (continuation 9)

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise — bounded exactly-once catch-up for a slot whose window elapsed during standby/session-down, or a structured (non-silent) miss.
**Agent:** po
**Started:** 2026-08-13T18:09:52Z
**Rolled from:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-8.md` (37262B > 36000B byte cap, CAP-REACHED sentinel already present)

---

### STEP po-S159 · po · 2026-08-13T18:09:52Z
**task-id:** CLEAN-TREEMAP-REGISTER-10-ORPHAN-POLICY-PROTOCOL-DOCS + FIX-SPRINTGOAL-STATUSLESS-ENTRY-STRUCTURALLY-UNEVICTABLE + COWORK-GUARANTEED-SLOT-DURABILITY (closure)
**what-done:** Triaged claude-manager-helper's two 2026-08-13T16:15Z audit findings (rerouted by router after CMH emitted no Pass 10 RETURN and no signal_queue row); one `orch-apply.sh` write closed the sprint_goal cap breach and minted 2 backlog rows.
**what-considered:**
- Pass 5 cap: raise cap 15→16 (rejected — hides growth, cap is the detector) · close an arbitrary PLANNING entry (rejected — all 15 others are live) · close the ONE entry that is structurally un-retirable (chosen)
- Pass 1 tree-map: bulk-register myself (rejected — DAG placement is architect's job per tree-map.md:418) · dismiss as false positive (rejected — I re-verified all 10 are tracked with 0 map hits) · mint architect row with resolved paths + acceptance (chosen)
**why-decision:** COWORK-GUARANTEED-SLOT-DURABILITY was never a sprint goal — a 2026-07-07 PO *ruling* record shaped `{id,ts,by,vision,ruling,brief}`, carrying neither `sprint_id` nor `status`, so `checkSprintGoalStatusCanonical()` early-returns on it and `orch-cold-evict.sh`'s TERMINAL predicate cannot key it. It was the only entry no automated path could ever remove, hence the one that overflowed. Its ruled-on deliverable SHIPPED (QA-verified 25/25, commit `4df3d1545`, launchd plist live) and its residual scope is carried by the still-active successor CATCHUP sprint — so closing is recording reality, not abandoning work.
**why-change:** Went beyond the referral by minting the root-cause FIX: closing the entry alone leaves the class intact, and orchStateSchema.ts § 11's own header records this array previously hitting 26 vs cap 15. Symptom-only closure would have guaranteed recurrence.

### STEP po-S160 · po · 2026-08-14T03:35:04Z
**task-id:** FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER
**what-done:** Signed off REVIEW→DONE_VERIFIED after repairing the 4 rows whose missing `next_agent` was holding the row's own acceptance gate red; minted FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER into ready[].
**what-considered:**
- Sign off on architect's note as written (rejected — its own text says the PRIMARY gate FAILS live; I re-ran it, exit=1, so "recommend sign-off" and the evidence contradicted each other)
- Rework back to architect (rejected — the red gate is a *data* defect in 4 unrelated rows, not a defect in the mechanism architect shipped; reworking would punish the wrong artifact)
- Hand-repair only (rejected alone — fixes 4 rows, prevents nothing; ages 15-58d prove the class recurs)
- Mint-only, leave gate red (rejected — leaves this row's own AC unmet for an unbounded wait)
- Hand-repair + mint the enforcement row + sign off (chosen)
**why-decision:** The AC demanded an executable showing ZERO dispatch-lane=none, run live. Every failing row carried a `zone` that *deterministically* names its handler via zone-routing.md Step A, so supplying `next_agent` was derivation, not the invention architect correctly refused under plan-only authority. Post-repair: report exit=0, PRIMARY 5/none:0, SECONDARY 77/none:0; verifier 24/24. The prior "no sign-off without a live fire+drain" hold is met by this row's own history — SLS promoted+claimed it live 08-07, review-lane drain routed it here 08-14.
**why-change:** Went past the referral: recorded in the row that the gate is green because of mechanism AND my repair, not mechanism alone. A future reader must not cite this PASS as proof the sweep is self-sustaining — it is not yet, which is exactly what the minted row buys.

### STEP po-S161 · po · 2026-08-14T06:56Z
**task-id:** UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL (primary) · OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (the row being un-certified)
**what-done:** Restored `OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX` from `archive/2026-08.json` `.done_tasks[]` into hot `review[]` at **BLOCKED**, retracted its QA certification in place, and banner-marked its falsified "MUST NOT BE RE-DIAGNOSED" instruction; cross-referenced `FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED` as the live tracking row.
**what-considered:**
- Status REVIEW + `next_agent=qa` (rejected — invites a second re-review of a crash loop already owned by the LANCECORE row; two open rows racing the same diagnosis is what produced 5 no-op folds)
- Status BLOCKED in `review[]` + `blocked_by` LANCECORE (chosen — lane-coherent per `LANE_ALLOWED_STATUSES.review`, non-terminal so `orch-cold-evict.sh` cannot re-evict it, and it states the dependency instead of manufacturing work)
- Leave the cold copy in place and only add a hot row (rejected — two copies with contradictory statuses IS the misdirection being removed)
- Leave a same-id tombstone in `.done_tasks[]` (rejected — `orch-cold-evict.sh:873` content-dedupes new cold rows against `.done_tasks[].id`, so a tombstone would silently swallow this row's eventual real closure record)
**why-decision:** Kernel dmesg (inside the Docker Desktop VM, the source this row's own commit `ca6d86869` designates as authoritative because `docker inspect .State.OOMKilled` is a known false-negative here) shows three memcg OOM-kills of the exact container QA certified — 2026-08-12T13:46:51Z (+1h00m), 14:00:57Z (+1h14m, invoker `lancedb-tokio-w`, the precise thread this row's fix pinned), 2026-08-13T09:20:09Z (+20h34m). A DONE_VERIFIED row whose subject was killed by the kernel three times after certification is not a record, it is an instruction — and this one explicitly tells the next actor not to re-diagnose. So the falsification had to land on the artifact itself, not only in a notebook. Removed the row from cold rather than duplicating it, recording the move in a new `.restored_to_hot[]` array in the archive (additive; the archive's own 4-key existence check at `orch-cold-evict.sh:871/980` is unaffected).
**why-change:** Went past "revert the status": also renamed `qa_verified_at`/`qa_verified_by` to `*_RETRACTED` and flagged `.verification.retracted=true` with the AC-3 probe's `live_value_observed` prefixed RETRACTED. A status flip alone leaves three independent green certification signals on the row for any predicate or reader to key off — reverting the status while leaving `qa_verified_at` intact is the same partial-write shape as the closure being corrected.
