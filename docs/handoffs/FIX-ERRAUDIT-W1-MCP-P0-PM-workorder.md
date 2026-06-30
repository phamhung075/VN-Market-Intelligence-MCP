<!-- PM work-order for dev-mcp-server. Zone-gated, architect ratified, binding edit shapes. -->

# PM Work-Order — FIX-ERRAUDIT-W1-MCP-P0

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 1 · P0  
**Input:** BA spec + Architect blueprint  
**Chain position:** pm → dev-mcp-server → qa  
**Status:** ZONE CLEAR, READY FOR DEV  
**Created:** 2026-06-15T21:30:00Z  

---

## ZONE-SERIALIZATION GATE: CLEAR ✓

Verified via `jq` on `docs/data/orch/orch-state.json`:
- `ARCH-CRON-SCHEDULER-RELIABILITY` is NOT in `.task_board.in_progress[]` (not actively coding `apps/mcp-server/`)
- `ARCH-CRON-SCHEDULER-RELIABILITY` is NOT in `.task_board.ready[]` (not queued to start)

**Verdict:** Dev-mcp-server lane is uncontended. FIX-ERRAUDIT-W1-MCP-P0 may proceed to development without waiting for zone release.

---

## Work Scope — Two Atomic Edits

**Zone:** `apps/mcp-server/`  
**Files modified:**
1. `apps/mcp-server/src/domain/services/marketContextBuilder.ts` (Site A)
2. `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts` (Site B)

**No other files change. Zero caller changes required.**

---

## Site A — marketContextBuilder.ts

**File:** `apps/mcp-server/src/domain/services/marketContextBuilder.ts`  
**Function:** `buildSystemStatusText(db: Database): string` (line 380–421)

**Binding Edit:** Replace entire function body with:

```ts
export function buildSystemStatusText(db: Database): string {
  const lines: string[] = ["=== SYSTEM STATUS ==="];

  let dbError = false;

  let pendingCount = 0;
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS cnt FROM alerts WHERE read = 0")
      .get() as AlertCountRow;
    pendingCount = row?.cnt ?? 0;
  } catch (err) {
    console.error("[buildSystemStatusText] alerts count query failed", err);
    dbError = true;
  }

  let lastCycleStr = "unknown";
  try {
    const row = db
      .prepare("SELECT triggered_at FROM alerts ORDER BY triggered_at DESC LIMIT 1")
      .get() as LastCycleRow | null;
    if (row?.triggered_at) {
      lastCycleStr = row.triggered_at.slice(0, 16).replace("T", " ");
    }
  } catch (err) {
    console.error("[buildSystemStatusText] last cycle query failed", err);
    dbError = true;
  }

  let lastAnalysisStr = "unknown";
  try {
    const row = db
      .prepare("SELECT created_at FROM rag_analyses ORDER BY created_at DESC LIMIT 1")
      .get() as { created_at: string } | null;
    if (row?.created_at) {
      lastAnalysisStr = row.created_at.slice(0, 16).replace("T", " ");
    }
  } catch (err) {
    console.error("[buildSystemStatusText] last analysis query failed", err);
    dbError = true;
  }

  const status = dbError ? "degraded: DB read failed" : "ok";
  const pendingDisplay = dbError
    ? "? alerts"
    : `${pendingCount} alert${pendingCount !== 1 ? "s" : ""}`;

  lines.push(
    `${status} | ${pendingDisplay} pending | last alert: ${lastCycleStr} | last analysis: ${lastAnalysisStr}`,
  );

  return lines.join("\n");
}
```

**Ratified design points (architect binding):**
- `console.error` is acceptable in domain layer (global, no import, DDD invariant preserved).
- `pendingDisplay: string` pre-formatted variable (EC-5 verdict) — avoids union type complexity.
- `dbError` flag set by any of three catch blocks.
- Status = `"degraded: DB read failed"` on any DB error, `"ok"` only when all three queries succeed.
- Function signature `(db: Database): string` unchanged (sync, no async, no caller changes).

---

## Site B — tickerIntelligenceTools.ts

**File:** `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts`  
**Sections:** S1 (line 119), S2 (139), S3 (171), S4 (206), S5-outer (266), S6 (298)

**Binding Edit — for each of the 6 section catch blocks, replace the silent catch with:**

