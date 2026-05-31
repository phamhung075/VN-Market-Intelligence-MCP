# REQ-VNH-SECTOR-FIX — Watchlist Seed Sector Misclassification Fix

**Sprint:** VNH-SECTOR-FIX
**Task:** VNH-BA
**Zone:** `apps/mcp-server/`
**Size:** S
**Owner (impl):** dev-mcp-server → ops → qa → po
**Created:** 2026-05-29
**Status:** Spec ready — no blockers

---

## Context

`seedWatchlist.ts` line 83 seeds VNH (CTCP Đầu tư Việt Việt Nhật, HNX — seafood/food
import-export) with `domain: "real_estate"`. This is factually wrong: VNH is an
agriculture/seafood exporter, NOT a real-estate company.

Because `seedWatchlist` uses `ON CONFLICT(code) DO UPDATE SET domain = excluded.domain`,
a fresh DB would be corrected by the next seed invocation — but the LIVE `market.db`
inside the running container already has the wrong value committed. A code-only seed
fix will NOT correct the live row without an explicit SQL UPDATE.

The bug propagates via `get_cycle_bootstrap` to every cowork agent (alert-commander,
news-scout, market-watcher, unified/CHEF, fb-market-poster), causing VNH to appear
under `real_estate` in agent notebooks, signals, and public FB drafts.

A coincidental spot-check also found three inline comments in the same file that
name wrong companies (values are defensible; only comments are wrong).

---

## Requirements

### FR-1 — VNH domain correction (CRITICAL) — DDD layer: infrastructure

**File:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` line 83

Change `domain` value for VNH from `"real_estate"` to `"agriculture"`.

Acceptance criteria:
- AC-FR1-1: `WATCHLIST_SEED.find(e => e.code === 'VNH')?.domain === 'agriculture'`
- AC-FR1-2: `WATCHLIST_SEED` contains no entry `{ code: 'VNH', domain: 'real_estate' }`
- AC-FR1-3: The inline comment for VNH reads: `// CTCP Đầu tư Việt Việt Nhật — seafood/food import-export (xuất nhập khẩu thủy hải sản & thực phẩm), HNX`

**Rationale:** `DomainType` in `apps/mcp-server/bctc-schema.ts` line 26-47 does NOT
contain `'seafood'`, `'food'`, or `'consumer'`. The union member `'agriculture'` is
the canonical home for seafood/aquaculture; `SECTOR_NAME_VI['agriculture'] = "Nông nghiệp & Thủy sản"`;
agriculture-sector peers include VHC and ANV (both seafood exporters, `sectorPeers.ts` lines
120-121). Using any non-union string would break `Record<DomainType, string>` at compile time.

---

### FR-2 — Inline comment corrections (LOW risk — no value change) — DDD layer: infrastructure

Three inline comments in `seedWatchlist.ts` misidentify the company behind the ticker.
Values remain unchanged; only the human-readable comment is corrected.

**FR-2a — TCH (line 85):**
- Current comment: `// Techcombank (high-vol) — std dev ~1.9%`
- Correct comment: `// Hoang Huy Investment Financial Services — real estate/auto services, HOSE; std dev ~1.9%`
- Note: Techcombank is ticker `TCB` (banking). TCH is CTCP Đầu tư Dịch vụ Tài chính Hoàng Huy.
- Value `domain: "real_estate"` is correct; do NOT change it.

**FR-2b — DPM (line 87):**
- Current comment: `// Daphaco — std dev ~2.2%`
- Correct comment: `// Đạm Phú Mỹ (PetroVietnam Fertilizer & Chemicals) — fertilizer, HOSE; std dev ~2.2%`
- Note: "Daphaco" is a pharmaceutical brand unrelated to DPM.
- Value `domain: "chemicals"` is correct; do NOT change it.

**FR-2c — DAG (line 69):**
- Current comment: `// Da Nang Rubber Group — industrial/machinery`
- Correct comment: `// Đông Á Plastic Group — plastics/industrial, HOSE`
- Note: "Da Nang Rubber" is ticker DRC, not DAG. DAG = Công ty Cổ phần Tập đoàn Nhựa Đông Á.
- Value `domain: "machinery"` is defensible (plastics/industrial); do NOT change it.

Acceptance criteria for all FR-2 items:
- AC-FR2-1: No comment in WATCHLIST_SEED mentions "Techcombank" adjacent to code TCH.
- AC-FR2-2: No comment in WATCHLIST_SEED mentions "Daphaco" adjacent to code DPM.
- AC-FR2-3: No comment in WATCHLIST_SEED mentions "Da Nang Rubber" adjacent to code DAG.

