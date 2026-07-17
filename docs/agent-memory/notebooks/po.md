# PO Notebook

_Last: 2026-07-17T12:00Z (pm intent:pm:sysremake-p2-rcverif-decompose — SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE Leg-1 decomposition)_

## Tick 2026-07-17T12:00Z — DECOMPOSE SYSREMAKE-P2 Leg-1 (RC-VERIF+RC-CONVERGE) — 9 subtasks T1-T9

### PRIOR ART CHECK (COMPLETED)
- Grep board: found parent SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE in backlog (supervised:true, next_agent:architect); zero existing RC-VERIF/RC-CONVERGE child rows.
- Parent disposition: Transitioned backlog→active_sprints, status BACKLOG→ACTIVE, subtasks array linked (9 rows: T1-T9).

### ROWS MINTED (9 total, all READY status, unsupervised, P1 priority)
| ID | Type | Zone | Deps | Size |
|----|------|------|------|------|
| T1-GRANDFATHER-JQ-QUERY | IMPL-XS | apps/mcp-server/ | — | XS |
| T2-SCHEMA-ADDITIONS | IMPL-S | apps/mcp-server/ | T1 | S |
| T3-UNIT-TESTS | IMPL-XS | apps/mcp-server/ | T2 | XS |
| T4-ORCH-VALIDATE-DISPLAY | IMPL-XS | scripts/ | T2 | XS |
| T5-SERVER-PATH-PARITY-TEST | IMPL-XS | apps/mcp-server/ | T2 | XS |
| T6-BUG-CLASS-LEDGER | IMPL-S | scripts/ | — | S |
| T7-TASK-SCHEMA-DOC-SYNC | IMPL-XS | docs/standards/ | T2 | XS |
| T8-FLOW-DOC-WIRING | IMPL-M | docs/agents/ | T2,T6 | M |
| T9-QA-GATE | QA-GATE | cross-service | T1-T8 | M |

### BOARD MATH
- Ready lane: 8→17 (added 9 rows).
- Active sprints: now includes 1 new SPRINT-S (SYSREMAKE-P2, status ACTIVE, supervised:true).
- Task total: 534→551 (+17 net → +9 rows + 1 parent moved from backlog→active adjusts count based on how conserve counts sprints vs bare tasks).
- Backlog: unchanged (385).
- Disposition note: Parent is a supervised SPRINT-S (held out of BOUNDED-1 auto-drainer). Leg-1 design complete (architect brief commit 2026-07-17). Leg-2/3/4 rows NOT minted (sequenced after).

### COMMITTED VIA orch-apply.sh
- Stage 0+1 PASS (Zod validation + ref integrity).
- Conservation check OK (task_total live=551 candidate=551).
- Git: docs/data/orch/orch-state.json + docs/agent-memory/notebooks/po.md (this entry).
- Session: e417ef1f-0c73-48ec-9c91-417e07f16288.

## Tick 2026-07-17T04:56Z — PRIORITY-BUMP ULTRACODE-AUDIT-FIXALL BAND (36 UC rows)

### WHY the pick didn't move on a bump alone (root finding)
- BOUNDED-1 (`devteam-backlog-promote-bounded1.jq`) picks lowest `[priority_rank, backlog-array-index]`. Array index is the ONLY intra-tier tiebreak.
- UC dev-eligible rows were all P2 → lost the FIFO tiebreak to ~350 earlier-indexed P2 rows. Bumping them P2→P1 was necessary but NOT sufficient: a PEER (`elevate-token-economy-sprint`, now complete/no live intent) had already bumped the live TOKEN-ECONOMY-AUDIT sprint to P1 AND front-positioned it (TE-T08 at idx 0). Co-equal P1 + lower idx = TE wins every tiebreak.
- UC rows use a markdown `detail_ref` (arch-brief), NOT backlog-detail.json → all detail gates fall to conservative "not gated"; UC eligibility is driven ENTIRELY by inline board fields. Most UC rows carry `next_agent=ba/po/agent-father` → gated OUT of BOUNDED-1 auto-pickup by design (route via router-adjudicated relay).

### WHAT I did (2 reusable scripts + 1 targeted write, ONE orch-apply)
- `scripts/po-sprint-band-priority-bump.jq` (NEW, generic, idempotent): 22 non-plan_only P2→P1, 4 plan_only P3→P2 = 26 rows. plan_only rows CAP at P2 (never inflated to P1); concrete rows CAP at P1 (never P0). Stamps priority_bumped_from/at/by.
- `scripts/po-sprint-band-to-front.jq` (NEW, generic, idempotent): front-partition UC band → wins the intra-tier tiebreak vs co-equal TE. Only reorders tiebreak — real P0 still outranks by rank. Made next pick flip TE-T08 → **UC-SDF-P3 (P1)** (verified via real promote script, WIP forced 0).
- Targeted specials: UC-RDL-P7 ungated (na po→ba, supervised→false, decision recorded); UC-ASL-P5 held (supervised:true + deploy_gate); UC-MDH-P2 deploy_gate note.

### UC-RDL-P7 po-decision gate RESOLVED
- Ruling: DROP the worktree/task-branch exception — main-only invariant wins (repo RAW-verified 100% main-only: zero task/* branches, 1 worktree=main). dev-standards.md task/NNN-* + .claude/worktrees/ lifecycle is dead doc contradicting the standing user "NO branches" rule.
- Recorded: `docs/agent-memory/decisions/2026-07-17-UC-RDL-P7-branch-policy-main-only.md`. Row ungated → na=ba SPRINT-M for STEP2 flow-reconciliation (surfaces in adjudicated triage, still gated from auto-pickup).

### LEFT UNTOUCHED (deliberate)
- 4 UC rows in review[] (SDF-P4/GCP-P2/GCP-P4/MDH-P1) — QA/merge pipeline. 9 done_verified UC rows — not resurrected.
- 8 UNVERIFIED PLAN-ONLY umbrellas kept plan_only (bumped rank only, NOT converted to fix rows). UC-CCA-P3 P0 / UC-RDL-P4 / UC-ASL-P6 / UC-CRITIC-HOOKS-ENFORCEMENT left at existing high tier. dep-blocked UC-CDC-P7 (TE-T03) / UC-CCA-P1 (TE-T11) bumped but stay dep-gated.

## Carry-over
- Live WIP=9 (peers manually dispatched 8 CCATO-MCP rows to ready[]) → BOUNDED-1 auto-pickup is a no-op until WIP drains to 0; the bump is a STANDING reprioritization for that moment. Next auto-pick then = UC-SDF-P3.
- CROSS-SESSION: front-partition puts UC ahead of the peer-elevated TE sprint (both remain P1). If the user wants UC+TE interleaved instead of UC-first, drop the front-partition (re-run nothing / re-front-partition TE). Router/user adjudicates the UC-vs-TE order.
- STEP2 of UC-RDL-P7 is real ba/dev flow work — NOT done here (PO does not edit flow docs).
- Committed MY paths only. Did NOT push (fleet-push timer / router owns push).
