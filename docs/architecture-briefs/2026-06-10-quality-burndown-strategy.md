# Quality Audit PHASE-4 Burn-Down Strategy

**Author:** architect (a6d92f9f) · **Date:** 2026-06-10 · **Clusters:** 10 · **Checks actioned:** 44
**Source artifact:** `docs/data/quality-checklist.json` (178 PASS / 37 WARN / 7 FAIL / 15 INFO / 3 NEEDS-REVIEW → DEGRADED)

> Persisted by router (architect Write was tool-denied for new files). Content is the architect's verbatim deliverable.

---

## Fix-Class Assignment (all 44)

| check_id | sev | fix-class | rationale |
|---|---|---|---|
| GW-CONTRACT-03 | CRIT | CONFIG/SSOT | `cmd/server/main.go:44` default `NOT_DEPLOYED_SERVICES` hardcodes `"pdf,..."` but pdf-extractor is DEPLOYED. Remove `pdf`. |
| PDF-CONTRACT-02 | CRIT | CONFIG/SSOT | Same root as GW-CONTRACT-03. |
| PDF-AVAIL-02 | CRIT | RECLASSIFY | Side-effect of GW misclassification; auto-resolves after B. |
| SYS-FUNC-05 | CRIT | REAL-CODE | `post_agent_signal` validator rejects all signal_types with "root: Required" — Zod path/over-strict. |
| CI-TEST-02 | CRIT | TEST-GAP | `1338-sprint-goal-retrospective.test.ts` expects `.sprint_goal.entries[]`; actual is a string. |
| MCP-TEST-01 | CRIT | TEST-GAP | Same CI run as CI-TEST-02. |
| SYS-TEST-01 | CRIT | TEST-GAP | Same CI run as CI-TEST-02. |
| CI-TEST-04 | CRIT | TEST-GAP | CI exit-1 from 1338. |
| ANA-TEST-01 | CRIT | RECLASSIFY | 083-tool-analysis NOT in CI failed list; local timeout=rag undeployed locally. Verdict: PASS. |
| KD-OBS-01 | WARN | REAL-CODE | `explain_hexagram(0)` returns raw MCP -32602. Missing range guard [1,64]. |
| AC-FUNC-02 | WARN | REAL-CODE | `task_list_held` missing `owner`+`expires_at` (returns `owner_agent`). Field-name contract drift. |
| FR-FUNC-02 | WARN | RECLASSIFY | `get_bctc_full(VCB)` → graceful empty. Fix `expected`. |
| FR-DEGRADE-01 | WARN | REAL-CODE | bctc VPS stale 2d; response lacks stale flag. Inject `{unavailable:true,reason:"vps_stale"}`. |
| FR-OBS-01 | WARN | REAL-CODE | bctcOverdueCheck SLA breach (975/360min), no WORK alert. Obs cluster D. |
| SEC-FUNC-01 | WARN | RECLASSIFY | `get_sector_rotation` returns ≥1 entry. Data sparsity ≠ defect. PASS. |
| SEC-FUNC-03 | WARN | RECLASSIFY | `get_supply_chain_exposure(HPG)` BDI=1400 returned. PASS. |
| MD-FUNC-01 | WARN | REAL-CODE | `get_market_snapshot` returns prose, not `{vn_index:{price,change_pct,direction}}`. |
| MD-FRESH-01 | WARN | RECLASSIFY | Wrong probe; `vnIndexRefreshJob` 100%. PASS, fix recheck_how. |
| MD-FRESH-02 | WARN | RECLASSIFY | Wrong probe; `foreignFlowFetcherJob` 100%. PASS. |
| MD-FRESH-03 | WARN | RECLASSIFY | Wrong probe; `intelligenceCycleJob` 99.1%. PASS. |
| NEWS-CONSIST-01 | WARN | REAL-CODE | recheck_how missing `stock_code`; fix probe + cross-source compare pattern. |
| NEWS-OBS-01 | WARN | RECLASSIFY | Pipeline healthy 99.9%; stale alert historical. PASS. |
| ALT-FUNC-02 | WARN | REAL-CODE | `get_alert_accuracy` lacks top-level `accuracy_rate` scalar. |
| ALT-FUNC-03 | WARN | RECLASSIFY | `list_alert_rules` empty = user-state. INFO. |
| ALT-PERF-01 | WARN | RECLASSIFY | alertDigest within 24h window. PASS. |
| KD-FRESH-01 | WARN | RECLASSIFY | Wrong probe (missing `code`); use `get_portfolio_conviction`. Fix recheck_how. |
| CI-FRESH-01 | WARN | RECLASSIFY | vnIndexRefresh market-hours gated; audit ran market-closed. INFO. |
| FW-FRESH-01 | WARN | RECLASSIFY | `freshnessSlaMonitor` 100%; stale data=VPS upstream (cluster E). PASS. |
| FW-OBS-03 | WARN | RECLASSIFY | `pipelineWatchdog` 100%; alert-absence unconfirmed. PASS after path check. |
| BCT-OBS-01 | WARN | REAL-CODE | bctcOverdueCheck SLA breach, no WORK alert. Obs cluster D. |
| BCT-OBS-02 | WARN | REAL-CODE | `sscCheck` healthy, WORK msg absent. Obs cluster D. |
| PA-CONSIST-01 | WARN | RECLASSIFY | 0 prediction samples; consistency meaningless. INFO. |
| DS-CONSIST-01 | WARN | RECLASSIFY | Two-step probe incomplete (step2 curl not run). Fix recheck_how. |
| DS-OBS-01 | WARN | REAL-CODE | bctc SLA breach via get_sla_status, no BUG alert. Obs cluster D. |
| DS-DEGRADE-01 | WARN | REAL-CODE | `get_public_contracts` empty, no `stale:true`. Data-serve gap. |
| MAC-CONSIST-01 | WARN | RECLASSIFY | step2 curl :5004/snapshot not run. Fix recheck_how. |
| CO-OBS-01 | WARN | RECLASSIFY | devTeamHeartbeat=Sunday job, audit Tuesday. NEEDS-REVIEW → direct check. |
| RAG-SERVICE-AVAIL-01 | INFO | CONFIG/SSOT | `rag-service-1` Up 43h but system-map=not_deployed. SSOT drift. |
| NEWS-FETCH-AVAIL-01 | INFO | CONFIG/SSOT | `news-fetch-1` Up 43h, same SSOT drift. |
| VPS-AVAIL-02 | CRIT | REAL-CODE | sbv last_push 56h, bctc 32.5h. VPS service stalled; ops restart. |
| VPS-FRESH-02 | WARN | REAL-CODE | Same root as VPS-AVAIL-02. |
| VPS-OBS-01 | WARN | RECLASSIFY | Stale visible via get_vps_proxy_health; BUG-absence unconfirmed. Fix recheck_how. |
| PDF-TEST-01 | WARN | TEST-GAP | `docker exec pdf-extractor pytest /app/__tests__` fails: dir absent from image. Add Dockerfile COPY. |
| SEC-TEST-01 | WARN | RECLASSIFY | Both files pass in CI; WARN is auditor artifact. PASS. |

