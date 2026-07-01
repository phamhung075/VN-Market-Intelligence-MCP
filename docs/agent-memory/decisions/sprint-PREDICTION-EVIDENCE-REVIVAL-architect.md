# Decision Journal — Sprint PREDICTION-EVIDENCE-REVIVAL · architect

**Sprint goal:** Revive starved evidence->LR->validation chain so digest-predict emits fresh prediction claims again
**Agent:** architect
**Started:** 2026-07-01T06:38:55Z

---

### STEP architect-S1 · architect · 2026-07-01T07:05:00Z
**task-id:** BA-PREDICTION-EVIDENCE-REVIVAL
**what-done:** Brownfield-verified both hops live; live-probed FR-2.2 (docker exec + logs) to a confirmed silent-bug verdict instead of leaving it open for dev; corrected 4 BA/PO path/naming errors (tools_package filenames, detectAccumulationStreaks location, seeded evidence_type set, FR-2.2 verdict).
**what-considered:**
- FR-1.1 horizon fix: fixed horizon=10 (keep old default, only fix direction) vs try-all-3-horizons-pick-best — fixed-10 fails to surface the live n=18 bearish/5d TRUSTED row PO explicitly wants surfaced.
- FR-2.2 fix scope: chase the VPS→SSC 502 root cause now vs close the observability gap only — chasing needs live VPS SSH (out of sandbox reach, may be unfixable external-site outage) and would blow PO's explicit "no scope balloon" instruction.
- FR-2.1 evidence_type strings: keep BA's proposed names (bctc_revenue_growth etc, cold-start) vs redesign against actually-seeded types — live-probed evidence_likelihood_ratios and found BA's names were never seeded (tool-docstring examples, not real data).
**why-decision:** Each choice picked the option that is live-verified-correct and honors PO's explicit constraints (honest-UNTRUSTED-no-interpolation for PER-1; no-scope-balloon for B2; reuse-seeded-strings for PER-3) rather than the literal (but unverified) BA/PO wording.
**why-change:** BA/PO spec's own FR-2.1/FR-2.2/§9 details were reshaped based on live verification, not blind implementation of the handoff as written; scope boundaries (2 hops, B1-B4 decisions) unchanged.
