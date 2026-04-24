# TECH-049: Kinh Dich Differentiation

status: APPROVED_BY_ARCHITECT
req_ref: Sprint 049 (PO-approved, BA skipped)

---

## Brownfield Impact

- Files modified: 2
  - `src/interface/mcp/tools/kinhDichTools.ts` (Tasks 297, 298, 299, 300)
  - `src/domain/services/kinhDich/hexagramLibrary.ts` (Task 301 — QUE_DATA section only)
- Files created: 2
  - `src/__tests__/302-kinhdich-differentiation.test.ts` (Task 302)
  - This document
- Files deleted: none
- Breaking changes: no — all function signatures unchanged, only SQL bodies and data content replaced

---

## Architecture Decision

All four score helpers (`computeForeignFlowScore`, `computeMacroScore`, `computeSectorScore`,
`computeMacroIndicatorScore`) are already in the correct DDD layer (interface/mcp/tools — pure
SQLite reads, no domain logic). The bugs are SQL column name mismatches and a peer-pool that is
too narrow; the fix is confined to query bodies within the existing functions.

`hexagramLibrary.ts` is pure domain data (no I/O). The `QUE_DATA` record is the only section
needing rewrite — all interfaces (`QueData`, `HaoData`, etc.), `TRIGRAMS`, `TRIGRAM_LINES`, and
`QUE_META` are correct and must not change.

The integration test (Task 302) creates a real in-memory SQLite instance and injects data via the
same `getDb()` singleton so the score helpers exercise real SQL paths without mocking.

---

## DDD Layer Plan

| Component                   | Layer              | File Path                                                | New/Modify |
| --------------------------- | ------------------ | -------------------------------------------------------- | ---------- |
| computeForeignFlowScore     | interface/mcp/tools| src/interface/mcp/tools/kinhDichTools.ts                 | MODIFY     |
| computeMacroScore           | interface/mcp/tools| src/interface/mcp/tools/kinhDichTools.ts                 | MODIFY     |
| computeSectorScore          | interface/mcp/tools| src/interface/mcp/tools/kinhDichTools.ts                 | MODIFY     |
| computeMacroIndicatorScore  | interface/mcp/tools| src/interface/mcp/tools/kinhDichTools.ts                 | MODIFY     |
| QUE_DATA (64 entries)       | domain/services    | src/domain/services/kinhDich/hexagramLibrary.ts          | MODIFY     |
| Integration smoke test      | test               | src/__tests__/302-kinhdich-differentiation.test.ts       | NEW        |

---

## Interface Contracts

No new interfaces. All existing exported types and function signatures remain identical.

### Corrected SQL schemas (confirmed from source files)

**`vnstock_trading_stats`** (src/infrastructure/db/vnstockStore.ts):
```
code, foreign_volume, avg_volume_2w, fetched_at
```
No `date` column. No `total_volume` column.

**`tracked_indicators`** (src/infrastructure/db/commodityTracker.ts line 36):
```
id, indicator, value, unit, source, extracted_at
```
No `name` column. No `sigma` column. No `updated_at` column.

**`sector_peers`**: This table does NOT exist in the infrastructure yet. `sector_peers` is mentioned
in the PO task description as a future data source. The current implementation in
`syncSectorPeers.ts` uses the in-memory `SECTOR_PEERS` constant from `sectorPeers.ts` (a domain
service) — it does NOT persist to a DB table named `sector_peers`. Task 299 must use an alternative
peer source that actually exists in the DB.

---

## Task-by-Task Fix Specification

### Task 297 — computeForeignFlowScore

**Root cause**: Query references non-existent columns `date` and `total_volume`.

**Fix** — replace the query body inside `computeForeignFlowScore()`:

```typescript
const row = db
  .query<
    { foreign_volume: number | null; avg_volume_2w: number | null },
    [string]
  >(
    `SELECT foreign_volume, avg_volume_2w FROM vnstock_trading_stats
     WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
  )
  .get(code);