---

### FR-3 — Idempotent DB migration UPDATE for live market.db — DDD layer: infrastructure

The `seedWatchlist` UPSERT (`ON CONFLICT(code) DO UPDATE SET domain = excluded.domain`)
will correct fresh databases on next startup. However, the LIVE `market.db` row for VNH
was seeded BEFORE this fix; the UPSERT only fires when `INSERT` conflicts — an UPDATE
on an already-inserted row does NOT re-trigger it without a new insert attempt.

Therefore: an explicit idempotent SQL UPDATE must be applied to the live DB in-container
before or alongside the seed re-run.

Required SQL (idempotent):
```sql
UPDATE watchlist SET domain = 'agriculture' WHERE code = 'VNH' AND domain != 'agriculture';
```

This must be executed inside the running container against the live `market.db` file.

Acceptance criteria:
- AC-FR3-1: After the UPDATE, `SELECT code, domain FROM watchlist WHERE code = 'VNH'`
  returns exactly one row: `{ code: 'VNH', domain: 'agriculture' }`.
- AC-FR3-2: The UPDATE is idempotent — re-running it when domain is already `agriculture`
  changes 0 rows and does not error.
- AC-FR3-3: Verification must be by DIRECT in-container DB query (bun, no sqlite3 binary),
  NOT inferred from seed commit or container log. False-green-on-seed-alone is FORBIDDEN.

---

### FR-4 — Type-tighten `WatchlistSeedEntry.domain` to `DomainType` — DDD layer: domain

**File:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` lines 30-34

Current definition:
```typescript
export interface WatchlistSeedEntry {
  code: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  domain: string;  // ← too loose
}
```

Required change:
```typescript
import type { DomainType } from "../../../bctc-schema.js";

