---
sprint: VN-MACRO-TOOLING
task_id: VMT-6-CREDIT-FLOW-EXTEND
type: ENHANCEMENT
size: M
zone: apps/mcp-server/src/interface/mcp/tools/sector/
wave: 1
depends_on: []
blocks: []
---

# VMT-6 — Zone C: EXTEND get_credit_flow_signal with survey_distribution stub (VIRA/VARA)

## TLDR

Extend the existing `getCreditFlowSignalHandler` in `creditFlowTools.ts` to add a new `survey_distribution` output field. The field carries VIRA/VARA bank-survey consensus data (mean forecast, dispersion, outliers), or `null` with `is_estimate=true` if no machine-readable source is confirmed. **This is additive only—existing `mortgageIsEstimate`, `yoyIsEstimate`, and `static_seed` flags must NOT be removed.** Low scope, no live data source probe required yet (BLOCKER-6 deferred). **Can proceed in WAVE-1 immediately (no dependencies).**

## [PM] Planning Context

**Blocker:** BLOCKER-6 (deferred by architecture decision) — VIRA/VARA machine-readable URL uncertain.

**Why this matters:**
- The skill `digest-predict` consumes VIRA/VARA bank-survey consensus for cross-checking macro forecasts.
- Currently: static seed values (`mortgageIsEstimate=true`, `yoyGrowthPct=±15`).
- Desired: real survey distribution (mean, dispersion, hawk/dove outliers).
- **Architecture decision (DD-1 in arch decision journal):** Ship with `is_estimate=true` degraded mode. If VIRA/VARA source is found later, a separate follow-up ticket opens (no schema change needed).
- **Zone C is independent** — can proceed in WAVE-1 without waiting for probes or Zone D.

**Acceptance Criteria:**
- [ ] Extend `getCreditFlowSignalHandler` in `creditFlowTools.ts` (existing code: L104+)
- [ ] Add new output field `survey_distribution`:
  ```typescript
  survey_distribution: {
    source: "VIRA" | "VARA" | null
    period: string                       // e.g. "2026-Q1"
    mean_pct: number | null              // consensus forecast
    dispersion_pct: number | null        // std dev or range
    hawk_outliers: string[]              // institutions above mean
    dove_outliers: string[]              // institutions below mean
    survey_topic: string                 // "credit_growth" | "interbank_rate" | "cpi" | "fx"
    is_estimate: boolean                 // true unless source confirmed
    note: string | null
  }
  ```
- [ ] **REGRESSION gate (CRITICAL):** Verify PR diff:
  - Existing `mortgageIsEstimate`, `yoyIsEstimate`, `static_seed` flags remain unchanged ✅
  - No removal of existing `is_estimate: true` flags ✅
- [ ] **Default behavior (VIRA/VARA source NOT found yet):**
  ```typescript
  survey_distribution: {
    source: null,
    period: null,
    mean_pct: null,
    dispersion_pct: null,
    hawk_outliers: [],
    dove_outliers: [],
    survey_topic: null,
    is_estimate: true,
    note: "VIRA/VARA no machine-readable source confirmed — manual data required"
  }
  ```
