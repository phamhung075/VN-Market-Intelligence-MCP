# Handoff — Sprint RECAP-CMD

**Sprint goal SSOT:** `docs/SPRINT_GOAL_RECAP-CMD.md`
**Opened:** 2026-05-27T21:34:53Z by PO (self-initiated, user feature request)
**Zone:** `apps/mcp-server` only — owner `dev-mcp-server`
**Pipeline:** PO → **ba** → architect → pm → dev-mcp-server → ops (rebuild+force-recreate) → qa (live) → PO sign-off

---

## What the user asked for (verbatim intent)

- `/recap` → complete recap of TODAY
- `/recapw` → recap of the WEEK
- `/recapm` → recap of the MONTH
- On the just-shipped `/news`: *"it reply but i dont see complete recap of day"*

## PO decisions LOCKED (do not re-litigate)

1. **`/news` stays as-is** (news LIST). **`/recap` is the new fuller day SYNTHESIS.** The user's gap is closed by a new command, not by changing `/news`.

2. **Data source per command — the #1 blocker, RESOLVED.** `docs/recaps/*.md` are NOT mounted into the mcp-server container (verified: `apps/mcp-server/Dockerfile` COPYs only `src/`+config; `docker-compose.yml` mcp-server mounts only `market_data`, `mcp.config.json`, `reports`, `docs/agent-memory`, three `docs/data/*.json`). So all 3 commands use existing ALL-DB in-container assembly fns:
   - `/recap` → `assembleEveningSummary({ db })` → typed `EveningSummary` (apps/mcp-server/src/application/usecases/assembleEveningSummary.ts)
   - `/recapw` → `generatePeriodicSummary("weekly", undefined, db)` → typed `PeriodicSummary`
   - `/recapm` → `generatePeriodicSummary("monthly", undefined, db)` (apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts)

3. **Render from TYPED fields, never prose.** `buildSummaryText()` / `PeriodicSummary.summaryText` are English+jargon — NOT user-facing. Handlers build their own plain-Vietnamese view from the typed object fields only. Both assembly fns are `async`; handlers `async`; router (`handleTelegramCommand`) is already `async`.

4. **No new DB table / MCP tool / cron / microservice / compose change.** Sync read-only ~1s pulls, same contract as `/news`. No LLM in render path.

## Reuse (predecessor NEWS-CMD pattern)

- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` — `handleNews` (line ~510, returns `{ texts: string[] }`), `chunkStories` (line ~480, never split mid-item), `sentimentLabel`, `midnightVietnamAsUtcInline`, `fmtNum` (vi-VN), `HELP_TEXT` (line ~72), router branch for `/news` (line ~633).
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` line 86 — `const chunks = result.texts ?? [result.text];` — new commands plug in for free.
- Refs: `docs/REQ_NEWS-CMD.md`, `docs/handoffs/TASK_NEWS-CMD.md`, `docs/architecture-briefs/2026-05-27-news-cmd-design.md`.

## Constraints carried

- Plain comprehensible Vietnamese, no jargon, direction + delta % on moves, vi-VN number format. [[feedback_market_report_plain_vietnamese]] [[feedback_market_data_direction]]
- After code: ops rebuild + FORCE-RECREATE (not restart). [[feedback_rebuild_after_dev_change]] [[project_mcp_server_write_wedge]]
- Live verify path: `zenmidi.com/vn-market/webhook` (NOT bare `/webhook` — commit 3ddeb820 added nginx location; `CLOUDFLARE_PATH_PREFIX=/vn-market`).
- Commit: serialized, no `-A`, main terminal commits, no branches, no push.

## ACK log

- 2026-05-27T21:34:53Z — PO: sprint scoped, goal + BA task written, data-source blocker resolved. NEXT: ba writes `docs/REQ_RECAP-CMD.md`.

---

## [Architect] Brownfield Findings — RECAP-CMD

**Zone:** `apps/mcp-server/` — sole zone, owner `dev-mcp-server`

