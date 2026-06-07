# Dev Team — Sprint Boundary Notebook

**Written:** 2026-06-07T07:30Z (cycle 20260607T031736Z — VN Sun, market CLOSED weekend)

## cycle-20260607T0317Z — wave-3 lanes MERGED, ops rebuild + CTG reset, SPIKE_3012 verdict, live-DB corruption surfaced
- **MERGED wave-3**: Lane F → bb05360a (FIX-REFINE-FLOW-FAILED-RETRY). Lane E → 23d7c73f + c98870f9. Earlier waves landed pre-0317 (see git chain). All work items DONE; branches=main only at close.
- **Ops rebuild**: mcp-server image f6026bec4031 rebuilt + force-recreated; CTG re-extract reset to PENDING/0 units — fleet bctcReparseJob cron (09:00/14:00 UTC) will auto-pick. Peers verified alive post-rebuild (docker ps -a).
- **NEW LESSON — lock orphaned by rebuild** (memory feedback_lock_orphaned_by_rebuild): coordination locks bind owner_session to mcp-server process instance; rebuild makes held locks unreleasable (ok:false forever). Sequencing rule: release locks BEFORE dispatching ops rebuilds; post-rebuild ok:false = EXPECTED, verify owner_session predates container start, LET-EXPIRE.
- **LET-EXPIRE locks** (unreleasable, harmless, suppress dups until TTL): task:on-demand:ops:2026-06-07 (~exp epoch 1780817137), esc-datacov:FPT:Q1-2026:ESC-3 (exp 2026-06-12). pm on-demand + commit-mutex released clean this cycle.
- **SPIKE_3012 verdict** (docs/spikes/SPIKE_3012-bctc-eval-hpg-ppc.md, a2b38ec1): HPG Q4-2025 validation_status="failed" = FALSE POSITIVE — extractor wrote totalLiabilities from PRIOR-period column; correct value → identity delta 0. Stage-4 RED from 2 dups: codes 140/141 genuine OCR overlap; 421b cross-section spill VALID for VN parent-company → should be yellow. PPC: ZERO financial_reports rows; Q4-2025 exhausted 6 attempts null URL; Q3-2025 wrongly holds Q1-2026 PDF URL.
- **4 spike follow-ups in backlog** (7a978a80): FIX-BCTC-LIAB-PRIOR-PERIOD (P0), FIX-BCTC-STAGE4-CROSS-SECTION-DUP (P0), SPRINT-PPC-PDF-SOURCING (P1), SPRINT-HPG-QUEUE-URL-FIX (P1).
- **LIVE market.db CORRUPTION** (named volume, /app/data): PRAGMA integrity_check fails — tree 32 page 2533 rowid out-of-order, pages 2533+22008 double-referenced, pdf_extracted_text + system_logs index/table mismatches. Reads still serve correct data. Signal rtr-livedb-integrity-corruption-20260607T0530Z (HIGH→po, NEW) + board row RECOVER-LIVEDB-INTEGRITY (architect+ops+dev-mcp-server lane, BACKUP FIRST, repair FORBIDDEN until planned).
- **Audits**: 3× T1 + 1× T2 (09888804). T2 added 3 signals to po: sau-b02-202606070633 (CRITICAL news-vps stale 1h44m, corroborates report #3065), sau-b-vps-unhealthy-202606070633 (WARN), sau-bctc-proxy-stale-202606070633 (INFO weekend). VPS proxy core confirmed UP first-hand (curl /health ok:true).
- **Board**: pm closeout 4d1c2ef6 (4 rows → done: UNBLOCK-CTG-REFINE-DRAIN, CLEAN-ESC-LOCK-FPT, FIX-BCTC-SLA-WEEKEND, SPIKE-BCTC-EVAL-HPG-PPC; rtr-auditor-db-stale-path → RESOLVED by 1849fe53) + continuation 7a978a80 (5 backlog adds). Conservation **293** verified (98 done / 36 backlog / 159 nested / 0 in-progress). NOTE: pm dropped 2 of 10 batch items on first pass — ALWAYS grep orch-state for every batch item ID post-RETURN; re-dispatch same agent type, don't fix board yourself.
- **Reports**: #3064 (D4 lock-diverge esc-datacov:FPT) resolved wontfix — orphaned pre-rebuild lock, LET-EXPIRE, msg 2703 deleted. #3065 (news-vps CRITICAL) deliberately LEFT for po triage with its signal row. process_telegram_report schema: `{id: number, action, resolution: enum[none|fixed|wontfix|duplicate|monitoring], note}`.
- **mock-guard --full**: CAUTION, exactly the 6 known TODO markers (macro-indicators models.go:26/ports.go:16/ports.go:24; mcp-server macroIndicatorFetcher.ts:35/orchStateStore.ts:429/brokerSanctionsJob.ts:100) — non-blocking. expire_monitoring_reports=0.
- Commits this cycle: 00bf7648→bb05360a→88fc4a44→23d7c73f→c98870f9→09888804→a2b38ec1→4d1c2ef6→7a978a80→[this notebook].

### Queue watch for next cycle's po triage
- sau-b02-202606070633 (CRITICAL news-vps + report #3065 pair) — if STILL stale at Monday VN open → real outage escalation.
- rtr-livedb-integrity-corruption (HIGH recovery lane — backup-first, downtime window needed).
- sau-b-vps-unhealthy (WARN), sau-bctc-proxy-stale (INFO weekend), rtr-bctc-playwright-thread (READ).

### Carry-forward (unchanged lanes)
- Parked: FIX-FETCH-VERYSTALE-LABEL. Deferred: TECH-DEBT-LINTING (3 TS2379 in 1980-f2-canon-schema.test.ts), FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS.
- Candidate for code-janitor: STALE-ORPHAN marker for apps/mcp-server/data/market.db (NEVER delete — may serve unit tests; live DB is the named volume).
- FIX-AUDITOR-DB-LIVENESS (1849fe53) + FIX-REFINE-FLOW-FAILED-RETRY (bb05360a) shipped without board rows — work done, no action.
- CTG re-extract → next fleet cron auto-pick (verify Monday).
- worktree.baseRef=head still set in .claude/settings.json — verify before any worktree-parallel dispatch (feedback_worktree_stale_base).

### Notes (standing)
- task_claim live schema: `{task_id, task_kind: enum[cowork-slot|sprint-task|dashboard-row|commit-mutex], owner_agent, ttl_seconds, payload: SERIALIZED-JSON-STRING}`. task_release: `{task_id}` only.
- Gateway meta-tools NOT callable via call_tool — find tool names by grepping apps/mcp-server/src/interface/mcp/tools/ or flow docs.
- signals.db git-ignored (local dedup cache); file-move to processed/ is SSOT.
- Durable cron flag session-only — re-arm after restart.
