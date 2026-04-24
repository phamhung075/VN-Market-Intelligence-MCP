# TECH-123: OHLCV Backfill Queue — Auto-seed daily_ohlcv via VPS Pull Pattern

status: APPROVED_BY_ARCHITECT
req_ref: REQ-123

## Brownfield Impact

- Files modified:
  - `src/infrastructure/db/schema.ts` — add `ohlcv_backfill_queue` DDL inside `initDatabase()`
  - `src/interface/mcp/server.ts` — add two route handlers: `GET /api/ohlcv-backfill-queue`, `POST /api/ohlcv-backfill-done`
  - `src/scheduler/ohlcvStartupProbe.ts` — add queue-dedup INSERT after sparse detection
- Files created:
  - `src/__tests__/1360-ohlcv-backfill-queue.test.ts` — TDD tests (Task 1360, written RED first)
  - `vps-scripts/ohlcv-backfill-poll.sh` — VPS polling loop script (Task 1361)
- Files deleted: none
- Breaking changes: no

## Architecture Decision

The feature mirrors the established BCTC queue pattern (`bctc_vps_queue` + `GET /api/bctc-fetch-queue` + `POST /api/push-bctc-pdf`) already in production. The simpler OHLCV variant needs only a single pending/done flag per queue row (no per-ticker rows, no multi-item queue response) — a minimal boolean signal to the VPS, not a payload-enriched queue. All new code lives in `infrastructure` (DDL) and `interface` (HTTP handlers); `ohlcvStartupProbe.ts` sits in `scheduler` and touches only `infrastructure/db` — DDD rules are preserved.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `ohlcv_backfill_queue` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `GET /api/ohlcv-backfill-queue` handler | interface | `src/interface/mcp/server.ts` | MODIFY |
| `POST /api/ohlcv-backfill-done` handler | interface | `src/interface/mcp/server.ts` | MODIFY |
| probe queue INSERT guard | scheduler | `src/scheduler/ohlcvStartupProbe.ts` | MODIFY |
| TDD tests | test | `src/__tests__/1360-ohlcv-backfill-queue.test.ts` | NEW |
| VPS poll script | vps-scripts | `vps-scripts/ohlcv-backfill-poll.sh` | NEW |

## Interface Contracts

### Schema DDL (add to `initDatabase()` after daily_ohlcv block, ~line 165)

```sql
CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  status       TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'done'
  requested_at TEXT    NOT NULL,                    -- ISO 8601, set on INSERT
  completed_at TEXT                                 -- ISO 8601, set by POST done endpoint; NULL until done
);
CREATE INDEX IF NOT EXISTS idx_obq_status ON ohlcv_backfill_queue(status);
```

No UNIQUE constraint needed — probe guards dedup in application logic (check before insert).

### GET /api/ohlcv-backfill-queue

Auth: `x-api-key` header === `Bun.env.VPS_PUSH_API_KEY` (same pattern as `/api/bctc-fetch-queue`).

```
200 { pending: true }   — at least one row WHERE status = 'pending' exists
200 { pending: false }  — no pending rows
401 { error: "Unauthorized" }
```

Handler logic (inline in server.ts, same style as bctc-fetch-queue handler):

```typescript
const apiKey = Bun.env.VPS_PUSH_API_KEY;
const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
if (!apiKey || authHeader !== apiKey) { /* 401 */ }

const db = getDb();
const row = db.prepare(`SELECT id FROM ohlcv_backfill_queue WHERE status = 'pending' LIMIT 1`).get();
res.writeHead(200, { "Content-Type": "application/json" });
res.end(JSON.stringify({ pending: row != null }));
```

### POST /api/ohlcv-backfill-done

Auth: same `VPS_PUSH_API_KEY` check.

```
200 { ok: true }        — always (idempotent: no-op if no pending row)
401 { error: "Unauthorized" }
```

Handler logic:

```typescript
const db = getDb();
const now = new Date().toISOString();
db.prepare(
  `UPDATE ohlcv_backfill_queue
   SET status = 'done', completed_at = ?
   WHERE id = (
     SELECT id FROM ohlcv_backfill_queue
     WHERE status = 'pending'
     ORDER BY requested_at DESC LIMIT 1
   )`
).run(now);
res.writeHead(200, { "Content-Type": "application/json" });
res.end(JSON.stringify({ ok: true }));
```

Idempotent: UPDATE matches 0 rows if no pending row → no error.

### ohlcvStartupProbe.ts modification

After `if (sparseTickers.length === 0) return ...`, before `sendWorkFn`:

```typescript
// Queue dedup: only insert if no pending row exists
const existingPending = db.prepare(
  `SELECT id FROM ohlcv_backfill_queue WHERE status = 'pending' LIMIT 1`
).get();
if (!existingPending) {
  db.prepare(
    `INSERT INTO ohlcv_backfill_queue (status, requested_at) VALUES ('pending', ?)`
  ).run(new Date().toISOString());
}
```

The `deps` interface must expose an optional `queueDb` — reuse the existing `db` parameter (already injectable). No new interface fields needed.

