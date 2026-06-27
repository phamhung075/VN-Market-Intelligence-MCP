# PO Notebook

_Last: 2026-06-27T12:05Z_

## This cycle — HARDEN SSOT-INTEGRITY-PERIMETER DoD (po-s122) to close 4 deploy-surface gaps
Router RAW-verified the deploy surface: 3/6 W1 Zod tasks DONE in source (SCHEMA-MODEL/VALIDATOR-CLI/SERVER-ENFORCE, tests green) but the perimeter is HALF-LIVE. Made the sprint DoD capture the gaps so a future SIGN-OFF can't false-green. Did NOT touch .head (stays FIX-CI-RED-EAC0CC65-BUNTEST) — let the dev-team loop clear CI-red first. Did NOT spawn/drive the dev build.

VERIFIED each gap on live orch-state by jq path, then ONE gated atomic write each (jq->temp->[-s]->jq empty->orch-state-validate.sh->mtime-CAS->rename):
- GAP-1 REBUILD-TO-LIVE (false-green): container Up 16h vs SERVER-ENFORCE committed 12:46 -> Point-2 in source NOT live. MINTED SSOT-W1-OPS-REBUILD-ENFORCE (ops, depends 3 TS tasks; QA injects bad status server-side vs REBUILT image).
- GAP-2 EVERY-WRITER-ROUTED: ORCH-APPLY-WRAPPER had title-intent but NO acceptance; orch-apply.sh absent; 10 files ref old bash gate. SET acceptance="0 direct hot-file writers remain".
- GAP-3 DOC-SYNC: MINTED SSOT-W1-DOC-SYNC-WRITE-CONTRACT (pm: CLAUDE.md + dev-standards.md orch-apply.sh pointer + flow repoint). Hardening brief DECISION: directive is CANONICAL design-of-record, NOT back-filled.
- GAP-4 RULE-PARITY: orchStateStore L178-183 EXCLUDES checkRefIntegrity; schema superRefine = head-RI ONLY; CLI Stage-1b lane-coherence WARN-only (72 live, verified), Stage-1c ref-integrity hard-block (0 dangling). 3-tier decision recorded in verification_gate.rule_parity + decision_journal + SSOT-W2-RULE-PARITY-PROMOTE.

Conservation EXACT: flat lanes byte-stable (backlog 321/ready 2/done 17/...). Sprint tasks 9->11, ranked_scope 16->19, verification_gate added. Zod CLI stayed exit 0 / 72 warnings. Committed LOCAL-ONLY under commit-mutex (5ad3d2f0, explicit paths). DJ len 23->25.

## Carry-over
- GAP-1/3 minted as wave-1 sprint tasks[]; sequence AFTER HOOK-ENFORCE/WRAPPER/SHIM land + CI-red clears. Dispatch is dev-team loop's job (head-resume) — PO does NOT spawn.
- RULE-PARITY: Tier-1 structural blocks BOTH points NOW. Tier-2 ref-integrity safe to promote (0 dangling) via SSOT-W2-RULE-PARITY-PROMOTE. Tier-3 lane-coherence STAYS warn-only until 72->0 data true-up + Wave-2 call on whether backlog=>{BACKLOG} widens to admit DEFERRED/BLOCKED/TODO (72 are mostly legit-deferred, not corrupt) — promoting before clean throws every server write.
- Wave-2 still: rank-9 signal-queue lifecycle, rank-11 sprint_goal prune (PO-owned), the new rank-9.5 rule-parity promote.
- Push held: fleet-push launchd timer (commit local-only, dirty-tree-safe).
