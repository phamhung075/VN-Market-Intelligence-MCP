# po-s135-ohlcv-depth-cd-promote-rebuild-gate-mint.jq
#
# EPIC WAVE-COMPLETION SEQUENCE triage for FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR.
# The P0 mechanism (SUBTASK-E + A + B) is DONE_VERIFIED; B's server handler is INERT
# until the mcp-server container is rebuilt. PO decision: batch the two remaining
# same-zone P1 observability subtasks (C+D) into the SAME rebuild as B (minimize the
# expensive single-svc force-recreate-with-build to ONE), then rebuild, then run the
# full-universe production backfill + Brief §4 cross-restart verification gate.
#
# Single-pass FIVE-mutation triage (idempotent):
#   M1 PROMOTE OHLCV-DEPTH-SUBTASK-C  backlog -> ready (next_agent=dev-mcp-server, parallel_eligible)
#   M2 PROMOTE OHLCV-DEPTH-SUBTASK-D  backlog -> ready (next_agent=dev-mcp-server, parallel_eligible)
#   M3 MINT    OHLCV-DEPTH-REBUILD            -> backlog HELD (ops single-svc rebuild; depends C+D+B)
#   M4 MINT    OHLCV-DEPTH-PROD-BACKFILL-GATE -> backlog HELD (full-universe backfill + Brief §4; depends REBUILD)
#   M5 REPOINT head off next_agent=po -> SUBTASK-C / dev-mcp-server (in_progress; epic stays active)
#
# Conservation: backlog net 0 (-2 promoted out, +2 minted in); ready +2; in_progress/review/done/done_verified byte-stable; total +2.
# Idempotency: M1/M2 skip if id already in any non-backlog lane; M3/M4 skip if id already in ANY lane; M5 sets a fixed value (re-run no-op).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s135-ohlcv-depth-cd-promote-rebuild-gate-mint.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push timer pushes)

