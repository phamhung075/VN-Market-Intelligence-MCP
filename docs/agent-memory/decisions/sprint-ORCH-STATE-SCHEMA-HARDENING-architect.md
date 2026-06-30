# Decision Journal — ORCH-STATE-SCHEMA-HARDENING

**task_id:** ORCH-STATE-SCHEMA-HARDENING
**agent:** architect
**date:** 2026-06-27
**brief:** `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md`

---

## Decisions

### D-1: Status enum set (11 values vs fewer)

**What considered:**
- Option A: 5 values only (BACKLOG/TODO/DONE/DONE_VERIFIED/CANCELLED). Simpler but loses IN_PROGRESS/REVIEW/QA/BLOCKED/DEFERRED/SKIPPED which agents use for routing.
- Option B: 11 values (chosen). Covers all real workflow states currently in use. REVIEW and QA are kept separate because architect-review and qa-agent are distinct pipeline stages that agents act on differently.

**Why 11:** Collapsing REVIEW into IN_PROGRESS would break dev-team routing (architect spawned on REVIEW, not IN_PROGRESS). Collapsing DEFERRED and CANCELLED into one value loses PM's ability to distinguish "postponed (may return)" from "dropped permanently."

### D-2: verify_note is HOT not COLD

**What considered:**
- Option A: verify_note goes to cold (detail_ref). Consistent with "all prose to cold" rule.
- Option B: verify_note stays hot (chosen). It is a ~20-char tag ("live-verified", "probe5"), not prose. It is the replacement for the qualifier suffix in the old status string. Agents need it to know WHY a task was marked cancelled vs done.

**Why hot:** Tag is too small to justify a cold round-trip. Prose (full note/probe_verdict text) goes cold; the status qualifier tag stays hot. This is the correct split.

### D-3: G-5 starts as WARN, not hard gate

**What considered:**
- Option A: Hard gate from day one. Clean but will block writes from any agent still using legacy spelling, causing deadlocks until migration is complete.
- Option B: WARN first (chosen). Migration (SHG-2) runs before hard gate (SHG-5). If SHG-2 fails mid-run, agents can still write. SHG-5 is a single uncomment line — trivial to promote.

**Why phased:** Operational safety. An aborted migration with a hard gate already active = no agent can write. Phased approach = zero write downtime during migration.

### D-4: Sprint eviction predicate is conservative (all tasks terminal)

**What considered:**
- Option A: Evict sprint if status field = "DONE"/"completed"/etc. Fragile (depends on manual sprint-level status being accurate, which it is NOT — the current data shows active/in_progress even for 100% done sprints).
- Option B: Evict sprint when ALL tasks are in TERMINAL_SET (chosen). Self-verifying from task data; immune to sprint-level status spelling drift.

**Why task-predicate:** Sprint-level status in the current data is unreliable (15 sprints say "active" but are 100% done). The only ground-truth is task completion. Predicate is deterministic and computable by jq without human judgment.

### D-5: null-id sprints quarantined unconditionally

**What considered:**
- Option A: Skip null-id sprints (leave them). They would never be evicted (predicate can't match null id) and persist forever as orphan bloat.
- Option B: Quarantine unconditionally (chosen). Both null-id sprints have all tasks DONE. They are corrupt artifacts from a previous bad write. Quarantine writes them to cold under a generated key; they are never surfaced in planning.

**Why quarantine:** A null-id sprint can never be referenced by any agent (no id = no lookup). It is pure bloat. Removing it is safe; the task data is preserved in cold.
