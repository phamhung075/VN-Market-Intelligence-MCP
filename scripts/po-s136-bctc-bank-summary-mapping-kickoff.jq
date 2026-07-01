# po-s136-bctc-bank-summary-mapping-kickoff.jq
# Single-pass TRIPLE-mutation self-initiated SPRINT KICKOFF (idempotent) for the
# recurrence-escalated P1 FIX-BCTC-BANK-SUMMARY-MAPPING (3rd re-fire over 15 days:
# 2026-06-16 mint PO-s70, 2026-06-21 reconfirm, 2026-07-01 ESC-2 signal bca-20260701T151500Z).
# Dev-team dispatcher PROMOTED this row per PO's own 2026-07-01 escalation recommendation
# (feedback_recurring_bug_escalation).
#
#   M1: append sprint_goal.entries[] with the FIX-BCTC-BANK-SUMMARY-MAPPING vision
#       (id-guarded — skip if sprint_id already present). RECURRENCE MANDATE baked:
#       cascade STARTS with a root-cause SPIKE, not a code patch.
#   M2: MINT the BA-spec cascade-kickoff task BA-FIX-BCTC-BANK-SUMMARY-MAPPING -> task_board.ready[]
#       (next_agent=ba, zone=multi, type=FIX, P1) — id-guarded across ALL board lanes.
#       SPIKE mandate + co-owner (dev-mcp-server serve-guard) scope + verification gate embedded.
#   M3: set .head to route to ba (next_agent=ba, active_task_id=BA task) — GUARDED: only
#       overwrites head when it is currently idle OR already pointing at our BA task, so a peer
#       session (f981431d owns DASH-CRON-RECHECK-TABLE) that grabbed head is never clobbered.
#       (orch-apply.sh CAS also protects; the guard is belt-and-suspenders.)
# The pre-existing backlog row FIX-BCTC-BANK-SUMMARY-MAPPING is LEFT in backlog[] untouched
# (implementation target the architect/pm pull in AFTER the spike) — WIP stays 0, this is PLANNING.
# Reusable pattern = po-s135 (self-initiate sprint -> ONE BA cascade-kickoff to ready[]; PO does NOT spawn).
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s136-bctc-bank-summary-mapping-kickoff.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push timer pushes.)

# ---- guards: is this kickoff already applied? ----
( [ .sprint_goal.entries[]?.sprint_id ] | index("FIX-BCTC-BANK-SUMMARY-MAPPING") != null ) as $sprint_exists
| (
    [ .task_board | to_entries[] | .value[]?
      | if type=="object" then .id else . end ]
    | index("BA-FIX-BCTC-BANK-SUMMARY-MAPPING") != null
  ) as $ba_exists