export interface WatchlistSeedEntry {
  code: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  domain: DomainType;  // ← compile-time union guard
}
```

Acceptance criteria:
- AC-FR4-1: `WatchlistSeedEntry.domain` is typed as `DomainType` (not `string`).
- AC-FR4-2: `DomainType` is imported from `../../../bctc-schema.js` (relative path per tsconfig conventions in this project).
- AC-FR4-3: TypeScript compilation (`bun build` or `tsc --noEmit`) succeeds with zero errors after the change.
- AC-FR4-4: Introducing a deliberate test value `domain: "seafood"` in a scratchpad compile check produces a compile-time type error (proof that the guard is active, not a no-op).
- AC-FR4-5: All 34 existing WATCHLIST_SEED entries satisfy the `DomainType` constraint without modification (VNH's value is already corrected by FR-1 before this AC is tested).

---

### FR-5 — Guard test: VNH-sector-fix.test.ts — DDD layer: infrastructure / interface

A new test file following the pattern of
`apps/mcp-server/src/__tests__/1787-gvr-sector-fix.test.ts` must be created.

**File:** `apps/mcp-server/src/__tests__/VNH-sector-fix.test.ts`

Required test cases:
1. `VNH entry exists in WATCHLIST_SEED` — `expect(vnh).toBeDefined()`
2. `VNH domain is agriculture, not real_estate` — `expect(vnh?.domain).toBe('agriculture')`
3. `VNH is not classified as real_estate` — `expect(vnh?.domain).not.toBe('real_estate')`
4. `NVL remains real_estate (no collateral damage)` — peers check confirms FR-1 did not shift NVL/KBC/VRE/VIC/VHM.
5. `every seed domain is a valid DomainType member` — iterate `WATCHLIST_SEED`, assert each `entry.domain` is in the `DomainType` union values array. This is the fleet-wide regression guard.

Acceptance criteria:
- AC-FR5-1: Test file exists at the path above and runs with `bun test`.
- AC-FR5-2: All 5 test cases pass GREEN after the fix.
- AC-FR5-3: Test case 3 (`VNH not real_estate`) was RED before the fix — the test must be capable of detecting a regression (developer must verify this with a pre-fix dry run or note in commit).
- AC-FR5-4: Test case 5 (every domain in DomainType) catches any future wrong-enum insertion — the allowed values list must be derived from the `DomainType` union, NOT hardcoded as a static string array.

---

### FR-6 — mcp-server rebuild + container verification — DDD layer: infrastructure

After code changes and DB migration, the mcp-server container MUST be rebuilt (per
`feedback_rebuild_after_dev_change` — restart alone relaunches the stale image).

Acceptance criteria:
- AC-FR6-1: Container is rebuilt (`docker compose build mcp-server` or equivalent) and restarted after the code change.
- AC-FR6-2: After rebuild, a direct in-container query confirms `domain = 'agriculture'` for VNH (mirrors AC-FR3-1 but run post-rebuild to verify the seed UPSERT did not overwrite the corrected value back).
- AC-FR6-3: At least one agent bootstrap (`get_cycle_bootstrap` tool call) in the running system shows VNH listed under `agriculture` and NOT under `real_estate`.

---

## Non-Functional Requirements

- NFR-1: All changes confined to zone `apps/mcp-server/` — no other microservice touched.
- NFR-2: Seed function remains idempotent — repeated `seedWatchlist(db)` calls must not toggle the value or cause conflicts.
- NFR-3: `HIGH_VOL_TICKERS` constant (line 198-200) retains VNH — the threshold migration (-9.0) is independent of domain classification and must not be removed.
- NFR-4: The 34-ticker count and all other ticker identities (code, exchange) are unchanged.
- NFR-5: Existing tests `1787-gvr-sector-fix.test.ts` and `1343a-watchlist-restore.test.ts` remain GREEN — no collateral damage.

---

## Edge Cases

- **UPSERT-only false-green:** If dev commits the seed change and ops only restarts the container (no explicit UPDATE), the live DB row stays `real_estate`. The done bar explicitly requires direct SQL verification AFTER the UPDATE is applied AND after rebuild. Do not conflate these steps.
- **Import path for DomainType:** `bctc-schema.ts` lives at `apps/mcp-server/bctc-schema.ts` — relative from `src/infrastructure/db/seedWatchlist.ts` the import is `../../../bctc-schema.js` (note `.js` extension per ESM convention used elsewhere in this project).
- **DPM appears in sectorPeers.ts agriculture array (line 119):** DPM (Đạm Phú Mỹ fertilizer) is listed as an agriculture-sector peer alongside VHC/ANV. This is the peer list, not the watchlist seed domain. DPM's seed `domain: "chemicals"` is correct per TASKS.md audit. Do NOT change DPM's domain; only fix its comment.
- **TCH is real_estate:** TCH = Hoang Huy Investment (real estate + auto services). Despite the wrong "Techcombank" comment, the `real_estate` value is correct. Leave value alone.
- **VNH group section comment:** Lines 81-84 carry a section-level comment `// Real Estate (high-vol)` above NVL/VNH/KBC/TCH. After moving VNH to `agriculture`, developer must decide whether to physically re-order VNH into the Agriculture section OR leave it in the high-vol block with an updated inline comment. Either approach is acceptable as long as AC-FR1-1 and AC-FR1-3 are met. The section comment `// Real Estate (high-vol)` should no longer reference VNH implicitly — add a note or move the entry to the agriculture section.

---

## DDD Layer Summary

| Req | Layer | File |
|---|---|---|
| FR-1, FR-2 | infrastructure | `seedWatchlist.ts` |
| FR-3 | infrastructure | live `market.db` (ops step) |
| FR-4 | domain | `seedWatchlist.ts` + `bctc-schema.ts` (read-only) |
| FR-5 | infrastructure/interface | `VNH-sector-fix.test.ts` (new) |
| FR-6 | infrastructure | container ops |

---

## Blockers

None. PO has pre-resolved all decisions:
- `agriculture` confirmed as the correct `DomainType` value for VNH.
- Comment-only fixes for TCH/DPM/DAG are confirmed in scope.
- DB migration approach (explicit UPDATE before/alongside seed re-run) confirmed.
- Type-tighten `domain` field confirmed in scope.
- Guard test pattern confirmed (precedent: 1787-gvr-sector-fix.test.ts).

---

## Done Bar (verbatim from PO signal)

1. `seedWatchlist.ts` corrected: VNH `domain = 'agriculture'` + correct inline comment.
2. TCH / DPM / DAG inline comments corrected (no value changes).
3. `WatchlistSeedEntry.domain` typed as `DomainType` (compile guard active).
4. Guard test `VNH-sector-fix.test.ts` present and all cases GREEN.
5. Live `market.db` row corrected by explicit SQL UPDATE inside the running container.
6. `mcp-server` rebuilt (not just restarted).
7. Direct in-container `SELECT code, domain FROM watchlist WHERE code = 'VNH'` returns `agriculture`.
8. At least one agent's `get_cycle_bootstrap` shows VNH NOT under `real_estate`.

**False-green forbidden:** seed commit alone ≠ done. DB query verification is mandatory.
