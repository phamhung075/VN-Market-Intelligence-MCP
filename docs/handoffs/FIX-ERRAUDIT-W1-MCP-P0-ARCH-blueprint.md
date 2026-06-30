<!-- size-justification: P0 architect blueprint — 3 ratified verdicts, exact edit shapes, DoD/QA tail. Load-bearing for pm+dev+qa. -->

# ARCH Blueprint — FIX-ERRAUDIT-W1-MCP-P0

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 1 · P0
**Input:** `docs/handoffs/FIX-ERRAUDIT-W1-MCP-P0-BA-spec.md`
**Chain position:** architect → pm
**Created:** 2026-06-15

---

## Three Open Item Verdicts

### ARCH-RATIFY-1 — console.error in domain layer
**VERDICT: APPROVED. `console.error` is acceptable in `marketContextBuilder.ts`.**

Rationale: `console` is a JS/Bun global — zero import statement required. The file header's DDD invariant (`MUST NOT import from src/infrastructure/`) is not violated. An import-free `console.error` call introduces no layer coupling. The alternative (bubble error flag via return type) would break the caller contract (NFR-A2 forbids it). `console.error` is the binding choice for this inline P0 fix.

### EC-5 — Type safety for pendingCount holding "?"
**VERDICT: Use `pendingDisplay: string` (pre-formatted string variable). DO NOT use a `number | "?"` union.**

Rationale: A union type forces the `pendingCount !== 1` pluralization ternary to carry a type guard, which adds non-trivial complexity for a P0 fix. A single `pendingDisplay: string` avoids the ternary entirely: on success `pendingDisplay = String(pendingCount) + " alert" + (pendingCount !== 1 ? "s" : "")`, on error `pendingDisplay = "? alerts"`. The template literal on line 418 then becomes `${pendingDisplay} pending`. Zero type narrowing needed. `bun check` / `pnpm check` passes trivially.

### EC-1 — Guard order invariant for all 6 Site-B sections
**VERDICT: Binding invariant confirmed. The canonical shape is:**

```
try {
  // DB query / store call
  if (!row) return noDataDefault;   // ← query succeeded, 0 rows → genuine no-data
  // ... format result
} catch (err) {
  console.error("[buildSectionN][TICKER]", err);
  return "(lỗi truy vấn)";          // ← query threw → error tag
}
```

The `if (!row) return noDataDefault` lives INSIDE the try block. It fires only when the query completes without throwing and returns null/empty. The catch fires ONLY on a thrown exception. The two paths are mutually exclusive by JS semantics — a thrown exception skips the `if (!row)` line entirely. Dev must not move the `if (!row)` outside the try, as that would break the mutual-exclusion guarantee. This invariant applies to all 6 sections including the S5 outer catch.

---

## Site A — Exact Edit Shape

**File:** `apps/mcp-server/src/domain/services/marketContextBuilder.ts`
**Function:** `buildSystemStatusText` (line 380–421)

Replace the entire function body with:

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

Key design points:
- `let dbError = false` — single boolean flag, no new helper, no new type import.
- Each catch captures `(err)`, calls `console.error` (global, no import), sets `dbError = true`.
- `pendingDisplay` resolves EC-5: it is always a `string`, no union narrowing needed.
- On full DB lock (EC-2): output is `degraded: DB read failed | ? alerts pending | last alert: unknown | last analysis: unknown`.
- On partial failure (EC-3, alerts query only throws): `degraded: DB read failed | ? alerts pending | last alert: <real> | last analysis: <real>`.
- `status = "ok"` only when `dbError` remains `false` — i.e. all three queries succeeded (AC-2).
- Function signature `(db: Database): string` unchanged (NFR-A2). Sync (NFR-A3). No infra import (DDD invariant).

---

## Site B — Exact Edit Shape

**File:** `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts`
**Sections:** S1 (line 119), S2 (139), S3 (171), S4 (206), S5-outer (266), S6 (298/299)

For each of the 6 catch blocks, replace the silent `catch { // ... }` with:

```ts
  } catch (err) {
    console.error("[buildSectionN][ticker]", err);
    return "(lỗi truy vấn)";
  }
```

Where `N` is the section number and `ticker` is the local `ticker` parameter variable (available in all 6 function signatures). The `(lỗi truy vấn)` string is a constant — no per-ticker/per-section variation.

**S5 outer catch specifically** (line 266): change from `catch { // outer catch... }` to `catch (err) { console.error("[buildSection5][ticker]", err); return "(lỗi truy vấn)"; }`. The INNER catch (line 263, JSON.parse failure → `(lỗi phân tích BCTC)`) is untouched.

Guard order invariant (from EC-1 verdict above) is already correct in the existing code — all 6 sections have `if (!row) return result` inside the try block. Dev must NOT restructure the try/catch; only the catch body changes.

**`formatTickerIntelligence` (line 62) — not touched.**
**`handleGetTickerIntelligence` outer handler (line 318) — not touched.**

---

## Constraints Propagated to PM → Dev → QA

1. SMALLEST CORRECT CHANGE — only the two files above. Zero fetch surface, zero caller changes.
2. NO Wave-2 helpers (`runSection`, `failLoud`, `safeQuery`) — inline only.
3. GENERIC — `(lỗi truy vấn)` is a single constant. Zero per-ticker/per-section variations.
4. S5 inner catch (line 263) must NOT change.
5. `buildSystemStatusText` stays sync `(db: Database): string`.
6. `formatTickerIntelligence` must not change.

---

## DoD / QA Tail

**Container:** REBUILD required after code change (not restart). Verify `docker inspect` image `.Created` > commit timestamp (AC-6).

**Named-volume DB only:** `vn-market-intelligence-mcp_market_data` via `keinos/sqlite3` sidecar. `./data/market.db` is a stale host decoy — do NOT use.

**Forced-failure probe (AC-1, AC-3):**
- Lock the named-volume `market.db` (e.g. `BEGIN EXCLUSIVE` hold from sidecar, or drop `alerts` table temporarily).
- Call `get_market_context` or `get_cycle_bootstrap` → response `system_status` MUST contain `degraded:`, pending count MUST be `?`, NOT `0`.
- Call `get_ticker_intelligence` for any ticker → each of the 6 sections MUST contain `(lỗi truy vấn)`. Container logs MUST show `console.error` entries.

**Healthy path (AC-2, AC-4):**
- With DB healthy and real data (e.g. VCB): `system_status` starts with `ok`, numeric pending count matches actual unread alerts.
- Unknown ticker (e.g. `XYZTEST`) with healthy DB: S1 shows `(không có dữ liệu)`, NOT `(lỗi truy vấn)`.

**TypeScript gate (AC-7):** `pnpm check` in `apps/mcp-server/` passes with zero errors.

**Two-ticker QA sweep (AC-5):** QA picks one ticker with data (VCB) + one without (XYZTEST). Both must conform to their respective paths on both healthy and forced-failure DB states.

---

**next_agent: pm**