**BUILD-STANDARD:** lean (new feature in existing service — `apps/mcp-server/` exists, no new service)

### Verified paths

- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L480-500 — `chunkStories(header, storyBlocks, maxLen=4096)` confirmed. Reused unchanged.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L612-691 — `handleTelegramCommand` is already `async`. New `await handleRecap(db)` etc. requires no signature change. Three new `if (cmd === "/recap")` branches slot in before the existing `switch` block, after L635.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L631-636 — existing `/news` branch pattern confirmed. New branches mirror this exactly.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L72-83 — `HELP_TEXT`. Three new lines to insert after the (modified) `/news` line. Non-overlapping with NEWS-FULLDAY's `/news` edit.
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` L355-370 — `assembleEveningSummary` overload confirmed: accepts `Database | AssembleEveningSummaryOptions`. Calling `assembleEveningSummary({ db: inMemoryDb })` injects the test DB without touching any real filesystem or HTTP.
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` L830-839 — `writeFileSync` side-effect: writes to `reportsDir` (default `./reports`). Confirmed wrapped in `try/catch`; failure does NOT throw — it logs warn and continues. The `reportsDir` option in `AssembleEveningSummaryOptions` (L163) can be overridden to `/tmp/test-reports`.
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` L97-150 — `EveningSummary` interface confirmed: `vnIndex?`, `watchlistMovers`, `topStories`, `topAlerts`, `portfolioPnl?`, `foreignFlowMovers?`, `newsCount`, `date`. All fields BA specified for §3-A render exist.
- `apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts` L53-80 — `PeriodicSummary` interface confirmed: `periodStart`, `periodEnd`, `newsCount`, `alertCount`, `reportCount`, `keyEvents[]{date,title,impact,direction}`, `stockPerformance`, `alertsSummary`, `summaryText` (BANNED), `recommendation` (BANNED), `macroContext` (BANNED).
- `apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts` L610-628 — `generatePeriodicSummary(periodType, periodEnd?, db?)` signature confirmed. Passing `db` as third argument injects the test DB.
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` L86 — `const chunks = result.texts ?? [result.text]` confirmed. No change needed.

**Greenfield confirmation:**
`stripHtml` is absent from `apps/mcp-server/src/` (grep-verified). It is defined once in the sibling NEWS-FULLDAY sprint. RECAP-CMD reuses it — no second definition allowed. Because both sprints land in one dev pass, `stripHtml` will be present in `telegramCommands.ts` before the recap handlers are added. No stub needed.

**Import direction verified (DDD):**
`telegramCommands.ts` (infrastructure/notifiers) imports from `application/usecases/assembleEveningSummary.ts` and `application/usecases/generatePeriodicSummary.ts`. This is a valid DDD direction: infrastructure layer may call application-layer use cases. The handlers read typed domain value objects (`EveningSummary`, `PeriodicSummary`) returned by those use cases — they do NOT call into domain services directly. `summaryText`, `buildSummaryText`, `recommendation`, `macroContext` are fields on `PeriodicSummary` but are never read by the handlers — the render path never touches them.

### DDD layer assignments

| Change | Layer | Rationale |
|---|---|---|
| `handleRecap`, `handleRecapWeek`, `handleRecapMonth` | Interface / Presentation | Command handlers building Vietnamese section strings from typed domain objects. |
| Call to `assembleEveningSummary({ db })` | Application orchestration | Calling existing use-case. No new domain logic. |
| Call to `generatePeriodicSummary("weekly"/"monthly", undefined, db)` | Application orchestration | Same. |
| Section-block builder (direction labels, fmtNum, stripHtml calls) | Interface | Pure render transform. No domain state mutation. |
| Router wiring (3 new `if` branches) | Interface | Command dispatch, same layer as existing `/news` branch. |
| `HELP_TEXT` update | Interface | Constant update. |
| `EveningSummary`, `PeriodicSummary` objects | Domain (value objects) | Read-only; not modified by handlers. |

