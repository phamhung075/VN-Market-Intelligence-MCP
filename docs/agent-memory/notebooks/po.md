# PO Notebook

_Last: 2026-07-22T16:29Z (dev-team :07 tick — VPS-plane recon returned; 3 rows minted, 1 tracker closed, 2 signals triaged; WIP-saturated triage-only)_

## Tick 2026-07-22T16:29Z — VPS-plane recon RETURNED: spin-out + close the mirror

3 drained signals (cowork-fire telem / dev-mcp-server P1 / ops critical) + 2 NEW signal_queue rows. WIP=2/2 SATURATED → all output lands BACKLOG, nothing dispatched. ONE orch-apply write (task_total 608→611, signals 102→102, both dry-run + idempotency-verified).

**★ The VPS recon (task vps-plane-stale-sources-audit) came back — closed TRACK-CRON-AUDIT-VPS-PLANE (backlog/BLOCKED → done/DONE).** Its precondition ("out-of-band agent returns") is met. Findings split by owner:
- **ops half already handled by ops itself** — `FIX-VPS-SYSTEMD-STARTLIMIT-HARDENING` self-minted 16:21Z, and it already folds the dead-code cleanup (vn-agm-plan/vn-reuters .service) + deploy-script dedup into scope. So I DROPPED my planned dup systemd + dead-code mints. Prior-art check paid off.
- **dev-mcp-server half was NOT on board** — minted the 2 health-measurement false-greens: `FIX-VPS-HEALTH-OFFHOURS-MASK-FALSE-GREEN` (M, off-hours veto double-spends grace isStale() already spent → masks live 36h outage; broad test-impact warning carried) + `FIX-VPS-SBV-HEALTH-SHARED-TABLE-IS-ESTIMATE` (S, add WHERE is_estimate=0; distinct from FIX-USDVND-FROZEN-26110 / FIX-SBV-FETCHER-ZERO-VALUE-EMIT — same incident, different code site).

**★ Ruled the alert-commander selloff-blind flag (a)-HYBRID, not (b)/(c).** Live 16:11Z: VN-Index <1700 -3.58%, watchlist -5..-7%, 20 open HIGH price_drop alerts, 7 price_anomaly signals — yet get_alerts(type=price) EMPTY → 0 position-danger fires, agent fully silent. stopLossHit-only IS correct-by-design for position-danger; the silence is the failure. → `FIX-ALERTCMD-SELLOFF-BREADTH-SILENT` (add a DISTINCT selloff-breadth trigger, do NOT overload stopLossHit). Same class as the 07-20 war-selloff gap.

**Dispositions (no churn):** signal_queue `po-...launchd-presence-not-health` → triaged (both target rows already exist, advisory-only). `cowork-...alertcmd-selloff-blind` → triaged (row minted). Telegram "new" = all `bctcExtractReconcile` EXHAUSTED — owned by SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD, not re-minted. TNB c115 already ACK'd 07-21T21:07Z.

## Carry-over
- WIP=2/2 (DESIGN-COWORK-FANOUT pm + FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD) — pipeline back-pressured: ready=40 can't dispatch. Throughput bottleneck is WIP slots, not triage. New rows await a freed slot (BOUNDED-1/SLS/RLC auto-promote).
- Head still on pm/UC-MDH-P1 DONE_VERIFIED (downstream pm action, not mine — left untouched).
- 3 new VPS/alert rows are HIGH; verify next tick they surface in grooming, not buried in backlog=437.
- Immediate VPS restart + Vinahost inbound-firewall DROP = USER/console action (blocked_by user-escalation-vps-restart), NOT dev backlog.
- calendar_status=unknown persists on cowork-fire (known FAILED FIX UC-CDC-P1) — not re-triaged.
- Prior-art / dedup-first is load-bearing at backlog=437: dropped 2 dup mints this tick by grepping the board first.
