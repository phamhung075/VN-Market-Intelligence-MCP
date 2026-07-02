---
sprint: DASH-CRON-RECHECK-TABLE
branch: task/DASH-CRON-2-frontend-table
size: M
zone: apps/frontend/
depends_on: ["TASK-DASH-CRON-1"]
blocks: []
---

## TLDR

Build the frontend Cron Recheck Table UI: REST proxy route, add table section to orchestration dashboard with status badges, integrate freshness badge and RECHECK button, update coverage-map SSOT. Ships after Zone 1; can develop against a stub endpoint.

## [PM] Planning Context

**Zone:** `apps/frontend/` (interface/routing + UI components)

**Acceptance Criteria:**
- [ ] AC-16: `/dashboard/orchestration` renders Cron Recheck Table without JavaScript error or blank section
- [ ] AC-17: Table displays all `layer_a` rows and all `layer_b` rows without truncation or pagination skipping rows
- [ ] AC-18: Layer-A and Layer-B rows are visually distinct (section header or shading — implementation-defined)
- [ ] AC-19: Layer-B rows render a blue/neutral "Phiên làm việc" badge — NO red or amber badge
- [ ] AC-20: Row with `last_fire: null` (Layer-A never-fired) renders "Chưa từng chạy" in last-fire column — NOT blank/fabricated timestamp
- [ ] AC-21 (RECHECK button): Clicking "Kiểm tra lại" triggers `useRevalidator().revalidate()` and table refreshes with new `fetched_at` value. No full page reload.
- [ ] AC-22 (Freshness badge): "Cập nhật lúc" badge displays `fetched_at` from DTO response. After RECHECK, badge updates to new `fetched_at`. Never shows client-generated time.
- [ ] AC-23 (no regression): `GET /api/orchestration` continues to return 200 with existing DTO shape unchanged
- [ ] AC-24: No new JavaScript error or React boundary in existing sections of `/dashboard/orchestration` after Cron Recheck Table added
- [ ] AC-25: `GET /api/cron-status` does NOT share mutable state with `GET /api/orchestration` — concurrent execution safe
- [ ] AC-28 (Vietnamese copy): All user-facing column headers, badge labels, status descriptions on dashboard are in plain Vietnamese (no English jargon visible to user). Work artifacts (code, API JSON keys, DTO field names) remain in English.

