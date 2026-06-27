# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · po

**Sprint goal:** Close the SSOT integrity perimeter so an agent can never be misled about task state and no writer can corrupt the board; make the HARD gate enforce all lanes + dup-key + referential integrity; clean live offenders so it can flip hard-fail without stranding the fleet; route every writer through one gated wrapper; then drain hot-file bloat (Wave 2).
**Agent:** po
**Started:** 2026-06-27T08:05Z

---

### STEP po-S1 · po · 2026-06-27T08:05Z
**task-id:** SSOT-W1-DATA-CLEAN
**what-done:** Opened sprint SSOT-INTEGRITY-PERIMETER and ran the PO-owned data-clean (po-s121.jq) in one atomic gated pass under commit-mutex: PARKED->DEFERRED (park_reason kept), 7x done_verified->DONE_VERIFIED (HSC-1..7), task_board.head re-collapsed to po-s66 stub, dup updated_at/_by dropped; minted ARCH-SSOT-INTEGRITY-PERIMETER->ready[] + pointed .head at architect.
**what-considered:**
- DEFER per devteam-lock rule: dev-team singleton + FIX-BCTC-Q1 lock ARE held — but BCTC work is DISJOINT from orch-state SSOT; no lock on any SSOT task id; WIP=0. Not overlapping -> proceed, NOT defer. The alive dev-team loop IS the dispatch mechanism (head-resume), so PO only feeds the board (single owner).
- Sequencing: data-clean FIRST (mandate 4a) so the gate can later flip hard-fail without stranding the fleet; gate-extension/wrapper/TS = board tasks for architect->pm->dev->qa.
**why-decision:** Clean-then-harden is the only order that lets the gate go hard-fail safely; one atomic CAS-guarded write minimizes the concurrent-write race with the live dev-team loop.
**why-change:** RAW-verify corrected the audit's "7x lowercase done_verified" path — they live at .task_board.closed_sprints[] (sprint ORCH-STATE-HOT-COLD-SPLIT), NOT top-level .closed_sprints[]. Targeted the real path.

### STEP po-S2 · po · 2026-06-27T08:05Z
**task-id:** ARCH-SSOT-INTEGRITY-PERIMETER
**what-done:** Cascaded by board: dispatched architect (hardening brief) via ready[]+.head=in_progress/architect; recorded 15-item ranked_scope in the lean active_sprints[] container (no inline prose) so pm decomposes Wave-1 zone tasks after the brief. Wave-2 (7-10) + defer (11,13,14,15) tracked in scope, not promoted.
**what-considered:**
- only: pre-mint all Wave-1 dev rows now vs let pm decompose after the architect brief — chose pm-decompose (matches dispatch_chain, avoids bloating the 320-row backlog with stubs the brief will reshape).
**why-decision:** architect brief is the design SSOT for ranks 1-4,6-gate,12; pm mints atomic zone tasks from it -> cleaner than PO guessing the decomposition.
**why-change:** no change from plan.

### STEP po-S3 · po · 2026-06-27T12:00Z
**task-id:** SSOT-INTEGRITY-PERIMETER
**what-done:** Hardened the sprint DoD (po-s122.jq, gated atomic) after router RAW-verified the deploy surface: added .verification_gate (4-gap done-when + 3-tier rule_parity), minted SSOT-W1-OPS-REBUILD-ENFORCE (ops, Gap-1) + SSOT-W1-DOC-SYNC-WRITE-CONTRACT (pm, Gap-3), set acceptance="0 direct hot-file writers remain" on ORCH-APPLY-WRAPPER (Gap-2), added SSOT-W2-RULE-PARITY-PROMOTE to ranked_scope (Gap-4). Did NOT touch head (stays FIX-CI-RED) or any flat lane.
**what-considered:**
- Gap-3 brief: back-fill SSOT-INTEGRITY-PERIMETER-hardening.md vs mark directive canonical -> chose CANONICAL (ADD-1/ADD-2 already resolved+shipped; back-fill = doc-theater for zero design value).
- Gap-4 lane-coherence: promote now vs keep warn-only -> KEEP warn-only; 72 live rows mostly legit-DEFERRED/BLOCKED; promoting before data-clean throws every server write.
**why-decision:** A future SIGN-OFF could certify "done" while Point-2 is source-only (container Up 16h), writers bypass the wrapper, docs unsynced, and the two enforcement points carry different blocking sets — the DoD must gate all four.
**why-change:** Schema superRefine blocks head-RI ONLY (orchStateStore L178-183 excludes checkRefIntegrity); rule-parity is a real asymmetry, not a doc nicety — tier2 ref-integrity safe to promote NOW (0 dangling), tier3 lane-coherence gated on 72->0 true-up.
