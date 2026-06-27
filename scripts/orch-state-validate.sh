#!/usr/bin/env bash
# scripts/orch-state-validate.sh — THIN SHIM
#
# Delegates ALL validation to the canonical Zod validator:
#   scripts/orch-validate.mjs (Stage 0 raw-byte dup-key + Stage 1 OrchStateSchema.safeParse)
#
# SUPERSET PROOF (task SSOT-W1-BASH-SHIM):
#   G-1 JSON validity          → Stage 1 JSON.parse (exit 2 on malformed JSON)
#   G-2 Structural sentinel    → OrchStateSchema: .head / .task_board / .signal_queue are required (exit 2)
#   G-3 Lane types are arrays  → Lane = z.array(TaskSchema); signal_queue.rows = z.array() (exit 2)
#   G-4 No null sprint IDs     → SprintSchema: id: z.string().min(1) rejects null/missing (exit 2)
#   G-5 Status enum            → StatusEnum (12-value) enforced across ALL 9 lanes — STRICTER than
#                                former G-5 which checked only 3 lanes (active_sprints/backlog/done).
#                                READY is now valid (PO-ratified ADD-1, 2026-06-27); former bash
#                                enum had 11 values and incorrectly rejected READY.
#   G-6 Skew warn-only         → NOT carried forward. G-6 was WARN-only (no exit-code impact).
#
# Exit-code semantics preserved:  0 = pass, non-zero = hard-fail.
# Specific non-zero codes differ from former G-1..G-5 exits (1-5) → shim now exits 1, 2, or 3
# per orch-validate.mjs contract. All callers only test `|| exit 1`, never test specific code.
#
# Wire-in pattern (unchanged for callers):
#   bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
#     || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
#
# Owning task: SSOT-W1-BASH-SHIM (SSOT-INTEGRITY-PERIMETER sprint)
# Decision:    docs/agent-memory/decisions/sprint-SSOT-INTEGRITY-PERIMETER-developer.md (STEP developer-S3)
# Canonical:   scripts/orch-validate.mjs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec bun "${SCRIPT_DIR}/orch-validate.mjs" "$@"
