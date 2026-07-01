# Decision Journal — Sprint PREDICTION-EVIDENCE-REVIVAL · qa

**Sprint goal:** Revive input-starved prediction/evidence pipeline — evidence monoculture fix, direction-hardcode bug, dead Sharpe gate, silent insider producer bug (LR job itself not broken).
**Agent:** qa
**Started:** 2026-07-01T07:29:00Z

---

### STEP qa-S1 · qa · 2026-07-01T07:45:00Z
**task-id:** TASK-EVIDENCE-HOP1-MCP
**what-done:** RAW-verified commit 24d1a4b5 (15 files); ran 8 targeted test files (74/0 pass) + full suite (14025 pass/64 fail/4 err/Bun panic); isolation-probed 4 of the failing files standalone — all GREEN, confirming pre-existing parallel/network flakiness (083/102/1146/1518/1875c/1898b class), zero hop1 regressions. tsc exit 0. mock-guard exit 0. DDD: no hand-rolled SQL, no process.env, no secrets.
**what-considered:**
- Accept dev's 131/15-files badge as-is vs re-run raw — re-ran raw per gate mandate, reconciled 74 (8 test files touched) vs 131 (dev's broader claim incl. pre-existing 313 suite) — immaterial, all green either way.
- Full-suite 64-fail vs dev's 60-fail — natural run-to-run variance (see qa notebook cycle-362 42→25/26), not a regression signal since none of the 64 touch hop1 files.
**why-decision:** RISK-1 coupling (cronConfig.ts + WEEKLY→DAILY_CADENCE_MS) confirmed same-commit; FR-1.1 horizon algorithm reuses getLikelihoodRatios (no new SQL), honest-UNTRUSTED no-interpolation confirmed in diff; FR-2.2 watchdog is observability-only, alert text correctly points to FIX-VPS-SSC-INSIDER-502 backlog not systemctl. APPROVE.
**why-change:** cron-registry.json/system-map.json weekly-cadence text now stale (flagged, not in this commit's file list) — routed to BACKLOG per dev's own recommendation, non-blocking doc-registry drift.

### STEP qa-S2 · qa · 2026-07-01T07:52:00Z
**task-id:** TASK-EVIDENCE-HOP2-AGENTS
**what-done:** RAW-verified commit 20264221 (10 files, docs-only). Live-probed evidence_likelihood_ratios (bun:sqlite, named-volume market.db) — confirmed exact seeded evidence_type/direction set matches brief §0-C3 and all 3 flow-doc insertions (news-scout, bctc-analyst, market-watcher) + record_evidence_fragment.md contract fix. YAML of digest-predict/init.md parses OK post FR-3 edit. mock-guard N/A-PASS (docs-only, no production source).
**what-considered:**
- bctc-analyst/flow/stage-analyze.md 154L and market-watcher/flow/cycle.md 253L exceed the 120L split-policy threshold — both already had pre-existing size-justification-header debt (131L/233L) before this task; increment is small (+23L/+20L), directly reuses already-computed signals per own justification, honestly updated headers rather than silently drifting.
- Block on 200L growth vs accept-as-follow-up — accepted as pre-existing non-blocking debt (matches prior QA precedent cycle-352 "systemic ... PO sweep recommended", not a hard gate on THIS docs-wiring hop).
**why-decision:** FR-2.1 evidence_type strings are 100% a subset of the live-verified seeded set (zero invented types); FR-3 correctly strips false Sharpe-gate language without touching the actually-coded P-5 gate. APPROVE.
**why-change:** none from plan.
