# PO Notebook

_Last: 2026-06-19T17:31:18Z_

## Carry-over
- review[] (3, all LIVE/behavioral gates, NOT router-resolvable): FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-BCTC-ENRICH-SILENT-0ROWS, ARCH-SHIP-WAVE-REAUDIT.
- Push deferred out-of-band (launchd com.vn-market.fleet-push). 2x fleet-push-abort this tick = three-dot classifier correctly DEFERRING (ahead 43 / behind 62, benign cloud-chore) — NOT a regression, NO task minted.
- ready[2] dispatched this tick → router spawns; in_progress will fill. WIP now at 2 (max).

## This cycle — dev-team tick 2026-06-19T173118Z (GATEWAY-BLIND local spawn; board+git+fs only)
RETURN = BATCH(2). WIP 0 → 2. Script: scripts/po-s110-orphan-cowrite-promote-auditor-writebug-mint.jq (atomic; conservation ready+2/backlog-1/sig_new-6, placement, idempotent re-run delta 0).

SLOT 1 (FIX → dev-mcp-server, HIGH): PROMOTED FU-ALERT-COWRITE-SCHEDULER-JOBS backlog→ready (was MEDIUM, escalated). This is the DURABLE ROOT of sau-c08 orphaned alerts (router RAW-verified LIVE 33 orphaned/119 alerts-24h, recurring 103 06-13 → 63 06-18 → 33 now). 3 scheduler jobs (taAlertScanJob/bbAlertScanJob/foreignFlowAlertJob, files confirmed on disk) INSERT INTO alerts directly, skip storeAlerts co-write → genuine orphans. Dep FIX-ALERT-ORPHAN-CORRELATION already shipped (7cbca67a/556eb214). DoD: route all 3 through storeAlerts atomic co-write; live orphan-delta→~0; generic all tickers.

SLOT 2 (UNBLOCK → agent-father via agent-md-factory, HIGH): MINTED FIX-AUDITOR-SIGNAL-WRITE-WRONG-KEY → ready. META-BUG that swallowed C-08 ~1.5d: system-auditor signal emit writes .signal_queue[N] numeric keys instead of .signal_queue.rows[] → findings invisible to PO. Also swallowed rag-service degraded this tick + legacy junk keys 0/1/2. DISTINCT from FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK (done_verified = row SHAPE, not write KEY). Fix: append to .rows[] + post-write read-back self-check. Per Agent .md factory rule → agent-md-factory then agent-father. Targets .claude/skills/signal-dashboard/SKILL.md § WRITE + system-auditor flow.

TRIAGED→backlog (ranked, not dispatched, WIP full):
- sau-20260619T170803Z rag-service OOM (MEDIUM, RestartCount=77/9d, 766/768MiB): overlaps FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX. Cap-bump ~1.5GB = ops/infra; growth = dev-rag-service. Next free slot.
- devteam-...-macro-fetch-cluster (5 findings): needs PO scoping into separate FIXes (DJIA/WTI stale store; Reuters/TE circuit-open; FRED_API_KEY unset; SBV zero-mask; foreign-flow primary dead). Multi-owner, scope next tick — NOT blind-dispatch.
- devteam-...-health-idle-vs-crash (P1): owner = health-recheck RemoteTrigger PROMPT (router-updatable, NOT a dev coding lane); matches project_health_recheck_trigger + bctc_lastpush_age_misread_as_crash. Queue=0+active=IDLE≠CRASH.
- devteam-...-d4-id-collision (P2): already tracked FU-AUDITOR-D4-SIGNAL-ID; durable fix overlaps M2 signal-dashboard write-path — fold/sequence after M2.
- qa-cycle277 ohlcv-aggregator follow-ons (2, already TRIAGED): stranded-pre-fix-rows DATA-REPAIR + class3 cold-start exchange-seed — left as-is, downstream of approved write-fix.

LESSON: the orphankey write-bug (M2) is the recurring-invisibility root behind why C-08 sat unseen ~1.5d — fixing the SENSOR write-path is as load-bearing as the alert co-write itself. Both HIGH this tick.
