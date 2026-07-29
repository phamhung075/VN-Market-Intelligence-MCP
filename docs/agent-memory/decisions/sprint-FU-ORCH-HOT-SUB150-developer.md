# Decision Journal — Sprint FU-ORCH-HOT-SUB150 · developer

**Sprint goal:** Drive hot orch-state.json <150KB via lifecycle eviction (sprint_goal/decision_journal trim, task FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE)
**Agent:** developer
**Started:** 2026-07-29T08:00:00Z

---

### STEP developer-S1 · developer · 2026-07-29T08:05:00Z
**task-id:** FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE
**what-done:** Verified sprint_goal.entries[]/active_sprints[] eviction is a genuine 0 (all 18 entries + 8 active_sprints are non-terminal, no drift/aliasing, no orphan cold-archive counterpart); extended scripts/orch-cold-evict.sh with an age-gated decision_journal[] pass (index-keyed removal + content-deduped cold append, since entries have no stable unique id) per architect finding state-data-files-P7; ran it live under commit-mutex.
**what-considered:**
- Cross-checking each live sprint_goal.entries[] sprint_id against task_board lanes + cold closed_sprints/closed_sprint_goals for drift evidence before concluding 0-evictable (not just trusting the predicate blindly)
- decision_journal retention rule: age-rank (mirrors done[] KEEP_RECENT/MAX_AGE_DAYS pattern, matches P7 spec) vs. sprint-liveness-based — chose age-rank since decision_journal is an append-only WHY audit trail with zero live readers (verified: only 2 writer call-sites, no flow reads it back), independent of whether the parent sprint is still open
- New dedicated script vs. extending orch-cold-evict.sh — extended the existing script (single canonical eviction SSOT, matches constraint to reuse existing pattern) despite added complexity from entries having no stable id (index-keyed removal, content-hash cold dedup)
**why-decision:** P7 (docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md) already specified the exact retention shape (age-rank, keep 10 newest, 14-day cutoff) and confirmed zero live readers — lowest-risk, most-grounded option available; sprint_goal/active_sprints genuinely had nothing to evict so no code change was needed there.
**why-change:** No change from plan — task scope note explicitly allowed narrowing to "only unambiguously terminal" and flagging remaining ambiguity rather than guessing; that is what was done.
