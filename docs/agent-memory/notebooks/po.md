# PO Notebook

_Last: 2026-07-25T07:39Z (user demand — auto-alert for stale-at-rest data + auto-remediate; COMPANION sprint FRESHNESS-AUTO-REMEDIATE minted, architect design SPIKE)_

## Tick 2026-07-25T07:35–07:41Z — freshness-auto-remediate kickoff (user demand, router-dispatched)

**DISTINCT from the 07-29Z input-validation sprint.** That gates bad writes at INPUT time; THIS catches data going stale OVER TIME (detect-at-rest → auto-remediate → anti-spam). Tightly coupled to the freshness sprint, so I FOLDED — did not mint a parallel duplicate.

**Prior-art gate confirmed the boundary in code, not assumption:**
- `FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING` (READY, dev-mcp-server) already owns DETECTION+EMIT verify-live. Kept it SEPARATE — did NOT widen (it is about to execute; widening bloats + hits the health-recheck stale-duplicate footgun).
- `coverageMapFreshnessChecker.ts` + `freshnessSlaMonitorJob.ts` = the detector/job (reused, not rebuilt). `frontend-data-coverage-map.json` SSOT — its `.writer` field names who refreshes each surface = the triage input.
- `apps/alert-engine/pkg/primitive/{dedup-key-builder,cooldown-gate}` = anti-spam (reuse, not rebuild). `emit-audit-signal.sh`+`po-s*` jq = anomaly→BACKLOG bridge.

**DECISION: companion sprint `FRESHNESS-AUTO-REMEDIATE` (PLANNING) + ONE architect SPIKE `SPIKE-FRESHNESS-REMEDIATE-TRIAGE` (backlog/P1/M, supervised, plan_only, timebox 120, next_agent=architect).** No implementation row — architect/PM/BA decompose from the spike. Mint minimally.

## Carry-over
- **The signal is a DEAD END today.** `freshnessSlaMonitorJob.ts:538-548` (DS-OBS-01-FIX) — alert-commander SUPPRESSES `freshness-sla-monitor` urgent_news as infra noise every cycle. So detection fires but no fix is ever picked up: this is WHY the user still sees stale pages. The spike's crux = REDIRECT the signal off alert-commander onto the po/dev-team signal_queue drain.
- **Detection is only 10% wired.** `ENDPOINT_DB_QUERY` maps 5 of 50 coverage-map surfaces to DB queries; the other 45 are silently skipped. "Many pages not updating" can't even be DETECTED yet — widening endpoint coverage is a spike input, not just a nicety.
- **The 'intelligent' classifier already half-exists.** `queryBctcPipelineRuntimeState` (queueDepth+serviceActive) is the exact idle-vs-crash discriminator — but bctc-only. The spike GENERALIZES that reader across surfaces via `.writer`; broken-code→dev FIX, healthy-idle→re-invoke refresh agent (resolve owner from system-map, never hardcode).
- **architect busy on IVC-ARCH-BLUEPRINT** — spike is BACKLOG+supervised so it queues, no BOUNDED-1 collision.
