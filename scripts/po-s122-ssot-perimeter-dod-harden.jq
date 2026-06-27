# po-s122-ssot-perimeter-dod-harden.jq
# Hardens the SSOT-INTEGRITY-PERIMETER sprint Definition-of-Done so a future SIGN-OFF
# cannot certify "done" while the enforcement perimeter is still half-live.
# Originated 2026-06-27 (po-s122) after the router RAW-verified the deployment surface
# (6-prober audit + live probe): 3/6 W1 Zod tasks DONE in source but the perimeter has
# 4 uncaptured gaps (REBUILD-TO-LIVE false-green, EVERY-WRITER-ROUTED acceptance,
# DOC-SYNC, DUAL-POINT RULE-PARITY).
#
# Mutations (ALL idempotent, ALL scoped to the active_sprints[SSOT-...] object — the flat
# task_board lanes backlog/ready/in_progress/review/done/done_verified/qa/closed_sprints/
# archive are NEVER touched, so lane-conservation is trivially preserved):
#   M1 ADD  .verification_gate (DoD) capturing all 4 gaps + the rule-parity 3-tier decision   [Gap 1-4]
#   M2 MINT SSOT-W1-OPS-REBUILD-ENFORCE  -> tasks[]   (owner ops, depends 3 TS tasks)          [Gap 1]
#   M3 MINT SSOT-W1-DOC-SYNC-WRITE-CONTRACT -> tasks[] (owner pm, depends WRAPPER+SHIM)         [Gap 3]
#   M4 SET  .acceptance on SSOT-W1-ORCH-APPLY-WRAPPER ("0 direct hot-file writers remain")      [Gap 2]
#   M5 APPEND 3 ranked_scope entries (ops-rebuild=6.5, doc-sync=6.7, rule-parity-promote=W2)    [Gap 1/3/4]
#   M6 bump _meta + task_board._updated_by/_updated_at + last_triaged
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); EPOCH=$(date +%s)
#        jq --arg now "$NOW" --argjson epoch "$EPOCH" -f scripts/po-s122-ssot-perimeter-dod-harden.jq \
#           docs/data/orch/orch-state.json
# Atomic caller: temp -> [ -s ] -> jq empty -> scripts/orch-state-validate.sh -> CAS-mtime -> rename.
# Pointer registered in docs/agents/po/flow/main.md (reusable triage scripts list).

def SPRINT: .id == "SSOT-INTEGRITY-PERIMETER";

def ops_rebuild_task($now):
  {
    id: "SSOT-W1-OPS-REBUILD-ENFORCE",
    title: "REBUILD-TO-LIVE: ops rebuilds mcp-server (single-svc, verify image ID) so OrchStateSchema.parse enforces Point-2 on LIVE task_claim/task_release/scheduler writes. SERVER-ENFORCE is in source (committed 12:46) but the running container predates it (Up 16h, bun loaded old src at boot, no hot-reload) -> Point-2 is NOT live. QA RAW-verifies by injecting a bad status server-side against the REBUILT container and confirming the LIVE server throws (directive Acceptance #6).",
    owner: "ops",
    status: "TODO",
    zone: "ops/rebuild",
    created_at: $now,
    created_by: "po-s122",
    size: "S",
    depends: ["SSOT-W1-ZOD-SCHEMA-MODEL", "SSOT-W1-ZOD-VALIDATOR-CLI", "SSOT-W1-SERVER-ENFORCE"],
    type: "FIX",
    wave: 1,
    dispatch_gate: "Dispatch ONLY after FIX-CI-RED-EAC0CC65-BUNTEST clears; ops-owned, NOT a coding-lane task — dev-team head-resume loop must not auto-grab. PO does not drive the rebuild.",
    verification_gate: "QA injects a non-enum status via a server-side write path (task_claim) against the REBUILT image and confirms orchStateStore throws (Point-2 LIVE). FALSE-GREEN GUARD: a source-only / typecheck / sidecar-parse pass is NOT acceptance — the LIVE running process must reject.",
    note: "Gap-1 (REBUILD-TO-LIVE false-green). memory: feedback_rebuild_after_dev_change + feedback_mcp_server_stale_image_mem_leak_rebuild_fixes."
  };

