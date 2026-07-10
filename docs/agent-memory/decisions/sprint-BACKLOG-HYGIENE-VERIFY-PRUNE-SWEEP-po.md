# Decision Journal — BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP (PO)

## 2026-07-10T18:41Z — D2.5 ratified + D1 residual re-scoped (sprint convergence)

**Context:** Sprint nearly converged. D3 (TODO/DEFERRED normalize), D0/D0B (triage + persistence-gap), D4 (cold-evict extend), D1 sub-scope (a) (live eviction, 72 rows, commit 42e565c7b) all DONE_VERIFIED / RAW-verified. Live coherence warnings 133 baseline -> 16. Router requested PO adjudication on D2.5 + D1 residual sequencing.

### Decision 1 — RATIFY D2.5 (extend LANE_ALLOWED_STATUSES to accept BLOCKED)
**Ruling: RATIFY** the architect brief §6 chosen design.
- Extend 3 lanes: `backlog += BLOCKED`, `review += BLOCKED`, `in_progress += BLOCKED` (orchStateSchema.ts:412-420 + doc-comment 392-399, ~3 lines).
- **Rejected** the alternative new `blocked[]` lane — large blast radius (TaskBoardSchema.strict(), collectAllTaskIds, checkRefIntegrity flatLanes, cold-evict enumeration, every dispatch/promote flow) and it loses the in-progress framing of a blocked task.
- **Rationale:** lane-coherence checks lane↔status *sanity*, not staleness. BLOCKED is a first-class enum sub-state with mandatory `blocked_reason`/`verify_note`; denying it a coherent lane forces either a fake relabel (hides real blockers) or a new lane (worse). Orthogonal-substate matches the enum's own definition. Precedent: ADD-1 `ready += TODO` (already live in schema). Zero data mutation — the 7 live BLOCKED rows (4 backlog + 3 review) already sit in those lanes.
- **Scope discipline:** `qa`/`done`/`done_verified`/`ready` deliberately left unchanged (never observed BLOCKED there; "done but blocked" is contradictory). Noted `qa`-BLOCKED is a plausible future extension IF ever observed — do not pre-broaden now.
- **Dispatch:** dev-mcp-server (single in-zone file). Moved backlog->ready[] with `po_signoff`. Dispatchable now (depends=[]).

### Decision 2 — D1 residual: reuse D1 row (not fresh D1b), re-scoped + promoted
Router offered 3 options (fold into D2.5 dispatch / fresh D1b / leave D1 open). **Chosen: reuse & sharpen D1's own row** — its title already charters "close exceptions, relocate confirmed D2-candidates" = exactly the residual. Reusing keeps D5.depends=[D3,D2.5,D1] valid (no churn) and keeps sub-scope-(a) history in its status_note.
- **Did NOT fold into D2.5's dispatch** — different zone/owner (schema code = dev-mcp-server; data-mutation = developer/scripts). Folding a code-change with a data-mutation invites the exact "dev silently picks" hazard the D2.5 note warns of.
- **Residual scope enumerated in the row note:** (b) close FACTORY-INTERFACE-split-server-ts (4/4 stage commits verified) via devteam-close-task-done-verified.jq; (c) 8 lane-moves from D0B triage_result.exceptions[] RELABEL (5 backlog[REVIEW]->review[], 3 backlog[IN_PROGRESS]->in_progress[]); (d) **PO-ADDED** relabel FIX-BCTC-BANK-SUMMARY-MAPPING DONE->BLOCKED.
- **Why (d) is PO-added, not in D0B:** D0B classed FIX-BCTC as EXCLUDE-from-evict (genuinely open per live DB probe CTG 2026Q1 net_margin_pct=229157%) but never fixed its wrong DONE label. To reach 0 warnings it must become coherent; BLOCKED is both accurate (blocked on ops re-ingest, corroborated by BLOCKED review sub-task TASK-W5-...-VALIDATION-REINGEST) and coherent once D2.5 lands. NOT a fabricated close.
- **depends=[D2.5]** so the BLOCKED-in-backlog rows land coherent (avoids transient incoherence). size S. Moved backlog->ready[].

### Arithmetic (16 -> 0)
- D2.5 resolves 7 BLOCKED (4 backlog + 3 review).
- D1-residual (c) resolves 8 lane-moves (5 REVIEW + 3 IN_PROGRESS in backlog).
- D1-residual (d) resolves 1 (FIX-BCTC DONE->BLOCKED).
- (b) FACTORY close = correctness (already coherent-as-BLOCKED under D2.5), 0 net warning delta.
= 16 -> 0. Unblocks D5 (validator hard-fail flip + close SHG-2/3/4/5).

### Write discipline
Board mutation via `jq -f | scripts/orch-apply.sh` (conservation OK 473=473, zero data mutation). No raw writes. No task closed by PO (dev/qa execute). D5 untouched.
