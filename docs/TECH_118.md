# TECH-118: OHLCV Backfill — populate daily_ohlcv with 60-day history

status: APPROVED_BY_ARCHITECT
req_ref: REQ-118

## Brownfield Impact

- Files modified: `src/interface/mcp/server.ts` (add handler before 404 block, line ~1189)
- Files created: `vps-scripts/fetch-ohlcv-backfill.sh`, `src/__tests__/1350-ohlcv-backfill-endpoint.test.ts`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

The new `/api/push-ohlcv-history` endpoint mirrors `/api/push-foreign-flow` exactly — same auth
pattern (`VPS_PUSH_API_KEY`), same body-read loop, same upsert-in-transaction approach, same
`log.info` format. No new domain service or repository interface is needed because `daily_ohlcv`
is already written directly via `db.prepare()` in the server handler (see push-prices OHLCV block,
lines 459-476). The VPS script follows the manual one-time pattern established by `fetch-bctc.sh`
(not a systemd loop).

## Price Unit Alignment (critical)

| Source | Raw value | Unit | Stored in daily_ohlcv |
|--------|-----------|------|-----------------------|
| VPS `bgapidatafeed` via push-prices | `lastPrice = 57.7` | VND thousands | 57,700 (server × 1000) |
| TCBS chart API via push-ohlcv-history | `open = 73500` | full VND | 73,500 (no conversion) |

The push-ohlcv-history endpoint stores bar values **as received** (full VND). The VPS backfill
script sends TCBS values directly without any × 1000 multiplication. This matches the existing
unit stored by push-prices (both result in full VND in daily_ohlcv).

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| push-ohlcv-history handler | interface | `src/interface/mcp/server.ts` | MODIFY |
| fetch-ohlcv-backfill.sh | infrastructure (VPS) | `vps-scripts/fetch-ohlcv-backfill.sh` | NEW |
| TDD test | test | `src/__tests__/1350-ohlcv-backfill-endpoint.test.ts` | NEW |

## Interface Contracts

### Endpoint: POST /api/push-ohlcv-history

Request body (typed, no `any`):
```typescript
interface OhlcvBar {
  date: string;   // "YYYY-MM-DD"
  open: number;   // full VND
  high: number;
  low: number;
  close: number;
  volume?: number; // defaults to 0 if missing
}
interface PushOhlcvHistoryPayload {
  code: string;
  bars: OhlcvBar[];
}
```

Response (200 success):
```typescript
{ ok: true; inserted: number; code: string }
```

Response (error):
```typescript
{ error: string }  // 400 = bad input, 401 = auth fail
```

### Handler logic (insertion order matches existing push-* handlers)

```
1. Auth check: X-API-Key vs Bun.env.VPS_PUSH_API_KEY → 401
2. Read body chunks → join → JSON.parse → 400 on parse failure
3. typeof payload.code !== "string" → 400 "Missing or invalid code"
4. !Array.isArray(payload.bars) → 400 "bars must be an array"
5. bars.length === 0 → 200 { ok: true, inserted: 0 }
6. db = getDb()
7. stmt = db.prepare(upsert SQL — see below)
8. db.transaction(() => {
     for bar of payload.bars:
       if any of [date, open, high, low, close] missing → log.warn + skip
       if open <= 0 || close <= 0 → log.warn + skip (corrupt guard)
       volume = bar.volume ?? 0
       updated_at = new Date().toISOString()
       stmt.run(code, date, open, high, low, close, volume, updated_at)
       inserted++
   })()
9. log.info("[push-ohlcv-history] code=VNM inserted=60", { code, inserted })
10. 200 { ok: true, inserted, code }
```

Upsert SQL (idempotent, matches existing push-prices pattern):
```sql
INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(code, date) DO UPDATE SET
  open       = excluded.open,
  high       = excluded.high,
  low        = excluded.low,
  close      = excluded.close,
  volume     = excluded.volume,
  updated_at = excluded.updated_at
```

