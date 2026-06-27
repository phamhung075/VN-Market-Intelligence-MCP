# Decision Journal — Sprint FRONTEND-FRESHNESS-TRANSPARENCY · dev-mcp-server

**Sprint goal:** Backend L2 data_asof contract for 5 handlers; unblock frontend FreshnessBadge
**Agent:** dev-mcp-server
**Started:** 2026-06-27T20:00:00Z

---

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-27T23:45:00Z
**task-id:** FIX-CI-RED-BA82F2F5-DWF-CADENCE
**what-done:** Updated DWF-phase1-cadence.test.ts slot-count assertion 17→19; tsc clean; 51/51 pass.
**what-considered:**
- Fix test: update 17→19 to match real cowork-schedule.json state (chosen)
- Delete or weaken assertion: ruled out — assertion is a SSOT guard, not a hard rule
**why-decision:** Root cause = 19764c0e added refine-bctc-slot-3+slot-4 (T2 throughput, legitimate) without updating the count assertion. Test reflects schedule truth; correct fix is truth-update.
**why-change:** No change from plan — straight test repair aligning assertion with committed schema.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-27T21:25:00Z
**task-id:** TASK-FFT-L4
**what-done:** Created coverageMapFreshnessChecker.ts (pure domain, zero I/O) + extended freshnessSlaMonitorJob.ts with additive L4 second pass; 25 tests green; tsc clean; 166 tools.
**what-considered:**
- STALE_RISK suppression at domain level (don't return breach) vs scheduler level (postSignal gate)
- marketDigest: use full CHEF agents SQL vs simple MAX(sent_at) without filter — used agents filter (matches L2)
**why-decision:** Domain suppression is cleaner (FreshnessBreachReport has no status field); domain already has isVnMarketHours; suppressing at domain ensures scheduler always receives only actionable breaches.
**why-change:** ARCH-RATIFY-FFT-3 injectable override = injectedRows (pre-parsed objects) not coverageMapPath (as BA spec said) — DDD rule: domain zero I/O.

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-27T20:15:00Z
**task-id:** TASK-FFT-L2
**what-done:** Added data_asof field to 5 handlers using real DB timestamp columns, with empty-sentinel guard in priceHistoryHandler.
**what-considered:**
- Use architect's spec columns verbatim (generated_at/created_at) — would fail: columns don't exist
- Use actual live schema columns (sent_at/triggered_at/updated_at/pushed_at) — correct per contract-from-live-payload rule
**why-decision:** Memory note "Contract from live payload not schema comment" — probed schemas directly, found 3 spec discrepancies (market_summaries.generated_at→market_messages.sent_at; vps_push_log.created_at→pushed_at; alerts.updated_at→triggered_at).
**why-change:** Spec inaccuracies corrected silently; rationale documented in handoff.
