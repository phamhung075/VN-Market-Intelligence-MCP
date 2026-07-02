# BA Requirement Spec — DASH-CRON-RECHECK-TABLE

**Sprint:** DASH-CRON-RECHECK-TABLE
**BA task:** BA-DASH-CRON-RECHECK-TABLE
**Status:** SPEC COMPLETE
**Author:** ba
**Date:** 2026-07-01
**NEXT:** architect (zone SPLIT: dev-mcp-server + dev-frontend)

---

## 1. Feature Context

User request (verbatim): add a CRON RECHECK TABLE to `/dashboard/orchestration` (Remix :3001) so the user can see, per cron, **expected schedule → last actual fire → status** (ran on-time / late / missed / stale / never-fired).

**The gap (verified live):** `get_cron_health` (cronHealthTools.ts) emits `last_run / last_status / success_rate` but contains **no expected-vs-actual classification**. The status classification is the sole new compute gap. All oracle surfaces already exist and are proven.

**Two-layer honesty constraint (non-negotiable):**
- **Layer-A** = node-cron INSIDE mcp-server container (`apps/mcp-server/src/scheduler/cronConfig.ts` CRONS map, 85 keys at last read — do NOT hardcode this count). These are always-on while the container is up and are trackable via `cron_job_runs`.
- **Layer-B** = CLI CronCreate crons (`.claude/commands/crons/*.md` + cron-detect-loop skill + cron-cowork-team skill). These are SESSION-SCOPED: they fire only while a live Claude Code CLI session hosts them and evaporate on session exit. A Layer-B cron with no recent fire MUST be shown as `SESSION_SCOPED` (non-red), NEVER as `MISSED` or `FAILED`.

---

## 2. Live Surface Inventory (PO-verified, BA-confirmed)

| Surface | File | Role | Gap? |
|---------|------|------|------|
| CRONS map | `apps/mcp-server/src/scheduler/cronConfig.ts` | Layer-A cron SSOT — all cron expressions + `Bun.env` overrides | None — read this map at runtime |
| cronJobRunStore | `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` | DB oracle; `getCronJobHealthSummary` + raw `MAX(started_at)` query | None — reuse the MAX(started_at) SELECT |
| WATCHDOG_MANIFEST | `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts` | `cadenceMs × thresholdMultiplier` threshold for 16 jobs | GENERALIZE to all Layer-A crons |
| get_cron_health | `apps/mcp-server/src/interface/mcp/tools/alerts/cronHealthTools.ts` | Emits `last_run / last_status / success_rate / total_runs / avg_duration` | Missing expected-vs-actual classify |
| orchestrationHandler.ts | `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` | Pattern: `buildDto()` pure fn + `handleGet*()` HTTP handler | Mirror this pattern |
| api.orchestration.tsx | `apps/frontend/app/routes/api.orchestration.tsx` | `proxyUpstream` resource route | Mirror for api.cron-status.tsx |
| dashboard.orchestration.tsx | `apps/frontend/app/routes/dashboard.orchestration.tsx` | Existing table + FreshnessBadge + useRevalidator | Add Cron Recheck Table section here |
| Layer-B SSOT | `.claude/commands/crons/*.md` + cron-detect-loop skill + cron-cowork-team skill | 14 command specs + 4 detect-loop crons + 1 cowork master | Read at server startup; never hardcode |
| frontend-data-coverage-map.json | `docs/data/frontend-data-coverage-map.json` | Freshness SSOT for "Cập nhật lúc" badges | New cron-status row must be appended |

---

## 3. Critical Implementation Constraint — Job Name Mismatch

The CRONS map keys (e.g., `ohlcvDailyAggregator`) are NOT identical to the `job_name` strings written by wrapRun/recordJobRun into `cron_job_runs` (e.g., `ohlcv-daily-aggregator`). The `CANONICAL_WATCHDOG_JOB_NAMES` list in `schedulerWatchdogJob.ts` documents the verified mappings for the 16 watchdog-monitored jobs.

