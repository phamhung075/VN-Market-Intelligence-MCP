# Decision Journal — Sprint S2-DATA-HONESTY · dev-frontend

**Sprint goal:** S2-DATA-HONESTY — eliminate fake/placeholder data from the full stack; backend serves real varied confidence, frontend must not re-introduce fabricated constants via null-coercion.
**Agent:** dev-frontend
**Started:** 2026-06-24T05:20:06Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-24T05:20:06Z
**task-id:** TASK-CONF-2
**what-done:** Propagated null confidence_score from API through domain type to render layer; null now renders "—" not "0%" or "50%".
**what-considered:**
- only path: widen `AgentSignal.confidence` from `number` to `number | null`, update `toAgentSignal` mapper to preserve null (not coerce with `?? 0`), then audit all render sites that call `.confidence`.
**why-decision:** Three render sites in dashboard.analysis.tsx consumed `AgentSignal.confidence`: inline text render (L778 — already null-guarded), `confidenceLabel()` function (needed widening to `number|null` + `if (!hasConfidence) return "—"`), cascade signals inline (L777 — wrapped in null check). `confidenceBar()` and `confidencePct()` are KinhDichReading/KinhDichMarket utilities — separate types not affected by this change.
**why-change:** no change from plan — task spec matched implementation exactly.