### Resolved design decisions

**B1 — Section-block overflow: split strategy for a single block >4096 chars (RESOLVED)**

Decision: **pre-split at newline boundaries before passing to `chunkStories`**, with a `(tiếp theo…)` continuation marker on overflow sub-blocks.

The `chunkStories` function splits at block boundaries. It does not split within a block. A section block that itself exceeds 4096 chars would be passed through as a single oversized string — `chunkStories` would emit it as a standalone chunk violating AC-CHUNK-2 (each element <= 4096 chars).

Maximum realistic block size for the Section 3 watchlist movers (30 tickers):
- Per-line format: `VCB: tăng +2,30% (giá 88.000)` ≈ 30 chars + newline = ~31 chars.
- Section header: `Cổ phiếu nổi bật:` = 19 chars + newline.
- 30 movers × 31 chars = 930 chars + 19 = ~950 chars total.
- **The 30-ticker watchlist section does NOT realistically hit 4096 chars. This edge case is not a real risk for the current watchlist.**

However, the `stockPerformance` section for `/recapw`/`/recapm` could theoretically list all 30 tickers too (~950 chars — same, safe). The `alertsSummary.topAlerts` messages (truncated to 100 chars each) for up to 3 alerts add ~300 chars max.

The only realistic scenario where a block might exceed 4096 is a contrived test (T-RECAP-3 seeds 30 movers with long codes). For production, no section block approaches 4096.

Implementation: dev adds a `splitBlockAtNewlines(block: string, maxLen = 4096): string[]` helper in `telegramCommands.ts`. This helper is called before passing section blocks to `chunkStories` for any section that could theoretically grow unbounded. It splits at the last newline boundary before `maxLen`, appending `\n(tiếp theo…)` to non-final sub-blocks. If no newline exists in the first `maxLen` chars, hard-cut at `maxLen` (degenerate case — long single line with no newlines).

The dev applies this helper as a defensive wrap to `sectionBlocks` array entries before calling `chunkStories`. In practice for the 30-ticker watchlist it will never trigger.

**B2 — Test injection strategy: `assembleFn` wrapper vs real assembly with in-memory DB (RESOLVED)**

Decision: **use the `assembleFn` wrapper parameter approach** (injected override).

Rationale: the `writeFileSync` side-effect in `assembleEveningSummary` is the deciding factor.

The `AssembleEveningSummaryOptions` interface provides `reportsDir?: string` which could be set to `/tmp/test-reports`. This would avoid real filesystem side effects — BUT it still requires the in-memory DB to have all tables that the full `_assembleEveningSummaryImpl` function queries (market_prices, daily_ohlcv, positions, commodity_prices, macro_indicators, prediction_signals, watchlist, etc.). The `makeRecapDb()` helper defined in the spec creates all required tables, but each test would need to seed them to produce a specific predictable output — making tests fragile to internal changes in `assembleEveningSummary` logic.

The `assembleFn` wrapper approach is cleaner:
1. Tests control exactly what `EveningSummary` or `PeriodicSummary` the handler receives — no dependency on the use-case internals.
2. Zero filesystem writes — no need for `/tmp/test-reports`.
3. The test directly exercises the handler's section-building render logic (the actual thing being tested) without coupling to the assembly use-case's DB queries.
4. Production path is unchanged — `assembleFn` is omitted in production; the handler calls the real use-case.
5. The router test cases (T-RECAP-RT-1..4) use the real handler with a minimal in-memory DB — these verify routing is wired, not render correctness.

Handler signatures (as spec §7-B):

```typescript
async function handleRecap(
  db: Database,
  assembleFn?: (db: Database) => Promise<EveningSummary>
): Promise<{ texts: string[] }>

async function handleRecapWeek(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicSummary>
): Promise<{ texts: string[] }>

async function handleRecapMonth(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicSummary>
): Promise<{ texts: string[] }>
```

Router branches do NOT pass `assembleFn` — production behaviour is unchanged.