**BA requirement:** The status-compute path MUST resolve the `job_name` to query against `cron_job_runs`. Resolution strategy (ranked):
1. **Prefer WATCHDOG_MANIFEST key** — for the 16 jobs in WATCHDOG_MANIFEST, the key IS the real `job_name` recorded in DB (verified 2026-06-14).
2. **For remaining Layer-A crons** — use the CRONS map key as a best-effort `job_name` probe. If MAX(started_at) returns null AND the CRONS key is a known alias (not the real run-name), it will show `NEVER_FIRED` which is the honest fallback. The architect must decide whether to embed a full key→job_name mapping table or scan `DISTINCT job_name FROM cron_job_runs` to auto-resolve.
3. **BA ARCH-RATIFY item** (non-blocking): ARCH-RATIFY-CN-1 — architect decides the resolution strategy (a full mapping table vs runtime DISTINCT scan). The BA specifies the requirement; the implementation is architect's call.

---

## 4. Functional Requirements

### FR-1 — Layer-A Cron Row Construction (mcp-server, application layer)

For each key `k` in the live `CRONS` map (read at runtime, no hardcoded list):

**FR-1.1** Derive the cron expression: `Bun.env[CRON_ENV_KEY] ?? defaultValue`. The mcp-server already resolves these via `Bun.env` at startup; the status endpoint reads the resolved value.

**FR-1.2** Compute `human_schedule`: a short human-readable description of the cron expression (e.g., `"every 15 min"`, `"daily 09:00 UTC"`, `"Sunday 02:00 UTC"`). Parse from the expression; do NOT bake static strings.

**FR-1.3** Compute `expected_last_fire` and `expected_next_fire`: parse the cron expression to find the most recent fire time before `now` and the next fire time after `now`. Use the `node-cron` dependency (already present) or `cron-parser` package (architect decision). Use server-side `Date.now()` — NEVER client time.

**FR-1.4** Read `last_fire` and `last_status` from `cron_job_runs` via:
```sql
SELECT MAX(started_at) AS last_started_at, status
FROM cron_job_runs
WHERE job_name = ?
  AND status IN ('success', 'error')
```
This is the same double-log-immune pattern used by `schedulerWatchdogJob.queryLastStartedAt`. Include `error` rows because a job that ran but failed still fired its tick (cadence is not broken; only missing/very-old rows indicate a missed fire). Also retrieve the `last_status` of the most recent run.

**FR-1.5** Derive `cadenceMs` for ALL Layer-A crons:
- If the job is in `WATCHDOG_MANIFEST`: use `WATCHDOG_MANIFEST[jobName].cadenceMs` and `WATCHDOG_MANIFEST[jobName].thresholdMultiplier` exactly.
- If the job is NOT in WATCHDOG_MANIFEST: derive `cadenceMs` from the cron expression (minimum interval between consecutive fires). Use `thresholdMultiplier = 1.5` as default (matching the daily-job convention in the manifest).

**FR-1.6** Classify `status` using the WATCHDOG threshold logic (PARITY mandatory):
```
if last_fire === null:
  status = NEVER_FIRED
elif age_ms <= cadenceMs:
  status = ON_TIME
elif age_ms <= cadenceMs × thresholdMultiplier:
  status = LATE
elif age_ms <= cadenceMs × 3:
  status = MISSED       ← watchdog alert fires here (cadenceMs × threshold < age)
else:
  status = STALE        ← multiple cadences missed
```

**PARITY guarantee:** Any job the existing `schedulerWatchdogJob` would currently alert on (age > cadenceMs × thresholdMultiplier) MUST show `MISSED` or `STALE` in our table — never `ON_TIME` or `LATE`. This is verifiable by cross-checking against the watchdog's in-process `_alertCooldownMap` state for the 16 manifest jobs (success_metric (b)).

**FR-1.7** Row schema (per Layer-A cron):
```typescript
interface CronStatusRowA {
  name: string;               // CRONS map key (e.g. "morningBriefing")
  layer: "server";            // always "server" for Layer-A
  cron_expr: string;          // resolved cron expression
  human_schedule: string;     // human-readable (e.g. "weekdays 08:00 UTC")
  expected_last_fire: string | null;  // ISO8601 UTC; null if never should have fired yet
  expected_next_fire: string | null;  // ISO8601 UTC
  last_fire: string | null;   // ISO8601 UTC from cron_job_runs MAX(started_at); null = never run
  last_status: string | null; // "success" | "error" | null
  status: "ON_TIME" | "LATE" | "MISSED" | "STALE" | "NEVER_FIRED";
  job_name_db: string;        // actual job_name used to query cron_job_runs (may differ from CRONS key)
}
```

