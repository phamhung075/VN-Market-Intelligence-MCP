---
sprint: CHORE-COMMIT-OVERHEAD
branch: task/chore-commit-4-dashboard-commit-batch
size: M
priority: P2
depends_on: []
blocks: []
---

## TLDR

Batch `scripts/emit-dashboard-row.sh`'s per-finding git commits to one per tier-cycle. The WRITE + READBACK stay per-finding (unchanged); only the git COMMIT cadence moves to end-of-tier. **REQUIRES explicit design call** to decide mutex-hold strategy (long-hold throughout cycle vs bounded-window + reconciliation). This task is **size M not S** because of the design complexity.

## [PM] Planning Context

**Current Design:** `scripts/emit-dashboard-row.sh` commits DASHBOARD.md after EVERY finding write. System-auditor runs with 3 tiers (T1 every 30min, T2 every 4h, T3 daily), each producing 1-3 findings/cycle, each with its own immediate commit. Result: ~53/500 chore commits (12%) from system-auditor family, with peaks of 1-2 commits per 30-min window.

**Root Cause of Mutex Complexity:** Unlike `auditor-notebook-commit.sh` (which commits already-written content), `emit-dashboard-row.sh` owns the read-modify-write of the shared `DASHBOARD.md` file AND the commit. Per the script's own header (line 62-69):

> Unlike scripts/auditor-notebook-commit.sh (invoked AFTER content is already on disk), this script owns the read-modify-write of the content itself and therefore must hold `commit-mutex:main` across BOTH the file mutation and the commit — two concurrent audit tiers (T1 every 30min, T2 every 4h, T3 daily) can call this script inside the same wall-clock window and must not race a read-modify-write on the same file.

**Design Decision Requirement (PO-Flagged):** From `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md`:

> `scripts/emit-dashboard-row.sh:60-67` explicitly requires holding `commit-mutex:main` across both the file mutation AND the commit — unlike `auditor-notebook-commit.sh` — because `DASHBOARD.md` is shared across concurrent audit tiers (T1 every 30min, T2) and an uncommitted row risks being swept by a peer's bare commit. **Batching this commit changes the mutex-hold duration/design — task must require an explicit design call (long mutex hold vs. bounded uncommitted window + reconciliation), not silent removal of the existing safeguard.** Size this one M, not S.

This is NOT a mechanical batch-the-commit refactor. It's a mutex strategy redesign.

**Acceptance Criteria:**

