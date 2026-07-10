# Decision Journal — FIX-BCTC-BANK-SUMMARY-MAPPING · pm

**Context:** PM reconciliation cycle for FIX-BCTC-BANK-SCALAR-MAPPING (near-duplicate task, minted 2026-06-16 21h after the canonical FIX-BCTC-BANK-SUMMARY-MAPPING, same CTG defect). Architect brief (docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md) explicitly recommends AC-14 dedup (close as duplicate, merge onto ONE execution thread). PM authority granted per prompt and flow contract.

**Task goal:** (1) Decide and document canonical task ID (FIX-BCTC-BANK-SUMMARY-MAPPING vs FIX-BCTC-BANK-SCALAR-MAPPING); (2) close the duplicate; (3) decompose Track 1 (architect brief §2.5) as concrete W5 replacement work unit; (4) update orch-state.json task_board via orch-apply.sh; (5) create handoff for Track 1.

**Agent:** pm
**Started:** 2026-07-10T00:20:00Z (architect brief completion)
**Decision date:** 2026-07-10T00:45:00Z

---

### STEP pm-S1 · pm · 2026-07-10

**task-id:** FIX-BCTC-BANK-SUMMARY-MAPPING (canonical sprint; FIX-BCTC-BANK-SCALAR-MAPPING closed as duplicate)

**what-done:**
1. **Canonical task selected:** FIX-BCTC-BANK-SUMMARY-MAPPING
   - Minted 2026-06-16T00:04:25Z by PO-s70
   - W1-W4 already shipped + done_verified (commits a46131cf1, 2cd9e1054, b630277c7, deployed 2026-07-03)
   - Status: active sprint_goal, W5 currently BLOCKED in review lane
   - Carries all forward work for the single root cause

2. **Duplicate identified and closed:** FIX-BCTC-BANK-SCALAR-MAPPING
   - Minted 2026-06-16T21:34:06Z by PO-s91 (~21h after canonical, same day)
   - Describes identical defect: CTG 2026-Q1, total_assets=0, net_margin_pct=229157%, net_revenue=3910
   - Same ticket, same numbers, no independent work units
   - Status changed from in_progress → closed_sprints (status=DUPLICATE, duplicate_of=FIX-BCTC-BANK-SUMMARY-MAPPING)
   - Board mutation: moved from .task_board.in_progress[] to .task_board.closed_sprints[] with closed_by=pm, closed_note=dedup reconciliation per AC-14

