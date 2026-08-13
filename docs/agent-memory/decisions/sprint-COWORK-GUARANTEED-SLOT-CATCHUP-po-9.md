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
