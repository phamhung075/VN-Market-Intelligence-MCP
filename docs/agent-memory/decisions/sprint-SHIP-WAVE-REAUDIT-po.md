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

### STEP po-S2 · po · 2026-06-11T19:27:17Z
**task-id:** BA-SHIP-WAVE-REAUDIT
**what-done:** APPROVED BA spec (19-item live-probe matrix); stamped status + 4 PO product rulings in spec; flipped BA DONE; created ARCH-SHIP-WAVE-REAUDIT; head→architect.
**what-considered:**
- Reject for revision — rejected: spec is complete (per-item rubrics + thresholds + DDD + zone-multi + NFR table), no gaps.
- Leave A-16 reputation trend as BA's "may be DEGRADED/monitor" — rejected: all 41 identical trend="stable" IS the user's "not best result"; ruled DEGRADED in-scope so it gets a real fix, not a deferred probe.
- Decide NFR-C-1 Option A vs B myself — rejected: that's technical design (handler vs middleware), architect's call; I only fix the product AC (stale must be consumer-visible).
**why-decision:** Spec passes all 3 gate criteria (matches vision / AC clear / blockers answerable); the one open item is a design ruling correctly owned by architect. Two product rulings (A-16 in-scope, stale-visible AC) keep weak-content items from being deferred away.
**why-change:** no change from plan — chain proceeds ba→architect as designed.
