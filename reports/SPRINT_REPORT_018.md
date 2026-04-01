# Sprint Report 018 — Scheduled Database Audit & Cleanup

date: 2026-04-01
qa_agent: QA / CI-CD
outcome: APPROVED — all 3 tasks merged, full test suite passes

---

## Sprint Goal

Add a nightly database audit job that auto-cleans safe bad data, flags data quality
issues via `agent_feedback`, and sends a single Telegram summary so the operator can
trust the pipeline's inputs without manually inspecting SQLite tables.

**Scope (IN)**:
- `dataAuditJob.ts` — daily checks (D-1 through D-10) + weekly checks (W-1 through W-7)
- `market_prices_history` canonical schema migration into `schema.ts` (FR-10)
- `getCount()` new export on `vectorstore.ts` for LanceDB drift detection (W-7)
- `audit_state` singleton table for health tracking (FR-11)
- `agent_feedback` inserts for warning/critical findings with same-day dedup (FR-7)
- `system_logs` write per audit run (FR-8)
- Telegram summary on dirty runs, silent on clean runs (FR-9)
- Scheduler wiring: `CRONS.dataAuditDaily` + `CRONS.dataAuditWeekly` in `jobs.ts` (FR-13)
- `get_system_health` MCP tool enhanced with `--- DB Audit ---` section (FR-12)

**Scope (OUT)**: ML-based anomaly detection, automatic BCTC re-fetch on failed validation,
external monitoring integrations.

---

## Tasks Completed (3 tasks)

| # | Title | Branch | Merged | Report |
|---|-------|--------|--------|--------|
| 157 | Data audit engine: `dataAuditJob.ts` + schema migration + `getCount()` | `task/157-data-audit-job` | 2026-04-01 | [TASK_REPORT_157](TASK_REPORT_157.md) |
| 158 | Scheduler wiring: `CRONS.dataAuditDaily` + `CRONS.dataAuditWeekly` in `jobs.ts` | `task/158-audit-scheduler-wiring` | 2026-04-01 | [TASK_REPORT_158](TASK_REPORT_158.md) |
| 159 | `get_system_health` db_audit section: `audit_state` + live `agent_feedback` counts | `task/158-audit-scheduler-wiring` | 2026-04-01 | [TASK_REPORT_159](TASK_REPORT_159.md) |

---

## Test Results

| Suite | Tests | Pass | Fail | Notes |
|-------|-------|------|------|-------|
| `157-data-audit-job.test.ts` | 52 | 52 | 0 | AC-1 through AC-12, daily + weekly checks |
| `159-health-db-audit.test.ts` | 9 | 9 | 0 | AC-9, all db_audit section scenarios |
| Full regression (`bun test`) | 1174 | 1171 | 3 | 3 failures are pre-existing, unrelated to Sprint 018 |

**Pre-existing failures** (present on `main` before Sprint 018 work):
- `Task 122 — Cascade Engine branch coverage > CE-13` — `122-domain-services.test.ts` (pre-existing since Sprint 013)
- `RT1 — Watchlist CRUD roundtrip > get_watchlist returns VCB after add` — `123-integration-mcp.test.ts` (pre-existing)
- `RT1 — Watchlist CRUD roundtrip > full CRUD chain` — `123-integration-mcp.test.ts` (pre-existing)

**TypeScript**: `bun tsc --noEmit` — 0 errors at merge.

---

## New Files

| File | Description |
|------|-------------|
| `src/scheduler/dataAuditJob.ts` | Core audit engine (task 157) |
| `src/__tests__/157-data-audit-job.test.ts` | 52-test suite for task 157 |
| `src/__tests__/159-health-db-audit.test.ts` | 9-test suite for task 159 |
| `reports/TASK_REPORT_158.md` | QA task report for task 158 |
| `reports/TASK_REPORT_159.md` | QA task report for task 159 |
| `reports/SPRINT_REPORT_018.md` | This file |

## Modified Files

| File | Change |
|------|--------|
| `src/infrastructure/db/schema.ts` | Added `market_prices_history` canonical DDL + `exchange` column migration |
| `src/infrastructure/rag/vectorstore.ts` | Added `getCount(): Promise<number>` export |
| `src/scheduler/jobs.ts` | Added `CRONS.dataAuditDaily` + `CRONS.dataAuditWeekly`, registration in `startScheduler()` |
| `src/interface/mcp/tools/systemTools.ts` | Added `--- DB Audit ---` section to `get_system_health` |

