# Decision Journal — Sprint FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT · qa

**Sprint goal:** sprint_goal.entries[] status-drift normalize + wire cold-evict
**Agent:** qa
**Started:** 2026-07-02T00:00:00Z

---

### STEP qa-S1 · qa · 2026-07-02T00:00:00Z
**task-id:** FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT
**what-done:** Merge-gate verified commit f9e6f40d against all 4 ACs — commit stat, scoped
bun test, Stage 1d negative+positive validate paths (scratchpad fixture only), shellcheck,
live sprint_goal.entries state, tsc --noEmit, DDD/security/mock-guard.
**what-considered:**
- Trust review_note text as-is vs re-derive every claim from filesystem/git/test output — chose re-derive (RAW-verify mandate).
- Whether to touch live orch-state.json for negative-path proof — rejected; built isolated fixture in scratchpad per hard constraint (feedback_negative_path_test_corrupts_live_ssot).
- Whether PO's live 18→15 eviction (541697bc) counts as sufficient proof — treated as corroboration only, independently re-verified count/statuses myself.
**why-decision:** All 6 VERIFY items passed with no discrepancies: commit contains exactly the claimed files; 5/5 scoped tests pass; Stage 1d hard-fails the drifted fixture (exit 2, mentions Stage 1d + canonical status) and passes live file (exit 0, only pre-existing unrelated coherence warnings); shellcheck zero output; live sprint_goal.entries = 15, statuses {OPEN:2, PLANNING:1, active:12} — zero drift; tsc --noEmit exit 0 repo-wide.
**why-change:** no change from plan — APPROVE.