# ---- M1: sprint_goal entry ----
| ( if $sprint_exists then .
    else .sprint_goal.entries += [{
      "sprint_id": "FIX-BCTC-BANK-SUMMARY-MAPPING",
      "status": "active",
      "priority": "high",
      "created_by": "po",
      "recurrence_escalation": true,
      "origin": "PO self-initiated recurrence-escalation 2026-07-01: FIX-BCTC-BANK-SUMMARY-MAPPING is a P1 served-bank-data-integrity defect on its 3rd re-fire over 15 days (2026-06-16 mint PO-s70, 2026-06-21 reconfirm, 2026-07-01 ESC-2 bctc-analyst deep-dive signal bca-20260701T151500Z) that has NEVER been decomposed (no acceptance_criteria, no spec_ref). Dev-team dispatcher PROMOTED it into the PLANNING pipeline per PO's own 2026-07-01 escalation recommendation. Class: feedback_recurring_bug_escalation (2+ re-fires same module -> block until root-caused).",
      "vision": "Bank (Mau B02-TCTD form) financial_reports scalar summaries MUST serve PLAUSIBLE, accounting-identity-consistent numbers generically across ALL bank tickers — or HARD-BLOCK as honest-NULL / confidence=0 with the dimension dropped — and MUST NEVER serve a labeled-garbage reading. No-fake-data goal #1.",
      "defect_raw_evidence": "CTG 2026Q1 (signal bca-20260701T151500Z, guard esc-deepdive:CTG:Q1-2026:ESC-2): assets_total=0, liabilities_total=24,735,484,770, equity_total=244,904,306, net_revenue=3910 (~1000x off), net_profit=8,960,041, roe=3.66, confidence=0.56, validation_message='Assets (0) != Liabilities (24,735,484,770) + Equity (244,904,306) — mismatch 100.0%', refine_status=PARTIAL. B02-TCTD balance-sheet rows are squeezed into income-statement scalar columns (net_revenue/ebitda/net_margin_pct) and total_assets is dropped -> served at conf 56% with a 'Validation FAILED' LABEL instead of being hard-blocked. RAW extraction (bctc_table_rows) is already CORRECT for banks (CTG/VCB 2026Q1 = 55 real varied plausible rows, raw-verified vs named-volume market.db) — defect is PURELY the downstream scalar SUMMARIZER + serve path.",
      "open_question": "VCB (bank) parses CLEAN (Net Revenue 17,421 ty, Total Assets 2,550,963.3 ty, Equity 224,558.7 ty, ROE 4.2%, conf 75%, PASS) but CTG (bank) CORRUPTS — likely a CTG-specific B02-TCTD layout/scale variant. This is a per-form-edge corruption, NOT a total bank outage.",
      "recurrence_mandate": "3rd re-fire -> the cascade MUST START WITH A ROOT-CAUSE SPIKE, NOT a code patch (feedback_recurring_bug_escalation). Fix GENERICALLY via the structural bank-form discriminator (isBankFormFromRows / Roman+no-3digit B02-TCTD SSOT in bctcFormType.ts) — NO per-ticker allowlist, NO date-literal, NO special-case.",
      "spike_mandate": "STEP 1 SPIKE (BA/architect, gateway-LIVE): pin WHY VCB(bank) parses clean but CTG(bank) corrupts. Compare LIVE via mcp__gateway__call_tool(server='vn-market', tool='compare_financials' / 'get_financial_reports' / 'get_bctc_full', ...) for CTG vs VCB vs FPT/VNM. DECIDE the true owning zone: dev-mcp-server bctcScalarAggregator (B02-TCTD row->scalar mapping; file lives in apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts) VS dev-pdf-extractor bank-form column/scale/row parse (apps/pdf-extractor). Likely a CTG B02-TCTD layout/scale variant. Architect SPLITs the multi-zone task per the SPIKE verdict.",
      "co_owner_scope": "STEP 2 CO-OWNER (dev-mcp-server): identity-serve-guard ENFORCEMENT. FIX-BCTC-IDENTITY-SERVE-GUARD (merged 62ef64fe: total_assets<=0 OR total_assets<equity -> [CORRUPT DATA — SKIP], confidence=0, ratios suppressed; guard lives in apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts) is NOT firing on the bank-form labeled-serve path (CTG served conf 56% + 'Validation FAILED' label instead of confidence=0 [CORRUPT DATA — SKIP], despite assets=0 with non-zero liabilities = exactly the assets<=0 guard condition). Determine whether the guard REGRESSED, NEVER FIRED on the bank-form path, or was BYPASSED by the labeled-serve path; make it HARD-BLOCK any identity-violated bank reading (confidence=0 / suppress scalars) — never serve labeled garbage.",
      "scope_in": "MULTI-zone (architect SPLITs after the SPIKE; pm decomposes). (1) SPIKE root-cause CTG-vs-VCB divergence + pin owner. (2) Generic bank B02-TCTD scalar-mapping fix: map bank balance-sheet rows into the correct scalar columns (or honestly NULL income-statement scalars that have no bank-form equivalent) — never squeeze balance-sheet rows into income-statement columns. (3) identity-serve-guard ENFORCEMENT on the bank-form serve path (dev-mcp-server co-owner). (4) qa gate RAW-live on the named-volume market.db.",
      "scope_out": "NO per-ticker allowlist / date-literal / special-case (must be generic via isBankFormFromRows). NOT re-fixing raw table extraction (bctc_table_rows already correct for banks). NOT the FIX-DE-* interest-bearing-debt-decomposition chain. NOT FIX-BCTC-ENRICH-SILENT-0ROWS (0-rows raw extraction). NOT changing corporate (B01-DN) scalar mapping except to prove non-regression.",
      "success_metric": "done_verified (/goal#1), RAW-verified vs the NAMED-VOLUME market.db (vn-market-intelligence-mcp_market_data, NOT host ./data decoy), container REBUILT after code change: (a) get_bctc_full(CTG) AND get_bctc_full(VCB) serve PLAUSIBLE bank scalar summaries — total_assets > 0 and consistent with total_liabilities+equity (accounting identity holds within ~1% tolerance), net_margin_pct within a plausible bank band (NOT 229157%), ebitda not an absurd 1e14 magnitude, net_revenue not ~1000x off; (b) validation_status no longer low_confidence SOLELY from the identity violation; (c) a bank reading that STILL violates the accounting identity is HARD-BLOCKED (confidence=0 / [CORRUPT DATA — SKIP] / corrupt scalars suppressed) — NEVER served as a labeled 'Validation FAILED' reading; (d) non-bank tickers FPT + VNM summaries NON-REGRESSED; (e) fix is GENERIC (structural bank-form discriminator, no per-ticker allowlist).",
      "detail_ref": "docs/data/orch/archive/backlog-detail.json#FIX-BCTC-BANK-SUMMARY-MAPPING",
      "created_at": $now
    }]
  end )