For T-RECAP-RT-1..4 (routing tests), the real handlers are called with a minimal in-memory DB (no `assembleFn`). These may return an error string or thin empty-state output — that is acceptable for routing tests; they only assert the command is recognised, `result` is non-null, and `result.texts` is defined.

### Exact functions / signatures to add or modify

**File: `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`**

1. **ADD imports** (after existing imports block, approximately after L39):

```typescript
import { assembleEveningSummary } from "../../application/usecases/assembleEveningSummary.js";
import type { EveningSummary } from "../../application/usecases/assembleEveningSummary.js";
import { generatePeriodicSummary } from "../../application/usecases/generatePeriodicSummary.js";
import type { PeriodicSummary } from "../../application/usecases/generatePeriodicSummary.js";
```

2. **ADD helper** (near `chunkStories`, in the module-level helpers block):

```typescript
/** Pre-split a single section block at newline boundaries if it exceeds maxLen.
 *  Defensive guard — in practice no production section block hits 4096 chars. */
function splitBlockAtNewlines(block: string, maxLen = 4096): string[] {
  if (block.length <= maxLen) return [block];
  const parts: string[] = [];
  let remaining = block;
  while (remaining.length > maxLen) {
    const cut = remaining.lastIndexOf("\n", maxLen);
    const boundary = cut > 0 ? cut : maxLen;
    parts.push(remaining.slice(0, boundary) + "\n(tiếp theo…)");
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}
```

3. **ADD three handler functions** (after `handleNews`, before `handleTelegramCommand`):

Handler structure for each (illustrative for `handleRecap`; `handleRecapWeek` and `handleRecapMonth` follow same pattern with `generatePeriodicSummary`):

```typescript
async function handleRecap(
  db: Database,
  assembleFn?: (db: Database) => Promise<EveningSummary>
): Promise<{ texts: string[] }> {
  try {
    const fn = assembleFn ?? ((d) => assembleEveningSummary({ db: d }));
    const summary = await fn(db);
    // Build section blocks (Section 1-7 as per §3-A spec)
    // ... [section building per spec — see §3-A Vietnamese labels]
    const sectionBlocks: string[] = [/* ... */];
    const flatBlocks = sectionBlocks.flatMap(b => splitBlockAtNewlines(b));
    const header = `Tổng kết ngày ${summary.date}`;
    return { texts: chunkStories(header, flatBlocks, 4096) };
  } catch {
    return { texts: ["Lỗi khi tổng kết ngày. Vui lòng thử lại sau."] };
  }
}
```

The section-building logic (direction labels, `fmtNum`, `stripHtml` calls, presence/omission logic per spec) is dev's responsibility to implement per §3-A and §3-B. The architect specifies the wrapper shape; the section bodies are specified completely by the BA spec labels (all locked Vietnamese strings per §3).

4. **ADD three router branches** in `handleTelegramCommand`, after L635 (after the `/news` branch):

```typescript
if (cmd === "/recap") {
  const r = await handleRecap(db);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
if (cmd === "/recapw") {
  const r = await handleRecapWeek(db);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
if (cmd === "/recapm") {
  const r = await handleRecapMonth(db);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
```

5. **MODIFY `HELP_TEXT`** — insert after the `/news` line (L77, modified by NEWS-FULLDAY):

```
/recap                  Tổng kết hôm nay (chỉ số, cổ phiếu, tin tức, cảnh báo, danh mục)
/recapw                 Tổng kết tuần này
/recapm                 Tổng kết tháng này
```

### File:line insertion points

| What | File | Lines affected |
|---|---|---|
| ADD imports for assembleEveningSummary + generatePeriodicSummary | `telegramCommands.ts` | After L39 (existing import block) |
| ADD `splitBlockAtNewlines` helper | `telegramCommands.ts` | After `chunkStories` (after L500) |
| ADD `handleRecap`, `handleRecapWeek`, `handleRecapMonth` | `telegramCommands.ts` | After `handleNews` (after L600) |
| ADD 3 router branches | `telegramCommands.ts` | After L635 (after `/news` branch) |
| MODIFY `HELP_TEXT` | `telegramCommands.ts` | After L77 (after modified `/news` line) |
| ADD T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4 | `214-telegram-commands.test.ts` | New describe blocks appended |
| ADD `makeRecapDb()` or extended `makeDb()` | `214-telegram-commands.test.ts` | Helper section |

