# Architecture Brief — Dashboard State Sync (Orchestration State → Frontend :3001)

**Date:** 2026-06-01  
**Author:** agents-architect  
**Status:** DESIGN — awaiting operator greenlight  
**Scope:** Analysis only — no code changes, no sprint commitment

---

## 1. Context

The frontend (`apps/frontend`, Remix + Bun, port 3001) currently renders market/analysis
data sourced entirely via SSR loaders → `api-gateway:4000` HTTP calls. Its rule is
inviolable: ALL backend calls through api-gateway, never direct microservice ports.

The multi-agent **orchestration state** — pipeline head, task board, signal dashboard,
agent notebooks, analysis briefs — lives exclusively in repo files under `docs/`. None of
it is reachable by any running HTTP service today.

This brief answers how to expose that state on the frontend without breaking the
architecture.

---

## 2. Brownfield Scan — Verified Facts

### 2.1 Existing surfaces (raw-verified)

**api-gateway (Go, `:4000`)**
- Routes: `GET /health`, `GET /healthz`, `GET /health/:service`, `GET /health-dashboard`
- Catch-all `/:service/*` reverse-proxy to registered upstreams (mcp, pdf, rag, ta,
  macro, stock, kinh-dich, alert, news, api)
- The `api` virtual alias maps `GET /api/*` → `mcp-server:3000` verbatim
- No file-reading capability, no docs/ volume mount, no `/api/pipeline*` or
  `/api/tasks*` endpoints

**mcp-server (Node/Bun, `:3000`)**
- 154 MCP tools + HTTP routes for market data, BCTC, signals, accuracy, news, etc.
- Existing routes: `/api/signals/stock/:code`, `/api/accuracy/digest`, `/api/watchlist`,
  `/api/bctc-inspect/*`, `/api/bctc-eval/*`, etc.
- `docs/pipeline-state.json` IS referenced in code
  (`tasksMdJanitorJob.ts`, schema test `1837a-pipeline-state.test.ts`) and read from
  the HOST filesystem during bun test — but the container has NO `docs/pipeline-state.json`
  mount in `docker-compose.yml`. The test resolves via relative path host-side only.
- `docs/agent-memory` IS volume-mounted: `./docs/agent-memory:/app/docs/agent-memory`
- `docs/data/*.json` (project-stats, stock-classification, alert-verdicts, bctc-eval-thresholds,
  daily-dashboard) are volume-mounted individually
- `docs/pipeline-state.json`, `docs/TASKS.md`, `docs/signals/DASHBOARD.md`,
  `docs/signals/*.json`, `docs/analysis-briefs/*.md` are NOT mounted

**frontend (Remix, `:3001`)**
- No `docs/` bind-mount in docker-compose
- `app/lib/api/client.ts` calls exclusively through `API_GATEWAY_URL` (default `:4000`)
- Existing domain formatters: `stale-badge.ts` (classifyStaleBadge), `change-pct.ts`,
  `direction-arrow.ts`, `signal-type-label.ts` — all testable pure functions
- Existing routes: analysis, services, fetch-ops, VPS proxy, database, BCTC eval

**Signal substrate (docs/signals/)**
- `docs/signals/DASHBOARD.md` — human-authored markdown, per-agent sections, rows are
  signal-queue for agents not yet drained; NOT a reliable machine-queryable log
- `docs/signals/*.json` + `docs/signals/processed/` — point-in-time agent signals;
  machine JSON but ephemeral (drained, not a DB)
- Agent signals stored in DB: `agent_signals` table in `market.db` — but MAX(created_at)
  was 2026-05-14 (legacy; live substrate is JSON bus not this table per DASHBOARD.md audit)
- `signals.db` in `docs/signals/` — SQLite but not mounted in mcp-server container

---

## 3. State Classes — Source of Truth & Transport Analysis

| State class | Current SSOT | Machine-readable? | Container reachable? |
|---|---|---|---|
| Pipeline head (status/wip/active_task) | `docs/pipeline-state.json` | Yes (JSON) | No — not mounted |
| Task board (sprint/backlog) | `docs/TASKS.md` | No — Markdown, human-authored | No — not mounted |
| Signal dashboard (open/severity/zone) | `docs/signals/DASHBOARD.md` | No — Markdown table | No — not mounted |
| Signal inbox (raw events) | `docs/signals/*.json` | Yes (JSON, ephemeral) | No — not mounted |
| Agent notebooks | `docs/agent-memory/notebooks/*.md` | No — Markdown | Yes — mounted at `/app/docs/agent-memory` |
| Analysis briefs | `docs/analysis-briefs/*.md` | No — Markdown | No — not mounted |
| Market signal history | `market.db` / `agent_signals` table | Yes (SQL) | Yes — via `/api/signals/stock/:code` |
| Accuracy digest | `market.db` / `signal_outcomes` | Yes (SQL) | Yes — via `/api/accuracy/digest` |

