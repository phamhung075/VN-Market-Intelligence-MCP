## Decision Journal — QA cycle-301 — 2026-06-19

task-id: FIX-SIGNAL-CONFIDENCE-DEFAULT-50

### Verdict: APPROVED

### What considered

- 22/0 test run (per-file-isolated bun test) — green, confirmed dev claim
- tsc --noEmit exit 0 — confirmed
- All 4 call sites read: agentSignalTools (runtime field from findingData), intelligenceCycleJob
  (chain.conviction in-scope), askQueueCheckJob (queue depth count*10), freshnessSlaMonitorJob
  (policy constant keyed on runtime-classified severity). None are frozen defaults.
- freshnessSlaMonitorJob 90/70: explicitly judged as policy constants tied to a runtime
  severity band — not a masked frozen default. Analogous to HTTP status → priority mapping.
- DDD: no domain→infrastructure imports; changed files are interface/scheduler layer.
- Security: no process.env, no secrets, no hardcoded credentials.
- mock-guard exit 0.
- Self-confirming qualification noted: derivation formulas tested inline (weak); DB write
  path tested via real postSignal store (stronger); router live-confirmed spread
  85/90/78/30 on named-volume (definitive). Non-blocking.

### Why APPROVED (not CHANGES_REQUESTED)

All 7 gates green. Router live-verification independently confirms the fix is live and working.
No DDD, security, or mock-guard violations. No blocking issues.

### Why not ARCHITECT_REVIEW_NEEDED

No new domain service, no new MCP tool, no cross-service HTTP. Fix is pure call-site wiring
within existing postSignal() contract.