### One-pass dev implementation order

Because both sprints share `stripHtml` and land in one dev pass, the implementation order within `telegramCommands.ts` is:

1. Add `stripHtml` (NEWS-FULLDAY).
2. Modify `handleNews` — dedup + strip + uncapped query (NEWS-FULLDAY).
3. Update `HELP_TEXT` `/news` line (NEWS-FULLDAY).
4. Add imports for `assembleEveningSummary` + `generatePeriodicSummary` (RECAP-CMD).
5. Add `splitBlockAtNewlines` helper (RECAP-CMD).
6. Add three `handleRecap*` handlers (RECAP-CMD).
7. Add three router branches (RECAP-CMD).
8. Add three HELP_TEXT lines (RECAP-CMD).

Then add all tests in `214-telegram-commands.test.ts` (T-NEWS-9..12, T-STRIP-1..7, T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4).

### Test approach

**Framework:** Bun test, in-memory SQLite. Zero network, zero credentials, zero filesystem writes (assembly function is injected via `assembleFn` wrapper for handler tests; routing tests use real handlers with minimal DB).

**T-RECAP-1..7:** Inject hardcoded `EveningSummary` objects via `assembleFn`. Assert section presence/absence, Vietnamese labels, format, no jargon. `makeRecapDb()` helper creates the additional tables needed for routing tests (T-RECAP-RT-*).

**T-RECAPW-1..4 and T-RECAPM-1..3:** Same pattern with injected `PeriodicSummary`. T-RECAPM-2 edge case: when all counts are zero but no throw, Totals section renders with zeros — acceptable; full-empty-state fires only on throw.

**T-RECAP-RT-1..4:** Real `handleTelegramCommand` call with minimal in-memory DB. Assert command is recognised (result non-null, `texts` defined). Assembly call on empty DB may produce thin output or an error string — both are acceptable for routing tests.

**`tsc` zero errors:** New imports must be correctly typed. `EveningSummary` and `PeriodicSummary` are already exported from their respective use-case files. `assembleFn` parameter types match.

### Risk flags

- **R-LOW — `assembleEveningSummary` freshness gate side-effect:** at L841-848, the function sends a Telegram message to the WORK channel when prices are stale. This fires when `sendTelegramFn` is provided in options. The `handleRecap` handler calls `assembleEveningSummary({ db })` — no `sendTelegramFn` is passed in production. In tests, `assembleFn` is injected (no real call). Zero risk of accidental Telegram send from handler or tests.
- **R-LOW — `generatePeriodicSummary` DB upsert side-effect:** the function upserts into `market_summaries`. In tests, `assembleFn` is injected and this never fires. In production with minimal DB (cold), the upsert may fail — already handled internally (no throw). Zero risk.
- **R-INFO — `globalSnapshot` field on `EveningSummary`:** present on L139 but not in the §3-A render spec (not shown to user). Architect confirms: do not render it. It is a diagnostic field like `predictionDiag`, `taDiag`.
- **R-INFO — Section 3 empty-state wording:** `Không có cổ phiếu nào biến động đáng kể hôm nay.` must appear even when `watchlistMovers` is empty. The BA spec says Section 3 is "always present" even when empty — dev must not omit the section header + empty string in this case.
- **R-LOW — `portfolioPnl.items` empty array (not null):** Section 6 spec says show header + aggregate footer only. Dev must handle `portfolioPnl !== null && portfolioPnl.items.length === 0` without crash.

### Scan clean: true

