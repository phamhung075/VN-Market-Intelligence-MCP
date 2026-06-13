# po-s50-arch-tsu-groom-ready.jq
# Idempotent groom of ARCH-TSU (architect-first design task) PARKED->READY.
# Writes a real description + concrete acceptance_criteria (DESIGN/SPIKE deliverable:
# one architecture-brief covering U1-U6; no code, no rebuild, no test gate).
# Source of truth for U1-U6 root-cause breakdown: active_sprints[21] TOOL-SURFACE-UPGRADE
# + BA spec docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md (6 ARCH blockers).
# Idempotent: re-running yields identical result (no count change, in-place groom).
# Usage: jq -f scripts/po-s50-arch-tsu-groom-ready.jq docs/data/orch/orch-state.json
( .task_board.backlog
  | map(
      if .id == "ARCH-TSU" then
        . + {
          status: "READY",
          description: "DESIGN/SPIKE: produce ONE architect technical-design brief at docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md covering all six audit units of the 162-tool vn-market surface (source of truth: active_sprints[21] TOOL-SURFACE-UPGRADE + docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md). Each unit's root cause is already known; the brief designs the fix-seam + file:line targets + per-unit DoD, and resolves the 6 standing architect blockers, then fans out to per-unit dev-task stubs next cycle. Root causes by unit: U1 sessionToolCache never populated post-gateway cutover (per-call counter store seam); U2 tool-registry.json hand-decayed to 125 vs 161/162 live (static-grep generator seam); U3 12 weak-claim tools zero-claimed across 4 layers (5-question verdict matrix -> deregister/integrate); U4 get_macro_snapshot serves point-in-time only (prev_session_delta+direction seam at macro-indicators); U5 get_foreign_flow renders fabricated 0.00% holding_ratio (DSI serve-null seam at vnstockStore.ts:561 / foreignFlowTools.ts:186); U6 TSH leftover merge diffs unexecuted (description-clarify vs merge rationale). This is a read-only DESIGN deliverable: NO code, NO rebuild, NO test/CI gate. DoD = brief exists + per-unit dev-task stubs identified.",
          acceptance_criteria: [
            "AC1 (BRIEF EXISTS): docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md exists with one section per unit U1-U6, each carrying: root cause (1 line) -> fix seam (file:line target) -> per-unit DoD.",
            "AC2 (U1 SEAM): brief names the MCP dispatch-chain insertion point for a per-call invocation counter (handler-entry hook in apps/mcp-server/src/interface/mcp/), counter-store type, flush trigger to docs/agent-memory/modules/tool-usage-stats.json, and a ruling on the now-meaningless sessionCount field (repurpose/rename/remove).",
            "AC3 (U2 SEAM + ARCH-U2-1/U2-2): brief specifies generator location (scripts/gen-tool-registry.ts) + parity-test path (apps/mcp-server/src/__tests__/tool-registry-parity.test.ts), and RESOLVES ARCH-U2-1 (does static grep of server.tool() in tools/**/*.ts fully capture registrations, or are there server.ts registrations) and ARCH-U2-2 (the source=161 vs /health=162 delta-of-1, documented in the brief).",
            "AC4 (U3 VERDICTS + ARCH-U3-1): brief gives a written 5-question verdict (integrate vs deregister) for each of the 12 weak-claim tools across all 4 layers (no single-layer grep removals), resolving ARCH-U3-1 (is_trading_day internal-call path from cowork-match-slots.js confirmed before any deregister); read_bctc_pdf settled FIRST.",
            "AC5 (U4 + ARCH-U4-1): brief confirms prev-session DB table+column for each of vnIndex/oilUsd/goldUsd/usdVnd (ARCH-U4-1) and specifies the additive prev_session_delta + direction enum (up/down/flat/unknown) seam in get_macro_snapshot; null+unknown where prev-session not persisted, never fabricated.",
            "AC6 (U5 + ARCH-U5-1): brief rules on ARCH-U5-1 (does bgapidatafeed.vps.com.vn batch endpoint expose a holding_ratio field) and specifies the DSI serve-null seam (vnstockStore.ts:561 fallback, foreignFlowTools.ts:186 test, foreignFlowAnalyzer.ts holdingRatioChange5d guard, get_company_profile foreign_holding_ratio); if VPS lacks the field, serve-null is permanent + marked a known data gap.",
            "AC7 (U6 + ARCH-U6-1): brief rules on ARCH-U6-1 with written source diffs: FR-U6-1 get_patterns vs get_technical_indicators (clarify, no merge), FR-U6-2 trigger_*_vps_fetch x5 consolidate-or-keep rationale, FR-U6-3 get_market_summary vs generate_market_summary, FR-U6-4 get_insider_signals vs get_insider_transactions — each verdict merge vs clarify with rationale.",
            "AC8 (FAN-OUT STUBS): brief lists the per-unit dev-task stubs (id + owner + zone + size) to be opened next cycle, respecting same-zone apps/mcp-server SERIALIZATION (one mcp-server code task in flight; U4 dev-macro-indicators is a separate zone). U2-PARITY stub flagged to run LAST after all U3/U6 deregistrations settle.",
            "AC9 (NO-CODE GATE): deliverable is the brief only — NO server code changed, NO container rebuild, NO test/CI gate run. DoD is satisfied by brief presence + fan-out stubs, not by a green build."
          ],
          park_reason: null,
          zone_block_reason: null,
          unparked_at: "2026-06-13T16:28:41Z",
          unpark_evidence: "EVIDENCE-ACCUM-SILENT-CRON 16:00Z gate SATISFIED — router RAW-verified named-volume DB: evidenceAccumulatorJob|2026-06-13 16:00:01|success (no error_msg); mcp-server Up 9h healthy; gate clock 16:26Z. apps/mcp-server/src/ zone OPEN.",
          completed_at: null,
          _updated_at: "2026-06-13T16:28:41Z",
          _adjudicated_by: "po"
        }
      else . end
    )
  ) as $newbacklog
| .task_board.backlog = $newbacklog
