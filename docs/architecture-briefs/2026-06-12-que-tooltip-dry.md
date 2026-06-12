# Architecture Brief — QUE-TOOLTIP-DRY
# Hexagram Tooltip DRY + Single SSOT

**Sprint:** QUE-TOOLTIP-DRY
**Architect task:** ARCH-QUE-TOOLTIP-DRY
**Authored:** 2026-06-12T09:00Z
**Status:** DESIGN COMPLETE — handoff to PM

---

## Summary

Single-sprint feature: wire hover tooltips to every frontend quẻ render site, enforcing ONE source of truth for hexagram description text.

The two blockers are resolved:
- **BLOCKER-1** (SSOT mechanism): Option B — codegen mirror. `scripts/gen-que-descriptions.ts` is rewritten to parse `apps/kinh-dich-service/dashboard/que-reference.js` directly. `hexagramLibrary.ts` becomes a declared downstream; its description text is no longer the codegen source.
- **BLOCKER-2** (FlipRow): Explicitly deferred. `KinhDichFlip` DTO carries no hexagram numeric ids — migration requires a separate DTO + API change.

---

## Zone: multi

| Zone | Subtask |
|---|---|
| `scripts/` + `apps/frontend/` | DEV-KINH-DICH-QUE-TOOLTIP-PIPELINE (FR-2 codegen + QueName update) |
| `apps/frontend/` | DEV-KINH-DICH-QUE-TOOLTIP-FR1-NFR (FR-1 SnapshotRow + NFR-1/2/3) |
| `apps/mcp-server/` | DEV-MCP-SERVER-QUE-DOWNSTREAM-ANNOTATION (header comment only) |

---

## BLOCKER-1 — SSOT Mechanism Decision: Option B

### Why not Option A (bulk HTTP endpoint)
Adding `GET /que-reference` to kinh-dich-service requires: new Go route + handler + JSON marshal of `queReferenceList` + HTTP call from gen-que-descriptions.ts at `bun run gen:que` build time. This creates a hard dependency on the Go service being running when a developer regenerates the file — brittle in CI, brittle on fresh clone.

### Why Option B is correct
`apps/kinh-dich-service/dashboard/que-reference.js` is a committed static file. It contains all 64 hexagram records as a JS assignment (`window.__QUE_REFERENCE__ = [...]`). The codegen script can parse it with two string operations (strip wrapper, strip trailing semicolon) then `JSON.parse`. Zero network call. Zero docker dependency. File is present on every clone.

### Text drift confirmed (drift is the defect)
| Field | hexagramLibrary.ts quẻ 1 | que-reference.js quẻ 1 |
|---|---|---|
| coreMeaning (VI) | "...không ngừng vận hành. Trời vận hành mạnh mẽ..." (2 sentences) | "...không ngừng vận hành" (1 clause) |
| trend label | "THUẬN LỢI — năng lượng dương cực mạnh..." (raw ASCII prefix) | "Thuận lợi (THUẬN LỢI)" (clean VN label) |

FR-2 AC "text traces to kinh-dich-service SSOT" is failing today. Option B fixes it.

### Enforcement
1. `gen-que-descriptions.ts` comment + output file header updated to cite `que-reference.js`
2. `hexagramLibrary.ts` header updated: "AUTO-GENERATED downstream of apps/kinh-dich-service/dashboard/que-reference.js — DO NOT EDIT description text independently"
3. `QueDescription` interface reduced to 2 fields (`coreMeaning`, `marketTrendLabel`) — no consumers other than `QueName.tsx` (verified by grep)

---

## BLOCKER-2 — FlipRow: Explicitly Deferred

`KinhDichFlip` interface at `dashboard.kinh-dich-signals.tsx` L79–L86:
```typescript
export interface KinhDichFlip {
  stockCode: string;
  fromAction: string;     // action label, not hexagram name
  toAction: string;
  toSentiment: string;
  confidence: number | null;
  timestamp: string;
  // NO fromHexagramNumber / toHexagramNumber
  // NO fromHexagramName / toHexagramName
}
```

`FlipRow` (L452–L471) renders action badges (`fromAction`, `toAction`) — NOT hexagram names. No numeric hexagram id available on the DTO. QueName requires a numeric `hexagram` prop. Migration is impossible without a DTO + API change.

Follow-up task: `QUE-TOOLTIP-DRY-FLIP-ROW` — add numeric hexagram ids to KinhDichFlip DTO (API layer in mcp-server + frontend interface), then migrate FlipRow to QueName.

---

## BLOCKER-3 (Pre-ruled PO-Q3) — Tooltip Fields

Tooltip = `coreMeaning.vi` (primary) + `marketTrendLabel.vi` (secondary badge only).

`stateInterpretation.vi`, `favorable.vi`, `warning.vi` are out-of-scope for hover tooltip (too verbose per PO ruling).

---

## File Map

