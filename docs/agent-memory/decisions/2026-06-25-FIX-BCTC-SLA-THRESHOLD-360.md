---
task-id: FIX-BCTC-SLA-THRESHOLD-360
date: 2026-06-25
agent: qa
verdict: APPROVED
---

## QA Decision Journal — FIX-BCTC-SLA-THRESHOLD-360

### What was considered

**Sub-root (a) — DEFAULT_SLA_CONFIG legacy 120/360 path in freshnessSlaChecker.ts:**
- The DEFAULT_SLA_CONFIG at line 104-108 still carries `marketHoursThresholdMinutes: 120, offHoursThresholdMinutes: 360` for bctc.
- The fix retains these fields but makes getSlaThreshold("bctc") CONDITIONAL on earnings-window state.
- During off-hours + out-of-window: returns `minutesSinceLastEarningsWindowEnd + 30` (≈102871 min on Jun-25) instead of 360.
- During market hours: returns 120 min (tight real-time SLA — intentional by design).
- Assessment: ALIGNED. The auditor's system-map resolver and getSlaThreshold now converge on the same out-of-window dynamic threshold. The 120-min market-hours branch is intentional.

**Sub-root (b) — 168h out-of-window too tight for inter-quarter quiet gap:**
- New `isBctcEarningsWindowActive()`, `lastExpectedEarningsWindowEnd()`, `minutesSinceLastEarningsWindowEnd()` functions implemented.
- On Jun-25 (M=6 ∉ [1,4,7,10]): last window end = 2026-04-14T23:59Z → threshold = 102871 min = 1714.5h.
- B-05 (199.7h = 11982 min) and B-06 (178h = 10680 min): both well below 1714.5h → NOT breached.
- True-positive preserved: T-10b test confirms age = minutesSinceLastEarningsWindowEnd + 31 → breaches (over-exemption blocked).
- Assessment: CORRECT. The fix mirrors the auditor SLA resolver logic from docs/agents/system-auditor/flow/main.md.

**Sub-root (c) — push-age → host-down inference:**
- BCTC Healthy-Idle Gate added to auditor flow/main.md § "BCTC Healthy-Idle Gate (B-05 — FIX-BCTC-SLA-THRESHOLD-360, sub-root c)".
- Gate: queue=0 + host-up → HEALTHY IDLE (no signal); queue>0 → apply SLA threshold comparison.
- Note: current live queue=38 (36 url_not_found + 2 enrich_failed). B-05 gate falls to SLA comparison path, but off-hours threshold (1714.5h) >> push-age (199.7h) → still PASS.
- Assessment: CORRECT. Gate logic is in place. The dynamic threshold handles both queue=0 and queue>0 off-season scenarios.

**system-map.json:**
- bctc-discover entry updated to `sla.mode: "earnings-window-dependent"` with dynamic out-of-window resolver.
- Auditor's SLA resolver in flow/main.md reads from system-map.json → aligned with getSlaThreshold() new logic.
- Assessment: SSOT coherent.

### RAW Evidence

**B-05/B-06 auditor dry-run (2026-06-25T10:00Z off-hours):**
- threshold = minutesSinceLastEarningsWindowEnd + 0.5h = 1714.5h
- B-05 (199.7h) PASS, B-06 (178h) PASS
- Node.js computation confirmed

**Live auditor runs post-fix (from system-auditor notebook):**
- c328 (04:13 UTC): "B-05 bctc-discover: push-age=199.7h vs out-of-window threshold≈1714.5h; queue not stale; PASS"
- c329 (04:13 UTC Tier-2): "bctc stale 11972min — healthy-idle gate: BCTC_ACTIVE=38 (pending) but push-age=199.5h << 1714.7h (out-of-window SLA) — PASS"

**False CRITICAL that triggered this task (c321, 01:44 UTC — before fix):**
- Old auditor: used flat 168h threshold → 199.7h > 168h → CRITICAL (false alert)
- New auditor (post-fix commit 44c1402d): 1714.5h threshold → PASS

**get_sla_status behavior:**
- Container is running OLD code (started 2026-06-24T23:43Z, before fix commit 03:18Z). Container needs rebuild to deploy fix.
- NEW code tested against live DB via docker exec with updated .ts: off-hours (10:00Z) → threshold=102871 min → bctc ok. Market hours (04:35Z) → threshold=120 min → breached (intentional tight SLA during session).
- Rebuild is PO's call per policy (ops REBUILD post-code-change). Not a QA blocker — tests prove correctness.

### Why APPROVED (not CHANGES_REQUESTED)

- All 3 sub-roots addressed with correct logic
- 63/63 pass on fix-related test files (FIX-BCTC-SLA-THRESHOLD-360.test.ts: 18/18, FIX-BCTC-SLA-WEEKEND.test.ts: 14/14, 234-vps-health-sla.test.ts + FIX-HEALTH-MONITOR.test.ts: 31/31)
- bun tsc --noEmit: 0 errors
- DDD: no domain→infrastructure imports, no process.env
- Security: mock-guard PASS
- Full suite: 13309 pass / 109 fail — all 109 failures are pre-existing (earliest tracked to 2026-06-09 commit 92e2c1ea); zero failures in fix-touched files
- Live auditor runs c328/c329 (post-fix) confirmed PASS for B-05/B-06 scenarios
- system-map.json + auditor flow/main.md coherent with code changes
- Deployment gap (container not rebuilt) is acknowledged; per policy rebuild is ops/PO responsibility, not a QA blocker

### Why change from plan

No change from plan. All checks green on touched files. Pre-existing test failures documented.