Note: backfill upsert overwrites all OHLCV fields (unlike push-prices which uses MAX/MIN for
intraday accumulation). Backfill data is authoritative historical data; full overwrite is correct.

### VPS Script: fetch-ohlcv-backfill.sh

Key decisions:
- `date -d "90 days ago"` on Linux VPS (GNU date — standard for Debian/Ubuntu)
- `tradingDate[0:10]` extracts "YYYY-MM-DD" from "2025-01-15T00:00:00"
- `volume // 0` handles missing volume field (maps to DEFAULT 0 in schema)
- 0.2s sleep between tickers to respect TCBS rate limit
- Per-ticker `|| true` ensures loop continues on any single ticker failure
- Exit 0 always (partial backfill > abort)
- `jq -e` on bars extraction: if jq fails, log WARN and continue

## Task Breakdown (for PM)

Dependency order:

1. **Task 1350** — test(ohlcv-backfill): write `1350-ohlcv-backfill-endpoint.test.ts` with
   all 5 required cases (TDD — tests written FIRST against unimplemented endpoint)
2. **Task 1351** — feat(ohlcv-backfill): implement handler in `server.ts` + create
   `vps-scripts/fetch-ohlcv-backfill.sh` (tests must pass, bun tsc --noEmit clean)

## Test File Specification (Task 1350)

File: `src/__tests__/1350-ohlcv-backfill-endpoint.test.ts`

Line 1 (mandatory): `process.env["DB_PATH"] = ":memory:";`

Test DB setup: create `daily_ohlcv` table in `:memory:` SQLite (same schema as
`src/infrastructure/db/schema.ts` lines 152-165). Import `createBunServer` and start on port 0.

Five required test cases:

| # | Name | Stimulus | Expected |
|---|------|----------|----------|
| 1 | Valid bars insert | POST with valid key + 3 bars | 200 `{ ok:true, inserted:3, code:"VNM" }`, DB has 3 rows |
| 2 | Duplicate upsert | Insert 3 bars, insert same 3 again | DB still has 3 rows (not 6); close reflects second push |
| 3 | Missing API key | POST without X-API-Key | 401 `{ error:"Unauthorized" }` |
| 4 | Empty bars | POST with `bars: []` | 200 `{ ok:true, inserted:0 }`, DB has 0 rows |
| 5 | Malformed payload | POST with missing `code` / `bars` not array | 400 `{ error:"..." }` |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| TCBS API response field `tradingDate` format changes | Low | Medium | Script extracts `[0:10]` slice; log raw response on jq failure |
| TCBS returns prices in different unit for some tickers | Low | High | REQ-118 note: TCBS is full VND. Developer must verify with 1 real ticker before running full backfill |
| Duplicate rows from push-prices racing with backfill | Low | None | ON CONFLICT upsert is atomic; last write wins, no corruption |
| VPS GNU date `-d` flag not available | Very Low | Medium | VPS is Debian/Ubuntu (confirmed by systemd units in vps-scripts/) |
| Server handler insertion point conflicts with future push-* routes | Low | Low | Insert before 404 block (line ~1189) — same pattern as all other handlers |
| TCBS geo-block from VPS | Very Low | High | TCBS API is public; VPS is VN-located; no block expected |

## Security Review

- [x] SQL parameterized: yes — all `stmt.run()` calls use positional `?` params
- [x] File paths validated: n/a — no file I/O in handler
- [x] External HTTP: n/a in handler (VPS script does the HTTP, not the Bun server)
- [x] Secrets via Bun.env only: yes — `Bun.env.VPS_PUSH_API_KEY`, same as all push-* handlers
- [x] No `any` escapes: use typed `OhlcvBar` interface; field access via typed property, not cast

## Insertion Point in server.ts

Add the new handler block immediately before the `// ── 404 ───` comment block (line 1190).
Pattern to follow: `push-foreign-flow` handler (lines 656-717) — same structure, simpler (no
secondary API calls, no Telegram triggers).
