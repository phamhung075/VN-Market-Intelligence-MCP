# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · architect

**Sprint goal:** Cowork guaranteed-slot catch-up (rolling sprint)
**Agent:** architect
**Started:** 2026-08-09T00:40:00Z (continuation of -4.md, which CAP-REACHED)

---

### STEP architect-S1 · architect · 2026-08-09T00:40:00Z
**task-id:** FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
**what-done:** Read agent-father's full flow directory (main/keep/scan-orphans/sweep-fixes/review/create/edit*/team-tool-recheck) per PO's mandatory pre-design question — confirmed by exhaustive grep (zero `task_board`/`next_agent` hits outside 2 unrelated lines) that the cron never consumes its own board queue. Found a second, independent defect: `main.md`'s dispatch table needs structured `agent_name`+`change_description`, so even a generic "spawn with row context" dispatch (the DRS/PO-sweep pattern) would silently no-op into `keep.md`'s default branch. Designed two disjoint mechanisms: (A) new `agent-father/flow/board-drain.md` sub-flow with a SAFE_AUTO/NEEDS_RATIFY classifier (reuses `edit.md`'s existing prepare/apply split as the safety envelope + the already-shipped `improvement_approved_md` proposal lifecycle for the ratify path) for the 34-row/79% agent-father concentration; (B) a small widen (1→N/tick) of the already-shipped `manual-dispatch-sweep.md` for the 9-row ops-class remainder. Full brief: `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md`.
**what-considered:**
- Adding agent-father to the DRS allowlist (AC1's implicit "obvious" option) — rejected twice over: already ratified OUT for blast-radius reasons (`devteam-eligibility.jq:512-514`), AND mechanically broken regardless (§1.3 of the brief — DRS's generic spawn shape cannot satisfy agent-father's structured intent contract, would silently no-op).
- One unified mechanism (widen PO-sweep for both agent-father and ops/*) vs two separate ones — rejected unified: ops/* was excluded for a *safety* reason (generic input already works, just needs a human gate PO-sweep already provides); agent-father was excluded for a *translation-contract* reason (no generic flow to spawn at all) — same measured defect, two different root causes, conflating them would either under-gate ops or fail silently on agent-father.
- SAFE_AUTO classifier shape — mirrored `sweep-fixes.md`'s own pre-existing "auto-fix mechanical/cosmetic only, escalate anything requiring scope understanding" discipline rather than inventing new risk vocabulary; live-verified against 5 real stranded rows (multi-owner file spans, `supervised:true`, empty `files[]`) before finalizing, not asserted from the predicate design alone.
**why-decision:** Live re-measured (43 rows, not the mint's 44 — 34 agent-father/9 ops-class, 0 P0 today) via the row's own named instrument before designing. `commit_zone` in `init.md` already names a "signal-queue DONE-mark" carve-out never actually exercised by any flow file — reused/narrowly-widened that existing governance seam for board-drain's own lane-move write rather than inventing new write authority.
**why-change:** No change from AC1-4's framing — AC1's "new sweep lane" and "ratified PO BATCH" are not alternatives as originally read; they are the correct fix for the two genuinely different problem classes hiding inside one measured number.