No DDD violations. Import direction legal: `telegramCommands.ts` (infrastructure) → `assembleEveningSummary.ts` (application) → domain types. Handlers read domain value objects; never call domain services directly. `summaryText` and `recommendation` fields exist on `PeriodicSummary` but are provably unreachable from the render path — enforced by the test assertions (NFR-1-AC-6 grep-verification mandate). No new infra, no new DB tables, no new MCP tools, no new cron jobs.

---

## [QA] Review Record — RECAP-CMD

**date:** 2026-05-28
**commit under test:** 99f433ec
**verdict:** APPROVED

### Test Results

- Target test file `214-telegram-commands.test.ts`: **60 pass / 0 fail** (independently re-run)
- T-NEWS-1..8 regression: all 8 still pass unmodified
- T-RECAP-1..7 (handleRecap /recap): all 7 PASS
- T-RECAPW-1..4 (handleRecapWeek /recapw): all 4 PASS
- T-RECAPM-1..3 (handleRecapMonth /recapm): all 3 PASS
- T-RECAP-RT-1..4 (routing): all 4 PASS (including T-RECAP-RT-4 /help lists all 3 new commands)
- TypeScript: **exit 0, 0 errors**

### AC Coverage

- Handlers defined: `handleRecap`, `handleRecapWeek`, `handleRecapMonth` at L751, L865, L883 — all async, all return `{ texts: string[] }`, all have `catch` returning Vietnamese error strings
- Router wiring: L1005-1016 — three `if (cmd === "/recap*")` branches before the switch block
- HELP_TEXT: L82-84 — all 3 commands listed with Vietnamese descriptions
- NFR-1-AC-6 (summaryText/buildSummaryText never in output): PASS — grep of telegramCommands.ts confirms `summaryText` and `recommendation` fields never appear in any string literal output
- AC-CHUNK-1/2/3 (chunk boundary): PASS — `splitBlockAtNewlines` helper at L711 + `chunkStories` called at L854, L965
- assembleFn injectable wrapper: PASS — `handleRecap(db, assembleFn?)` signature at L751-753; production omits it
- `stripHtml` reused from NEWS-FULLDAY — exactly one definition at L113, RECAP-CMD handlers call it at L796, L923

### DDD: PASS

- `telegramCommands.ts` (infrastructure) imports `assembleEveningSummary` + `generatePeriodicSummary` from `application/usecases/` — valid DDD direction (infra→app→domain)
- Domain value objects (`EveningSummary`, `PeriodicSummary`) read-only, never mutated by handlers
- No domain→infra violations

### Security: PASS

- Zero `process.env` in `telegramCommands.ts`
- No hardcoded secrets
- No SQL in recap handlers (they call existing use-cases, not raw SQL)

### Live E2E Probes

All four commands probed synthetically via `update_id:99001-99004`, `chat_id:99999999` to `https://zenmidi.com/vn-market/webhook`:

- `/news` (update 99001): HTTP 200. Log: `sendMessage failed status:400 chatId:99999999`. Handler ran, reply targeted originating chat. No errors.
- `/recap` (update 99002): HTTP 200. Log: `[assembleEveningSummary] summary persisted filePath:reports/2026-05-28-evening.json` + `sendMessage failed status:400 chatId:99999999`. Real assembly ran without error. Reply targeted originating chat.
- `/recapw` (update 99003): HTTP 200. Log: `[generatePeriodicSummary] stored id:weekly-2026-05-25` + `sendMessage failed status:400 chatId:99999999`. Weekly summary assembled and stored. Reply targeted originating chat.
- `/recapm` (update 99004): HTTP 200. Log: `[generatePeriodicSummary] stored id:monthly-2026-05-01` + `sendMessage failed status:400 chatId:99999999`. Monthly summary assembled and stored. Reply targeted originating chat.

All four handlers: (a) reached `handleTelegramCommand`, (b) correct handler ran without throwing, (c) reply attempted to originating chatId. 400 = expected for non-existent test chat.

### Merge Status: APPROVED — already on main (commit 99f433ec)