---

### FR-2 — Layer-B CLI Session Cron Row Construction (mcp-server, application layer)

**FR-2.1** Source Layer-B cron definitions from their SSOT at server startup (do not re-read on every request):
- `.claude/commands/crons/*.md` — 14 files; each file documents a CronCreate schedule for a CLI-session agent
- `.claude/skills/cron-detect-loop/SKILL.md` — 4 crons: `7,37 * * * *` (dev-team loop), `*/30 * * * *` (system-auditor T1), `0 */4 * * *` (system-auditor T2), `0 2 * * *` (system-auditor T3)
- `.claude/skills/cron-cowork-team/SKILL.md` — 1 cron: `*/15 * * * *` (cowork master dispatcher)

**FR-2.2** Row schema (per Layer-B cron):
```typescript
interface CronStatusRowB {
  name: string;               // e.g. "cron-system-auditor" or "cron-detect-loop/dev-team"
  layer: "cli-session";       // always "cli-session" for Layer-B
  cron_expr: string;          // cron expression from the .md SSOT
  human_schedule: string;     // human-readable
  expected_last_fire: null;   // always null — no server-side run tracking
  expected_next_fire: null;   // always null — session-scoped
  last_fire: null;            // always null — no cron_job_runs rows for Layer-B (BY DESIGN)
  last_status: null;          // always null
  status: "SESSION_SCOPED";   // fixed — NEVER "MISSED" or "FAILED"
  reason: string;             // "Session-scoped: fires only while a live CLI session is active"
}
```

**FR-2.3** The "Cập nhật lúc" freshness badge on the table applies to the Layer-A data fetch time. Layer-B rows carry a static note ("Phiên làm việc") instead of a data timestamp.

---

### FR-3 — REST Endpoint `GET /api/cron-status` (mcp-server, interface layer)

**FR-3.1** New handler file: `apps/mcp-server/src/interface/mcp/routes/cronStatusHandler.ts`.
Pattern: mirrors `orchestrationHandler.ts` exactly — one exported pure `buildCronStatusDto()` function + one exported `handleGetCronStatus(req, res)` HTTP handler.

**FR-3.2** Response shape:
```typescript
interface CronStatusDto {
  fetched_at: string;          // ISO8601 UTC — server-side time of response (NEVER client-now)
  layer_a_count: number;       // length of layer_a array (derived at runtime)
  layer_b_count: number;       // length of layer_b array
  layer_a: CronStatusRowA[];
  layer_b: CronStatusRowB[];
}
```

**FR-3.3** Registered in `apps/mcp-server/src/interface/mcp/server.ts`:
```typescript
if (method === "GET" && pathname === "/api/cron-status") {
  handleGetCronStatus(req, res);
  return;
}
```
Pattern mirrors the `GET /api/orchestration` block at line 2125 of server.ts.

**FR-3.4** Error handling: 503 JSON `{ error: "..." }` on any unhandled exception. Never crash the HTTP server.

**FR-3.5** `get_cron_health` data reuse: the endpoint EXTENDS get_cron_health by adding expected-vs-actual. It does NOT duplicate cron_job_runs queries — the same `getCronJobHealthSummary` result can satisfy `last_run` / `last_status`; a single additional `MAX(started_at)` SELECT per job covers jobs not in the 7-day health window.

---

### FR-4 — Frontend Proxy Route (dev-frontend, interface layer)