### scripts/gen-que-descriptions.ts (REWRITE)
- Remove: import from hexagramLibrary.ts
- Add: `readFileSync("apps/kinh-dich-service/dashboard/que-reference.js")`; strip `window.__QUE_REFERENCE__ = ` prefix + trailing `;`; `JSON.parse()`
- Emit: `QueDescription { coreMeaning: string; marketTrendLabel: string; }`
- Field mapping: `entry.coreMeaning.vi` → `coreMeaning`; `entry.marketTrendLabel.vi` → `marketTrendLabel`
- Drop: `judgment_interpretation`, `image_action`, `state_trend` fields from emitted interface

### apps/frontend/app/lib/que-descriptions.generated.ts (REGENERATED)
- Produced by `bun run gen:que` after script rewrite
- Header: "Source: apps/kinh-dich-service/dashboard/que-reference.js"

### apps/frontend/app/components/QueName.tsx (MODIFY)
- `QueDescription` interface: remove `judgment_interpretation`, `image_action`, `state_trend`; add `marketTrendLabel: string`
- Tooltip content: `{desc.state_trend}` → `{desc.marketTrendLabel}`; remove `italic` class
- No structural change to tooltip markup (still coreMeaning primary + secondary label)

### apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx (MODIFY — FR-1)
- L484–L489 in `SnapshotRow`: replace `<span>{item.hexagramName}</span><span>#{item.hexagramNumber}</span>` with `<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />`
- Add import: `import { QueName } from "~/components/QueName";`
- No other changes to this file

### apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts (ANNOTATE ONLY)
- Update file-header comment block (3 lines): declare as generated downstream of que-reference.js
- Zero data changes; zero TS type changes
- kinhDichTools.ts runtime continues consuming `QUE_DATA`/`QUE_META` unchanged

---

## DDD Layer Map

| Change | Layer | Zone |
|---|---|---|
| gen-que-descriptions.ts rewrite | Infrastructure (data pipeline) | scripts/ |
| que-descriptions.generated.ts regen | Infrastructure (static data contract) | apps/frontend/ |
| QueName.tsx interface + tooltip update | Interface | apps/frontend/ |
| SnapshotRow → QueName migration | Interface | apps/frontend/ |
| hexagramLibrary.ts comment annotation | Domain (metadata only) | apps/mcp-server/ |

---

## Test Strategy

| Test | Type | Owner |
|---|---|---|
| 64 entries in generated file after `bun run gen:que` | Smoke (manual) | dev-kinh-dich |
| `grep "Source:.*que-reference" apps/frontend/app/lib/que-descriptions.generated.ts` | NFR grep | dev-kinh-dich |
| `grep -rn "TooltipProvider\|TooltipContent\|TooltipTrigger" apps/frontend/app/routes/` returns 0 | NFR-1 grep | dev-kinh-dich |
| `grep -rn "Thuận lợi\|Bất lợi\|Trung tính\|THUẬN LỢI" apps/frontend/app/routes/` returns 0 | NFR-2 grep | dev-kinh-dich |
| QueName no-op with hexagram=0 still renders plain span | NFR-3 component test | dev-kinh-dich |
| SnapshotRow hover shows tooltip in browser | FR-1 manual | dev-kinh-dich |

No new unit test files required. Existing QueName.tsx has no test file — no regression surface added.

---

## Risk Flags

| ID | Severity | Description | Mitigation |
|---|---|---|---|
| RF-1 | LOW | que-reference.js strip regex must handle whitespace + semicolon variants | Dev runs smoke: 64 entries output |
| RF-2 | LOW | `QueDescription` field rename (`state_trend`→`marketTrendLabel`) breaks any undiscovered consumer | Dev greps `QUE_DESCRIPTIONS` before shipping; currently only QueName.tsx |
| RF-3 | LOW | hexagramLibrary.ts runtime consumers (kinhDichTools.ts) unaffected — reads `state.trend` not `marketTrendLabel` | Annotation-only change; no data mutation |
| RF-4 | INFO | coreMeaning text shortens for some quẻ (PO-approved SSOT change) | Expected, not a regression |

---

## BUILD-STANDARD: lean

All work is within existing services. No new microservice, no new Docker container, no new MCP tool, no schema change.

---

## Task Split (for PM)

3 subtasks, parallelism noted:

1. **DEV-KINH-DICH-QUE-TOOLTIP-PIPELINE** (zone: scripts/ + apps/frontend/, dev-kinh-dich)
   - Rewrite gen-que-descriptions.ts; regen generated file; update QueName.tsx (FR-2)
   - Must complete before Subtask 2

2. **DEV-KINH-DICH-QUE-TOOLTIP-FR1-NFR** (zone: apps/frontend/, dev-kinh-dich)
   - Migrate SnapshotRow to QueName (FR-1); verify FR-3 no regression; run NFR-1/2/3 grep gates
   - Depends on Subtask 1

3. **DEV-MCP-SERVER-QUE-DOWNSTREAM-ANNOTATION** (zone: apps/mcp-server/, dev-mcp-server)
   - hexagramLibrary.ts header comment only
   - Parallel with Subtask 1

**Follow-up (deferred, not this sprint):** QUE-TOOLTIP-DRY-FLIP-ROW