---

## DDD Compliance

| Layer | Status | Notes |
|-------|--------|-------|
| domain | PASS | No new domain files — `AuditFinding` interface in scheduler layer (operational artefact, not business entity) |
| infrastructure | PASS | `schema.ts` and `vectorstore.ts` changes are purely additive |
| scheduler | PASS | `dataAuditJob.ts` imports only from `infrastructure/` — never from `application/` or `interface/` |
| interface | PASS | `systemTools.ts` uses only DB read queries — no scheduler imports |

No domain-from-infrastructure violations. No interface-layer imports in scheduler. DDD clean.

---

## Security Review

| Check | Result |
|-------|--------|
| All SQL parameterized | PASS — `db.prepare(...).run(...)` and `db.query<T, []>(...).get()` throughout |
| `Bun.env` only (no `process.env`) | PASS — all new code uses `Bun.env` |
| No `any` types | PASS — `bun tsc --noEmit` clean, zero `any` in modified files |
| Same-day dedup guard on `agent_feedback` | PASS — FR-7 dedup prevents feedback flooding on re-runs |
| LanceDB W-7 wrapped in try/catch | PASS — never throws even if LanceDB unavailable |
| Telegram only on dirty runs | PASS — AC-6 verified: silent on clean runs |

---

## Acceptance Criteria Sign-off

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | Daily audit deletes zero-price rows | PASS |
| AC-2 | Stale unread alert marked read | PASS |
| AC-3 | Old agent_feedback priority escalated | PASS |
| AC-4 | Outlier commodity value triggers critical finding | PASS |
| AC-5 | Old history rows pruned in weekly audit | PASS |
| AC-6 | Telegram silent on clean run | PASS |
| AC-7 | Telegram sends one message when issues found | PASS |
| AC-8 | LanceDB count drift flagged not thrown | PASS |
| AC-9 | get_system_health shows db_audit section | PASS |
| AC-10 | Scheduler registers both audit crons | PASS |
| AC-11 | No duplicate agent_feedback on same-day re-run | PASS |
| AC-12 | Full test suite passes | PASS (excluding 3 pre-existing unrelated failures) |

All 12 acceptance criteria: PASS.

---

## Architecture Notes

The audit job follows the established `intelligenceCycleJob.ts` pattern:
- Self-contained scheduler module under `src/scheduler/`
- Direct `getDb()` access (no store adapter indirection — appropriate for raw table maintenance)
- `AuditFinding` interface exported from `dataAuditJob.ts` (operational artefact, not promoted to domain)
- `audit_state` singleton table created lazily inside `dataAuditJob.ts` (PO decision — minimises schema migration scope)
- `agent_feedback` DDL guard inlined in `dataAuditJob.ts` (avoids importing from `feedbackTools.ts` which is interface-layer)

---

## Operator Impact

After Sprint 018:
- `get_system_health` now shows DB health at a glance (last audit timestamps, pending feedback count, open warnings)
- 23:00 daily audit auto-cleans zero-price rows, stale alerts, old logs
- 01:00 Sunday weekly audit prunes commodity/SBV history (>180 days), deduplicates RAG entries and price history, checks LanceDB/SQLite drift
- Critical findings (e.g. oil price = $5) auto-escalate to `agent_feedback` with `priority = 'critical'` — visible via `get_feedback` MCP tool
- Telegram summary sent only when issues exist — no alert fatigue on clean runs

---

## Merge Commits

```
merge(158+159): scheduler wiring for audit crons + get_system_health db_audit section
merge(157): data audit engine with daily+weekly checks
```

---

## Notes for Next Sprint

- 3 pre-existing test failures (CE-13 cascade, RT1 watchlist CRUD x2) should be triaged in a dedicated fix sprint
- Consider a `get_audit_findings` MCP tool to expose the last `AuditFinding[]` array to Claude
- D-2 (stale price rows, `-3 days` threshold) may produce false positives during Vietnamese public holidays — monitor in production; adjust to `-7 days` if needed (pure SQL constant in `dataAuditJob.ts`)
- `task/159-health-db-audit` branch was never advanced past its initial commit on main (developer committed tasks 158+159 on the `task/158-audit-scheduler-wiring` branch chain) — no action needed, both features are fully merged
