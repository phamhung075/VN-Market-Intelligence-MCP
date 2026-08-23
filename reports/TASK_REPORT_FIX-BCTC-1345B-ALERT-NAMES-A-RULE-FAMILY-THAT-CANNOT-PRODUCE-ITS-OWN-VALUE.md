## Task Report FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE
changed: [apps/mcp-server/src/domain/services/financial-reports/confidenceFinancialReasonBuilder.ts, apps/mcp-server/src/__tests__/FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY.test.ts]
commit: 1854156a6 (round 2, redispatch after QA CHANGES_REQUESTED on 7ac55adc8, 2026-08-14)
tests: 11/11 pass (targeted) + 83/83 pass (wider BCTC/DDD suite) / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
verdict: DONE_VERIFIED (Direct-Commit Verify)

### Notes
- AC-2 gap from round 1 (matchesVnmVeaSignature gated on rule-membership alone, letting BCTC-VAL-03 stack with VAL-05/VAL-01-SCALE and land confidence on 0.4/0.6 — values the VNM/VEA rule family can never produce) is closed: gate is now `violations.length===1 && rule∈{VAL-01,VAL-03,VAL-10}`. Hand-traced the rule cascade in `financialFiguresRules.ts` to confirm `violations.length===1` structurally guarantees confidence∈{0.0,0.8} — the fix is logically sound, not just test-shaped.
- Non-blocking: commit message / status_note narrate the 2nd new regression test as landing confidence=0.4; live-verified actual is 0.6 (VAL-03+VAL-01-SCALE, both 0.2 penalties). Narrative-only mismatch — the test's own assertions are internally consistent and pass, and both 0.4/0.6 are equally outside the AC-2-mandated {0.0,0.8} set.
- AC-1/AC-3 already confirmed met in round 1, untouched by this commit. AC-5 (non-goal scope) respected.