```ts
  } catch (err) {
    console.error("[buildSectionN][ticker]", err);
    return "(lỗi truy vấn)";
  }
```

Where:
- `N` = section number (1–6)
- `ticket` = the local `ticker` parameter (available in all function signatures)
- `(lỗi truy vấn)` = constant string, no per-ticker variation

**S5 outer catch (line 266) specifically:** change from silent to `catch (err) { console.error("[buildSection5][ticker]", err); return "(lỗi truy vấn)"; }`. The INNER catch (line 263, JSON.parse → `(lỗi phân tích BCTC)`) is untouched.

**Ratified invariant (architect binding):**
- Guard order (EC-1): `if (!row) return noDataDefault` lives INSIDE try block. Catch fires ONLY on thrown exception. Dev must not restructure; only catch body changes.
- All 6 sections already satisfy this invariant in the current code.

**No changes to:**
- `formatTickerIntelligence` (line 62) — pure formatter.
- `handleGetTickerIntelligence` outer handler (line 318) — already logs at outer level.

---

## Hard Constraints (propagate unchanged)

1. **SMALLEST CORRECT CHANGE** — pure error→marker, zero fetch surface, no Wave-2 helpers (`runSection`, `failLoud`, `safeQuery`).
2. **GENERIC** — single `(lỗi truy vấn)` constant, zero per-ticker/per-exchange/per-date special-casing. AC-5 holds for ANY ticker.
3. **Forced-failure DoD mandatory** — not optional. QA must perform DB-lock probe on named-volume `vn-market-intelligence-mcp_market_data` (not host `./data`).
4. **Container REBUILT** after code change (not restarted). Verify `docker inspect` `.Created` timestamp > commit time.
5. **Caller contract intact** — `buildSystemStatusText(db: Database): string` signature unchanged.
6. **S5 inner catch** (line 263) must NOT change.

---

## Definition of Done / QA Acceptance Tail

**TC-1 (Healthy path — marketContextBuilder):**
- DB nominal, real data present.
- `get_market_context` / `get_cycle_bootstrap` → `system_status` starts with `ok`.
- Numeric pending count matches actual unread alert count in DB.

**TC-2 (Healthy path — tickerIntelligenceTools):**
- DB nominal, real data for ticker (e.g. VCB).
- `get_ticker_intelligence(VCB)` → all 6 sections show real data (no error tag).

**TC-3 (Healthy no-data path — tickerIntelligenceTools):**
- DB nominal, unknown ticker (e.g. XYZTEST) with no historical data.
- `get_ticker_intelligence(XYZTEST)` → S1 shows `(không có dữ liệu)` (genuine no-data default, NOT `(lỗi truy vấn)`).
- Verifies no-data vs error distinction is preserved (EC-1, EC-4).

**TC-4 (Forced-failure path — marketContextBuilder):**
- Lock named-volume DB (e.g. `BEGIN EXCLUSIVE` hold, or drop `alerts` table temporarily).
- `get_market_context` / `get_cycle_bootstrap` → `system_status` MUST contain `degraded:`, MUST NOT be `ok`.
- Pending count MUST be `?` (not `0`).
- Container logs MUST show `console.error` entries for all three queries.

**TC-5 (Forced-failure path — tickerIntelligenceTools):**
- Lock named-volume DB.
- `get_ticker_intelligence` for any ticker → all 6 sections MUST contain `(lỗi truy vấn)` (not genuine no-data defaults).
- Container logs MUST show 6× `console.error("[buildSectionN][ticker]", ...)` entries.

**TC-6 (Generic mandate):**
- TC-3, TC-4, TC-5 must hold for ANY ticker symbol (e.g. VCB + VNM + XYZTEST), not hardcoded test cases.
- QA picks two tickers: one with data + one without.

**TC-7 (Container rebuild):**
- Verify `docker inspect` image `.Created` timestamp is AFTER the commit timestamp of the code change.

**TC-8 (TypeScript gate):**
- Run `pnpm check` in `apps/mcp-server/` → zero errors.
- All type-safety checks pass (EC-5 resolved via `pendingDisplay: string`).

---

## Sign-off

- **Zone gate:** CLEAR ✓
- **Architect ratifications:** 3 verdicts baked in (console.error, pendingDisplay, guard order).
- **Next agent:** dev-mcp-server (code implementation).
- **Successor agent:** qa (forced-failure DoD verification on named-volume DB, container rebuilt).
