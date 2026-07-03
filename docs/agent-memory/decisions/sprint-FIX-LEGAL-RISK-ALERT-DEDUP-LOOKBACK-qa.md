# Decision Journal — Sprint FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK · qa

**Sprint goal:** Gate dev-mcp-server's two-tier fix for legal_risk CRITICAL alerts re-firing every alert-commander cycle for up to 30 days
**Agent:** qa
**Started:** 2026-07-03T19:52:00Z

---

### STEP qa-S1 · qa · 2026-07-03T20:10:00Z
**task-id:** FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK
**what-done:** Re-ran (did not trust dev's reported numbers) — isolated new test file 7/7 pass; broadened adjacent-suite net (14 files via case-insensitive keyword grep, wider than dev's claimed list) 124/124 pass; `tsc --noEmit` clean; `gen-project-stats.ts --dry-run` confirms toolCount=183 unchanged; full suite run TWICE independently (66-69 fail / 5-11 errors across 1170 files, both << ceiling 348), every fail line mapped to 20 unique source files, none import the 2 changed modules, 0 keyword hits for legal_risk/alertVerdict anywhere in either ~22K-line log.
**what-considered:**
- Trusting dev's "118/118 pass, 11 files" claim as-is: REJECTED — task explicitly requires independent re-run; also found a broader 14-file adjacent set (dev's grep net was narrower) and both full-suite runs surfaced more fails (66-69 vs dev's 62) — needed to confirm none of the delta is attributable to this diff, not just accept the aggregate number.
- Whether TC4 dedup violates alert-policy.md's "never suppress legal_risk" clause: investigated `write_alert_verdict`'s call site in `stage-dispatch-log.md:24` — confirmed it fires strictly AFTER `send_telegram`, so the dedup guard cannot gate the actual CRITICAL alert dispatch; it only prevents duplicate PENDING bookkeeping rows for an already-fired event. No-suppression intent is about the fire-decision (`stage-signals.md`'s unconditional CRITICAL rule, untouched), not verdict bookkeeping.
- Full-suite fail delta (66-69 now vs 62 in the same-day cycle-374 baseline pre-dating this commit): considered as a possible regression signal. REJECTED as such — mapped every one of the 66 fail lines (run 2) to 20 unique test files, none import `legalRiskTools`/`alertVerdictTools`/`alertVerdictStore`; cross-run variance (66 vs 69, 5 vs 11 errors) on IDENTICAL code between my own two runs is itself proof of pre-existing flakiness (a deterministic regression would reproduce identically both runs).
**why-decision:** Both gate-scope security/DDD checks pass unchanged from established project convention (interface layer legitimately imports infrastructure per ARCHITECTURE.md L7; domain/ untouched). Shared `days=30` default verified intact via grep across all 6 other agent-flow consumers — not just trusting the commit message's claim.
**why-change:** No change from router's gate scope. One addition beyond the 4 listed items: flagged an out-of-scope, pre-existing systemic finding (3 OTHER already-merged dev-mcp-server notebook entries — commits 85267b624/1a9cda30b/e73a53688 — still carry the raw coordination-session UUID unscrubbed, predating this task) as a recurring-pattern follow-up, not a blocker on this specific gate (the 2 commits under review, 3badf5fe5/ce4051a7b, are themselves clean).
**verification:** Verdict APPROVED. Full detail in `reports/TASK_REPORT_FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.md`.