---

## Root-Cause Clusters (10)

- **CLUSTER-A — CI RED (1 file → 4 CRIT):** `1338-sprint-goal-retrospective.test.ts` vs `orch-state.json .sprint_goal` schema drift (entries[] vs string). Members: CI-TEST-02, MCP-TEST-01, SYS-TEST-01, CI-TEST-04. Owner qa+dev-mcp-server. No rebuild. DoD: `gh run list --limit 1` → success.
- **CLUSTER-B — gateway NOT_DEPLOYED drift (3 CRIT):** api-gateway default includes `pdf` though deployed. Members: GW-CONTRACT-03, PDF-CONTRACT-02, PDF-AVAIL-02. Owner dev-api-gateway. Fix: docker-compose env `NOT_DEPLOYED_SERVICES=rag,ta,stock,kinh-dich,alert,news`. Rebuild api-gateway only. DoD: `curl :4000/health|jq .services.pdf.not_deployed`→false.
- **CLUSTER-C — post_agent_signal validator (1 CRIT):** SYS-FUNC-05. validateSignalPayload rejects all with "root: Required". Owner dev-mcp-server. Rebuild mcp-server. DoD: post_agent_signal returns signal_id.
- **CLUSTER-D — BCTC observability gap (4 WARN):** jobs fire healthy but WORK/BUG alerts silent. Members: BCT-OBS-01, BCT-OBS-02, DS-OBS-01, FR-OBS-01. Owner dev-mcp-server. Step1 diagnose `read_telegram_reports({channel:'work',hours:48})`; if present→recheck_how fix only; if absent→fix send path. DoD: WORK has bctcOverdueCheck+sscCheck msgs.
- **CLUSTER-E — VPS upstream staleness (1 CRIT+1 WARN):** sbv/bctc not pushing 32-56h. Members: VPS-AVAIL-02, VPS-FRESH-02. Owner ops. SSH restart. DoD: get_vps_proxy_health sbv last_push<2h, bctc<24h.
- **CLUSTER-F — system-map deploy drift (2 INFO):** rag-service+news-fetch Up but classified not_deployed. Members: RAG-SERVICE-AVAIL-01, NEWS-FETCH-AVAIL-01. Owner ops+po. po decision → update system-map OR stop containers. DoD: classification matches docker ps.
- **CLUSTER-G — auditor probe errors (16 false WARN → reclassify):** wrong recheck_how/missing param/irrelevant source. Members: MD-FRESH-01/02/03, KD-FRESH-01, CI-FRESH-01, FW-FRESH-01, FW-OBS-03, NEWS-OBS-01, ALT-PERF-01, ALT-FUNC-03, PA-CONSIST-01, DS-CONSIST-01, MAC-CONSIST-01, CO-OBS-01, VPS-OBS-01, SEC-TEST-01 (+ FR-FUNC-02, SEC-FUNC-01, SEC-FUNC-03, ANA-TEST-01). Owner qa/system-auditor (emit corrected verdicts → merge-writer). No code.
- **CLUSTER-H — tool output schema mismatch (3 WARN):** MD-FUNC-01 (snapshot JSON), ALT-FUNC-02 (accuracy_rate scalar), AC-FUNC-02 (owner/expires_at field names). Owner dev-mcp-server. Rebuild mcp-server.
- **CLUSTER-I — data-serve stale-flag missing (2 WARN):** DS-DEGRADE-01, FR-DEGRADE-01. Inject `{stale:true,stale_since,source}` when upstream beyond SLA. Owner dev-mcp-server. Rebuild mcp-server.
- **CLUSTER-J — isolated singles (2):** KD-OBS-01 (hexagram 1-64 guard, dev-mcp-server, rebuild), PDF-TEST-01 (Dockerfile COPY __tests__, dev-pdf-extractor/qa, rebuild pdf-extractor).