# ---- M2: BA cascade-kickoff task -> ready[] ----
| ( if $ba_exists then .
    else .task_board.ready += [{
      "id": "BA-FIX-BCTC-BANK-SUMMARY-MAPPING",
      "title": "Requirement spec + AC list for FIX-BCTC-BANK-SUMMARY-MAPPING: root-cause SPIKE (why VCB clean / CTG corrupt) FIRST, then generic bank B02-TCTD scalar-mapping fix + identity-serve-guard enforcement (P1, 3rd re-fire 15d)",
      "owner": "ba",
      "next_agent": "ba",
      "status": "READY",
      "zone": "multi",
      "type": "FIX",
      "priority": "P1",
      "recurrence_escalation": true,
      "sprint": "FIX-BCTC-BANK-SUMMARY-MAPPING",
      "implements": "FIX-BCTC-BANK-SUMMARY-MAPPING",
      "detail_ref": "docs/data/orch/archive/backlog-detail.json#FIX-BCTC-BANK-SUMMARY-MAPPING",
      "co_owner": "dev-mcp-server",
      "depends": [],
      "created_at": $now,
      "files": [
        "apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts",
        "apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts",
        "apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts",
        "apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts",
        "apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts",
        "apps/mcp-server/src/__tests__/fix-bctc-identity-serve-guard.test.ts",
        "apps/pdf-extractor/"
      ],
      "spec_ref": "sprint_goal.entries[FIX-BCTC-BANK-SUMMARY-MAPPING]",
      "spike_first": "MANDATORY — 3rd re-fire over 15 days -> the cascade STARTS with a root-cause SPIKE, NOT a code patch (feedback_recurring_bug_escalation). BA/architect FIRST pin WHY VCB(bank) parses clean but CTG(bank) corrupts by comparing LIVE (compare_financials / get_bctc_full for CTG vs VCB vs FPT/VNM via the gateway), then DECIDE the owning zone: dev-mcp-server bctcScalarAggregator (B02-TCTD row->scalar mapping) vs dev-pdf-extractor bank-form column/scale parse. Architect SPLITs per the SPIKE verdict. NO code patch is dispatched before the SPIKE pins the owner.",
      "generic_mandate": "GENERIC across ALL bank tickers / B02-TCTD forms — NO per-ticker allowlist, NO date-literal, NO special-case. Detect bank-form structurally (reuse isBankFormFromRows / Roman+no-3digit B02-TCTD discriminator SSOT in bctcFormType.ts) and map bank balance-sheet rows into the correct scalar columns (or honestly NULL income-statement scalars that have no bank-form equivalent) — never squeeze balance-sheet rows into income-statement columns.",
      "co_owner_scope": "dev-mcp-server co-owner: identity-serve-guard ENFORCEMENT — FIX-BCTC-IDENTITY-SERVE-GUARD (merged 62ef64fe) is NOT firing on the bank-form labeled-serve path (CTG served conf 56% + 'Validation FAILED' instead of confidence=0 [CORRUPT DATA — SKIP]). Determine if it regressed / never fired on bank-form / was bypassed; make it HARD-BLOCK any identity-violated bank reading (confidence=0 / suppress scalars), never serve labeled garbage. Extend apps/mcp-server/src/__tests__/fix-bctc-identity-serve-guard.test.ts to cover the bank-form path.",
      "acceptance": "VERIFICATION GATE (carried verbatim from PO into ACs; see sprint_goal.entries[FIX-BCTC-BANK-SUMMARY-MAPPING].success_metric (a)-(e)): RAW-verified vs the NAMED-VOLUME market.db (NOT host ./data), container rebuilt — CTG + VCB serve PLAUSIBLE bank scalars + accounting identity holds within tolerance + magnitudes sane (net_margin NOT 229157%, ebitda not 1e14, net_revenue not ~1000x off) + a still-identity-violated bank reading is HARD-BLOCKED (confidence=0 / [CORRUPT DATA — SKIP], never labeled-garbage) + non-regression on FPT + VNM + fix is GENERIC (no allowlist). BA delivers docs REQ spec + numbered AC list; architect runs the SPIKE + pins owner + SPLITs; pm decomposes into per-zone dev tasks; qa gates RAW-live.",
      "note": "PO-s136 recurrence-escalation cascade-kickoff (3rd re-fire, feedback_recurring_bug_escalation). Owning zone pinned by the SPIKE (dev-mcp-server scalar/serve is the primary suspect — bctcScalarAggregator + serve-guard both live in apps/mcp-server; dev-pdf-extractor row-parse is the alternative). PO does NOT spawn — dev-team cron adopts this ready BA task and spawns ba. WIP stays 0 (this is PLANNING; the FIX implementation row remains in backlog[] until architect/pm pull it into the sprint post-SPIKE)."
    }]
  end )