def doc_sync_task($now):
  {
    id: "SSOT-W1-DOC-SYNC-WRITE-CONTRACT",
    title: "DOC-SYNC the orch-state write-contract: (a) CLAUDE.md add a clause 'route EVERY hot-file orch-state.json write via scripts/orch-apply.sh, never raw mv'; (b) docs/policies/dev-standards.md add orch-apply.sh as the canonical write pointer (orch-validate.mjs already listed); (c) repoint docs/agents/*/flow/ writers at orch-apply.sh; (d) .claude/skills/dispatch/SKILL.md if relevant.",
    owner: "pm",
    status: "TODO",
    zone: "docs/",
    created_at: $now,
    created_by: "po-s122",
    size: "S",
    depends: ["SSOT-W1-ORCH-APPLY-WRAPPER", "SSOT-W1-BASH-SHIM"],
    type: "FIX",
    wave: 1,
    verification_gate: "grep proves CLAUDE.md + dev-standards.md carry the orch-apply.sh write-contract clause AND 0 flow docs still instruct a raw mv/redirect into orch-state.json.",
    note: "Gap-3 (DOC-SYNC). Hardening brief NOT back-filled — the directive SSOT-zod-validation-directive-2026-06-27.md is the CANONICAL design-of-record (po-s122 decision; ADD-1/ADD-2 already resolved + shipped)."
  };

def vgate($now):
  {
    _added_by: "po-s122",
    _added_at: $now,
    _rationale: "Router RAW-verified deployment surface 2026-06-27 (6-prober + live probe): 3/6 W1 Zod tasks DONE in source (SCHEMA-MODEL/VALIDATOR-CLI/SERVER-ENFORCE) but the perimeter is half-live. DoD hardened so SIGN-OFF cannot certify 'done' while the gaps below are open.",
    wave1_done_when: [
      "All 6 W1 TS+script tasks DONE_VERIFIED (SCHEMA-MODEL, VALIDATOR-CLI, SERVER-ENFORCE, HOOK-ENFORCE, ORCH-APPLY-WRAPPER, BASH-SHIM) + SSOT-W1-HEAD-METADATA-COLLAPSE 3-script retarget DONE.",
      "GAP-1 REBUILD-TO-LIVE: ops rebuilt mcp-server (single-svc, image-ID verified) so OrchStateSchema.parse enforces on LIVE task_claim/scheduler writes; QA RAW-verifies by injecting a bad status server-side and confirming the LIVE process throws (NOT a source/sidecar parse). Task: SSOT-W1-OPS-REBUILD-ENFORCE.",
      "GAP-2 EVERY-WRITER-ROUTED: 0 direct hot-file writers remain — the ~290/tick po-s*/router-*.jq apply idiom + scripts/orch-backlog-stub.sh + dev-team flow head-reset all route through scripts/orch-apply.sh. 'wrapper file exists' is NOT sufficient. Acceptance encoded on SSOT-W1-ORCH-APPLY-WRAPPER.",
      "GAP-3 DOC-SYNC: CLAUDE.md write-contract clause + dev-standards.md canonical orch-apply.sh pointer + flow writers repointed + dispatch SKILL if relevant. Task: SSOT-W1-DOC-SYNC-WRITE-CONTRACT.",
      "GAP-4 RULE-PARITY documented + sequenced (see .rule_parity)."
    ],
    rule_parity: {
      _decision_by: "po-s122",
      _evidence: "orchStateStore.ts L178-183 calls OrchStateSchema.safeParse and EXPLICITLY excludes checkRefIntegrity (dangling refs allowed at Point-2). Schema superRefine (L334) = head.active_task_id RI ONLY. checkLaneCoherence + checkRefIntegrity = standalone exports NOT wired into the blocking schema (orchStateSchema.ts L359-363 documents the deferral). CLI orch-validate.mjs: Stage-1b lane-coherence WARN-only (72 live violations, verified exit 0), Stage-1c ref-integrity HARD-BLOCK (0 dangling post FIX-DANGLING, verified).",
      tier1_structural_HARD_BLOCK_BOTH_POINTS_NOW: "TaskSchema shape + StatusEnum(12 incl READY) + .strict() unknown/dup-object-key reject + head.active_task_id referential integrity. Point-2 (orchStateStore.safeParse) and Point-3 (CLI Stage-1) enforce identically TODAY. Parity confirmed.",
      tier2_file_ref_integrity: "detail_ref/payload_ref dangling — TODAY hard-block at CLI Stage-1c ONLY; server schema superRefine deliberately excludes it (genuine asymmetry). Live data is now CLEAN (0 dangling). DECISION: promote checkRefIntegrity into the shared OrchStateSchema.superRefine via injected fs-resolver so BOTH points block — SAFE NOW because 0 dangling. Sequenced as SSOT-W2-RULE-PARITY-PROMOTE (needs fs-resolver wiring + rebuild). Until promoted, Point-1/Point-3 (hook+CLI) is the ref-integrity gate; uncovered path (server-internal write of a bad ref) is LOW exposure (refs are agent-jq-written, hook/CLI-covered once WRAPPER+HOOK land).",
      tier3_lane_coherence: "ADD-2 lane->status coherence — WARN-only at CLI, ABSENT from schema. 72 live violations (verified), MOSTLY legitimately-DEFERRED/BLOCKED/TODO backlog rows (not corrupt). DECISION: KEEP warn-only; do NOT promote to a blocking superRefine until BOTH (i) the data true-up cleans the 72 rows AND (ii) a Wave-2 design call resolves whether the backlog=>{BACKLOG} mapping WIDENS to admit DEFERRED/BLOCKED/TODO or the data relabels. Promoting before data-clean would make EVERY server write (task_claim/scheduler) throw — catastrophic. 72->0 data true-up is a HARD precondition for promotion.",
      promotion_task: "SSOT-W2-RULE-PARITY-PROMOTE (wave-2, dev-mcp-server): after data true-up, promote checkRefIntegrity + (rule-resolved) checkLaneCoherence into OrchStateSchema.superRefine + rebuild so both points block the same set.",
      seventy_two_rows_cleaned_before_blocking: "YES — mandatory. Data true-up (72->0) gates lane-coherence promotion."
    },
    design_of_record: "docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md is CANONICAL. The architect hardening brief (docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md) was NEVER authored; dev built straight from the directive + tests green + ADD-1 READY ratified (PO option-a) + ADD-2 shipped. DECISION (po-s122): do NOT back-fill the brief — it would duplicate the directive + the shipped schema for zero design value; remaining design surface (rule-parity tiering) is resolved in .rule_parity here. The directive stands as design-of-record."
  };

