# PO triage 2026-08-14T18:43Z — Pipeline-B signal_queue disposition, via scripts/orch-apply.sh
# Closes 20 to=po rows (17 from system-auditor Tier-2 c99, 1 router corroboration,
# 2 duplicate code-janitor rows). Writes triaged_at/triaged_by/disposition on every
# row per docs/agents/po/flow/triage-signals.md § Live .signal_queue.rows[] inbox.
# Additive field-merge only; re-running is a no-op.

def now: "2026-08-14T18:43:30Z";
def stamp($disp): . + {status: "triaged", triaged_at: now, triaged_by: "po", disposition: $disp};

.signal_queue.rows |= map(
  # ── A-29 CRITICAL x5 — FALSE POSITIVES, premise refuted by PO live check ──
  if (.id | test("^sys-20260814T16000[0-4]-a29-[1-5]$")) then
    stamp("FOLD (FALSE POSITIVE) -> FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL. PO verified against GET /api/cron-status 2026-08-14T18:39Z: every one of these 5 crons is window-bounded (`2-8 * * 1-5`) and each has last_fire EXACTLY == expected_last_fire with last_status=success (vpsProxyWatchdog+priceUpdateWatchdog 08:50, alertScanParallel+taAlertNotifier 08:45, vnIndexRefresh 08:55) — each fired precisely at the final slot of its own daily window and is not due again until Monday 02:00Z. NOT STALE. classifyCronLiveness() measures elapsed-since-last-fire against the intra-window interval instead of the next scheduled slot. The CRITICAL severity on this row is manufactured by that upstream defect, not by any real cron gap. No board row minted. Blast-radius correction (weekday, not just weekend) recorded on the Layer-A row as po_fold_20260814T1841Z.")
  # ── A-29 CRITICAL: monthlySignalQualityAudit — GENUINE, already owned ──
  elif .id == "sys-20260814T160005-a29-6" then
    stamp("FOLD (GENUINE) -> FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD (backlog, dev-mcp-server, P2). PO verified live: cron `0 0 1 * *`, last_fire 2026-06-01, status MISSED — the two consecutive missed fires that row already tracks. Corroboration appended there; no new row.")
  # ── A-29 CRITICAL: brokerSanctionsSweep — GENUINE + un-rowed -> MINTED ──
  elif .id == "sys-20260814T160006-a29-7" then
    stamp("MINTED -> FIX-BROKERSANCTIONSSWEEP-MISSED-CONSECUTIVE-FRIDAY-FIRES (backlog, dev-mcp-server, P2, zone apps/mcp-server/). The only finding in this batch of 8 that survived PO's premise check AND had no existing owner: cron `0 8 25-31 * 5`, last_fire 2026-07-31, a 14-day gap spanning two Fridays. Row carries an explicit caveat that expected_last_fire comes from the same schedule-blind engine, so the implementer must settle dom-AND-dow vs dom-OR-dow from source first.")
  # ── A-29 CRITICAL: ragFtsRebuildCron — GENUINE, already owned (BLOCKED) ──
  elif .id == "sys-20260814T160007-a29-8" then
    stamp("FOLD (GENUINE) -> ALPHA-S2-RAG-FTS-REBUILD-CRON (backlog, BLOCKED, next_agent=null). PO verified live: cron `15 20 * * *` daily, last_fire 2026-07-20 — 25 days dead. Real retrieval-quality gap (hybrid BM25 leg missing all post-07-20 rows), not an archival chore. Escalation note recorded on that row: it is BLOCKED with a null next_agent so nothing dispatches it — it needs an owner or an explicit retire ruling.")
  # ── A-29b WARN x9 — detector join-drop, not 9 dead crons ──
  elif (.id | test("a29b")) then
    stamp("FOLD -> FIX-AUDITOR-A29-UNEXECUTABLE-SPEC-SILENT-JOIN-DROP (review, P1, next_agent=system-auditor). PO verified live: /api/cron-status status histogram is ON_TIME=72 NEVER_FIRED=9 STALE=7 MISSED=1 — the NEVER_FIRED set is exactly these 9 names, each with reason 'chua ghi nhan lan chay nao trong cron_job_runs', i.e. a job_name_db join miss (marketOpen vs morningBriefingJob), not a dead job. Precisely the silent-join-drop that row exists for. No rows minted. Acceptance addition requested on the row: the fix must make these 9 resolve AND must make 'join failed' distinguishable from 'genuinely never ran' at the consumer.")
  # ── Router corroboration: 16th analysis-only-exit occurrence ──
  elif .id == "sys-20260814T035355-r16c" then
    stamp("FOLD -> SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE (backlog, P0, agents-architect), minted this tick and carrying this row as its origin_signal_id. This row's own detail block says 'corroboration only, per standing occurrence-3+ precedent — no new board row minted'; at occurrence 16 that precedent has become the problem, not the policy. The narrower system-auditor variant of the same class has now fired 10 times in 48h, so PO is escalating the class to a structural investigation rather than logging a 17th corroboration.")
  # ── code-janitor duplicate pair: explicit PO replace-vs-retire ruling ──
  elif (.id == "cj-20260814T103320Z" or .id == "cj-20260814T163219Z") then
    stamp("PO RULING — RETIRE, do not replace in kind; and the signal itself is partly self-generated. (1) DECISION: the pre-2026-06-23 team-tool-recheck writer is RETIRED. Its function — comparing a DOCUMENTED tool param name against the LIVE MCP schema — is already owned by CHECK-TOOL-INTERFACE-SCHEMA-DRIFT-DOC-VS-LIVE (backlog, agent-father), which is the correct successor. Do not rebuild the old writer; land that row instead. (2) PREMISE CORRECTION: this signal is emitted by code-janitor's memory-prune-sweep.sh, which FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE (backlog, developer) documents as carrying a HARDCODED 'writer silent since 2026-06-23' string with NO liveness predicate — so it will keep re-emitting on every sweep regardless of this ruling, and did: these two rows are byte-identical 6h apart. Fixing that row is what actually stops the resurface. Both rows closed together as one duplicate pair.")
  else . end
)