# ---- M3: head route to ba (GUARDED — never clobber a peer that grabbed head) ----
| ( if (.head.status == "idle" or .head.active_task_id == "BA-FIX-BCTC-BANK-SUMMARY-MAPPING")
    then .head = {
      "status": "planning",
      "active_task_id": "BA-FIX-BCTC-BANK-SUMMARY-MAPPING",
      "next_agent": "ba",
      "next_action": "ba writes the requirement spec + numbered AC list for FIX-BCTC-BANK-SUMMARY-MAPPING; cascade STARTS with the root-cause SPIKE (why VCB clean / CTG corrupt) before any code patch (feedback_recurring_bug_escalation)",
      "updated_by": "po",
      "updated_at": $now,
      "note": ("[po-s136 " + $now + "] Self-initiated + PROMOTED sprint FIX-BCTC-BANK-SUMMARY-MAPPING (P1, 3rd re-fire 15d) into PLANNING. Minted BA-FIX-BCTC-BANK-SUMMARY-MAPPING -> ready[] (next_agent=ba, zone=multi). Cascade MANDATE: SPIKE-first (root-cause CTG-vs-VCB divergence, pin dev-mcp-server bctcScalarAggregator/serve vs dev-pdf-extractor parse) BEFORE any code patch; co-owner dev-mcp-server = identity-serve-guard enforcement on bank-form path; verification gate = CTG+VCB plausible + identity holds + magnitudes sane + hard-block on still-violated + non-regression FPT/VNM + generic (no allowlist). WIP still 0. Peer session f981431d owns DASH-CRON-RECHECK-TABLE (ARCH-* in ready) — untouched.")
    }
    else . end )
