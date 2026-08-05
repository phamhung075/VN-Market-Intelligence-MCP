# Decision Journal — PM Decomposition

**Task:** FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE
**Agent:** pm
**Date:** 2026-08-05T09:40:22Z
**Decision:** Decompose architect design into 2 sequential dev tasks + mint fast-follow tracking

---

## What I Considered

1. **Decomposition strategy:** Single unified task vs. 3 separate handler tasks
   - **Option A:** One task covering all 3 handlers + all 3 test suites (3 files, M-sized, ~2h total)
   - **Option B:** Three parallel tasks (1 per handler, slight overhead/coordination)
   - **Chosen:** Option A (unified single task)
   - **Rationale:** Same zone (apps/mcp-server/), identical fix pattern applied 3 times, non-parallelizable (same validators, same test patterns), testable as one atomic feature. Splits into 3 implementation parts but are lightweight trivial edits. Reduces coordination overhead (one handoff, one PR, one verification gate).

2. **Fast-follow tracking:** Mint now or defer to later?
   - **Option A:** Don't track yet; let developer mention it if they notice
   - **Option B:** Mint as P1/M BACKLOG task now with explicit blocking dependency on write-side task
   - **Chosen:** Option B (mint now with dependency)
   - **Rationale:** Architect brief § 5 explicitly recommends PO mint a P1/M fast-follow. PM's job includes this decision (architect's not_my_job boundary). Minting now ensures (1) ~14 read-side call sites are visible in backlog before write-side ship, (2) verification gate for write-side is crisp (AC-1/2/3 only require write-path), (3) developer can pick up read-side naturally after write-side is verified live (explicit depends=["write-task"] ensures ordering). This is lower-risk parallelism than bundling.

3. **Task sizing and dependencies:**
   - Write-side: size=M, no deps, status=TODO, next_agent=dev-mcp-server
   - Read-side: size=M, depends=[write-task], status=BACKLOG, next_agent=dev-mcp-server
   - Rationale: Keeping them separate allows write-side AC to be verified independently (72h window for reconcile job recovery), then read-side unfolds naturally as a follow-on. Same-day parallel work would blur "did code or data readiness cause a 400?" If write-side is slow, read-side waits in BACKLOG (no blocking). Architect's AC-1/2/3 scope is crisp: write path only.

4. **Handoff content and acceptance criteria:**
   - Read brief § 2 (Fix Design) + § 3 (Test Strategy) to set AC
   - Included exact file paths and line numbers from brief
   - Specified test fixture shape (minimal financial_reports insert) with reference to existing pattern (bctcReparseJob.ts:656-683)
   - Required AC: 3 test files + all 3 handler files must be modified and test-green before merge
   - Verification gate: Live 72h probe (AC-2) for no more RECONCILE-EXHAUSTED telegrams citing fallback-% IDs
   - Rationale: Brief is already detailed; PM just needs to translate into dev-actionable handoff + wire tasks into board

5. **Observability gap flagging:**
   - Architect noted: "mcp-server's own container logs show ZERO trace... the 400 branch has no server-side log call, only the HTTP response body... a one-line logger.warn on the 400 branch would have cut discovery time"
   - This is in SCOPE for write-side task (small additive improvement, same review)
   - Handoff includes note: consider adding server-side log on the 400 branch (nice-to-have, not blocked AC)

---

## Why No Change from Plan

- Architect design was thorough and complete (root-cause, fix, test strategy, scope, callsite list all provided)
- PM decomposition is straightforward: translate design → 1-2 dev tasks + handoffs + board update
- No surprises encountered in reading the brief or checking the codebase
- No blocking dependencies or prerequisites needed
- Write-task and read-task are naturally sequenceable (write must land first, data must exist before reads are meaningful)

---

## Board State Post-Decomposition

- **Parent task:** FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE (READY → stays READY, updated status_note points to children)
- **Write-side task:** FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write (TODO, no deps, ready for dev pickup)
- **Read-side task:** FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW (BACKLOG, depends on write-task, AC gate-gated on write-side verification)
- **Handoffs:** Created `docs/handoffs/FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write.md` and `docs/handoffs/FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW.md`
- **orch-state.json:** Updated via orch-apply.sh (validation PASS, task counts +2)

---

## Next Steps for Dev

1. Pick up FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write (TODO, no external dependencies)
2. Modify 3 handlers + 3 test files per handoff spec
3. Merge & deploy
4. Await 72h verification window (AC-2: no new RECONCILE-EXHAUSTED Telegrams for fallback-% IDs)
5. Developer or PM picks up FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW (moves from BACKLOG → TODO once write-side is verified)