**FR-4.1** New file: `apps/frontend/app/routes/api.cron-status.tsx`
Pattern mirrors `api.orchestration.tsx` exactly:
```typescript
export async function loader({ request: _request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/cron-status`;
  return proxyUpstream(upstream, { method: "GET", headers: { Accept: "application/json" } }, { label: "api.cron-status" });
}
```

---

### FR-5 — Cron Recheck Table UI (dev-frontend, interface layer)

**FR-5.1** Add a `CronRecheckTable` section to `apps/frontend/app/routes/dashboard.orchestration.tsx`. Location: below existing sections (after Signal Queue or Narrative — architect / designer call; BA does not prescribe UI ordering).

**FR-5.2** Table columns (user-facing copy in plain Vietnamese):
| Column key | Vietnamese label | Value |
|---|---|---|
| name | Tên cron | CRONS map key (Layer-A) or command file name (Layer-B) |
| layer | Lớp | "Server" (Layer-A) \| "Phiên làm việc" (Layer-B) |
| human_schedule | Lịch dự kiến | Human-readable cron expression |
| last_fire | Lần chạy gần nhất | ISO timestamp formatted as VN locale time; "Chưa từng chạy" if null |
| expected_next_fire | Dự kiến lần tới | ISO → VN locale; null for Layer-B |
| status | Trạng thái | Colored badge (see FR-5.3) |

**FR-5.3** Status badge colors:
| Status value | Badge color | Vietnamese label |
|---|---|---|
| ON_TIME | green | Đúng giờ |
| LATE | amber | Trễ nhẹ |
| MISSED | red | Bỏ lỡ |
| STALE | red (darker) | Quá hạn |
| NEVER_FIRED | grey | Chưa từng chạy |
| SESSION_SCOPED | blue | Phiên làm việc |

**FR-5.4** Visual layer separation: Layer-A rows and Layer-B rows are visually distinct — either a section header divider ("Server crons / Cron máy chủ" and "CLI session crons / Cron phiên làm việc") or background shading. Layer-B rows MUST NOT render a red/amber status badge — SESSION_SCOPED is always blue/neutral.

**FR-5.5** RECHECK button: triggers `revalidate()` from `useRevalidator()` (already imported on the page). Button label: "Kiểm tra lại". Re-fetches `/api/cron-status` via the Remix loader — no full page reload.

**FR-5.6** Freshness badge "Cập nhật lúc": display `fetched_at` from the DTO using the existing `FreshnessBadge` component (already imported on the page). `fetched_at` comes from the server-side response — NEVER client `Date.now()`. Layer-B rows show "Phiên làm việc" in place of a data timestamp.

**FR-5.7** Loader pattern:
```typescript
// Inside dashboard.orchestration.tsx existing loader:
const { data: cronStatus } = await safeFetch<CronStatusDto>(
  `${origin}/api/cron-status`,
  parseCronStatusDto,
  { label: "dashboard.cron-status" },
);
```
OR loaded in a separate sub-request — architect decides; both are compliant.

**FR-5.8** Never-fired display: when `last_fire` is null, render "Chưa từng chạy" in the last-fire column — NEVER a fabricated timestamp or "—" without explanation.

---

### FR-6 — frontend-data-coverage-map.json Update

After shipping, the dev-frontend task appends a new row to `docs/data/frontend-data-coverage-map.json`:
```json
{
  "page": "orchestration",
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

---

## 5. Non-Functional Requirements

**NFR-1 (Honesty — no fake data):** `last_fire: null` is the truthful representation of a never-fired job. NEVER synthesize a timestamp. NEVER default to current time. `NEVER_FIRED` status is the honest representation, not an error.

**NFR-2 (Server-side time only):** `expected_last_fire`, `expected_next_fire`, and `fetched_at` are all computed server-side using `Date.now()` at the moment the HTTP handler runs. The frontend displays these values as-received. No client-side clock substitution.

**NFR-3 (No count hardcoding):** Layer-A row count = `Object.keys(CRONS).length` at runtime. `layer_a_count` in the DTO is derived, never a constant. The QA gate for AC-1 checks row count == map size at that moment, not a magic number.

**NFR-4 (Read-only):** `GET /api/cron-status` is strictly read-only. No mutation of any table, file, or in-process state. No triggering of jobs (scope_out: NO auto-restart from UI).

**NFR-5 (No regression to existing orchestration view):** The existing `/api/orchestration` endpoint and `task_board` section are unchanged. The new endpoint is an independent addition — no shared mutable state with orchestrationHandler.

**NFR-6 (PARITY with schedulerWatchdogJob):** For each of the 16 WATCHDOG_MANIFEST jobs, the status classification MUST agree with the watchdog's current verdict. A divergence (watchdog says stale, table says ON_TIME) is a blocking QA failure.

**NFR-7 (Layer-B honesty):** A Layer-B cron MUST NEVER display a red or amber status badge. SESSION_SCOPED is the terminal and non-red status for all Layer-B rows regardless of last_fire value.

---

## 6. DDD Layer Mapping

| Requirement | DDD Layer | File / Module |
|---|---|---|
| Status classification algorithm | Application | `apps/mcp-server/src/application/` or collocated in handler (architect decides) |
| cron_job_runs MAX(started_at) SELECT | Infrastructure | `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` (new export) |
| CRONS map read | Infrastructure (config) | `apps/mcp-server/src/scheduler/cronConfig.ts` (existing, no change) |
| WATCHDOG_MANIFEST cadenceMs/threshold read | Infrastructure (config) | `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts` (existing, no change) |
| Layer-B SSOT read (filesystem) | Infrastructure | Read `.claude/commands/crons/*.md` + skill files at startup |
| buildCronStatusDto() | Interface / Application | `cronStatusHandler.ts` — pure function, no side effects |
| handleGetCronStatus() | Interface | `cronStatusHandler.ts` + registration in `server.ts` |
| api.cron-status.tsx proxy | Interface (frontend) | `apps/frontend/app/routes/api.cron-status.tsx` |
| CronRecheckTable UI | Interface (frontend) | `apps/frontend/app/routes/dashboard.orchestration.tsx` |

---

## 7. Edge Cases

**EC-1 — CRONS map key is not the cron_job_runs job_name:** The CRONS key `ohlcvDailyAggregator` maps to DB name `ohlcv-daily-aggregator`. For the 16 WATCHDOG_MANIFEST jobs, the manifest key IS the real DB name. For others, a best-effort probe is acceptable; if null is returned for a job that has run, it shows NEVER_FIRED (honest, if misleading). The architect must document the unmapped jobs in the ARCH brief.

**EC-2 — Cron expression with restricted hours:** Jobs like `vpsProxyWatchdog` (`*/10 2-8 * * 1-5`) only fire during market hours. Outside market hours, `expected_last_fire` may be many hours in the past — this is CORRECT and should be shown as ON_TIME (not LATE). The cadence derivation must account for time-restricted expressions: `cadenceMs` represents the cadence WITHIN the allowed window, not calendar-wall time between fires. ARCH-RATIFY-CN-2: architect specifies how to handle restricted-window cadence derivation.

**EC-3 — New mcp-server container startup (fresh DB):** All Layer-A jobs show NEVER_FIRED. This is the honest representation. The table must render cleanly with all-null last_fire values — no crash, no fabricated data.

**EC-4 — `restartCadenceAlert` fires at `15,45 * * * *` (2 fires per hour):** Cadence = 30 min = 1_800_000 ms. This is a multi-value minute expression; the cadence is the minimum gap between fires. Cron parser must handle comma-separated minute values.

**EC-5 — Layer-B cron definition files change during a running server:** The Layer-B list is loaded at startup. If a new .md file is added, the server must restart to reflect it. This is acceptable (scope_out: no live-refresh of Layer-B definitions).

**EC-6 — `status IN ('success', 'error')` excludes 'running' and 'crashed':** A job in mid-run shows its previous completed timestamp. A crashed job (status='crashed') is also excluded from the last_fire oracle — this is intentional (mirrors watchdog behavior). Architect may opt to include 'crashed' in a separate `last_crashed_at` field; BA marks this ARCH-RATIFY-CN-3.

---

## 8. Architect-Ratify Items (non-blocking, hand to architect)

| ID | Question |
|----|----------|
| ARCH-RATIFY-CN-1 | CRONS map key → cron_job_runs job_name resolution strategy: full static mapping table vs `DISTINCT job_name FROM cron_job_runs` runtime scan? |
| ARCH-RATIFY-CN-2 | Cadence derivation for time-window-restricted expressions (e.g., `*/10 2-8 * * 1-5`): use minimum-in-window interval or treat as effective cadence? |
| ARCH-RATIFY-CN-3 | Include `'crashed'` status in MAX(started_at) query? |
| ARCH-RATIFY-CN-4 | Loader pattern for CronRecheckTable data: combined into existing loader (one round-trip) or separate safeFetch (simpler isolation)? |
| ARCH-RATIFY-CN-5 | Layer-B cron parsing: parse .md files at server startup (light, startup cost) vs static embedded table in code (simpler, manual sync burden)? PO mandates filesystem-read as default to avoid manual sync. |

---

## 9. PO Blockers

**NONE.** The sprint is fully specified from live-verified surfaces. No PO decisions required before architect can start the SPLIT.

---

## 10. Numbered Acceptance Criteria

Each AC maps to the sprint `success_metric` (a)–(e) and standing gates.

### Group A — Endpoint correctness (maps to metric (a))

**AC-1:** `GET /api/cron-status` returns HTTP 200 with `Content-Type: application/json`.

**AC-2:** The `layer_a` array contains exactly `Object.keys(CRONS).length` rows (derived at runtime from the live CRONS map). QA verifies by fetching the endpoint and comparing `response.layer_a_count === Object.keys(CRONS).length` — NOT against a hardcoded number.

**AC-3:** Every row in `layer_a` has the fields: `name`, `layer`, `cron_expr`, `human_schedule`, `expected_last_fire`, `expected_next_fire`, `last_fire`, `last_status`, `status`, `job_name_db`. No row is missing any required field (null is acceptable for optional fields, missing key is a failure).

**AC-4:** Every `layer_a` row has `layer === "server"`.

**AC-5:** `status` for every `layer_a` row is one of `{ON_TIME, LATE, MISSED, STALE, NEVER_FIRED}` — no other value accepted.

**AC-6:** A row where `last_fire` is null has `status === "NEVER_FIRED"`.

**AC-7:** `fetched_at` in the response is an ISO8601 UTC timestamp within 5 seconds of the request time. It is NOT a client-generated timestamp.

### Group B — Status classification parity (maps to metric (b))

**AC-8:** For each of the 16 `WATCHDOG_MANIFEST` jobs: if a fresh `cron_job_runs` row exists with `MAX(started_at)` within `cadenceMs` of `now`, the endpoint returns `status === "ON_TIME"` for that job.

**AC-9 (PARITY gate):** For each of the 16 `WATCHDOG_MANIFEST` jobs: if `MAX(started_at)` exceeds `cadenceMs × thresholdMultiplier` of `now`, the endpoint returns `status === "MISSED"` or `status === "STALE"` — NEVER `ON_TIME` or `LATE`. QA verifies by cross-checking against `runSchedulerWatchdog()` verdict for the same job at the same moment (divergence = FAIL).

**AC-10:** A job with `MAX(started_at)` between `cadenceMs` and `cadenceMs × thresholdMultiplier` of `now` returns `status === "LATE"`.

**AC-11:** A job with `MAX(started_at)` more than `cadenceMs × 3` ago returns `status === "STALE"`.

### Group C — Layer-B honesty (maps to metric (c))

**AC-12:** The `layer_b` array is non-empty and contains at least one row for each `.claude/commands/crons/*.md` file (14 files minimum) plus entries for cron-detect-loop and cron-cowork-team skills.

**AC-13:** Every `layer_b` row has `layer === "cli-session"` and `status === "SESSION_SCOPED"`.

**AC-14:** NO `layer_b` row has `status` of `MISSED`, `LATE`, `STALE`, `NEVER_FIRED`, or any red/amber value.

**AC-15:** `layer_b` rows have `last_fire: null`, `expected_last_fire: null`, `expected_next_fire: null` — no fabricated timestamps.

### Group D — Frontend rendering (maps to metric (d))

**AC-16:** `/dashboard/orchestration` renders the Cron Recheck Table without a JavaScript error or blank section.

**AC-17:** The table displays all `layer_a` rows and all `layer_b` rows without truncation or pagination skipping rows.

**AC-18:** Layer-A and Layer-B rows are visually distinct (section header or shading — implementation-defined).

**AC-19:** Layer-B rows render a blue/neutral "Phiên làm việc" badge — NO red or amber badge.

**AC-20:** A row with `last_fire: null` (Layer-A, never fired) renders "Chưa từng chạy" in the last-fire column — NOT a fabricated timestamp, NOT blank.

**AC-21 (RECHECK button):** Clicking "Kiểm tra lại" triggers `useRevalidator().revalidate()` and the table refreshes with a new `fetched_at` value. No full page reload required.

**AC-22 (Freshness badge):** The "Cập nhật lúc" badge displays the `fetched_at` field from the DTO response. After a RECHECK, the badge updates to the new `fetched_at`. The badge never shows a client-generated time.

### Group E — No regression (maps to metric (e))

**AC-23:** `GET /api/orchestration` continues to return 200 with the existing DTO shape unchanged. The existing orchestration task-board, head, signal-queue, sprint-goal, and narrative sections render correctly.

**AC-24:** No new JavaScript error or React boundary in the existing sections of `/dashboard/orchestration` after the Cron Recheck Table is added.

**AC-25:** The new `GET /api/cron-status` endpoint does not share mutable state with `GET /api/orchestration` — they may run concurrently without interference.

### Group F — Standing gates (from sprint standing_acs)

**AC-26 (No fake data):** QA injects a scenario where a known-running job has NO `cron_job_runs` row (e.g., test against an empty DB). The endpoint returns `status: "NEVER_FIRED"` and `last_fire: null` — no fabricated value.

**AC-27 (Server-side time):** The `expected_last_fire`, `expected_next_fire`, and `fetched_at` fields are all computed with the server's clock at handler-call time. QA verifies by checking the values against server time (±10s tolerance) — NOT against client clock.

**AC-28 (Vietnamese copy):** All user-facing column headers, badge labels, and status descriptions on the dashboard table are in plain Vietnamese (no English jargon visible to the user). Work artifacts (code, API JSON keys, DTO field names) remain in English.

**AC-29 (Source/detail affordance):** When a status is MISSED or STALE, a hover tooltip or detail row shows the reason (e.g., "Lần chạy cuối: 2026-06-28T10:00Z — quá hạn 48h (ngưỡng: 1.5×)"). At minimum a `reason` field in the DTO is populated for non-ON_TIME rows.

---

## 11. Multi-Zone SPLIT Guidance for Architect

The architect must SPLIT this into two independent zones:

**Zone 1 — dev-mcp-server:**
- `apps/mcp-server/src/interface/mcp/routes/cronStatusHandler.ts` (new)
- `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` (new export: `getLastStartedAt(db, jobName)`)
- `apps/mcp-server/src/interface/mcp/server.ts` (add GET /api/cron-status registration, ~3 lines)
- Resolve ARCH-RATIFY-CN-1 (job name mapping), CN-2 (window-restricted cadence), CN-3 (crashed status), CN-5 (Layer-B SSOT parse strategy)

**Zone 2 — dev-frontend:**
- `apps/frontend/app/routes/api.cron-status.tsx` (new proxy route, ~10 lines)
- `apps/frontend/app/routes/dashboard.orchestration.tsx` (add CronRecheckTable section + loader update)
- `docs/data/frontend-data-coverage-map.json` (append cron-status row — FR-6)
- Resolve ARCH-RATIFY-CN-4 (loader pattern)

**Zone 1 must ship before Zone 2 can be tested end-to-end.** Zone 2 can be developed against a mock/stub of the endpoint.

---

## 12. Success Metric Coverage Map

| Sprint metric | Covered by ACs |
|---|---|
| (a) GET /api/cron-status 200 + one row per Layer-A cron from live CRONS map | AC-1, AC-2, AC-3, AC-4, AC-5 |
| (b) ON_TIME if fresh success row; MISSED/STALE if age > cadence × threshold; parity with watchdog | AC-8, AC-9, AC-10, AC-11 |
| (c) Layer-B: layer=cli-session + SESSION_SCOPED + non-red + no fabricated fire timestamp | AC-12, AC-13, AC-14, AC-15 |
| (d) Table renders; RECHECK re-fetches; "Cập nhật lúc" shows real fetch time; never-fired = "Chưa từng chạy" | AC-16–AC-22 |
| (e) No regression to existing orchestration view or /api/orchestration | AC-23, AC-24, AC-25 |
| Standing: freshness "Cập nhật lúc" = real fetch time | AC-22, AC-27 |
| Standing: no fake data / honest-NULL | AC-20, AC-26 |
| Standing: plain Vietnamese copy | AC-28 |
| Standing: source/detail on MISSED/STALE | AC-29 |

Total ACs: **29**

---

## [Architect] Brownfield Findings

- **Zone:** multi — SPLIT into `apps/mcp-server/` (Zone 1) + `apps/frontend/` (Zone 2). Full brief: `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md`
- **BUILD-STANDARD:** lean (both zones already exist — new feature, not new service)

**Verified paths (Zone 1):**
- `apps/mcp-server/src/scheduler/cronConfig.ts` — 85 CRONS keys read live (not hardcoded in any output; count read at runtime).
- `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts:112-224` — `WATCHDOG_MANIFEST` (16 jobs) + `CANONICAL_WATCHDOG_JOB_NAMES`; existing public exports, read-only reuse, no modification.
- `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` — extend with 2 additive exports (`getLastRunForJob`, `getDistinctJobNames`); zero signature changes to existing exports.
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — exact pattern to mirror for `cronStatusHandler.ts`.
- `apps/mcp-server/src/interface/mcp/server.ts:2125` — exact registration block to mirror for `GET /api/cron-status`.
- `.claude/commands/crons/*.md` (14 files) — verified NOT uniform format; 2 files break a naive single-regex parse (see Design decisions).

**Reuse patterns:**
- Extend `cronJobRunStore.ts` rather than duplicate the `MAX(started_at)` query pattern already proven in `schedulerWatchdogJob.queryLastStartedAt`.
- Read `WATCHDOG_MANIFEST` directly (import, no copy) for the 16-job cadence/threshold source of truth — guarantees AC-9 PARITY by construction rather than by convention.
- `dashboard.orchestration.tsx`'s existing `revalidator` (line 888, already drives the page's 5s auto-poll) is reused for the RECHECK button — no second refresh mechanism built.