# ── Apply all mutations to the matched sprint object ──────────────────────────
(.task_board.active_sprints[] | select(SPRINT)) |= (
  # M1 — add verification_gate if absent (idempotent)
  (if has("verification_gate") then . else . + {verification_gate: vgate($now)} end)
  # M2 — mint OPS-REBUILD into tasks[] if id absent
  | (if (.tasks | any(.id == "SSOT-W1-OPS-REBUILD-ENFORCE"))
       then . else .tasks += [ops_rebuild_task($now)] end)
  # M3 — mint DOC-SYNC into tasks[] if id absent
  | (if (.tasks | any(.id == "SSOT-W1-DOC-SYNC-WRITE-CONTRACT"))
       then . else .tasks += [doc_sync_task($now)] end)
  # M4 — set acceptance on ORCH-APPLY-WRAPPER (idempotent set)
  | (.tasks |= map(
        if .id == "SSOT-W1-ORCH-APPLY-WRAPPER"
        then . + {acceptance: "DONE = 0 direct hot-file writers remain: the ~290/tick po-s*/router-*.jq apply idiom + scripts/orch-backlog-stub.sh + dev-team flow head-reset (docs/agents/dev-team/flow/main.md direct mv) ALL route through scripts/orch-apply.sh. 'wrapper file exists' is NOT done. Verify: grep finds 0 raw `mv ... orch-state.json` / `> ...orch-state.json` writers outside orch-apply.sh."}
        else . end))
  # M5 — append ranked_scope traceability rows if absent
  | (if (.ranked_scope | any(.id == "SSOT-W1-OPS-REBUILD-ENFORCE"))
       then . else .ranked_scope += [{rank: 6.5, id: "SSOT-W1-OPS-REBUILD-ENFORCE", wave: 1, owner: "ops", effort: "S", dep: "1,2,3", title: "REBUILD-TO-LIVE mcp-server so Point-2 OrchStateSchema.parse enforces on live writes; QA injects bad status server-side"}] end)
  | (if (.ranked_scope | any(.id == "SSOT-W1-DOC-SYNC-WRITE-CONTRACT"))
       then . else .ranked_scope += [{rank: 6.7, id: "SSOT-W1-DOC-SYNC-WRITE-CONTRACT", wave: 1, owner: "pm", effort: "S", dep: "5,6", title: "DOC-SYNC write-contract: CLAUDE.md + dev-standards.md orch-apply.sh canonical pointer + flow writers repointed"}] end)
  | (if (.ranked_scope | any(.id == "SSOT-W2-RULE-PARITY-PROMOTE"))
       then . else .ranked_scope += [{rank: 9.5, id: "SSOT-W2-RULE-PARITY-PROMOTE", wave: 2, owner: "dev-mcp-server", effort: "M", dep: "data-true-up", title: "After 72->0 data true-up + rule-resolution, promote checkRefIntegrity + checkLaneCoherence into OrchStateSchema.superRefine (both points block) + rebuild"}] end)
)
# M6 — metadata bump
| ._meta.updated_at = $now
| ._meta.updated_by = "po-s122"
| .task_board._updated_by = "po-s122"
| .task_board._updated_at = $epoch
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s122"
