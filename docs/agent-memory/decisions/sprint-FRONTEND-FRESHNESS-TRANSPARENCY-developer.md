# Decision Journal — Sprint FRONTEND-FRESHNESS-TRANSPARENCY · developer

**Sprint goal:** no goal set (governance-tooling fix)
**Agent:** developer
**Started:** 2026-06-27T00:00:00Z

---

### STEP developer-S1 · developer · 2026-06-27T00:00:00Z
**task-id:** FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH
**what-done:** Fixed context-bloat backstop hook false-breach on archive notebook files by adding exempt entry to caps SSOT and honoring it in the hook script.
**what-considered:**
- High-cap sentinel only (9999) — JSON-only change, no script change needed; self-sufficient but opaque
- Explicit `exempt: true` flag + script guard — two coordinated edits; semantically clear, self-documenting, future-proof
- Exclusion logic in script only (no JSON change) — violates SSOT principle (caps policy lives in JSON)
**why-decision:** Chose `exempt: true` flag approach: SSOT policy stays in JSON (caps.json is the single source of truth); script honors it explicitly; intent is unambiguous to future readers. High-cap sentinel alone would be a magic number.
**why-change:** no change from plan; root cause was accurately diagnosed in the task spec.