**Key finding:** `docs/agent-memory` is the ONLY orchestration-adjacent directory already
volume-mounted in mcp-server. Everything else (pipeline-state, TASKS.md, DASHBOARD.md,
analysis-briefs) is host-only.

---

## 4. Option Analysis

### Option A — New HTTP endpoints in mcp-server that read files/DB (RECOMMENDED)

mcp-server adds read-only JSON endpoints that read `docs/` state files from the mounted
volume (after extending docker-compose mounts) and serialize to JSON. api-gateway proxies
them via the existing `/api/*` → `mcp-server:3000` catch-all. Frontend loaders call the
new endpoints through api-gateway as they do today.

**Transport path:**
```
Remix loader → apiGet("/api/orchestration/pipeline")
  → api-gateway :4000 (catch-all /api/* → mcp-server:3000)
  → mcp-server GET /api/orchestration/pipeline
  → reads /app/docs/pipeline-state.json (new volume mount)
  → returns JSON
```

**Pros:**
- Preserves the api-gateway-only invariant (zero change to that rule)
- mcp-server already reads docs/ files (tasksMdJanitorJob, pipeline-state test)
- New endpoints are thin read-only handlers — no business logic
- api-gateway catch-all already routes all `/api/*` → no api-gateway code change needed
- Additive — no regressions in existing routes or tests

**Cons:**
- Requires 4 new volume mounts in docker-compose.yml
  (`docs/pipeline-state.json`, `docs/TASKS.md`, `docs/signals/DASHBOARD.md`,
  `docs/analysis-briefs/` as a directory)
- TASKS.md and DASHBOARD.md require Markdown parsing in the endpoint (risk — see §7)
- mcp-server container rebuild needed after code change (per policy)
- Stale-on-rebuild risk for pipeline-state if container is up while the file updates
  (mitigated: file is read at request time, not startup)

---

### Option B — Bind-mount docs/ into the frontend container + file-reading loaders

Frontend container gets `./docs:/app/docs:ro` and Remix loaders read files directly.

**Verdict: REJECTED.** Violates the documented "ALL backend calls go through api-gateway"
rule in `app/lib/api/client.ts`. Also introduces a second code path for the same data
that will drift. File-size caps and markdown parsing risk remain.

---

### Option C — Sync job materializes file-state into a DB table

A cron job (new or extended from tasksMdJanitorJob) parses the docs/ files and writes
structured rows into market.db on every update. Existing `/api/*` query endpoints read
from DB.

**Pros:** Cleanest query surface, no on-request file I/O, DB already accessible.

**Cons:**
- Adds a cron+parser layer between source and display: lag (up to 1 cron tick = ~30min)
- Markdown parsing fragility moves from HTTP handler to cron scheduler
- Schema additions to market.db (migration + rebuild)
- Substantially higher scope: cron job + DB schema + endpoints + frontend

**Verdict:** Over-engineered for this cadence (state changes hourly at most). Option A
subsumes the file-read; sync-to-DB is only warranted if query patterns require historical
trending, which is not requested.

---

### Hybrid recommendation

**Option A for all state classes except TASKS.md/DASHBOARD.md.**

For TASKS.md and DASHBOARD.md: introduce a machine-writable JSON twin alongside the
Markdown file (see §7). The endpoint reads the JSON twin; the Markdown stays for human
consumption. This eliminates the Markdown-parsing fragility while not changing the human
authoring workflow — agents emit BOTH formats via the signal-dashboard skill update.

---

## 5. Refresh Model

| State class | Change cadence | Recommended model |
|---|---|---|
| Pipeline head | Per agent cycle (~:07 cron hourly) | Loader poll on navigation + manual refresh button; no SSE needed |
| Task board | Several times per day (human + PO) | Loader poll on navigation; stale badge if `updated_at` > 2h |
| Signal dashboard | Per agent cycle (hourly) | Loader poll on navigation |
| Agent notebooks | Per agent cycle (hourly) | Loader poll; no auto-refresh |
| Analysis briefs | Per analyst run (daily/on-demand) | Loader poll; stale if `updated_at` > 4h market hours |
| Market signals (DB) | Near-real-time (cron ticks) | Already working; keep existing pattern |

**Verdict:** Navigation-time loader poll with a manual refresh button is sufficient.
The system has no sub-minute update cadence on orchestration state. SSE/websocket adds
significant complexity for hourly-at-most updates — do not implement.

If a future operator need for live push emerges, add a `Cache-Control: no-store` header
to the new endpoints and revisit then.

