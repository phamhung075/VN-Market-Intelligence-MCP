# Decision Journal — Sprint PREDICTION-EVIDENCE-REVIVAL · ba

**Sprint goal:** Revive the starved evidence->likelihood-ratio->validation chain so digest-predict emits fresh prediction claims again.
**Agent:** ba
**Started:** 2026-07-01T06:07:59Z

---

### STEP ba-S1 · ba · 2026-07-01T06:07:59Z
**task-id:** BA-PREDICTION-EVIDENCE-REVIVAL
**what-done:** Live-probed named-volume market.db (bun:sqlite exec in mcp-server container) instead of trusting the router-verified board framing at face value; wrote FR/NFR/blocker spec to docs/handoffs/BA-PREDICTION-EVIDENCE-REVIVAL.md.
**what-considered:**
- Accept PO's "n=0 everywhere" + "LR job needs to be found/built" framing verbatim — REJECTED, live probe shows LR job (baseRateComputationJob) exists, is wired, runs weekly and succeeds; the real gap is input monoculture (48/48 fragments = 1 evidence_type) plus a hardcoded bullish/10d lookup bug in get_evidence_summary masking the one row that IS trusted (n=18).
- Accept "Sharpe>1.0 gate unsatisfiable at n=0" as a hard code gate — REJECTED, traced to an unwired identity-level workflow block in digest-predict/init.md; the actual coded P-5 gate only neutralizes LR to 1.0, never blocks create_prediction_claim. Flagged as PO-intent blocker B1 rather than assumed technical fact.
- Accept FIX-PREDICTION-SIGNALS-EMPTY as literally the same starved chain — REJECTED, traced to predictionMarketJob.ts (Polymarket poll), a code-distinct pipeline; flagged as scope-correction + blocker B3.
**why-decision:** BA's job is to ground requirements in live-verified fact, not relay upstream framing; three of PO's four premises did not survive a code+DB probe, and specing against the wrong root cause would send architect down a dead end.
**why-change:** Reframes work-item (a) from "build/repair a missing job" to "fix an input-starved+buggy-lookup existing job"; reframes work-item (c) from "design a statistics bootstrap" to "resolve a business-intent question about whether a gate should exist at all"; adds a scope-correction on FIX-PREDICTION-SIGNALS-EMPTY. Net: same three work-items PO named, corrected root-cause + 4 new PO-only blockers (B1-B4) surfaced by evidence, not invented.