- [ ] **AC-D1 (REQUIRED FIRST):** Design call with PO/Architect to decide on ONE of the following strategies and document the choice in `docs/architecture-briefs/2026-08-XX-dashboard-commit-batching-design.md`:
  - **Strategy A: Long Mutex Hold** — hold `commit-mutex:main` for the ENTIRE tier-cycle (e.g., T1's full 30-min window from first finding to final commit). Pros: simple, no reconciliation needed. Cons: mutex held for 30min blocks other writers, potential latency impact
  - **Strategy B: Per-Write Mutex + Bounded Uncommitted Window** — each write claims mutex briefly (just for read-modify-write), releases it; accumulated writes sit uncommitted for up to 30min (TTL-gated or cycle-end-gated). Final commit happens in a separate step holding mutex briefly for the commit only. Pros: shorter mutex holds. Cons: uncommitted DASHBOARD.md rows at risk of being swept by concurrent peer bare commits (per `feedback_coldevict_bare_commit_sweeps_worker_staged_index`)
  - **Strategy C: Hybrid — Reconciliation Guard** — like B, but add a pre-commit reconciliation step: before final commit, verify that no rows were lost to a concurrent peer's write by comparing row count. Document recovery if reconciliation fails
  - **Your choice** — if neither A/B/C, propose alternate strategy with explicit hazard analysis

- [ ] **AC-D2:** Once design is chosen, document it clearly in the task and in the architecture brief. Include: (1) mutex claim/release timing diagram, (2) failure scenarios and recovery, (3) acceptance window (how long can rows sit uncommitted)

- [ ] **AC-1:** Modify `scripts/emit-dashboard-row.sh` to separate the row-write from the git-commit step (deferred commit). Update header prose to explain the new batching behavior and the chosen mutex strategy

- [ ] **AC-2:** Modify `docs/agents/system-auditor/flow/main.md` and/or `tier1-probe.md` (T1's probe step) to accumulate written-row state across the tier's finding loop, then call a batched-commit step at end-of-tier. This becomes a new orchestration point per tier

- [ ] **AC-3:** Update the contract for `emit-dashboard-row.sh` — now it returns the row count written (not committed). The post-cycle commit actuator handles the git work, possibly in a shared call with other dashboard mutations from that tier's cycle

- [ ] **AC-4:** Verify that the chosen strategy respects `feedback_coldevict_bare_commit_sweeps_worker_staged_index` constraints. If using Strategy B/C, confirm that the bounded-uncommitted window and reconciliation guard are sufficient to prevent silent data loss

- [ ] **AC-5:** Update OUTPUT-CONTRACT or dashboard_rows counter in system-auditor flows to remain accurate (count WRITES, not COMMITS). Verify the count reflects the actual row presence on disk before the final commit

**Files to read first:**
- `scripts/emit-dashboard-row.sh` — header (lines 1-80), mutex protocol (lines 62-69), entire script to understand current flow
- `docs/agents/system-auditor/flow/main.md` — main flow (how findings are discovered, mutations ordered)
- `docs/agents/system-auditor/flow/tier1-probe.md` — T1-specific probe step (where emit-dashboard-row.sh is called)
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` — §6 R1 (recommendation)
- `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md` — PO's design-call requirement
- `feedback_coldevict_bare_commit_sweeps_worker_staged_index.md` — memory note on why uncommitted rows are risky

**Files to modify (after design decision):**
- `scripts/emit-dashboard-row.sh` — separate write from commit, update header, document strategy
- `docs/agents/system-auditor/flow/main.md` and/or `tier1-probe.md` — add batched-commit orchestration
- (NEW) `docs/architecture-briefs/2026-08-XX-dashboard-commit-batching-design.md` — document the chosen strategy

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § R1 & overall context
- `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md` § design-call requirement
- `scripts/emit-dashboard-row.sh` — full mutex protocol understanding (this is load-bearing)
- `docs/agents/system-auditor/flow/` — current tier orchestration and when emit-dashboard-row is called

---

## Architecture Reference

From `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § R1:

> **Batch system-auditor's per-finding GIT COMMIT to end-of-tier-cycle; keep per-finding WRITE+READBACK unchanged.**
> `scripts/emit-dashboard-row.sh`'s own header already treats commit as decoupled, non-blocking bookkeeping ("a commit-failure ... does NOT flip this call's success/count status") — the write's crash-safety property does not depend on immediate commit. Change: accumulate written-row state across a tier's finding loop, move the actual `git commit` to ONE call at end-of-tier (`docs/agents/system-auditor/flow/main.md` / `tier1-probe.md` post-cycle step) covering every `DASHBOARD.md` + `signal_queue` mutation from that cycle. Precedent: `docs/agents/market-watcher/flow/` + `docs/agents/news-scout/flow/stage-log-notify.md` already ship exactly this write-every-cycle / commit-once-per-session split — this generalizes an already-validated pattern, not a novel one.

### Precedent: Market-Watcher + News-Scout Batching

From architecture brief § 5:

> `docs/agents/market-watcher/flow/` + `docs/agents/news-scout/flow/stage-log-notify.md` already ship exactly this write-every-cycle / commit-once-per-session split (L-7, §5) — this generalizes an already-validated pattern, not a novel one.

**Reference:** Read `docs/agents/market-watcher/flow/cycle.md:283` and `docs/agents/news-scout/flow/stage-log-notify.md:14` to understand how they batch commits. Adapt that same pattern for system-auditor tiers.

---

## Scope Boundary

**IN SCOPE:**
- Design decision on mutex strategy
- Separating write from commit in emit-dashboard-row.sh
- Modifying system-auditor flows to orchestrate batched commits
- Updating contracts and OUTPUT-CONTRACT prose
- Documentation of the chosen strategy

**OUT OF SCOPE (don't touch):**
- Changing per-finding WRITE+READBACK behavior (that stays, unchanged, crash-safe)
- Altering the dedup-check or signal-routing logic
- Modifying notebook-commit isolation policy
- Touching cron cadence (tiers still run at their current rates)

---

## Design Call Requirement (BLOCKING)

**This task CANNOT proceed to implementation without completing AC-D1.** Before writing any code:

1. Review the three strategies (A: long hold, B: bounded + no reconciliation, C: bounded + reconciliation)
2. Consult with PO/Architect on the risk/benefit tradeoff
3. Document the chosen strategy in a new architecture brief
4. Get sign-off on the choice

Once the strategy is chosen, implementation becomes straightforward:
- **Strategy A:** Move the commit to end-of-tier, hold mutex the whole time
- **Strategy B/C:** Decouple write and commit, add reconciliation/guard if needed

---

## Success Criteria

1. Design decision documented and approved
2. `emit-dashboard-row.sh` defers commit to caller
3. System-auditor flows batch commits per tier-cycle
4. Mutex strategy respected and documented
5. Existing safeguards against data loss maintained (reconciliation if strategy B/C)
6. On merge: system-auditor family commits drop from ~53/500 to ~20-25/500 (rough half, per architecture brief estimate), with peaks smoothed from 1-2/30min to 1-2/tier-cycle
