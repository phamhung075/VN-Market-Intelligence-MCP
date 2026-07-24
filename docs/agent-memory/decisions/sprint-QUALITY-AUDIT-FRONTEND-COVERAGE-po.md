# Decision Journal — Sprint QUALITY-AUDIT-FRONTEND-COVERAGE · po

**Sprint goal:** User demand — recheck the frontend, add ALL missing quality-audit checks, page by page.
**Agent:** po
**Started:** 2026-07-24T17:12:59Z

---

### STEP po-S1 · po · 2026-07-24T17:20:00Z
**task-id:** QUALITY-AUDIT-FRONTEND-COVERAGE
**what-done:** Added 36 per-page frontend capability groups (+173 checks) to quality-checklist.json via idempotent generator; recomputed lowercase summary FROM rows.
**what-considered:**
- Grouping: per-page capability groups (best "page by page" nav) vs 4 domain buckets vs one giant group → chose per-page (directly answers user's "which pages missing").
- Dimensions: applied ≤5 per page (Functional/Freshness/Observability/Degradation/Correctness) only where the page's PUBLISHED CONTRACT supports each — not formulaic padding.
**why-decision:** Per-page groups + contract-grounded dims are the honest, navigable answer; generator makes it reproducible + guarantees summary==rows.
**why-change:** Prompt's schema prose was stale (checks nest under .capabilities[], not top-level .checks; token is NEEDS_REVIEW not the artifact's legacy NEEDS-REVIEW) — verified live, did not trust prose.

### STEP po-S2 · po · 2026-07-24T17:22:00Z
**task-id:** QUALITY-AUDIT-FRONTEND-COVERAGE
**what-done:** Fixed 2 pre-existing artifact bugs found during the mandated recompute: stored-summary drift (pass 239→245, info 20→14) + legacy NEEDS-REVIEW token normalized to NEEDS_REVIEW (consumer badge only matched underscore → grey-render bug).
**what-considered:**
- Leave legacy token (out of scope) vs normalize → normalize (root-cause fix; same file write; makes 3 rows render yellow not grey).
**why-decision:** "Recompute summary FROM rows" is explicit scope; the drift + token mismatch are exactly what that step exists to catch.
**why-change:** no change from plan.

### STEP po-S3 · po · 2026-07-24T17:27:00Z
**task-id:** QUALITY-AUDIT-FRONTEND-COVERAGE
**what-done:** LIVE HTTP-probed all 36 routes; caught /dashboard/bctc-eval = HTTP 500 (root error boundary) — upstream /api/bctc-eval 404s and the loader throws. Flipped FE-PG-BCTC-EVAL-_INDEX-FUNC PASS→FAIL, its 4 siblings + detail FUNC →NEEDS_REVIEW; overall→DEGRADED.
**what-considered:**
- Ship static-only PASS (fast) vs live-verify Functional → live-verify.
**why-decision:** My own notebook carry-over warns of the recurring FIX-QUALITY-CHECKLIST-GENERATOR-FABRICATED-PASS-EVIDENCE defect (PASS-while-broken). Static-only PASS on a 500 page IS that defect; the runtime probe is what distinguishes a real PASS from a fabricated one.
**why-change:** Added a live-probe gate the initial static plan lacked — surfaced a genuine broken page.

### STEP po-S4 · po · 2026-07-24T17:28:30Z
**task-id:** QUALITY-AUDIT-FRONTEND-COVERAGE
**what-done:** Minted 4 fix-tasks (owner=dev-frontend, AC="{check_id} re-check returns PASS") via orch-apply: FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX (P1, broken page) + 3× freshness-transparency WARN (P2).
**what-considered:**
- One fix-task per WARN/FAIL vs converge → 1 P1 for the FAIL (its 4 NEEDS_REVIEW siblings share root cause, no double-mint) + 1 P2 per distinct WARN.
**why-decision:** Constraint mandates a {check_id}-FIX per WARN/FAIL; convergence avoids 5 tasks for 1 root cause.
**why-change:** no change from plan.