---

## 6. Proposed Frontend Routes & Components

### New nav tabs (add to `NAV_ITEMS` in `dashboard.tsx`)

| Route | Label | Data source |
|---|---|---|
| `/dashboard/pipeline` | Pipeline | `GET /api/orchestration/pipeline` |
| `/dashboard/tasks` | Tasks | `GET /api/orchestration/tasks` |
| `/dashboard/signals` | Signals | `GET /api/orchestration/signals` |

Agent notebooks and analysis briefs are lower priority; defer to follow-up sprint or
surface as sub-cards under /dashboard/pipeline.

### New mcp-server endpoints

```
GET /api/orchestration/pipeline
  → reads /app/docs/pipeline-state.json
  → returns: { status, active_task_id, next_agent, wip, wip_max, updated_at, updated_by,
               watch_items[], open_sprints[], current_sprint, last_updated_iso }

GET /api/orchestration/tasks
  → reads /app/docs/data/tasks-state.json (machine twin — see §7)
  → returns: { sprints: [{ id, status, items: [{ id, status, label }] }],
               backlogs: string[], last_updated_iso }

GET /api/orchestration/signals
  → reads /app/docs/data/signals-state.json (machine twin — see §7)
  → returns: { by_agent: { [agent]: [{ id, severity, ts, summary, status }] } },
               last_updated_iso }
```

All three endpoints MUST include a `last_updated_iso` field derived from the source file
`mtime` or an embedded `_updated_at` field. This feeds the stale badge logic.

### Domain types (new, in `apps/frontend/app/domain/`)

- `orchestration.ts` — PipelineState, TasksState, SignalsState response shapes
- Reuse `classifyStaleBadge` from `app/domain/formatters/stale-badge.ts`
  with threshold: pipeline=70min (>1 cron tick), tasks=120min, signals=70min

### Stale badge display rule

All three new cards show a STALE amber banner if `last_updated_iso` is older than the
threshold. This is mandatory (system-wide false-green failure culture — show staleness
honestly, never silently-OK).

---

## 7. SSOT / Markdown Parsing Risk — VERDICT

**CRITICAL risk: do NOT parse TASKS.md or DASHBOARD.md markdown in an HTTP endpoint.**

Rationale:
- Both files are human-authored, free-form markdown with varying section structures
- DASHBOARD.md is already 140 lines of deeply nested pipe-table rows with embedded
  backtick code, multi-line cells, and signal payloads containing shell-injection
  characters (documented `feedback_signal_payload_shell_injection` incident)
- TASKS.md has sprint-block headers, emoji, unicode, nested bullet structures — any
  regex parser will have false-positive/false-negative failure modes
- A broken parser silently returns empty or wrong data = false-green, the most
  dangerous failure mode for this system

**Recommended fix: machine JSON twins**

Agents that write TASKS.md / DASHBOARD.md ALSO write a lightweight machine-readable
sidecar:

| Markdown source | Machine twin (new) | Writer |
|---|---|---|
| `docs/TASKS.md` | `docs/data/tasks-state.json` | PO signal at each TASKS.md update |
| `docs/signals/DASHBOARD.md` | `docs/data/signals-state.json` | signal-dashboard skill at each DASHBOARD write |
| `docs/pipeline-state.json` | (already JSON — use directly) | every agent at RETURN |

The machine twins are NOT full duplicates — they extract only the subset the dashboard
needs (sprint list, open tasks, signal rows with status≠RESOLVED). They are written by
the same agent that writes the Markdown; no separate sync job. The Markdown stays the
canonical human-readable form; the JSON twin is the machine-readable projection.

**Implication for implementation:** this requires a `po` or `signal-dashboard` skill
change to emit the JSON twin on each relevant write. This is a flow/agent change
(agent-father lane) not a dev-apps change. Must be coordinated before the dev tasks run,
otherwise the endpoints exist but serve empty JSON.

**Alternative if twins are not implemented first:** pipeline-state.json is already pure
JSON (safe). Surface ONLY pipeline-state in Sprint 1; defer tasks/signals until twins
are ready. This gives immediate value with zero parsing risk.

---

## 8. Security / Scope Considerations

**Safe to expose (read-only JSON):**
- `docs/pipeline-state.json` — no secrets, no payloads, pure structural state
- `docs/data/tasks-state.json` (twin) — task IDs, statuses, labels only
- `docs/data/signals-state.json` (twin) — summaries, severity, status; no raw payloads

**Exclude from any endpoint:**
- Raw signal payload fields from DASHBOARD.md (contain shell-injection characters)
- `docs/signals/*.json` inbox files (raw agent payloads, potentially unsafe strings)
- `.env` and any auth files (not in docs/ but belt-and-suspenders reminder)
- `docs/agent-memory/notebooks/*.md` — contain VPS credentials references, Telegram
  channel IDs, and internal system details; if surfaced, redact or summarize only