if (!row?.foreign_volume || !row?.avg_volume_2w || row.avg_volume_2w === 0) {
  return 0.0;
}
return Math.max(-1, Math.min(1, row.foreign_volume / row.avg_volume_2w));
```

**Test** (`src/__tests__/297-foreign-flow-fix.test.ts`):
- Seed `vnstock_trading_stats` with `foreign_volume=1000, avg_volume_2w=5000, fetched_at=now`
- Assert `computeForeignFlowScore("VCB")` returns `0.2` (1000/5000)
- Seed a second row with older `fetched_at` — assert the newer row is used
- Seed `avg_volume_2w=0` — assert returns `0.0` (no division by zero)

---

### Task 298 — computeMacroScore

**Root cause**: Query references `name`, `sigma`, `updated_at` — none exist.

**Fix** — replace entire body of `computeMacroScore()`:

```typescript
function computeMacroScore(): number {
  try {
    const db = getDb();
    const indicators = ['oil', 'gold', 'usd_vnd', 'brent'];
    const placeholders = indicators.map(() => '?').join(', ');

    const rows = db
      .query<
        { indicator: string; value: number },
        string[]
      >(
        `SELECT indicator, value FROM tracked_indicators
         WHERE indicator IN (${placeholders})
         ORDER BY extracted_at DESC LIMIT 80`,
      )
      .all(...indicators);

    if (rows.length === 0) return 0.0;

    // Group by indicator, compute inline z-score: latest vs prior window
    const byIndicator = new Map<string, number[]>();
    for (const r of rows) {
      const arr = byIndicator.get(r.indicator) ?? [];
      arr.push(r.value);
      byIndicator.set(r.indicator, arr);
    }

    const zScores: number[] = [];
    for (const [, values] of byIndicator) {
      if (values.length < 3) continue;
      const latest = values[0]!;
      const window = values.slice(1);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const std = Math.sqrt(
        window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
      );
      if (std === 0) continue;
      zScores.push((latest - mean) / std);
    }

    if (zScores.length === 0) return 0.0;

    const avgZ = zScores.reduce((s, v) => s + v, 0) / zScores.length;
    // High macro stress (positive z) = negative for stocks
    return Math.max(-1, Math.min(1, -avgZ / 2.0));
  } catch {
    return 0.0;
  }
}
```

**Test** (`src/__tests__/298-macro-score-fix.test.ts`):
- Seed 20 `tracked_indicators` rows for `oil` with steadily rising values (latest is highest)
- Assert `computeMacroScore()` returns a negative value (rising oil = macro stress)
- Seed with stable values (all equal) — assert returns `0.0` (std = 0 path)
- Empty table — assert returns `0.0`
- Test also covers Task 300 (see below)

---

### Task 299 — computeSectorScore

**Root cause**: Peers resolved from `watchlist WHERE domain = ?` — only 1 stock per domain in
watchlist, so `peerCodes` is always empty.

**Key finding**: `sector_peers` DB table does NOT exist. The peer data lives in the in-memory
constant `SECTOR_PEERS` inside `src/domain/services/sectorPeers.ts`. The correct approach is a
two-tier strategy:

1. Primary: Query `market_prices` for codes that appear in the static `SECTOR_PEERS` mapping for
   this stock's domain. This avoids importing domain logic into the interface layer by resolving
   peer codes via a DB lookup against `market_prices` (all 48 stocks are present).
2. Fallback: If zero peers have prices, use all `market_prices` codes except the target stock.

**Fix** — replace entire body of `computeSectorScore()`:

```typescript
function computeSectorScore(code: string): number {
  try {
    const db = getDb();

    // Get domain for this stock
    const watchlistRow = db
      .query<{ domain: string }, [string]>(
        "SELECT domain FROM watchlist WHERE code = ?",
      )
      .get(code);
    if (!watchlistRow) return 0.0;

    // Resolve peer codes from domain service (pure, no I/O)
    const { getSectorPeers } = await import(
      "../../../domain/services/sectorPeers.js"
    );
    // Note: getSectorPeers is sync; the import() is evaluated once at module load.
    // To avoid dynamic import inside a sync function, we use a top-level import instead.
    // See "Implementation note" below.
    const sectorPeerEntries = getSectorPeers(
      watchlistRow.domain as DomainType,
      new Set([code]),
    );
    const peerCodesFromDomain = sectorPeerEntries.map((p) => p.code);

    // Intersect with codes that actually have prices in market_prices
    let peerCodes: string[] = [];
    if (peerCodesFromDomain.length > 0) {
      const placeholders = peerCodesFromDomain.map(() => "?").join(", ");
      const available = db
        .query<{ code: string }, string[]>(
          `SELECT DISTINCT code FROM market_prices
           WHERE code IN (${placeholders})`,
        )
        .all(...peerCodesFromDomain);
      peerCodes = available.map((r) => r.code);
    }

    // Fallback: use all available market_prices codes
    if (peerCodes.length === 0) {
      peerCodes = db
        .query<{ code: string }, [string]>(
          "SELECT DISTINCT code FROM market_prices WHERE code != ? LIMIT 20",
        )
        .all(code)
        .map((r) => r.code);
    }

    if (peerCodes.length === 0) return 0.0;

    const placeholders = peerCodes.map(() => "?").join(", ");
    const peerPrices = db
      .query<{ change_pct: number | null }, string[]>(
        `SELECT change_pct FROM market_prices WHERE code IN (${placeholders})`,
      )
      .all(...peerCodes);

    const validChanges = peerPrices
      .map((r) => r.change_pct ?? 0)
      .filter((v) => v !== 0);
    if (validChanges.length === 0) return 0.0;

    const sectorAvg =
      validChanges.reduce((s, v) => s + v, 0) / validChanges.length;

    const myRow = db
      .query<{ change_pct: number | null }, [string]>(
        "SELECT change_pct FROM market_prices WHERE code = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(code);

    const myChange = myRow?.change_pct ?? 0;
    return Math.max(-1, Math.min(1, (myChange - sectorAvg) / 3.0));
  } catch {
    return 0.0;
  }
}
```

**Implementation note — avoiding dynamic import inside sync function**:

`computeSectorScore` is synchronous. Using `await import()` inside it is not allowed. Instead,
add a top-level static import at the top of `kinhDichTools.ts`:

```typescript
import { getSectorPeers } from "../../../domain/services/sectorPeers.js";
import type { DomainType } from "../../../../bctc-schema.js";
```

Then call `getSectorPeers(watchlistRow.domain as DomainType, new Set([code]))` directly.

**DDD check**: `sectorPeers.ts` is a domain service (pure, no I/O). Importing it from the
interface layer is permitted — interface may import domain services. No violation.

**Test** (`src/__tests__/299-sector-score-fix.test.ts`):
- Seed `watchlist` with `VCB` (domain=banking)
- Seed `market_prices` with VCB (+1%), BID (+2%), CTG (+3%) — BID and CTG are banking peers
- Assert `computeSectorScore("VCB")` returns a non-zero value
- Seed VCB with a much higher change than peers — assert positive score (outperforming)
- Seed VCB with a lower change — assert negative score

---

### Task 300 — computeMacroIndicatorScore

**Root cause**: Query references `name`, `sigma`, `updated_at` — same mismatch as Task 298.

**Fix** — replace entire body of `computeMacroIndicatorScore()`:

```typescript
function computeMacroIndicatorScore(name: string): number {
  try {
    const db = getDb();
    const rows = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ? ORDER BY extracted_at DESC LIMIT 21`,
      )
      .all(name);

    if (rows.length < 3) return 0.0;

    const latest = rows[0]!.value;
    const window = rows.slice(1).map((r) => r.value);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const std = Math.sqrt(
      window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
    );
    if (std === 0) return 0.0;

    const z = (latest - mean) / std;
    return Math.max(-1, Math.min(1, z / 2.0));
  } catch {
    return 0.0;
  }
}
```

**Sign convention**: `computeMacroScore` uses `-avgZ/2.0` (rising commodities = bad for stocks).
`computeMacroIndicatorScore` uses `+z/2.0` (used by `get_market_hexagram` for USD/VND/oil/gold
direction, where the caller interprets the sign). This is intentional — do not change the sign.

**Test**: covered by extending `src/__tests__/298-macro-score-fix.test.ts`.
- Seed 20 rows of `usd_vnd` rising — assert `computeMacroIndicatorScore("usd_vnd")` > 0
- Fewer than 3 rows — assert returns `0.0`

---

### Task 301 — Rebuild hexagramLibrary.ts QUE_DATA (64 entries)

**Source**: 64 markdown files at
`/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/`

**Confirmed file structure** (from reading `01_kien.md`):

| Section heading | Maps to `QueData` field |
| --- | --- |
| First `>` blockquote line | `coreMeaning` |
| "Phán Đoán" — **Kinh văn:** | `judgment.chinese` |
| "Phán Đoán" — **Dịch nghĩa:** | `judgment.vietnamese` |
| "Phán Đoán" — **Luận giải:** | `judgment.interpretation` |
| "Đại Tượng" — **Tượng:** | `image.description` |
| "Đại Tượng" — **Hành động:** | `image.action` |
| Table row "Xu hướng" | `state.trend` |
| Table row "Nghề nghiệp" | `state.career` |
| Table row "Quan hệ" | `state.relationship` |
| Table row "Sức khỏe" | `state.health` |
| Table row "Cảnh báo" | `state.warning` |
| Each "### Hào N" subsection | `lines[N-1]` |
| Hào — **Loại:** | `lines[i].type` ("yang"/"yin") + `lines[i].name` (e.g. "Sơ Cửu") |
| Hào — **Kinh văn:** | `lines[i].chinese` |
| Hào — **Dịch nghĩa:** | `lines[i].vietnamese` |
| Hào — **Kết quả:** | `lines[i].outcome` |
| Hào — **Hành động:** | `lines[i].action` |
| Hào — **Luận giải:** paragraph | `lines[i].interpretation` |

**Critical constraint**: `state.trend` must contain one of the following strings (case-sensitive,
with diacritics) for the `explain_hexagram` formatter to classify the trading context correctly:
- `"THUẬN LỢI"` (favorable)
- `"BẤT LỢI"` (unfavorable)
- anything else → "TRUNG TINH" (neutral)

All 64 markdown files use the uppercase Vietnamese in the table cell. Copy verbatim.

**Parser approach**: The Developer should write a standalone Bun script
(`scripts/parseQueMarkdown.ts`) to read each of the 64 files, parse section by section using
regex against the confirmed headings, and emit the TypeScript object literal. The output is then
copy-pasted into the `QUE_DATA` section of `hexagramLibrary.ts`, replacing entries 3–64 (entry 1
and 2 are already correct in the current file and serve as a reference for expected shape).

**What NOT to change** in `hexagramLibrary.ts`:
- All interfaces (`TrigramMeta`, `QueMeta`, `HaoData`, `QueData`)
- `TRIGRAMS` constant
- `TRIGRAM_LINES` constant
- `QUE_META` array (all 64 entries already correct)
- The `export const QUE_DATA: Record<number, QueData> = {` declaration line

**Test** (`src/__tests__/301-hexagram-library-rebuild.test.ts`):
- Assert `Object.keys(QUE_DATA).length === 64`
- Assert each entry has `coreMeaning`, `judgment`, `image`, `state`, `lines`
- Assert each `lines` array has exactly 6 entries with positions 1–6
- Assert `QUE_DATA[1].coreMeaning` includes "sáng tạo" (spot-check que 1)
- Assert `QUE_DATA[2].state.trend` includes "THUẬN LỢI" (spot-check que 2)
- Assert `QUE_DATA[64].lines[5]!.position === 6` (spot-check last que, last hao)
- Assert no entry has `undefined` or empty string for `judgment.interpretation`

---

### Task 302 — Integration smoke test: 4 stocks → 4 different hexagrams

**File**: `src/__tests__/302-kinhdich-differentiation.test.ts`
**Depends on**: Tasks 297, 298, 299 merged.

**Test setup** — in-memory SQLite seeded via `getDb()` singleton:

```typescript
// watchlist
INSERT INTO watchlist (code, domain) VALUES
  ('VNM', 'retail'), ('FPT', 'tech'), ('VCB', 'banking'), ('VEA', 'automotive');

// market_prices — distinct change_pct to force different price scores
INSERT INTO market_prices (code, price, change_pct, volume, updated_at) VALUES
  ('VNM', 80000, -2.5, 1000000, datetime('now')),
  ('FPT', 120000, +3.1, 2000000, datetime('now')),
  ('VCB', 95000, +0.5, 3000000, datetime('now')),
  ('VEA', 40000, -0.8, 500000, datetime('now')),
  -- sector peers (banking)
  ('BID', 45000, +1.2, 4000000, datetime('now')),
  ('CTG', 33000, +0.9, 5000000, datetime('now')),
  ('TCB', 52000, +1.5, 6000000, datetime('now')),
  -- sector peers (tech)
  ('CMG', 25000, +2.8, 800000, datetime('now')),
  ('ELC', 18000, +3.5, 700000, datetime('now'));

// vnstock_trading_stats — distinct foreign_volume ratios
INSERT INTO vnstock_trading_stats (code, foreign_volume, avg_volume_2w, fetched_at) VALUES
  ('VNM', 200000,  1000000, datetime('now')),  -- ratio 0.20
  ('FPT', 800000,  1000000, datetime('now')),  -- ratio 0.80
  ('VCB', 50000,   1000000, datetime('now')),  -- ratio 0.05
  ('VEA', 10000,   1000000, datetime('now'));   -- ratio 0.01

// tracked_indicators — 20 rows of rising oil prices
INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at) VALUES
  ('oil', 85.0, 'USD/bbl', 'test', datetime('now', '-19 days')),
  ... -- 18 more rows with steadily increasing values
  ('oil', 95.0, 'USD/bbl', 'test', datetime('now'));  -- latest = highest
```

**Assertions**:

```typescript
// 1. All score helpers return non-zero for seeded data
expect(computeForeignFlowScore("FPT")).toBeCloseTo(0.8, 1);
expect(computeMacroScore()).not.toBe(0.0);
expect(computeSectorScore("VCB")).not.toBe(0.0);

// 2. Each stock gets at least 3 non-zero hao scores
for (const code of ['VNM', 'FPT', 'VCB', 'VEA']) {
  const scores = computeHaoScores(code);
  const nonZero = scores.filter(s => s !== 0.0).length;
  expect(nonZero).toBeGreaterThanOrEqual(3);
}

// 3. The 4 hexagram numbers are not all identical
const hexagrams = ['VNM', 'FPT', 'VCB', 'VEA'].map(code => {
  const scores = computeHaoScores(code);
  return computeReading(code, scores, null).queChiNh.number;
});
const unique = new Set(hexagrams);
expect(unique.size).toBeGreaterThan(1);
```

**Note on test isolation**: `computeHaoScores` and the individual score helpers are not exported
from `kinhDichTools.ts`. The test will need to either:
- Export them (add `export` keyword to each helper — preferred, cleaner)
- Or test indirectly via the MCP tool's text output

The Architect recommends **exporting the helpers** for testability. Add `export` to the 6 score
functions and `computeHaoScores` in `kinhDichTools.ts`.

---

## Execution Order (Dependency Chain)

```
297 (foreign flow fix)  ─┐
298 (macro score fix)   ─┤─ all parallel → 302 (smoke test)
299 (sector score fix)  ─┘
                          ↑ also needs:
300 (macro indicator)   ── after 298 (same pattern, same test file)
301 (hexagram library)  ── independent, parallel track
```

Start order: 297 + 298 + 299 + 301 in parallel. 300 after 298. 302 after 297+298+299.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| `sector_peers` DB table does not exist | Confirmed | High | Use static `getSectorPeers()` from domain service + `market_prices` intersection (Task 299 fix above) |
| Dynamic import inside sync function | Low | Medium | Use top-level static import of `getSectorPeers` — confirmed allowed by DDD (interface imports domain) |
| Markdown parser misreads Vietnamese diacritics | Medium | Medium | Copy text verbatim (no transliteration); validate with spot-check tests on QUE_DATA[1] and QUE_DATA[64] |
| `computeHaoScores` not exported — test cannot call it | Confirmed | Medium | Add `export` to all 6 helpers + `computeHaoScores` before writing test (Task 302 depends on this) |
| Oil/gold not in `tracked_indicators` on live DB | Medium | Low | All score helpers already return `0.0` on empty table — graceful degradation confirmed |
| 64-entry QUE_DATA rewrite introduces TypeScript errors | Low | Medium | Run `bun tsc --noEmit` after Task 301 before declaring done |

---

## Security Review

- SQL parameterized? Yes — all queries use `?` placeholders, no string interpolation
- File paths validated (no `../`)? N/A — no file I/O in modified functions
- External HTTP rate-limited? N/A — no external HTTP in modified functions
- Secrets via Bun.env only? N/A — no secrets touched