---

## Burn-Down Runsheet (WIP ≤ 2 bands)

```
PRI  CLUSTER       OWNER              #CLR  FIX
[1]  A — CI RED    qa+dev-mcp-srv       4   orch-state.json .sprint_goal ↔ 1338 test; fix the drift side; per-file verify
[1]  G — RECLFY    qa/system-auditor   16   re-probe 16 corrected recipes; emit corrected verdicts; merge-writer folds
[2]  B — GW CFG    dev-api-gateway      3   docker-compose NOT_DEPLOYED_SERVICES (drop pdf); rebuild api-gateway
[2]  E — VPS       ops                  2   SSH VPS; restart sbv/bctc; verify pushes resume
[3]  C+H+I+J       dev-mcp-server       8   batch PR: validator + snapshot JSON + accuracy scalar + task fields + stale flags + hexagram guard; rebuild mcp-server
[4]  D — OBS GAP   dev-mcp-server       4   read_telegram_reports(hours:48) first; fix send path if absent
[5]  F — SSOT      ops+po               2   po decision: system-map rag+news-fetch OR stop
[ ]  PDF-TEST-01   qa/dev-pdf-extr      1   Dockerfile COPY __tests__; rebuild pdf-extractor
─────────────────────────────────────────────────────────────────
TOTALS: 10 clusters | 44 checks | 16 zero-code reclassify | 3+1 rebuilds
CRITICAL PATH: Band1→Band2→Band3 = 3 dev cycles clears all 7 CRITICAL
```

Closeout: after each band, router raw-verifies + pushes owned-path commits; ops targeted-rebuilds where code changed; affected re-check slice re-runs (emit-only) → single system-auditor merge-writer re-verdicts `quality-checklist.json` (recompute summary from rows) + folds Cluster-G reclassifications → router pushes → frontend updates live. Loop until all 44 → PASS.
