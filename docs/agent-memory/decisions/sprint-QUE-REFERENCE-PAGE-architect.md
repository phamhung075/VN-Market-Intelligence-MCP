# Decision Journal — Sprint QUE-REFERENCE-PAGE · architect

**Sprint goal:** One Kinh Dich reference page detailing all 64 hexagrams in plain Vietnamese, served from que-reference.js SSOT via codegen, never hardcoded.
**Agent:** architect
**Started:** 2026-06-12T15:30:00Z

---

### STEP arch-S1 · architect · 2026-06-12T15:30:00Z
**task-id:** ARCH-QUE-REFERENCE-PAGE
**what-done:** Designed codegen extension mechanism, reference page route, nav entry, search UX, QueName deep-link ruling, and test strategy. Produced brief docs/architecture-briefs/2026-06-12-que-reference-page.md. Task split into 4 subtasks for PM.
**what-considered:**
- Codegen option A: widen existing QueDescription interface with ~12 new fields — REJECTED: would break AC-2 test in QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts which asserts "entry does NOT have state_trend" (implies a bounded shape); and forces every tooltip consumer to carry unused fields.
- Codegen option B: second generated artifact `que-descriptions-detail.generated.ts` with new `QueDetailDescription` type — CHOSEN: keeps tooltip contract sealed, both emitted by one `bun run gen:que` invocation, zero parse duplication.
- QueName deep-link option A: wrap trigger span in Remix `<Link>` — REJECTED: Link inside Radix portal risks hydration mismatch.
- QueName deep-link option B: plain anchor `<a href>` inside TooltipContent, behind `withDetailLink?: boolean` prop (default false) — CHOSEN: additive prop, no existing call-site changes, NFR-1 (tooltip markup stays in QueName) preserved.
- Server API route for reference data — REJECTED (PO pre-ruled): static codegen-from-file is the proven pattern; zero Docker dependency at render time, zero latency.
- Client-side search with debounce — deferred to developer judgment (64 items makes debounce optional).
**why-decision:** SSOT integrity paramount — QUE-TOOLTIP-DRY established que-reference.js as the single source; this design extends that binding to the full field set without touching the existing consumer contract. Second-artifact pattern is the lowest-risk extension mechanism. Deep-link is zero-regression additive via opt-in prop.
**why-change:** No change from plan. Standard lean BUILD-STANDARD for new feature in existing zone.
