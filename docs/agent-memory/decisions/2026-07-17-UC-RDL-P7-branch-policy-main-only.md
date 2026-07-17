# 2026-07-17 — UC-RDL-P7 · Branch-policy STEP1 po ruling

## Summary
STEP1 po-gate resolution for `UC-RDL-P7` (ULTRACODE-AUDIT-FIXALL,
"Reconcile branch policy across the FULL branch lifecycle with the main-only
invariant"). **Ruling: DROP the worktree/task-branch exception. The main-only
invariant wins.** All flow docs reconcile to a single main-only commit policy.
This unblocks STEP2 (the flow-reconciliation sprint) which now routes
`next_agent=ba` (was po-gated / supervised).

## The gate
`UC-RDL-P7.note` split the row into two steps: STEP1 = a po ruling on whether
to *keep or drop* the worktree-branch exception, STEP2 = a single sprint that
edits developer+qa+microservice+fixer+pm+dev-team flows so the Developer->QA
handoff never straddles two policies (put reconciled commit-policy text in ONE
place; do NOT edit only the branch-creation half — that wedges QA merge).
STEP2 cannot start until STEP1 is ruled. The row carried `next_agent=po`,
`supervised=true`, `supervised_note="STEP1 = po branch-exception ruling before
any flow edits"`.

## The contradiction (audit finding, router-dispatch-locking-P7 / RESCOPE)
- **CLAUDE.md (project) + auto-memory (MEMORY.md):** standing user invariant
  "NO branches — all work stays on main." Most-recent, authoritative policy.
- **docs/policies/dev-standards.md § Branch Hygiene (L374-385) + § Parallel
  Agent Dispatch (L362):** still describes a `task/NNN-*` branch lifecycle and
  `.claude/worktrees/<name>` worktrees, with `isolation:"worktree"` REQUIRED
  for disjoint-scope parallel tasks — the "worktree-branch exception."
- These two directly contradict: one says main-only, the other documents a
  task-branch merge-to-main workflow.

## Ground truth (RAW-verified this session, 2026-07-17)
- `git branch -a` → only `main` (+ `remotes/origin/main`). ZERO `task/*` branches.
- `git worktree list` → exactly ONE worktree = the repo root, on `main`.
- The repo is, and has been operating, 100% main-only in practice. The
  `task/NNN-*` + `.claude/worktrees/` lifecycle in dev-standards.md is DEAD
  DOCUMENTATION — it describes a workflow no live agent uses and that
  contradicts the standing user rule.

## Decision & rationale
**DROP the worktree/task-branch exception.** Decisive reasons:
1. The user's "NO branches — all work stays on main" is the newer, explicit,
   standing invariant and outranks the legacy 2026-05-12 parallel-isolation
   brief that introduced task-branch worktrees.
2. Zero live usage — dropping the exception removes dead doc, changes no
   observed behavior, and eliminates a real Developer->QA straddle hazard
   (the whole point of the row).
3. Parallel isolation does NOT require task *branches*: sequential dispatch is
   already the documented DEFAULT (dev-standards.md L367), and when worktree
   isolation is genuinely needed it can run detached/main-based and push to
   `main` via the existing fleet-worktree-push backstop — no `task/NNN-*`
   branch lifecycle needed.

## STEP2 scope handed to ba (unblocked by this ruling)
Single sprint, reconcile to main-only in ONE place:
- Rewrite dev-standards.md § Branch Hygiene + § Parallel Agent Dispatch to
  main-only (drop `git branch -d task/NNN-*`, `git push origin --delete
  task/*`; keep worktree *removal* hygiene but main-based).
- Put the canonical commit/branch policy text in ONE location
  (docs/policies/commit-convention.md) and repoint developer + qa +
  microservice + fixer + pm + dev-team flows to it.
- Edit BOTH the branch-creation half AND the QA-merge half together — never
  only branch-creation (that wedges the QA merge path). This is exactly the
  straddle the row warns about.

## Board effect (applied same session, orch-state)
- `UC-RDL-P7`: `next_agent` po→ba, `supervised` true→false, added
  `po_gate_resolved:"2026-07-17"` + `po_decision_ref` (this file), rewrote
  `note` to record the ruling + STEP2 scope. Priority bumped P2→P1 with the
  rest of the ULTRACODE-AUDIT-FIXALL band. Row is now a normal na=ba SPRINT-M
  that surfaces in router-adjudicated triage (still gated OUT of BOUNDED-1
  auto-pickup by na=ba, correct for a multi-zone flow-edit needing a spec).

## Notes
- This is STEP1 (the ruling) only. STEP2 (the flow edits) is real dev/ba work,
  deliberately NOT done here — PO does not write production/flow-doc changes.
- Owning task board row: `UC-RDL-P7` (ULTRACODE-AUDIT-FIXALL, detail_ref
  docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#router-dispatch-locking-P7).
