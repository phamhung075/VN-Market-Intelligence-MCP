# Archive — Sprints 059–063 (Prediction Engine + Foreign Flow + Cron Observability)

---

## Sprint 059 — Prediction Engine Phase B+C (Done 2026-04-12)

6 tasks. +2 MCP tools (get_evidence_summary, create_prediction_claim). +2 scheduler files (baseRateComputationJob, predictionResolutionJob). +1 Cowork agent (08-prediction-synthesizer.md). Tool count 86 → 88. Scheduler 24 → 26.

| ID | Title | Commit |
|----|-------|--------|
| 1121 | evidence_likelihood_ratios DDL + likelihoodRatioStore CRUD | 3e337ee |
| 1122 | baseRateComputer domain service + baseRateComputationJob weekly | 90e004c |
| 1123 | prediction_claims DDL + predictionClaimStore CRUD | 3e337ee |
| 1124 | get_evidence_summary + create_prediction_claim MCP tools (+2) | 1018913 |
| 1125 | predictionResolutionJob nightly Brier score resolver | c53d0ff |
| 1126 | 08-prediction-synthesizer.md Cowork agent + roster update | f15333c |

---

## Sprint 060 — Prediction Engine Phase D: Calibration Report + Telegram Digest (Done 2026-04-12)

4 tasks. calibration_snapshots DDL + store, calibrationReportJob weekly + Telegram digest, get_calibration_report MCP tool, 08-prediction-synthesizer self-assessment Step 0. +1 tool → 89 total.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1127 | calibration_snapshots DDL + calibrationSnapshotStore CRUD | infrastructure | Done |
| 1128 | calibrationReportJob weekly computation + Telegram digest + jobs.ts registration | scheduler | Done |
| 1129 | get_calibration_report MCP tool + registry.ts registration (+1 tool → 89) | interface | Done |
| 1130 | 08-prediction-synthesizer.md self-assessment Step 0 | Cowork | Done |

---

## Sprint 061 — Foreign Flow VPS Pipeline (Partial — 4/5 Done 2026-04-12)

5 tasks (4 done, 1 blocked). upsertForeignFlow, POST /api/push-foreign-flow, foreignFlowAlertJob, foreignFlowTools MCP tool. Task 1135 (VPS script extension) blocked on B1: VPS API field names unconfirmed. +1 tool → 90 total. 46 tests pass.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1131 | upsertForeignFlow in vnstockStore.ts | infrastructure | Done |
| 1132 | POST /api/push-foreign-flow in server.ts | interface | Done |
| 1133 | foreignFlowAlertJob — daily 16:30 VN scan | scheduler | Done |
| 1134 | foreignFlowTools + get_foreign_flow MCP tool (+1 → 90) | interface | Done |
| 1135 | VPS script extension (poll foreign flow) | infrastructure (VPS) | Blocked (B1) |

---

## Sprint 062 — Cron Observability Completion (Done 2026-04-13)

8 tasks (REQ + TECH + PM + 5 dev). Wrapped all remaining cron jobs with recordJobRun. jobs.ts imports, summaryJobs wrap, 4 briefing/cycle wraps, 4 market/portfolio wraps, 4 utility/infra wraps, 3 try/catch replacements.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| REQ-062 | BA: REQ_062.md | — | Done |
| TECH-062 | Architect: TECH_062.md | — | Done |
| PM-062 | PM: sprint planning — tasks 1136–1140 | — | Done |
| 1136 | jobs.ts imports + summaryJobs.ts wrap (FR-16, FR-18) | interface/scheduler | Done |
| 1137 | Wrap critical briefing/cycle jobs (FR-1–4) | interface/scheduler | Done |
| 1138 | Wrap market/portfolio/prediction jobs (FR-5–8) | interface/scheduler | Done |
| 1139 | Wrap utility/infra jobs (FR-9–12) | interface/scheduler | Done |
| 1140 | Replace try/catch blocks (FR-13–15) | interface/scheduler | Done |

---

## Sprint 063 — Task 1135 Unblock + Insider Transaction Detection (Done 2026-04-13)

10 tasks (REQ + TECH + PM + 7 dev). insider_transactions DDL, VPS script foreign flow, insiderCheckJob refactor, /api/foreign-flow-status endpoint, insiderCheck cron registration, get_insider_transactions MCP tool. +1 tool → 91 total.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| REQ-063 | BA: REQ_063.md | — | Done |
| TECH-063 | Architect: TECH_063.md | — | Done |
| PM-063 | PM: sprint planning | — | Done |
| 1141 | insider_transactions DDL in initDatabase() + indexes | infrastructure | Done |
| 1142 | VPS script foreign flow step with env-var field names | infrastructure | Done |
| 1143 | Refactor insiderCheckJob — streak detection + insertAlert + evidenceFragment | domain/infrastructure | Done |
| 1144 | GET /api/foreign-flow-status diagnostic endpoint | interface | Done |
| 1145 | Register insiderCheck cron in jobs.ts + recordJobRun wrap | interface/scheduler | Done |
| 1146 | get_insider_transactions MCP tool + insiderStore date-filter | interface/infrastructure | Done |
| 1147 | Update project-stats.json (toolCount 91) + cron-registry.json | docs/data | Done |
