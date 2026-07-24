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
