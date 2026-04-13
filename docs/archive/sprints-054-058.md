# Archive — Sprints 054–058 (Position/Ask/Signals + BCTC + Evidence)

---

## Sprint 054 — Position-Aware Analysis, /ask Queue, Alert Narrowing, Kinh Dich Default Layer (Done 2026-04-08)

11 tasks. Position ledger (buy/sell/apply), Telegram /set_position + /check_position, ask_queue DDL + store + Telegram /ask + scheduler, alertPolicyChecker + stopLossComputer, marketScanJob noise retirement, kinhDichWrapper, askQueueTools, positionTools, smoke test.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1070 | Position ledger: buyPosition + sellPosition + applyPositionCommand | domain/infra | Done |
| 1071 | Telegram /set_position + /check_position handlers | interface | Done |
| 1072 | ask_queue DDL + askQueueStore CRUD helpers | infrastructure | Done |
| 1073 | Telegram /ask handler | interface | Done |
| 1074 | askQueueCheckJob scheduler + cron registration | scheduler | Done |
| 1075 | alertPolicyChecker + stopLossComputer + mcp.config.json alertPolicy | domain | Done |
| 1076 | marketScanJob noise retirement (remove direct MARKET sends) | scheduler | Done |
| 1077 | kinhDichWrapper + wire appendKinhDich into analysis/market/portfolio tools | domain/interface | Done |
| 1078 | askQueueTools: get_pending_ask_questions + answer_ask_question MCP tools | interface | Done |
| 1079 | positionTools: get_user_positions_for_analysis MCP tool | interface | Done |
| 1081 | Sprint 054 smoke test | test | Done |

---

## Sprint 055 — Observability + Signal Quality + Alert Attribution (Done 2026-04-11)

11 tasks. cron_job_runs DDL + store, recordJobRun wrapper, get_cron_health tool, cronHealthAlertJob, signal fixes (causal_root_id, signal_class, recency_weight), agent_work_log, sent_by column. Net +3 tools → ~83 total. 156/156 tests pass.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1100 | cron_job_runs DDL + cronJobRunStore CRUD | infrastructure | Done |
| 1101 | recordJobRun wrapper + apply to 5 existing jobs | infrastructure/scheduler | Done |
| 1102 | get_cron_health MCP tool (+1 tool) | interface | Done |
| 1103 | cronHealthAlertJob — daily WORK alert if success_rate < 80% | scheduler | Done |
| 1104 | Sprint 055 cron smoke test | test | Done |
| 1105 | Signal Fix A: causal_root_id migration + grouping | infrastructure | Done |
| 1106 | Signal Fix B: signal_class + conviction weighting | infrastructure/domain | Done |
| 1107 | Signal Fix C: recency_weight in search_similar_context | domain/interface | Done |
| 1108 | agent_work_log DDL + store | infrastructure/db | Done |
| 1109 | log_agent_work + get_agent_work_log MCP tools (+2) | interface/mcp | Done |
| 1110 | sent_by column on alerts table + Alert Commander filter | infrastructure/db + interface/mcp | Done |

---

## Sprint 056 — BCTC Fallback Hardening (Done 2026-04-11)

1 task. disableSscPolling flag + UPCOM fetcher + listSscDocumentsWithFlag. SSC disabled by default, HOSE/HNX/UPCOM queried in parallel. VEA (UPCOM) coverage gap closed. 9 tests pass.

| ID | Title | Status |
|----|-------|--------|
| 1111 | BCTC fallback: disableSscPolling flag + UPCOM fetcher + listSscDocumentsWithFlag | Done |

---

## Sprint 057 — Prediction Engine Phase A: Evidence Accumulation Store (Done 2026-04-12)

3 tasks. evidence_fragments DDL + store, record_evidence_fragment MCP tool, evidenceAccumulatorJob. Net +1 tool → 85 total. +1 cron. 31/31 tests pass.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1116 | evidence_fragments DDL + evidenceFragmentStore CRUD | infrastructure/db | Done |
| 1117 | record_evidence_fragment MCP tool (+1 tool) | interface/mcp | Done |
| 1118 | evidenceAccumulatorJob + evidence_scores table | scheduler | Done |

---

## Sprint 058 — BCTC Split-Block OCR Fix (Done 2026-04-12)

2 tasks. VNM income: revenue 1→63.6T, COGS 10→37.4T. VNM balance sheet: totalAssets 0→53.3T, equity 0→34.5T. 19 new tests + 18 existing pass.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1119 | Split-block OCR extraction + magnitude inference for income statement | domain | Done |
| 1120 | Split-block fallback for balanceSheetExtractor (VNM totalAssets=0) | domain | Done |