### vps-scripts/ohlcv-backfill-poll.sh (new file)

```bash
#!/bin/bash
# OHLCV Backfill Poll — Task 1361
# Polls GET /api/ohlcv-backfill-queue every 30 min.
# When pending=true: runs fetch-ohlcv-backfill.sh, then calls POST /api/ohlcv-backfill-done.
# NOT a systemd service — operator adds to crontab or runs standalone.

set -euo pipefail

MCP_BASE_URL="${MCP_BASE_URL:-http://localhost:3001}"
API_KEY="${API_KEY:-__API_KEY__}"
SLEEP_INTERVAL="${SLEEP_INTERVAL:-1800}"   # 30 minutes
SCRIPT_DIR="$(dirname "$0")"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

while true; do
  RESP=$(curl -s --connect-timeout 10 --max-time 15 \
    "${MCP_BASE_URL}/api/ohlcv-backfill-queue" \
    -H "X-API-Key: ${API_KEY}" \
    -H "User-Agent: VN-Market-VPS-Proxy/1.0")

  PENDING=$(echo "$RESP" | jq -r '.pending // false' 2>/dev/null || echo "false")

  if [ "$PENDING" = "true" ]; then
    echo "$(ts) pending=true — starting backfill"
    OHLCV_API_URL="${MCP_BASE_URL}/api/push-ohlcv-history" \
    WATCHLIST_URL="${MCP_BASE_URL}/api/watchlist" \
    API_KEY="${API_KEY}" \
    bash "${SCRIPT_DIR}/fetch-ohlcv-backfill.sh"

    echo "$(ts) backfill done — posting done signal"
    curl -s -X POST --connect-timeout 10 --max-time 15 \
      "${MCP_BASE_URL}/api/ohlcv-backfill-done" \
      -H "X-API-Key: ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d '{}'
    echo "$(ts) done signal sent"
  else
    echo "$(ts) pending=false — sleeping ${SLEEP_INTERVAL}s"
  fi

  sleep "${SLEEP_INTERVAL}"
done
```

## TDD Test Cases (Task 1360 — file: `src/__tests__/1360-ohlcv-backfill-queue.test.ts`)

Test file uses `:memory:` DB, spins up `createBunServer({ port: 0 })` as in 1350.

| TC | Description | Expected |
|---|---|---|
| TC-1 | `GET /api/ohlcv-backfill-queue` — no rows → `{ pending: false }` | 200 |
| TC-2 | `GET /api/ohlcv-backfill-queue` — pending row exists → `{ pending: true }` | 200 |
| TC-3 | `GET /api/ohlcv-backfill-queue` — done row only → `{ pending: false }` | 200 |
| TC-4 | `GET` missing API key → `{ error: "Unauthorized" }` | 401 |
| TC-5 | `POST /api/ohlcv-backfill-done` — pending row → status=done, completed_at set | 200 `{ ok: true }` |
| TC-6 | `POST /api/ohlcv-backfill-done` — no pending rows (idempotent) → no error | 200 `{ ok: true }` |
| TC-7 | `POST` missing API key → `{ error: "Unauthorized" }` | 401 |
| TC-8 | probe: sparse tickers, no pending row → inserts 1 pending row | row in table |
| TC-9 | probe: sparse tickers, pending row exists → no duplicate insert | still 1 row |

TC-8 and TC-9 test `runOhlcvStartupProbe()` directly (unit, not HTTP), passing injectable `db` that has `ohlcv_backfill_queue` table.

## Task Breakdown

| Task | Description | Depends on |
|---|---|---|
| 1360 | TDD: write `1360-ohlcv-backfill-queue.test.ts` — all 9 TCs RED | — |
| 1361 | Impl: schema DDL + server.ts handlers + probe modification + poll script — all TCs GREEN | 1360 |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `ohlcv_backfill_queue` table absent on existing prod DB | High | High | `CREATE TABLE IF NOT EXISTS` in `initDatabase()` is idempotent; applies on next launchctl restart |
| Probe fires at every restart even after backfill done | Low | Low | Done endpoint sets status=done; probe checks for pending row first — no duplicate insert |
| VPS poll script orphaned after backfill completes | None (by design) | None | `pending=false` branch sleeps and loops — no action taken |
| Double-queue if server restarts mid-backfill | Low | Low | `pending` row persists; probe skips because pending row already exists |
| `fetch-ohlcv-backfill.sh` fails partway — done never called | Medium | Medium | VPS operator monitors log; re-run poll script manually; probe re-inserts on next server restart only if all rows done |

## Security Review

- [ ] SQL parameterized? Yes — all queries use `db.prepare().run(param)` with bound values
- [ ] File paths validated (no `../`)? Yes — no file paths involved
- [ ] External HTTP rate-limited? N/A — endpoints receive inbound calls; VPS poll is outbound from VPS
- [ ] Secrets via Bun.env only? Yes — `VPS_PUSH_API_KEY` read from `Bun.env.VPS_PUSH_API_KEY`; never hardcoded
