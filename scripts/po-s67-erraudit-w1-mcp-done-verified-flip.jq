# po-s67-erraudit-w1-mcp-done-verified-flip.jq
# Single-pass verified-task board flip + head reconcile + next-lane ready triage.
#
# Origin 2026-06-15: FIX-ERRAUDIT-W1-MCP-P0 (epic ERROR-AUDIT-2026-06-15, Wave-1 P0
# data-masking pair, apps/mcp-server/) is QA-GREEN (aaf65b10, 8 TCs) + router RAW-verified
# at HEAD db7ef001 (fix markers present in both files; live get_market_context serves
# "SYSTEM STATUS: ok | 557 alerts pending"). fix_commit 2d07011d.
#
# Three atomic mutations:
#   1. RELOCATE FIX-ERRAUDIT-W1-MCP-P0  in_progress -> done_verified  (status DONE_VERIFIED,
#      stamped fix_commit/verified_sha/qa_sha + rich pre-verified evidence; no re-run).
#   2. RECONCILE top-level .head -> the genuinely-running coding lane
#      FIX-BCTC-BANK-PDF-OCR-RASTERIZE (dev-pdf-extractor); .task_board.head stays the
#      po-s66 deprecated non-routing stub (asserted, not mutated).
#   3. PROMOTE FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE  backlog -> ready  (status READY) for the
#      one free coding slot (WIP<=2: pdf-extractor lane still running). Router dispatches.
#
# Reusable pattern for "a verified task awaits its board flip + head reconcile + ready ONE
# successor for the freed slot, in one atomic write".
#
# Harness adds: [ -s tmp ] empty-guard, jq empty parse-check, CONSERVATION guard
# (in_progress -1, done_verified +1, backlog -1, ready +1, total unchanged), and a
# head-stub assertion (.task_board.head.status == "deprecated"). Commit orch-state by
# EXPLICIT PATH. PUSH HELD (PO deferred call).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s67-erraudit-w1-mcp-done-verified-flip.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp
#   [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp && mv /tmp/orch.tmp docs/data/orch/orch-state.json

def W1ID: "FIX-ERRAUDIT-W1-MCP-P0";
def W2ID: "FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE";
def RUNLANE: "FIX-BCTC-BANK-PDF-OCR-RASTERIZE";

# --- capture the source rows before relocation ---
(.task_board.in_progress[]? | select(.id == W1ID)) as $w1
| (.task_board.backlog[]?    | select(.id == W2ID)) as $w2

# enrich the W1 row into a verified done_verified row (relocate, not duplicate)
| ($w1 + {
    status: "DONE_VERIFIED",
    fix_commit: "2d07011d",
    verified_sha: "db7ef001",
    qa_sha: "aaf65b10",
    done_verified_ts: $now,
    done_verified_by: "po-s67",
    review_entered_ts: $now,
    rebuild_required: "yes",
    rebuild_done: true,
    rebuild_evidence: "image .Created 2026-06-15T21:57:10Z > commit 2026-06-15T21:49:08Z (rebuild AFTER code change verified).",
    generic_verified: true,
    raw_evidence: "Fix markers present at HEAD db7ef001 in both files: marketContextBuilder.ts emits dbError/'degraded: DB read failed'/'? alerts'; tickerIntelligenceTools.ts 6x console.error('[buildSectionN][ticker]') + 6x '(loi truy van)'. Live get_market_context serves 'SYSTEM STATUS: ok | 557 alerts pending'.",
    qa_evidence: "QA aaf65b10 GREEN on all 8 TCs: healthy 'ok'+real pending; genuine no-data '(khong co du lieu)'; forced-failure both sites -> console.error fires + degraded markers + no-throw; generic across VCB/VNM/XYZTEST; marker distinctness; rebuild image .Created 21:57:10Z > commit 21:49:08Z; TS gate clean on the 2 changed files (lone TS2367 pre-existing in untouched FIX-SIGNAL-CONFIDENCE test).",
    forced_failure_method: "Mock-DB injection into the actual source at 2d07011d (NOT live SQLITE_BUSY sidecar). JUSTIFIED: market.db is WAL mode, external BEGIN EXCLUSIVE cannot block an already-open reader connection. Accepted by PO.",
    router_raw_verify: true,
    done_verified_note: "Pre-verified evidence recorded by po-s67 board-flip; not re-run."
  }) as $w1done

# enrich the W2 backlog row into a ready row (promote)
| ($w2 + {
    status: "READY",
    promoted_at: $now,
    promoted_by: "po-s67",
    ready_note: "ERROR-AUDIT-2026-06-15 Wave-2 successor for the freed apps/mcp-server/ coding slot (W1-MCP-P0 now done_verified). WIP<=2: pdf-extractor lane FIX-BCTC-BANK-PDF-OCR-RASTERIZE still running -> this is the 1 free slot. Left in ready[] for router to dispatch on its own cadence; NOT spawned by po-s67."
  }) as $w2ready

| .task_board.in_progress |= map(select(.id != W1ID))
| .task_board.done_verified += [$w1done]
| .task_board.backlog |= map(select(.id != W2ID))
| .task_board.ready += [$w2ready]

# RECONCILE top-level .head off the completed task -> the genuinely-running coding lane.
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "po-s67",
    active_task_id: RUNLANE,
    next_agent: "dev-pdf-extractor",
    note: ("HEAD RECONCILE (po-s67). FIX-ERRAUDIT-W1-MCP-P0 flipped in_progress->done_verified (QA aaf65b10 GREEN + router RAW-verified at db7ef001, fix_commit 2d07011d) so .head no longer points at it. Advanced to the one genuinely-running coding lane FIX-BCTC-BANK-PDF-OCR-RASTERIZE (dev-pdf-extractor, dispatched po-s64 20:17:53Z, worktree). Promoted FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE backlog->ready for the freed slot (WIP<=2; router dispatches, po-s67 did NOT spawn). ARCH-CRON-SCHEDULER-RELIABILITY architect-design lane untouched. Top-level .head remains the SINGLE canonical dispatch SSOT; .task_board.head stays the po-s66 deprecated non-routing stub. PUSH HELD (PO deferred call). Commit orch-state by EXPLICIT PATH.")
  }

| ._updated_at = $now
| ._updated_by = "po-s67"
| .updated_at = $now
| .updated_by = "po-s67"
