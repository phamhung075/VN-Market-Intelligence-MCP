# FIX-BCTC-BANK-SUMMARY-MAPPING — W3 dispatcher-verified GREEN -> review; dispatch W5 (final unit) -> in_progress.
# W3 (detectSection section-boundary guard, commit a79b33eb) RAW-verified: fence clean (refinedMarkdownParser.ts detectSection
#   + new TASK-W3 test only, 257 ins/0 del), secrets clean, Claude-Session trailer, W2 repairCorruptedRows wiring UNTOUCHED
#   (file-serialization held), orch-state absent, generic (foldDiacritics NFD+đ/Đ fallback + FOLDED_SECTION_KEYWORDS 6-section
#   table; ticker/date in comments only), real RED->GREEN defect (bare "KẾT QUẢ HOẠT ĐỘNG KINH DOANH" leaked currentSection),
#   brownfield reuse FM-VCB-1/TASK_331 AC-2, no rebuild.
# W5 (finalizeBctcRefineTool.ts AC-6 validation_status + CTG re-ingest runbook) is file-disjoint from all committed W1-W4 files;
#   serialize-after-W3 now satisfied. W5 is UNIT-TEST-ONLY + authors the re-ingest script; terminal qa AC-13 does the single
#   rebuild + executes the re-ingest + live named-volume verification (unfreeze total_assets from 0).
# Usage: ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg ts "$ts" --arg w3note "<note>" -f scripts/dev-team-fix-bctc-w3-review-w5-dispatch.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ts) as $now
# --- W3: in_progress -> review (dispatcher RAW-verified GREEN; awaits terminal sprint qa AC-13) ---
| ([ .task_board.in_progress[] | select(.id=="TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD") ]) as $w3moving
| .task_board.in_progress |= map(select(.id!="TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD"))
| .task_board.review += ($w3moving | map(
    .status = "REVIEW"
    | .next_agent = "qa"
    | .reviewed_at = $now
    | .dev_commit = "a79b33eb"
    | .dispatcher_verified = true
    | .review_note = $w3note
  ))
# --- W5: ready -> in_progress (dispatched, dev-mcp-server) ---
| ([ .task_board.ready[] | select(.id=="TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST") ]) as $w5moving
| .task_board.ready |= map(select(.id!="TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST"))
| .task_board.in_progress += ($w5moving | map(
    .status = "IN_PROGRESS"
    | .next_agent = "dev-mcp-server"
    | .dispatched_at = $now
    | .dispatched_by = "dev-team"
  ))
# --- head -> W5 active ---
| .head.status = "in_progress"
| .head.active_task_id = "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST"
| .head.next_agent = "dev-mcp-server"
| .head.next_action = "dev-mcp-server implements W5 (FINAL unit): AC-6 truthful validation_status hard-block in finalizeBctcRefineTool.ts (block/flag serve when validation fails — no silent Case-2 preserve-prior-value masking) + AC-6 unit tests, UNIT-TEST-ONLY (no rebuild). ALSO author a reusable, idempotent re-ingest runbook/script under scripts/ for CTG report_id 96e36139-5dac-414d-8e4d-20a4725890d1 — but do NOT execute the re-ingest (it needs the rebuilt image; terminal qa runs it). W5 file finalizeBctcRefineTool.ts is disjoint from all committed W1-W4 files. After W5 commits: terminal qa AC-13 = single mcp-server rebuild on clean fully-committed tree -> execute CTG re-ingest -> RAW-probe named-volume market.db total_assets unfrozen from 0 -> full 3-serve-tool live verify CTG + non-regression VCB/FPT/HPG/VNM -> clear W1-W5 review->DONE_VERIFIED + release sprint-task locks. W1/W2/W3/W4 in review: dispatcher RAW-verified GREEN."
| .head.updated_by = "dev-team"
| .head.updated_at = $now
| .head.note = "[dev-team 2026-07-01T20:15Z] W3-SECTION-GUARD RAW-verified GREEN -> review (dev a79b33eb): detectSection diacritic-insensitive keyword fallback (foldDiacritics NFD+đ/Đ + FOLDED_SECTION_KEYWORDS 6-section table), real RED->GREEN defect (bare 'KẾT QUẢ HOẠT ĐỘNG KINH DOANH' w/o 'BÁO CÁO ' prefix leaked currentSection -> CTG income rows mistagged balance_sheet). Fence clean (parser detectSection + W3 test, 257 ins/0 del), secrets clean, trailer, W2 wiring UNTOUCHED, orch-state absent, generic, no rebuild. Brownfield reuse FM-VCB-1/TASK_331 AC-2. Wave-4 (FINAL): W5-VALIDATION-REINGEST -> in_progress (finalizeBctcRefineTool.ts, disjoint from all W1-W4). W5 unit-test-only + authors re-ingest script; terminal qa AC-13 rebuilds + re-ingests + live-verifies. Locks held: SF-1, task:W1/W2/W3/W4(review), task:W5(in_progress). qa watch-items: W2 VN_NUMBER_TOKEN no-sep mis-peel; W3 substring .includes over-match on data rows carrying a full section title — both AC-13 net."
| ._updated_at = $now
| ._updated_by = "dev-team"
