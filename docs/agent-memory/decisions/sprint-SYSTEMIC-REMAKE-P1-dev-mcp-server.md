# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-mcp-server

**Sprint goal:** Systemic remake P1 — root-cause fixes (idle-loops→verif→detector) per 07-04 systemic review.
**Agent:** dev-mcp-server
**Started:** 2026-07-04T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-04T00:00:00Z
**task-id:** FACTORY-INTERFACE-confidence-score-50-mask
**what-done:** Grepped apps/mcp-server for `confidence_score ?? 50` / `confidenceScore ?? 50` in the /api/signals/stock handler — zero matches. stockSignalsHandler.ts:224 already reads `row.confidence_score ?? null` (FIX-SIGNAL-CONFIDENCE-DEFAULT-50 marker present in comments).
**what-considered:**
- Assume stale detector output and implement anyway (rejected — would fabricate a diff on already-correct code)
- Search for a second/older stock-signals route that might still carry the mask (none found — server.ts:1359 has exactly one `/api/signals/stock/:code` route, delegating to this same handler)
- Verify via git history that the mask was already removed (confirmed: commit e3386bdfa "TASK-CONF-1 remove DEFAULT-50 confidence mask")
**why-decision:** Code, tests, and git history all converge on: this exact mask was fixed by a prior task (FIX-SIGNAL-CONFIDENCE-DEFAULT-50 / TASK-CONF-1). Editing would be a no-op diff or risk introducing churn on a correct file.
**why-change:** No implementation change made — reporting NO-CHANGE-NEEDED per detection-never-ran ≠ failed-fix policy. Ran scratch behavior-proof (absent confidence_score → null) + existing regression suite (47 pass) + `bun tsc --noEmit` (exit 0) to confirm current state is honest, not to fix a live bug.
