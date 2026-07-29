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