3. **Track 1 decomposed as concrete W5 replacement**
   - Task ID: TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD
   - Type: FIX-MIGRATION (deterministic, non-agentic path replacing blocked agentic W5)
   - Size: S (~2h, source_report_id param extension OR one-off migration script)
   - Zone: apps/mcp-server/ (confirmed unchanged from architect's 2026-07-01 SPIKE)
   - Status: READY (immediately available for dev-mcp-server pickup)
   - Sprint: FIX-BCTC-BANK-SUMMARY-MAPPING (W5 replacement, same sprint as W1-W4)
   - Design reference: docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md §2.5 (Track 1)
   - Scope: CTG orphaned-row carry-forward (451 rows from report_id 96e36139-... to e497f7d1-..., deterministic migration before aggregation)
   - Board mutation: added to .task_board.ready[] with next_agent=dev-mcp-server

4. **Handoff created:** docs/handoffs/TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD.md
   - 6 acceptance criteria (AC-TRACK1-1 through AC-TRACK1-6)
   - AC-TRACK1-1: tool param or script implementation
   - AC-TRACK1-2: live DB execution on named-volume, row count verification
   - AC-TRACK1-3: downstream scalar plausibility (total_assets > 0, net_revenue plausible, net_margin_pct in bank band)
   - AC-TRACK1-4: regression gates (VCB, FPT, VNM unchanged)
   - AC-TRACK1-5: AC-16 report_id freshness re-check before shipping
   - AC-TRACK1-6: commit discipline (dedup note, brief ref, session UUID scrub)

5. **Board state updates via orch-apply.sh (atomic write, schema-validated)**
   - FIX-BCTC-BANK-SCALAR-MAPPING: in_progress → closed_sprints (status=DUPLICATE)
   - TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD: added to ready[]
   - .head.active_task_id: FIX-BCTC-BANK-SCALAR-MAPPING → TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD
   - .head.next_agent: pm → dev-mcp-server
   - .head.next_action: updated to Track 1 implementation intent
   - Validation: orch-validate.mjs passed (Zod schema, no dup keys, coherence warnings SHG-migration non-blocking)

6. **Notebook updated:** docs/agent-memory/notebooks/pm.md
   - Entry c322: Decision rationale, constraint verification, board mutations summary
   - <200L budget maintained (actual: ~85L)

7. **Committed:** 83748768d
   - Message includes: AC-14 dedup note, Track 1 decomposition intent, architect reference, session UUID, W2 sequencing verification

**what-considered:**
1. **Task identity question:** Should I merge FIX-BCTC-BANK-SCALAR-MAPPING onto FIX-BCTC-BANK-SUMMARY-MAPPING or open a parallel W5 under this task's id?
   - Option A (selected): Merge onto FIX-BCTC-BANK-SUMMARY-MAPPING, close FIX-BCTC-BANK-SCALAR-MAPPING as duplicate
   - Option B (rejected): Decompose Track 1 as a standalone W5 directly off FIX-BCTC-BANK-SCALAR-MAPPING
   - **Reasoning:** Architect explicitly recommends (AC-14, brief §3): "do NOT decompose a second parallel W5-equivalent off this task's board row... this brief's Track 1 becomes the concrete replacement for the twin sprint's blocked W5 — routed as a follow-on work unit under whichever task id po/pm designates as canonical." FIX-BCTC-BANK-SUMMARY-MAPPING was minted first, already has 4 shipped units, and is the single canonical thread. AC-14 is non-blocking advisory per BA, but architect brief elevates it to decision-time recommendation.

2. **W2 sequencing prerequisite:** Was W2 already deployed before this cycle?
   - Option A (selected): Confirm live from orch-state.json and commit history
   - Option B (rejected): Assume W2 deploying now or flag as blocker
   - **Reasoning:** RISK-1 [HIGH] states "sequencing this ahead of W2 would carry-forward *uncorrected* corrupted rows." Must verify. Live check via orch-state.json: W1-W4 all done_verified (status field in sprint_goal shows "active", sprints details show W1-W4 shipped 2026-07-03). Coordinator independently verified git_sha of live container against W2 deploy commit — CONFIRMED. No blocker. Track 1 ready to sequence now.

3. **Track 1 scope vs. Track 2:** Should I include Track 2 (general 62-report unblock for other tickers) in this sprint?
   - Option A (selected): Defer Track 2 to separate backlog scope, decompose only Track 1 this cycle
   - Option B (rejected): Mint parallel Track 2 task now
   - **Reasoning:** Architect brief §2.5 explicitly: "Track 2 (general, all other 62 PENDING reports incl. VCB/MBB/ACB/BID) — NOT a small FR-9 patch, flag for pm as separate backlog-sized scope, not this sprint." AC-TRACK1 accepts this scope split. Track 1 is CTG-specific, deterministic, ~2h. Track 2 requires new non-LLM markdown/table extractor = SPRINT-S+ effort. Separate the concerns.

4. **Decision-journal filing:** Should this be filed under FIX-BCTC-BANK-SUMMARY-MAPPING or FIX-BCTC-BANK-SCALAR-MAPPING?
   - Option A (selected): File under sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-pm.md (canonical sprint)
   - Option B (rejected): File under sprint-FIX-BCTC-BANK-SCALAR-MAPPING-pm.md (the task I was dispatched on)
   - **Reasoning:** PM flow contract (line 98) states: "Write at minimum ONE entry per task you complete stamped with its task-id." The "task I complete" is the reconciliation/dedup decision, which results in FIX-BCTC-BANK-SUMMARY-MAPPING becoming the canonical thread. Coordinator guidance suggested sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-pm.md "since that's now the canonical sprint where the forward work lives" — this aligns with the flow contract intent to record decisions against the canonical work unit, not the now-closed duplicate.

**why-decision:**
1. **AC-14 dedup reconciliation → FIX-BCTC-BANK-SUMMARY-MAPPING canonical:** Both BA and architect explicitly recommended merging onto ONE thread. PM authority per prompt ("per your own authority over task_board"). FIX-BCTC-BANK-SUMMARY-MAPPING has first-mover advantage (minted 06-16 00:04), already has 4 shipped units, and W1-W4 done_verified status provides clear evidence of forward progress. Closing FIX-BCTC-BANK-SCALAR-MAPPING as a duplicate eliminates board confusion and enforces single execution thread per feedback_recurring_bug_escalation / feedback_recurring_detection_vs_recurring_failed_fix (resolve at the root: one fix path, not two parallel attempts).

2. **Track 1 sequencing after W2 deploy (verified RISK-1 ✓):** W2 row-repair is a prerequisite for Track 1 carry-forward (architect brief RISK-1: "sequencing ahead would carry-forward uncorrected rows"). Live verification via orch-state.json sprint_goal shows W2 shipped 2026-07-03 as part of W1-W4 done_verified. Coordinator independently confirmed via container git_sha. No sequencing blocker. Track 1 ready for immediate dev-mcp-server pickup.

3. **Track 1 as atomic W5 replacement (not separate backlog item):** Architect brief §2.5 design explicitly frames Track 1 as "the concrete replacement for the twin sprint's blocked W5" — a work unit that continues the same sprint's intent rather than a new independent backlog item. Scoping it under FIX-BCTC-BANK-SUMMARY-MAPPING keeps the same sprint's narrative coherent and allows W5 blocking status to be lifted once Track 1 ships.

4. **Deterministic path justified (RISK-2 noted, not blocking):** Architect brief RISK-2 [MEDIUM] states: "if the gateway-blind defect recovers, the original agentic W5 may become viable — re-check live before committing dev effort." This is a developer-time decision gate (in the handoff AC-TRACK1-1 acceptance criteria context), not a PM-time blocker. PM appropriately defers the decision to dev-mcp-server: "before committing dev effort, re-check RISK-2 (gateway recovery)." If recovered, dev can pivot to original agentic W5 without board changes.

**why-change:**
1. **Reconciliation necessary (not planned ahead of time):** The twin sprint's existence as a near-duplicate was a discovery during this cycle (BA/architect specs completed 2026-07-09/10; PM decomposition 2026-07-10). This wasn't a "known gap — defer to PM" from day 1; it's a correction of a past dispatch mis-dedup that now surfaces. AC-14 and architect recommendation makes the change mandatory, not optional.

2. **No deviation from architect brief:** Architect brief §2.5, §3, and RISK flags are the operative design. No interpretation or extension beyond what's written. Track 1 acceptance criteria (AC-TRACK1-1 through AC-TRACK1-6) directly transcribe the architect intent into executable gates.

3. **Board state fidelity:** FIX-BCTC-BANK-SCALAR-MAPPING in_progress → closed_sprints transition is truthful: the task exists and was promoted to in_progress by bounded-1 auto-pickup (real promotion, real BA/architect specs), but now is correctly re-labeled as DUPLICATE rather than left as an orphaned in_progress row. Prevents downstream dispatch confusion (dev-mcp-server won't pick up a stale duplicate).

**verification:**
- **Board state:** jq '.task_board.in_progress' shows 0 rows (FIX-BCTC-BANK-SCALAR-MAPPING moved); jq '.task_board.closed_sprints[] | select(.id == "FIX-BCTC-BANK-SCALAR-MAPPING")' returns {status: "DUPLICATE", duplicate_of: "FIX-BCTC-BANK-SUMMARY-MAPPING", closed_by: "pm"}; jq '.task_board.ready[] | select(.id == "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD")' returns {status: "READY", next_agent: "dev-mcp-server", zone: "apps/mcp-server/"} ✓
- **.head state:** jq '.head' returns {active_task_id: "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD", next_agent: "dev-mcp-server"} ✓
- **Orch-apply.sh:** Validation passed (Zod schema + dup-key + coherence warnings SHG-migration non-blocking, exit 0) ✓
- **Commit:** 83748768d includes orch-state mutations, notebook c322, handoff, all via git with proper message and session UUID ✓
- **Handoff file:** Created at docs/handoffs/TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD.md with 6 ACs, risk flags, files, and dependencies ✓
- **Notebook:** Entry c322 ≤200L, decision rationale, constraint verification documented ✓
- **Sequencing constraint (RISK-1):** W2 deploy verified 2026-07-03 (part of W1-W4 done_verified); coordinator confirmed via container git_sha ✓