**Volume mount scope:** add only the 3 specific files/directories needed; do NOT
mount `docs/` wholesale (would expose TASKS_ARCHIVE, incidents, briefings, etc. to the
container process).

---

## 9. DDD Layer Assignment

| Layer | Artifact |
|---|---|
| Domain | `OrchestrationStatePort` (interface) in `apps/mcp-server/src/domain/ports/` |
| Application | `GetPipelineStateUseCase`, `GetTasksStateUseCase`, `GetSignalsStateUseCase` in `apps/mcp-server/src/application/usecases/` |
| Infrastructure | `FileOrchestrationStateRepository` in `apps/mcp-server/src/infrastructure/` — reads JSON from `/app/docs/...` |
| Interface | 3 new route handlers in `apps/mcp-server/src/interface/mcp/routes/` + registration in `server.ts` |
| Frontend domain | `orchestration.ts` in `apps/frontend/app/domain/` |
| Frontend interface | 3 new route files in `apps/frontend/app/routes/` + api client functions in `app/lib/api/client.ts` |

---

## 10. Zones & Rough Scope

**Multi-zone — implement in sequence:**

| Zone | Tasks | Estimate |
|---|---|---|
| `docs/data/` (agent flow — agent-father) | Add JSON twin writes to PO + signal-dashboard skill | S (2 flow edits) |
| `docker-compose.yml` (ops) | 3 new volume mounts (pipeline-state.json, tasks-state.json, signals-state.json) | XS |
| `apps/mcp-server/` (dev-mcp-server) | Domain port + 3 use cases + infrastructure reader + 3 route handlers + server.ts wiring | M (est. 6 tasks) |
| `apps/frontend/` (dev-frontend) | Domain types + 3 api client functions + 3 route files + 3 UI components + nav items | M (est. 5 tasks) |
| qa + ops rebuild | Route contracts, stale badge accuracy, staleness verified live | S |

Total: approximately 14–18 atomic tasks across 3–4 zones. Medium sprint (not XS).

---

## 11. Build Standard

Existing services — **BUILD-STANDARD: lean** for both `apps/mcp-server/` and `apps/frontend/`.

---

## 12. Risk Flags

1. **MARKDOWN-PARSE-FOOTGUN (HIGH):** If dev implements TASKS.md/DASHBOARD.md endpoint
   before JSON twins exist, the parser will produce silent wrong data. Enforce: twin first,
   endpoint second. Block dev-mcp-server task on agent-father twin task.

2. **VOLUME-MOUNT-ORDER (MEDIUM):** New volume mounts require a container rebuild (not
   restart) of mcp-server. ops must run `docker compose up -d --build mcp-server`. A
   restart-only will leave the new mounts absent and endpoints will return 404/empty.

3. **STALE-FILE-STALE-ENDPOINT (MEDIUM):** If pipeline-state.json is not updated (agent
   crash, session gap), the endpoint returns old data with a fresh HTTP 200. The frontend
   MUST surface the `last_updated_iso` stale badge — never silently-OK. Threshold: 70min
   (>1 cron tick) → STALE banner.

4. **SIGNAL-PAYLOAD-INJECTION (HIGH — prevented by design):** Raw signal payloads in
   DASHBOARD.md contain shell-injection characters. The JSON twin writer (PO/skill, not
   the endpoint) must strip payloads and include only summary/severity/status fields in
   `signals-state.json`. The HTTP endpoint must not read DASHBOARD.md directly.

5. **mcp-server WIP budget:** mcp-server currently has multiple open sprints.
   New endpoints are additive (no schema change, no existing route modification) so
   collision risk is LOW, but schedule behind FLEET-HOST-SAFETY / ENV-ISOLATION P2.

---

## 13. Phased Delivery Recommendation

**Phase 1 (minimal value, zero parsing risk):**
- agent-father: emit `docs/data/tasks-state.json` twin from PO TASKS.md write
- ops: add `docs/pipeline-state.json` volume mount to mcp-server
- dev-mcp-server: `GET /api/orchestration/pipeline` endpoint (reads JSON directly)
- dev-frontend: `/dashboard/pipeline` route with stale badge
- qa + ops rebuild

**Phase 2 (full coverage, after twins are proven):**
- signal-dashboard skill: emit `docs/data/signals-state.json` twin
- ops: add two more volume mounts
- dev-mcp-server: tasks + signals endpoints
- dev-frontend: tasks + signals routes

---

_Brief owner: agents-architect. Implementation: route to PO for sprint planning._
