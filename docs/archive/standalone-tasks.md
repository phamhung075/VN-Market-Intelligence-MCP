# Archive — Standalone Tasks (not in a numbered sprint)

Bug fixes, janitor cleanups, and ad-hoc tasks completed outside the sprint framework.

---

### [1004 / @dev P2] Cascade gap: VN-market policy/macro news scoring — Done 2026-04-11

18 SECTOR_RULES + 10 POLICY_RULES + detectPolicyInterventionCombo. TECH_1004.md. 15 tests. Commit 09f0cef.

---

### [1112 / @dev P1] BCTC VPS proxy: push pattern for geo-blocked PDFs — Done 2026-04-11

Extended VPS Singapore push pattern for BCTC PDFs. GET /api/bctc-fetch-queue + POST /api/push-bctc-pdf. TECH_1112.md. 10 tests. Commit 0ecca9b.

---

### [1113 / @dev P2] VPS proxy observability — push log + get_vps_proxy_health — Done 2026-04-12

vps_push_log table, 4 push endpoints log success/error, get_vps_proxy_health MCP tool. 8 tests. Commit 594dc67.

---

### [1002 / @dev P1] Anonymous SSC PDF attribution — Done 2026-04-11

normaliseFilename + action_code on pdf_extracted_text + D-7c fallback. TECH_1002.md. 11 tests. Commit 60482d1.

---

### [1085 / @dev P1] SSC portal JS-shell: BCTC ingestion stalled — Done 2026-04-11

PO Decision: OPTION 2 — strengthen HOSE/HNX/UPCOM fallback as primary BCTC source; disable SSC polling via config flag. Implemented by task 1111 (Sprint 056). Commit 00d0e60.

---

### [1086 / @dev P2] financial_reports row count drop detection — Done 2026-04-10

D-10b in dataAuditJob.ts compares current row counts vs previous audit_state snapshot. 4 new tests. Commit 0c23a2b.

---

### [283 / @dev P1] Batch queries in get_portfolio_conviction — Done 2026-04-10

N+1 query patterns eliminated, appendKinhDich removed. 5 batch optimizations, 11 new tests. Commit 812e8fa.

---

### [914 / @po] Steel sector watchlist gap — HPG — Closed (no-op) 2026-04-10

HPG already in mcp.config.json. No code change needed.

---

### [1089 / janitor] Remove dead sourcesRaw fallback in analysis.ts — Done 2026-04-10

Zod .default() handles it. Removed 3 dead lines. Commit 067fb8c.

---

### [1093 / janitor] Remove orphaned cron defaults from config.ts — Done 2026-04-11

Removed SchedulerConfig interface + 7 cron defaults + scheduler property from McpConfig. 18/18 tests. Commit 8411424.

---

### [1048 / @dev P3] Consolidate scheduler cron defaults — Closed (Working as Designed)

config.ts provides typed defaults, jobs.ts implements env-var override pattern. No actual duplication risk.

---

### [1001 / @architect P1] BCTC ingest regression: VNM PDF on disk 9 days — Done

Fixed by bctcReparseJob (1019) + OCR cache fallback (1068).

---

### [1092 / @dev P3] Consolidate SUMMARY_CRONS — Done 2026-04-10

Removed SUMMARY_CRONS export. registerSummaryJobs() now accepts cron config as parameter. 8/8 tests. Commit varies.

---

### [296 / @dev P1] OCR pipeline e2e smoke test — Done 2026-04-10

4 tests: full OCR extraction on VNM PDF, OCR cache fallback, both-paths-empty, PDF diagnostic. 4/4 pass.

---

### [1021 / @dev] 20 pre-existing per-file test flakes — Done 2026-04-10

17 self-healed, 1 fixed (timeout 5s→30s), 2 removed in earlier sprints. Commit 8841439.

---

### [1091 / @dev P3] Remove 8 inline DDL blocks from vnstockStore.ts — Done 2026-04-10

Commit 0977107. DDL canonical in schema.ts:928+. 35/35 tests pass.

---

### [1083 / @dev P3] Remove inline DDL from hexagramStore.ts — Done 2026-04-10

Commit 3d967ae. DDL canonical in schema.ts:779-808. 32/32 tests pass.

---

### [1090 / @dev P3] Remove inline DDL from pharmaStore.ts — Done 2026-04-10

Commit 3d967ae. DDL canonical in schema.ts:833. 16/16 tests pass.

---

### [1050 / @dev P3] Remove initMentionVelocityTable() — Done 2026-04-10

Commit ab4d20c. DDL canonical in schema.ts:271. 24/24 tests pass.

---

### [1082 / @dev P3] Remove inline DDL from cascadeHitStore.ts — Done 2026-04-10

Commit ab4d20c. DDL canonical in schema.ts:872. 14/14 tests pass.

---

### [1089 / @dev P3] Remove inline DDL from bondMaturityStore.ts — Done 2026-04-10

Commit ab4d20c. DDL canonical in schema.ts:814. 11/11 tests pass.

---

### [1087 / @dev P2] Macro snapshot Brent crude duplicate — Done 2026-04-10

Yahoo Finance storeCommoditySnapshot now mirrors Brent+Gold into tracked_indicators. Commit 8d3d997. 14/14 tests.

---

### [915 / @dev] Analyst-credibility discount on sanctioned brokers — Done 2026-04-08

broker_sanctions table + forecastConfidenceScore() + get_broker_credibility MCP tool. 22 new tests.

---

### [1049 / @dev P3] Remove ensureAlertMutesTable() inline DDL — Done 2026-04-09

Commit 5764d1b. 25/25 tests pass.

---

### Task 1139 — Wrap utility/infra jobs (FR-9 to FR-12) — Done (Sprint 062, closed Sprint 069)

Wrapped franceSummaryJob, devTeamHeartbeatJob, weatherCheckJob, davPharmacyCheckJob with recordJobRun. Administrative close confirmed in Sprint 069 Task 1171.
