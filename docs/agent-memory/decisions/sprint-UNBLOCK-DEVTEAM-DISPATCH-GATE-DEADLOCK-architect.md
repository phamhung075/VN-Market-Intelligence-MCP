# Decision Journal — Sprint UNBLOCK-DEVTEAM-DISPATCH-GATE-DEADLOCK · architect

**Sprint goal:** UNBLOCK — repair the dev-team board-drain deadlock (dead WIP gate + no ready/review-lane consumers) per PO ruling `sprint-UNBLOCK-DEVTEAM-DISPATCH-GATE-DEADLOCK-po.md`.
**Agent:** architect
**Started:** 2026-07-22T00:00Z

---

### STEP architect-S1 · architect · 2026-07-22T00:35Z
**task-id:** UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK
**what-done:** Implemented all 4 PO-ruling components: (1) WIP gate formula corrected to `in_progress` length ONLY (BOUNDED-1 + SLS, `main.md` + `promote-bounded1.jq`); (2) new Ready-Lane Consumer (`devteam-backlog-claim-ready-lane-consumer.jq`) draining the 25 stranded PM/architect epic-decomposition rows in `ready[]` that carried no `promoted_by` marker and were therefore unclaimable by BOUNDED-1/SLS; (3) new Review-Lane QA-Drain (`devteam-review-claim-qa-drain.jq` + qa/flow/main.md `verify-committed` mode) folding `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`; (4) new satisfiability DoD instrument `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (fires+drains against the live ready=36/in_progress=1/review=32 shape, not lane-resolution). Extracted a shared `scripts/lib/devteam-eligibility.jq` predicate library (SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW design principle), migrating BOUNDED-1/SLS/report-script off 3 independently hand-copied def sets.
**what-considered:**
- QA-drain dispatch via the existing `pipeline` JUMP-TO (git-checkout-based) — REJECTED: all 32 live `review[]` rows have `branch:null`; would guarantee-fail every dispatch (PO AC(2), confirmed empirically).
- Leave `bounded1-supervised-lane-report.sh` as THE acceptance gate — REJECTED per PO explicit instruction: it tests lane-resolution, not satisfiability, and was the exact false-green that shipped an inert SLS. Kept the script (still correct for what it tests, migrated to shared lib) but built the new satisfiability instrument as the real DoD gate.
- RLC picking purely by priority_rank with no depends_on gate — REJECTED after finding CCATO-MCP-T3/T5-T8, SYSREMAKE-P2-T2..T9, DESIGN-COWORK-FANOUT-T2/T4/T7/T8 carry real sequential `depends_on` chains onto siblings; verified live (`CCATO-MCP-T1` picked over `T3`, `T3` correctly excluded pre-`T1`-DONE_VERIFIED).
**why-decision:** Gate-formula fix alone does not drain the 25 epic children (no claimer recognizes them) or review[] (no consumer exists at all) — matches PO's explicit "BOTH, decomposed" ruling; each of the 4 components addresses a distinct, independently-verified non-overlapping failure mode.
**why-change:** No change from PO ruling scope. Added the qa/flow/main.md `verify-committed` mode beyond the router's original 6-file FILES: list after brownfield investigation found it a genuine hard blocking dependency (100% of review[] rows branch:null) — extend-not-duplicate, additive-only entry point, `pipeline`/`approved`/`changes-requested` untouched.

### STEP architect-S2 · architect · 2026-07-22T00:40Z
**task-id:** UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK
**what-done:** Verified every change against real data before commit: (a) jq candidate-set parity diffs (BOUNDED-1 148/148, SLS 15/15 identical pre/post shared-lib migration); (b) full-script dry-runs on scratch copies of the LIVE board — never mutated `docs/data/orch/orch-state.json` directly; (c) `bun scripts/orch-validate.mjs` (Zod) + `bun scripts/orch-conservation-check.mjs` green on every candidate; (d) `devteam-dispatch-gate-satisfiability.sh` run live: all 4 lanes fire+drain against the actual ready=36/in_progress=1/review=32 board, negative control (WIP=2 cap) confirmed non-bypassable; (e) `bounded1-supervised-lane-report.sh` re-run post-migration: 16/16 unchanged (matches architect's own 2026-07-21 notebook claim); (f) shellcheck clean on all 3 new/touched bash scripts; (g) fence-balance + jump-anchor length/uniqueness checked on both edited flow docs.
**what-considered:** only path — RAW live-data verification before any DONE claim (`feedback_router_verify_raw_not_badges`); no shortcut considered given this is the exact false-green failure class this task exists to fix.
**why-decision:** Standing lesson `feedback_ship_completion` + `feedback_trust_verification_is_system_job` — a design/implementation for a dispatch-gate bug is worthless without proving it actually fires on the real saturated board, not a synthetic toy case.
**why-change:** no change from plan.