**Design decisions (full detail + rationale in the brief):**
- **CN-1 (job_name resolution):** hybrid — static 16-pair reverse-map (verified table in brief §2) + normalized-match against runtime `DISTINCT job_name` scan + honest CRONS-key-as-probe fallback.
- **CN-2 (restricted-window cadence):** `cadenceMs` = MIN successive delta across next N=6 `cron-parser`-sampled occurrences — one generic algorithm, no per-expression special-casing (handles EC-2 + EC-4 uniformly).
- **CN-3 (crashed status):** excluded from primary oracle (parity with existing watchdog filter); optional `reason` enrichment only.
- **CN-4 (loader pattern):** combined into existing loader via `Promise.all` (parallel fetch); makes Zone-1 memoization load-bearing (see Risk R1).
- **CN-5 (Layer-B parse):** filesystem-read at startup, memoized — **only** `.claude/commands/crons/*.md` (13 live files), NOT the 2 re-arm skill files (would double-count 5 crons — see Risk R2, a real correction to BA FR-2.1).
- **New dependency:** `cron-parser` — verified absent from repo entirely; `node-cron`'s public API has no next/prev-fire computation and its internals are unexported/unsafe to deep-import.

**Risk flags:** 7 flagged in the brief §5 — R1 (perf, memoization load-bearing), R2 (BA FR-2.1 double-counts Layer-B sources — AC-12 wording correction needed), R3 (2 of 14 command files break naive single-regex parse), R4 (new `cron-parser` dependency), R5 (3 manifest jobs inherit a pre-existing weekend-gap under-coverage — must NOT be "fixed" here, would violate AC-9 PARITY), R6 (DDD — no new violation), R7 (all changes additive, zero regression risk to `get_cron_health`/`GET /api/orchestration`).

**Scan clean:** true ✓

---

## RETURN
DONE: Technical design complete, brownfield findings written to `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md`
ZONE: multi — `apps/mcp-server/` + `apps/frontend/` (SPLIT, see brief §1)
NEXT: pm | decompose into 2 dev-* work units (dev-mcp-server ships first; dev-frontend can build against a stub) per `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md`
HANDOFF: docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md
PIPELINE: continue