**Files to read first:**
- `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md` (§4 Zone-2 specs, frontend UI layout, badge colors, freshness integration)
- `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md` (§4 FR-4..FR-6 frontend functional specs, Vietnamese copy, coverage-map schema)
- `apps/frontend/app/routes/api.orchestration.tsx` (exact pattern to mirror for api.cron-status.tsx)
- `apps/frontend/app/routes/dashboard.orchestration.tsx` (existing loader, safeFetch pattern, useRevalidator, FreshnessBadge import, table layout)
- `docs/data/frontend-data-coverage-map.json` (schema: page|route|elem|endpoint|store|writer|cadence|sla|asof|status|fix; NEW row must include `route: "/dashboard/orchestration"`)
- `apps/frontend/app/lib/api/loader-utils.ts` (safeFetch, parseOrchStateDto validator pattern to mirror for parseC ronStatusDto)
- `apps/frontend/app/components/FreshnessBadge.tsx` (existing component for cron table's "Cập nhật lúc" badge, second instance scoped to cron data)

**Files to create:**
- `apps/frontend/app/routes/api.cron-status.tsx` — NEW (mirrors `api.orchestration.tsx` ~10 lines):
  ```typescript
  export async function loader({ request: _request }: LoaderFunctionArgs) {
    const upstream = `${MCP_SERVER_BASE_URL}/api/cron-status`;
    return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.cron-status" });
  }
  ```

**Files to modify:**
- `apps/frontend/app/routes/dashboard.orchestration.tsx`:
  - Loader (line ~175): add second `safeFetch<CronStatusDto>` call, `Promise.all`'d with existing orchestration fetch (parallel, no latency). Add `parseCronStatusDto` validator (mirror `parseOrchStateDto` line 162), reject/normalize `status` values outside 6-enum set. Extend `LoaderData` (line ~155) with `cronStatus`/`cronStatusError`.
  - Component: add `CronRecheckTable` section below Signal Queue/Narrative (exact placement architect/designer call, no constraint from BA). Visually distinct Layer-A ("Cron máy chủ") / Layer-B ("Cron phiên làm việc") sub-sections.
  - RECHECK button: `onClick={() => revalidator.revalidate()}` (reuses existing revalidator at line ~888, already drives 5s auto-poll).
  - Freshness badge: reuse existing `<FreshnessBadge>` component, second instance for cron table, `dataAsof={cronStatus?.fetched_at ?? null}`.
  - Status badges: 6-entry lookup via switch pattern (reuse existing signal `severityClasses` pattern, line ~222).
  - Never-fired display: `last_fire == null ? "Chưa từng chạy" : <VN locale format>` (AC-20).

- `docs/data/frontend-data-coverage-map.json` — append 1 row to `.rows`:
  ```json
  {
    "page": "orchestration",
    "route": "/dashboard/orchestration",
    "elem": "cron recheck table",
    "endpoint": "/api/cron-status",
    "store": "cron_job_runs (MAX(started_at)) + CRONS map",
    "writer": "node-cron scheduler (mcp-server container)",
    "cadence": "on-demand (user recheck)",
    "sla": "realtime",
    "asof": "fetched_at",
    "status": "LIVE",
    "fix": null
  }
  ```
  (Note: `route` field is MANDATORY per the schema, BA's example omitted it — corrected here)

**Dependencies:**
- Blocks on TASK-DASH-CRON-1 (dev-mcp-server) — can develop UI against a stub if needed

**Knowledge needed:**
- `docs/policies/dev-standards.md` (Remix + React + TypeScript conventions)
- `docs/ARCHITECTURE.md` (frontend layer, DTO validation, component patterns)
- Vietnamese UX copy conventions (plain VN, no English jargon to user)

**COMPONENT DESIGN REFERENCE (from architect brief §4):**

**Table columns (Vietnamese labels per BA FR-5.2):**
| Column key | Vietnamese label | Value |
|---|---|---|
| name | Tên cron | CRONS key (Layer-A) or command file name (Layer-B) |
| layer | Lớp | "Server" (Layer-A) \| "Phiên làm việc" (Layer-B) |
| human_schedule | Lịch dự kiến | Human-readable cron expression |
| last_fire | Lần chạy gần nhất | ISO→VN locale format; "Chưa từng chạy" if null |
| expected_next_fire | Dự kiến lần tới | ISO→VN locale; null for Layer-B |
| status | Trạng thái | Colored badge (see below) |

**Status badge colors & Vietnamese labels (BA FR-5.3):**
| Status value | Badge color | Vietnamese label |
|---|---|---|
| ON_TIME | green | Đúng giờ |
| LATE | amber | Trễ nhẹ |
| MISSED | red | Bỏ lỡ |
| STALE | red (darker) | Quá hạn |
| NEVER_FIRED | grey | Chưa từng chạy |
| SESSION_SCOPED | blue | Phiên làm việc |

**Layer visual separation (BA FR-5.4):** Layer-A and Layer-B rows are visually distinct — either section header divider ("Cron máy chủ" / "Cron phiên làm việc") or background shading. Layer-B rows MUST NOT render red/amber badge (SESSION_SCOPED always blue/neutral).

## DTO TYPE CONTRACT

Expected response from `GET /api/cron-status` (built by Zone 1 / dev-mcp-server):
```typescript
interface CronStatusDto {
  fetched_at: string;          // ISO8601 UTC — server time, NEVER client-now
  layer_a_count: number;       // length of layer_a (derived at runtime)
  layer_b_count: number;       // length of layer_b
  layer_a: CronStatusRowA[];
  layer_b: CronStatusRowB[];
}

interface CronStatusRowA {
  name: string;                           // CRONS map key
  layer: "server";                        // always "server"
  cron_expr: string;                      // resolved cron expression
  human_schedule: string;                 // human-readable
  expected_last_fire: string | null;      // ISO8601 UTC; null if never should have fired yet
  expected_next_fire: string | null;      // ISO8601 UTC
  last_fire: string | null;               // ISO8601 UTC from cron_job_runs MAX(started_at); null = never run
  last_status: string | null;             // "success" | "error" | null
  status: "ON_TIME" | "LATE" | "MISSED" | "STALE" | "NEVER_FIRED";
  job_name_db: string;                    // actual job_name used to query cron_job_runs (may differ from CRONS key)
  reason?: string;                        // populated for non-ON_TIME rows (AC-29)
}

interface CronStatusRowB {
  name: string;                           // e.g. "cron-system-auditor" or file name
  layer: "cli-session";                   // always "cli-session"
  cron_expr: string;                      // cron expression from .md SSOT
  human_schedule: string;                 // human-readable
  expected_last_fire: null;               // always null
  expected_next_fire: null;               // always null — session-scoped
  last_fire: null;                        // always null
  last_status: null;                      // always null
  status: "SESSION_SCOPED";               // fixed
  reason: string;                         // "Session-scoped: fires only while a live CLI session is active"
}
```

## EDGE CASES & DEFENSES

**EC-1 — CRONS key ≠ cron_job_runs job_name:** Resolved by CN-1 hybrid resolution (Zone 1). If mismatch exists and no DB row found, status = NEVER_FIRED (honest, if potentially misleading). Zone 2 displays as-received from API.

**EC-3 — Fresh container startup (empty DB):** All Layer-A jobs show NEVER_FIRED. Zone 2 renders cleanly with all-null `last_fire` values.

**EC-6 — status IN ('success','error') excludes 'running'/'crashed':** By design (parity with watchdog). A job in mid-run shows previous completed timestamp. Crashed job = excluded from oracle (optional: separate `last_crashed_at` in reason, per CN-3).

## RETURN

DONE: Decomposed DASH-CRON-RECHECK-TABLE into 2 atomic tasks. Handoff TASK-DASH-CRON-2 (Zone 2, dev-frontend) created with 13 ACs, DTO contract, and detailed component specs.

FILES:
- `docs/handoffs/TASK-DASH-CRON-1.md` (sibling, dev-mcp-server)
- `docs/handoffs/TASK-DASH-CRON-2.md` (this file)

NEXT: dev-mcp-server (TASK-DASH-CRON-1) → dev-frontend (TASK-DASH-CRON-2)

PIPELINE: dev-mcp-server pickup, Zone 2 stages for dev-frontend after Zone 1 ships