- [ ] **Schema validation:** Zod schema updated to include `survey_distribution` field
- [ ] **TypeScript compilation:** `tsc --noEmit` passes
- [ ] **No new fetcher code in handler:** If VIRA/VARA fetch logic is needed later, it goes in `apps/mcp-server/src/infrastructure/fetchers/viraSurveyFetcher.ts` (separate file, not inline in handler). **Handler is interface-only; fetcher is infrastructure-only.**
- [ ] **Test:** snapshot test updated to include new field (mirror existing `mortgageIsEstimate` snapshot pattern)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` (extend output, ~10–15 lines)
- `apps/mcp-server/src/zod-schemas/schema-macro.ts` (or relevant Zod schema file) (add survey_distribution to output schema, ~15 lines)
- `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.test.ts` (update snapshot, ~5 lines)

**Files to NOT touch:**
- Existing `mortgageIsEstimate`, `yoyIsEstimate`, `static_seed` lines (read-only from PM perspective)
- VIRA/VARA fetch logic (deferred to follow-up ticket after source research)

**Dependencies:** None (WAVE-1, no blockers)

**Knowledge needed:**
- TypeScript basics (adding new object field)
- Zod schema (extending output schema with new field)
- Git diff review (verifying no regression on existing flags)

**Existing pattern to follow:**
- `creditFlowTools.ts` L104+ — existing handler structure
- `mortgageIsEstimate` / `yoyIsEstimate` pattern — how is_estimate flags are currently set

---

## Context from Architecture

From ARCH-VN-MACRO-TOOLING, BLOCKER-6 resolution:

> **BLOCKER-6 — VIRA/VARA machine-readable URL (VMT-6 design)**
>
> **Resolution: ACCEPT IS_ESTIMATE DEGRADED MODE. No manual-input PUT endpoint.**
>
> Decision rationale:
> - VIRA and VARA are research bodies that publish survey results primarily in Vietnamese financial media (VnExpress Finance, CafeF, Tài chính doanh nghiệp). No stable machine-readable API or consistent URL pattern is known.
> - A PUT `/vira-survey-data` manual-input endpoint would require a separate authenticated endpoint, documentation, and a workflow for the user to update it — this is scope beyond what the BA spec warrants.
> - The correct response is: `survey_distribution: { is_estimate: true, note: "VIRA/VARA no machine-readable source confirmed — manual data required" }`.
> - **If** a live VPS probe by the dev (as part of the BLOCKER probing phase) finds a confirmed machine-readable URL, the dev reports back to PO who opens a follow-up ticket for the fetcher. The VMT-6 task itself ships with `is_estimate=true` as the accepted degraded state.
> - The existing `static_seed` masquerade on `reCreditRatioPct: 20/19` and `yoyGrowthPct: ±15` MUST remain flagged with `is_estimate=true` as they currently are — BLOCKER-6 resolution does NOT remove these flags.
>
> **VMT-6 gate:** NOT gated on BLOCKER-6. VMT-6 can proceed immediately in Zone C: add `survey_distribution: null` with honest `is_estimate: true` note to the existing handler output. The VIRA/VARA source can be wired later without a schema change.

From ARCH-VN-MACRO-TOOLING, FR-3 (Zone C):

> **Zone C — Existing file to MODIFY**
> - `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` — add `survey_distribution` field to `getCreditFlowSignalHandler` output; add `fetchViraSurvey()` call (returns null if source not found); no changes to existing `mortgageIsEstimate` / `yoyIsEstimate` / `static_seed` flags

---

## DDD Considerations

**This task must be interface-only:**
- Handler (`creditFlowTools.ts`) = interface layer. MUST NOT contain fetch logic.
- If/when VIRA/VARA fetcher is implemented, it goes in `apps/mcp-server/src/infrastructure/fetchers/viraSurveyFetcher.ts` (infrastructure layer).
- Handler calls the fetcher as a service; handler returns the result.

**Currently:** Fetcher doesn't exist yet (source not confirmed). Handler safely returns `null` + `is_estimate: true`.

**Later (follow-up ticket):** Fetcher is added; handler imports and calls it. No schema change needed.

---

## Code Example (skeleton)

**Current handler (read-only example):**
```typescript
// creditFlowTools.ts (simplified)
export async function getCreditFlowSignalHandler(input) {
  return {
    mortgageSignal: {...},
    mortgageIsEstimate: true,
    yoyGrowthPct: 15,
    yoyIsEstimate: true,
    notes: ["static_seed"]
  };
}
```

**After VMT-6 (new field added):**
```typescript
export async function getCreditFlowSignalHandler(input) {
  // const surveyDist = await fetchViraSurvey(); // TODO: implement after source confirmed
  
  return {
    mortgageSignal: {...},
    mortgageIsEstimate: true,
    yoyGrowthPct: 15,
    yoyIsEstimate: true,
    notes: ["static_seed"],
    
    // NEW FIELD (VMT-6)
    survey_distribution: {
      source: null,  // no source confirmed yet
      period: null,
      mean_pct: null,
      dispersion_pct: null,
      hawk_outliers: [],
      dove_outliers: [],
      survey_topic: null,
      is_estimate: true,
      note: "VIRA/VARA no machine-readable source confirmed — manual data required"
    }
  };
}
```

**Zod schema (simplified):**
```typescript
const creditFlowSignalSchema = z.object({
  mortgageSignal: z.object({...}),
  mortgageIsEstimate: z.boolean(),
  yoyGrowthPct: z.number(),
  yoyIsEstimate: z.boolean(),
  notes: z.array(z.string()),
  
  // NEW FIELD
  survey_distribution: z.object({
    source: z.enum(["VIRA", "VARA"]).nullable(),
    period: z.string().nullable(),
    mean_pct: z.number().nullable(),
    dispersion_pct: z.number().nullable(),
    hawk_outliers: z.array(z.string()),
    dove_outliers: z.array(z.string()),
    survey_topic: z.string().nullable(),
    is_estimate: z.boolean(),
    note: z.string().nullable()
  })
});
```

---

## Task Boundaries

**This task ENDS when:**
- `survey_distribution` field is added to `getCreditFlowSignalHandler` output
- Output with `is_estimate: true` and `note: "VIRA/VARA no machine-readable source confirmed ..."`
- Zod schema is updated
- Snapshot tests are updated
- `tsc --noEmit` passes
- PR diff verified: no removal of existing `is_estimate` flags ✅
- Commit merged to main

**Next steps:**
- If VIRA/VARA source is discovered during ops-vps-fetch probes: open follow-up ticket for `viraSurveyFetcher.ts` (infrastructure layer)
- No schema change needed in that follow-up; handler imports + calls the fetcher, fills in the survey_distribution fields

**This task is INDEPENDENT of all other Zone A/B work** — can be completed in parallel with probes and Zone D.
