# Decision Journal — Sprint COWORK-RELIABILITY · architect

**Sprint goal:** Close recurring cowork signal/synthesis/publish-marker reliability defects (drain, filename collisions, marker key/lifecycle).
**Agent:** architect
**Started:** 2026-08-07T05:10:00Z

---

### STEP architect-S1 · architect · 2026-08-07T05:10:00Z
**task-id:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING
**what-done:** Read BA spec + full task_board row history at source; re-verified 3 load-bearing claims live (chef.md CYCLE_DATE_UTC already shipped, scheduled_utc= NOT yet on any live trigger_prompt, drain-signals.js fingerprint filename-independent); wrote design brief `docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md` covering FR-1..FR-7/NFR-1..5/EC-1..5.
**what-considered:**
- Design FR-3's intraday hour component on UTC basis immediately (fully closes EC-2) — REJECTED for this ship: would violate NFR-3 (filename-key and mutex-key must derive from the IDENTICAL upstream value) since the live multi-fire MARKER_KEY is still VN_HOUR-based (out of scope for the sibling ANCHOR row); UTC migration needs the mutex key migrated too, in the same breaking change — deferred to a named Phase 2 follow-on, flagged to PO rather than silently bundled.
- Design a new write-serialization mechanism for FR-4 (tnb) this cycle — REJECTED: performed the mandated RAW-verify first (git log since 2026-07-29 marker-cadence fix) and found zero repeat c<NNN> collision across 3 tnb-audit cycles (c121/c122/c123); building a new mechanism against unreproduced-since-the-actual-fix evidence would be speculative engineering. Flagged disposition (monitor-only vs. cheap task_claim-based defense-in-depth) to PO as a risk-tolerance call, not a technical one.
- Bundle FR-7 (routine-mode explicit emit line) + a stage-consolidate.md cross-reference correction into the same bctc-analyst edit set as FR-2 — CHOSEN, zero extra scope since those files are touched anyway and the cross-reference (pointing to the wrong file for the actual signal-file write) would otherwise mislead the implementer.
**why-decision:** NFR-3's single-source-of-truth rule and the row's own binding 2026-07-22 CAUTION are non-negotiable per the PO go-ahead's independent verification pass — any design that lets filename-key and mutex-key diverge (even temporarily, even for a "better" basis) reopens the exact defect class this row exists to close.
**why-change:** No change from BA's file-by-file plan; this pass adds sequencing precision (which session variable is pinned where) and 2 source-verified corrections (stage-consolidate.md's stale cross-reference; scheduled_utc= not yet live so BA's FR-1 fallback is the active path, not a hedge).
