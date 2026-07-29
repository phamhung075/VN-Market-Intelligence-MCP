# Decision Journal — Sprint QUALITY-AUDIT-FRONTEND-COVERAGE · dev-frontend

**Sprint goal:** User demand — recheck the frontend, add ALL missing quality-audit checks, page by page.
**Agent:** dev-frontend
**Started:** 2026-07-24T20:00:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-24T20:15:00Z
**task-id:** FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX
**what-done:** Live-verified the PO narrative before implementing; found the loader never threw, the real crash was StatusBadge destructuring undefined for not-yet-computed stage keys; fixed the render path + a separate proxy trailing-slash 404.
**what-considered:**
- Trust PO narrative and patch loader try/catch → rejected: loader already caught upstream errors, curl+docker-logs proved the crash was in render, not loader.
- Patch only EvalTable (skip missing key) vs make StatusBadge itself defensive → chose StatusBadge (shared leaf component, must degrade for any future caller, not just this one call site).
- Domain type: keep 6 required keys + defensive cast vs make StageStatuses honestly optional → chose optional (root-cause fix — the type must match the live wire contract, not paper over it).
**why-decision:** Fixing the actual crash site (StatusBadge) plus the type lie (EvalTable's `as EvalStatus`) is the definitive root-cause fix; the proxy trailing-slash bug is real but separate (unexercised by the page itself) so fixed independently, no mcp-server escalation needed.
**why-change:** Diverges from PO's stated root cause (loader-throws-on-404) — live reproduction found a different, real bug; both are now fixed.

### STEP dev-frontend-S2 · dev-frontend · 2026-07-29T17:31:36Z
**task-id:** FE-PG-_INDEX-FRESH-FIX
**what-done:** Verified live that mcp-server's GET /api/market-digest already carries a top-level `data_asof` (naive SQLite string); wired FreshnessBadge/useFreshnessRevalidator("daily") onto dashboard._index.tsx via that field, reusing the existing `parseDate` naive-UTC normalizer instead of forking one.
**what-considered:**
- Fork a local naive-UTC-parse fn (as gen-frontend-page-checks.mjs does) vs reuse `app/lib/formatDate.ts::parseDate` → chose reuse (already the frontend's own SSOT for the identical space→T+Z transform; 4 other routes already import it).
- Keep `normalizeDataAsof` as a standalone named fn vs inline into `parseMarketDigestDto` → inlined after simplicity-gate Q2 flagged it as a single-call-site helper with no interface contract forcing its existence.
- Extract `fetchMarketDigestData(origin)` vs leave loader inline → extracted (matches fetchMacroData/fetchAlertsData precedent; Remix strips inline loader exports under jsdom, blocking unit-testability otherwise).
**why-decision:** data_asof normalization is the one correctness-critical line (host TZ = Europe/Paris, +2h skew risk) — reusing the already-proven `parseDate` helper is strictly safer than re-deriving the regex/replace logic a third time in this codebase.
**why-change:** no change from plan — dispatch prompt already named the exact reuse targets (FreshnessBadge, useFreshnessRevalidator, slaTierKey="daily"); the data_asof-wiring + naive-UTC-normalization mechanics were discovered during implementation, not pre-specified.

### STEP dev-frontend-S3 · dev-frontend · 2026-07-29T19:56:00Z
**task-id:** FE-PG-BCTC-FRESH-FIX
**what-done:** Confirmed live against the real, unmodified mcp-server that `/api/analysis-briefs` `generated_at` is already real ISO8601 UTC (no parseDate needed); wired FreshnessBadge/useFreshnessRevalidator("event") onto dashboard.bctc.tsx.
**what-considered:**
- Leave `fetchAnalysisBriefs` returning `Omit<LoaderData,"generated_at">` and feed FreshnessBadge the loader's own separately-computed `new Date().toISOString()` vs thread the DTO's real `generated_at` through → chose threading the real DTO value (the loader was silently discarding the parsed field and substituting a second, independent clock read — dishonest provenance for a value now also driving a staleness badge).
- Introduce null semantics for `generated_at` (mirroring sibling's honest-null `data_asof`) vs keep existing always-a-string fallback (`new Date().toISOString()` on absent/malformed) → kept existing fallback — this DTO's own type contract (`generated_at: string`, never optional) predates this task and is shared with `count`/`items`' fallback philosophy; inventing null here would diverge from the established parse function unprompted.
**why-decision:** slaTierKey="event" is dictated by the quality-checklist's own SLA formula (not a free choice) — matching it is required for the audit re-check to agree with what the page renders.
**why-change:** no change from plan — dispatch prompt named the exact reuse targets; the generated_at-discarded-then-reinvented provenance bug was found during implementation, not pre-specified.

### STEP dev-frontend-S4 · dev-frontend · 2026-07-29T20:24:00Z
**task-id:** FE-PG-INTEL-FRESH-FIX
**what-done:** Confirmed dashboard.intel.tsx hits the identical GET /api/market-digest endpoint (and identical naive-SQLite `data_asof` field) as sibling FE-PG-_INDEX-FRESH-FIX; wired FreshnessBadge/useFreshnessRevalidator("daily") onto dashboard.intel.tsx via the same `parseDate` normalization, no new logic invented.
**what-considered:**
- Fork a second naive-UTC normalizer local to dashboard.intel.tsx vs reuse `parseDate` (app/lib/formatDate.ts) → reused (this is now the 3rd route wiring the identical `data_asof` transform — forking would create a 2nd copy of a bug-prone regex/replace transform for zero benefit).
- Add `data_asof` as a required vs optional field on the intel DTO → kept optional/nullable (`string | null`), matching the sibling's honest-NULL semantics exactly since both routes parse the exact same upstream payload shape.
**why-decision:** Because this is the third sibling wiring the exact same endpoint+field+badge combination, the correct move was pure pattern replication (byte-identical parse/normalize logic to dashboard._index.tsx), not independent re-derivation — divergence here would only introduce inconsistency risk with zero functional upside.
**why-change:** no change from plan — dispatch prompt named the exact reuse targets (parseDate, FreshnessBadge, useFreshnessRevalidator, slaTierKey="daily") and confirmed the field/endpoint identity up front; no new discovery during implementation.