def idof: if type == "object" then (.id // .task_id) else . end;
def in_lane($lane; $id): ([ $lane[]? | idof ] | index($id)) != null;

# --- read current lanes ---
.task_board.backlog        as $backlog
| .task_board.ready          as $ready
| .task_board.in_progress    as $in_progress
| .task_board.review         as $review
| .task_board.done           as $done
| .task_board.done_verified  as $done_verified

# membership across all non-backlog lanes (for promote idempotency)
| ([ $ready[]?, $in_progress[]?, $review[]?, $done[]?, $done_verified[]? ] | map(idof)) as $nonbacklog_ids
# membership across ALL lanes (for mint idempotency)
| ([ $backlog[]?, $ready[]?, $in_progress[]?, $review[]?, $done[]?, $done_verified[]? ] | map(idof)) as $all_ids

# ---- M1+M2: extract C and D rows from backlog (if present and not already promoted) ----
| ($backlog | map(select((idof) == "OHLCV-DEPTH-SUBTASK-C")) | .[0]) as $rowC
| ($backlog | map(select((idof) == "OHLCV-DEPTH-SUBTASK-D")) | .[0]) as $rowD
| (($rowC != null) and (($nonbacklog_ids | index("OHLCV-DEPTH-SUBTASK-C")) == null)) as $promoteC
| (($rowD != null) and (($nonbacklog_ids | index("OHLCV-DEPTH-SUBTASK-D")) == null)) as $promoteD

# ---- M3+M4: mint guards ----
| (($all_ids | index("OHLCV-DEPTH-REBUILD")) == null) as $mintRebuild
| (($all_ids | index("OHLCV-DEPTH-PROD-BACKFILL-GATE")) == null) as $mintGate

# promotion-stamp helper
| def promote($row): $row + {
    status: "READY",
    next_agent: "dev-mcp-server",
    parallel_eligible: true,
    promoted_by: "po-s135",
    promoted_at: $now,
    promote_note: "Batched into the SAME rebuild as SUBTASK-B (minimize single-svc force-recreate-with-build to ONE). Observability-only, no deps, parallel with sibling."
  };

# ---- build new backlog: drop C+D, append minted held rows ----
  ( $backlog
    | map(select((idof | . != "OHLCV-DEPTH-SUBTASK-C" and . != "OHLCV-DEPTH-SUBTASK-D")))
  ) as $backlog_minus_cd

| ($backlog_minus_cd
    + (if $mintRebuild then [{
        id: "OHLCV-DEPTH-REBUILD",
        status: "BACKLOG",
        type: "FIX",
        size: "S",
        priority: "P0",
        blocking: true,
        held: true,
        zone: "apps/mcp-server/",
        owner: "ops",
        next_agent: "ops",
        sprint: "MARKET-INDICATOR-DEPTH-P0",
        parent: "FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR",
        depends: ["OHLCV-DEPTH-SUBTASK-C","OHLCV-DEPTH-SUBTASK-D","OHLCV-DEPTH-SUBTASK-B"],
        hold_reason: "HELD until SUBTASK-C + SUBTASK-D done_verified — rebuild brings B+C+D live in ONE force-recreate.",
        title: "OHLCV-DEPTH rebuild gate: ops single-svc REBUILD of mcp-server (force-recreate-with-build) — B's /api/ohlcv-backfill-done depth-probe + C taOhlcvBackfillJob MOMENTUM_MIN_BARS logs + D ohlcvStartupProbe shallow-alert are ALL INERT until this rebuild. NEVER down&&up (kills peers ~21min); single-service force-recreate-with-build only (feedback_rebuild_after_dev_change).",
        acceptance: "docker image ID for mcp-server changes; container UP healthy; peers (frontend/remix/api-gateway) untouched; B handler live (POST /api/ohlcv-backfill-done parses bars_pushed_total + depth-probes).",
        detail_ref: "docs/architecture-briefs/2026-06-30-FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR.md",
        created_by: "po-s135",
        created_at: $now
      }] else [] end)
    + (if $mintGate then [{
        id: "OHLCV-DEPTH-PROD-BACKFILL-GATE",
        status: "BACKLOG",
        type: "FIX",
        size: "M",
        priority: "P0",
        blocking: true,
        held: true,
        zone: "apps/mcp-server/",
        owner: "dev-mcp-server",
        next_agent: "dev-mcp-server",
        sprint: "MARKET-INDICATOR-DEPTH-P0",
        parent: "FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR",
        depends: ["OHLCV-DEPTH-REBUILD"],
        hold_reason: "HELD until OHLCV-DEPTH-REBUILD done — the §4 gate needs B live AND a full-universe production backfill (today only VCB is proven deep).",
        title: "OHLCV-DEPTH production backfill + Brief §4 cross-restart gate: (1) run full-universe R-2 backfill PRODUCTION run on VPS (hardened fetch-ohlcv-backfill.sh, ALL traded tickers not just VCB), B depth-probe verifies + re-queues shortfalls; (2) run Brief §4 Gates 1-5 (depth>=252 GROUP BY universe / get_price_history VCB 730 / get_roc_momentum+get_relative_strength+compute_52w_proximity NON-NULL / PERSISTENCE re-probe AFTER container restart / non-watchlist universe >0 historical rows). This gate done_verifies the EPIC.",
        acceptance: "Epic verification_gate verbatim: after fix+rebuild+RESTART (a) get_price_history VCB days=730 >=252 (target ~504); (b) GROUP BY code >=252 across traded universe; (c) get_roc_momentum + get_relative_strength + compute52WProximity NON-NULL with real tickers; PERSISTENCE proven by re-probe AFTER a container restart (the durable gate — failure mode is purge-on-boot).",
        detail_ref: "docs/architecture-briefs/2026-06-30-FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR.md#4-cross-restart-verification-gate-durable",
        created_by: "po-s135",
        created_at: $now
      }] else [] end)
  ) as $new_backlog

# ---- build new ready: append promoted C+D ----
| ($ready
    + (if $promoteC then [promote($rowC)] else [] end)
    + (if $promoteD then [promote($rowD)] else [] end)
  ) as $new_ready

# ---- assemble ----
| .task_board.backlog = $new_backlog
| .task_board.ready   = $new_ready

# ---- M5: repoint head off next_agent=po (epic stays active; dispatch C, D parallel via ready[]) ----
| .head = {
    status: "in_progress",
    active_task_id: "OHLCV-DEPTH-SUBTASK-C",
    next_agent: "dev-mcp-server",
    updated_at: $now,
    updated_by: "po-s135",
    note: "Epic FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR: P0 mechanism (E+A+B) DONE_VERIFIED. PO sequence: (1) dispatch SUBTASK-C + SUBTASK-D (ready[], dev-mcp-server, parallel, observability) -> (2) ops single-svc REBUILD OHLCV-DEPTH-REBUILD brings B+C+D live -> (3) OHLCV-DEPTH-PROD-BACKFILL-GATE full-universe backfill + Brief §4 cross-restart gate done_verifies epic. CI-red c8557899 confirmed PRE-EXISTING standing baseline (4 files disjoint from B, tracked FIX-MCP-SUITE-HEALTH-BASELINE) — SUBTASK-B exonerated."
  }
