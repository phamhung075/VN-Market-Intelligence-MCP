# Decision Journal — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · pm · Board Surgery (P1 Enum-Drift Corrective)

**Task ID:** TASK_1989 (mint) + TASK_1982 (supersede) + TASK_1983-1988 (re-gate)
**Session:** 14f8039a-51ce-44f8-a7d9-0ddbe73b994e
**Date:** 2026-06-28T11:37:00Z

---

## Context

PO step po-S10 identified P1 router pre-claim gate (step 2.5: task_claim(task_kind="intent")) as non-functional: deployed server rejects with -32602 (Invalid Parameters). Root cause: coordinationStore.ts CHECK constraint, TS union TaskKind, and Zod enum in coordinationTools.ts all carry only 4 kinds (cowork-slot, sprint-task, dashboard-row, commit-mutex); 'intent' absent. PO classified this as class-level defect (same family as TASK_1976/1977 commit-mutex enum-drift).

Per po-S11 (decision B/C/D), the fix is ONE atomic Migration-3 widening all 3 schema sites to a complete 7-kind taxonomy (intent + orphan-signal + session-presence + existing 4), with redispatch_count column fold-in. This corrective SUPERSEDES TASK_1982 entirely (original scope: partial "orphan-signal + redispatch_count" column add; now absorbed into complete taxonomy migration).

---

## Decision: Mint TASK_1989 as P1 corrective gate + supersede TASK_1982

**What considered:**

1. **Piecemeal enum-widen (intent only)** — rejected: leaves session-presence (P2) as a 3rd future enum-drift window. PO: "2nd recurrence of enum-drift → fix the CLASS not the symptom (feedback_recurring_bug_escalation)." Complete taxonomy NOW collapsing 3 windows into 1.

2. **Extend TASK_1982 scope instead of minting corrective** — rejected: TASK_1982 is already decomposed, allocated to dev, and carries incomplete scope (orphan-signal + redispatch_count ADD COLUMN). The corrective needs a DIFFERENT detection guard (!sql.includes("'intent'"), not the orphan-signal guard that would NO-OP on live dbs after 'commit-mutex' already passed). Two guards on one table-recreate block = complex; one atomic Migration-3 is cleaner.

3. **TASK_1982 status** — supersede via CANCELLED (not DONE, not BACKLOG): CANCELLED signals "valid scope, but absorbed elsewhere" vs DONE (completed) or BACKLOG (pending).

**Why decision:**

- **Only path:** One atomic Migration-3 with its OWN detection guard, replicating Migration 1 precedent. All 3 enum sites (CHECK/TS/Zod) + describe strings widened in sync. redispatch_count column folded in (P1.5 reaper feature from TASK_1982 scope).
- **Sequencing:** TASK_1989 depends TASK_1980 (P1-FINAL flip required for schema to make sense). Blocks TASK_1983-1988 (P1.5 fan-out).
- **Absorbs TASK_1982 scope fully:** redispatch_count column + 'orphan-signal' kind both land in corrective. TASK_1982 marked CANCELLED with clear status_note. No scope residual in 1982.
- **Closes P1 gate-hardening:** router step 2.5 dispatch-claim gate (CLAUDE.md step 2.5) can ship as intended once corrective lands + rebuilt.

---

## Decision: Re-gate TASK_1983-1988 → blockedBy TASK_1989

**What considered:**

- Keep TASK_1983-1988 blockedBy TASK_1982 (original gate): breaks their flow once TASK_1982 marked CANCELLED; their dep reference becomes ambiguous.
- Add TASK_1989 as an additional dep alongside TASK_1982: leaves dead reference to superseded task; confusing.
- **Replace → TASK_1989:** Clears ambiguity. TASK_1983-1988 now explicitly gate on the P1 schema migration (the real schema dependency, not the partial orphan-signal feature decomposition).

**Why decision:**

- **Real dependency is the schema:** PO: "real intra-P1.5 dependency is the schema; gate them on the corrective so the fan-out can't start until the 7-kind schema lands."
- **TASK_1983 reaper already excludes 'intent':** reaper ALLOW-LIST (DoD-P15-4) pre-approved in brief §6.5.2 with 'intent' already named as NOT-emittable. No scope change to TASK_1983 needed; only blockedBy pointer.
- **All 6 tasks depend on taxonomy:** TASK_1983 emits orphan-signal (needs full kind enum), TASK_1984–1988 consume it. They all wait for schema.

---

## Execution

**Orch-apply.sh mutations (atomic write):**
```
.task_board.backlog += [TASK_1989 object]
.task_board.backlog[id=TASK_1982].status = "CANCELLED"
.task_board.backlog[id=TASK_1982].status_note = "..."
.task_board.backlog[id=TASK_1983].depends_on = [..., "TASK_1989"] (remove "TASK_1982", add "TASK_1989")
.task_board.backlog[id=TASK_1984-1988].depends_on += ["TASK_1989"]
```

**Validation:** orch-apply.sh passed; 82 pre-existing SHG coherence warnings (unrelated), no new issues.

**Commit:** `chore(pm/1989): mint P1 enum-drift corrective TASK_1989, supersede TASK_1982, re-gate TASK_1983-1988`

**Handoff created:** docs/handoffs/TASK_1989-fix-coord-taskkind-enum-intent-gate.md

---

## Artifacts

- **Board state after:** TASK_1989 (BACKLOG, depends TASK_1980, blocks [1983-1988]) + TASK_1982 (CANCELLED) + TASK_1983-1988 (all depend 1989)
- **Decision journal location:** this file (sprint-CROSS-SESSION-MULTI-TEAM-ORCH-pm-board-surgery-1989.md)
- **Notebook append:** docs/agent-memory/notebooks/pm.md § c325

---

## Next: Developer Execution (Deferred to dev-mcp-server)

Developer will execute TASK_1989 per handoff AC:
1. Migrate coordinationTable with Migration-3 block (own detection guard)
2. Widen all 3 sites: CHECK/TS union/Zod enum + describe strings
3. Fold in redispatch_count column
4. RAW-verify against live named-volume db
5. Compile + tsc 0 errors

QA will verify live integration (router PRE-CLAIM gate + orphan-signal/session-presence kinds all accepted).

Post-ship: ops REBUILD mcp-server (post-code-change rule), qa regression, architect doc-sync (non-blocking).
