# Decision Journal — Sprint DASH-CRON-RECHECK-TABLE · architect

**Sprint goal:** Add a Cron Recheck Table to /dashboard/orchestration so the user can RECHECK every scheduled cron and see per-cron expected schedule -> last actual fire -> honest status (ON_TIME/LATE/MISSED/STALE/NEVER_FIRED), truthful about the two cron layers.
**Agent:** architect
**Started:** 2026-07-02T06:45:00Z

---

### STEP architect-S1 · architect · 2026-07-02T06:45Z
**task-id:** ARCH-DASH-CRON-RECHECK-TABLE
**what-done:** Brownfield-read all 6 BA-cited surfaces + `.claude/commands/crons/*.md` (14 files) live; wrote SPLIT design (Zone 1 mcp-server / Zone 2 frontend) to `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md` + `[Architect] Brownfield Findings` in the BA handoff.
**what-considered:**
- CN-1 job_name resolution: full static ~85-entry map vs runtime-only DISTINCT+normalize vs hybrid — chose hybrid (static 16-pair table for WATCHDOG_MANIFEST jobs, since a pure normalize heuristic provably fails on `summaryJob:daily`→`summaryDaily`; normalized DISTINCT-scan fallback for the rest).
- CN-2 cadence for restricted-window/comma-list crons: per-expression special-casing vs one generic MIN-of-N-samples algorithm — chose generic (MIN successive delta across 6 `cron-parser`-sampled occurrences) — verified by hand it correctly derives 10min for `*/10 2-8 * * 1-5` and 30min for `15,45 * * * *` without special-casing.
- node-cron vs new `cron-parser` dep for next/prev-fire math — node-cron exports no public parsing API (internals unexported, deep-import fragile/DDD-unclean) → added `cron-parser` as new pinned dependency (verified absent from repo entirely, not even transitively).
- Layer-B SSOT: parsed `.claude/commands/crons/*.md` directly and found BA's FR-2.1 3-source list (14 files + cron-detect-loop 4 crons + cron-cowork-team 1 cron) double-counts 5 crons (dev-team + system-auditor×3 + cowork-team) — the 2 skill files are re-arm automation that verbatim-copies the command files' values, not independent sources. Also found `cron-fb-market-poster.md` is DEPRECATED (folded into cowork-team dispatcher 2026-06-28) with zero standalone crons, and `cron-refine-bctc.md` uses a different comment-format than the other 12 files.
**why-decision:** Each choice resolves an ARCH-RATIFY item with a verified live-code justification (not a guess) — hybrid CN-1 and generic CN-2 both directly trace to a concrete counter-example found by reading the actual data (WATCHDOG_MANIFEST literals, CRONS map keys, the 14 .md files), not BA's assumed-uniform spec text.
**why-change:** Corrects BA FR-2.1 (Layer-B source double-count) and AC-12 wording (14→13 live files) — flagged to PM/QA in the brief §5 R2, not silently patched into the spec.
