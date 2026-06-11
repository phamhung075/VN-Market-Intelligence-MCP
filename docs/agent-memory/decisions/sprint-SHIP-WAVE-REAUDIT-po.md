# Decision Journal — Sprint SHIP-WAVE-REAUDIT · po

**Sprint goal:** Live-behavior re-audit of last ship wave (17 TASK-17 endpoint+page pairs + FIX-VNSTOCK-FUNDAMENTALS + FIX-EVIDENCE-PIPELINE-STARVED). User signal: "many code not give best result".
**Agent:** po
**Started:** 2026-06-11T19:13:09Z

---

### STEP po-S1 · po · 2026-06-11T19:13:09Z
**task-id:** BA-SHIP-WAVE-REAUDIT
**what-done:** Self-initiated sprint SHIP-WAVE-REAUDIT; wrote sprint_goal entry + BA task atomically to orch-state, claimed umbrella lock, set head→ba.
**what-considered:**
- Direct FIX batch (skip BA) — rejected: 19 items + improvement-lane = needs per-endpoint contract decomposition, not a single fix.
- Re-run 44-check burn-down — rejected: that's lint/checklist (239 PASS done); user signal is LIVE content quality, orthogonal.
- Scope to only the 2 mcp fixes — rejected: TASK-17 wave is the bulk of "many code", surface-200 hides weak content.
**why-decision:** Grounded scope on live probe: all 17 endpoints return HTTP 200 + non-empty payloads, so failures are CONTENT-shape/staleness/UX (prose-where-JSON, missing direction/delta, unflagged stale) — exactly a BA→architect split + per-item GOOD/DEGRADED/BROKEN matrix.
**why-change:** no change from router directive — full ba→architect→pm→dev→qa chain as instructed.
