# po-s54-macro-fetch-deadline-stack-triage.jq
# Single-tick macro-indicators stack triage (post VMT-8 done, router live-verify PARTIAL).
# - RELEASE F-MACRO-FETCH-DEADLINE -> .task_board.ready[] (lead reliability fix, /goal#1 completion for 4 fetch tools).
# - SEQUENCE F-BOP-ENCODING + F-NSO-SELECTOR -> .task_board.backlog[] as HELD-sequenced (status="HELD-sequenced",
#   sequence_after="F-MACRO-FETCH-DEADLINE") so router does NOT dispatch them concurrently (same files = commit-race risk).
# - Flip both NEW po signal_queue.rows -> RESOLVED with disposition.
# All three task ids are id-guarded across ALL board arrays (skip if already present).
# Usage: jq --arg now "$NOW" -f scripts/po-s54-macro-fetch-deadline-stack-triage.jq docs/data/orch/orch-state.json
# Atomic: write temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH only.

def has_id($id): ([.task_board | (.ready[]?, .backlog[]?, .in_progress[]?, (.done[]? // empty)) | .id] | index($id)) != null;

# --- F-MACRO-FETCH-DEADLINE (lead, ready) ---
(if has_id("F-MACRO-FETCH-DEADLINE") then .
 else .task_board.ready += [{
   id: "F-MACRO-FETCH-DEADLINE",
   type: "FIX",
   title: "Bound every Zone-A upstream fetch with a per-fetch ctx/client deadline (~8s) < gateway timeout so a slow-origin HANG converts to a fast ctx.DeadlineExceeded that VMT-8's existing degrade path catches -> degraded-200",
   zone: "apps/macro-indicators/",
   owner: "dev-macro-indicators",
   status: "READY",
   priority: "high",
   size: "S",
   baseline_pass: "go test ./pkg/... = ALL PASS (cached green) 2026-06-14",
   goal_ref: "/goal#1 completion (best-result for the 4 fetch-dependent tools: trade/macro/cpi/bop) + /goal#2 generic",
   root_cause: "vpsFetch.go adapter ALREADY honors http.Client{Timeout} from opts.TimeoutSec, BUT callers set it too high: cache_vmt_nso.go discoverAndFetch TimeoutSec:30 across 3 chained fetches (index->press->xlsx, up to 90s) for trade/macro/cpi; usecases_vmt_bop.go Fetch TimeoutSec:30. All 30s >> gateway timeout. Slow NSO/SBV origin -> Fetch hangs ~30-90s past gateway deadline -> gateway TIMEOUT before VMT-8 degrade path can emit. VMT-8 degrades only on a FAST fetch-ERROR; it cannot rescue a HANG.",
   fix_spec: "GENERIC across all 5 Zone-A use-cases: introduce a single bounded fetch deadline (~8s, < gateway timeout; ideally a named const so all callers share one SSOT) applied to EVERY uc.fetcher.Fetch call (and as a context.WithTimeout on the ctx passed in, belt-and-suspenders). For the NSO 3-fetch chain the BUDGET (not per-fetch x3) must stay under the gateway deadline. A hang then yields ctx.DeadlineExceeded -> VMT-8 existing degrade path -> degraded-200 (is_estimate + blocked_reason). Do NOT touch the degrade logic (VMT-8 owns it) — only bound the fetch.",
   files: ["apps/macro-indicators/pkg/infrastructure/vpsFetch.go","apps/macro-indicators/pkg/infrastructure/cache_vmt_nso.go","apps/macro-indicators/pkg/application/usecases_vmt_bop.go","apps/macro-indicators/pkg/application/usecases_vmt_macro.go","apps/macro-indicators/pkg/application/usecases_vmt_trade.go","apps/macro-indicators/pkg/application/usecases_vmt_cpi.go"],
   verification_gate: "Unit: simulate a hanging fetcher -> assert ctx.DeadlineExceeded surfaces within budget AND use-case returns degraded-200 (not gateway-timeout). LIVE: router re-probe all 5 Zone-A tools across timing windows -> each returns 200 (real OR degraded) within gateway deadline; NO raw gateway-timeout. This is the gate that unblocks VMT-8 done_verified.",
   source_signal: "dev-team-20260614T231805Z-vmt8-liveverify-fetch-deadline",
   absorbs: "standalone bop-timeout from dev-team-20260614T225734Z (same root)",
   created_at: $now,
   created_by: "po"
 }] end)

# --- F-BOP-ENCODING (sequenced backlog) ---
| (if has_id("F-BOP-ENCODING") then .
 else .task_board.backlog += [{
   id: "F-BOP-ENCODING",
   type: "FIX",
   title: "URL-encode the BOP OData $filter (raw spaces -> %20) before vpsFetch so tinyproxy accepts the CONNECT; restores get_vn_bop real data (accuracy, after deadline fix)",
   zone: "apps/macro-indicators/",
   owner: "dev-macro-indicators",
   status: "HELD-sequenced",
   sequence_after: "F-MACRO-FETCH-DEADLINE",
   priority: "high",
   size: "S",
   root_cause: "usecases_vmt_bop.go BOP OData filter passed to vpsFetch with raw spaces ('filter=status eq 0 and ...') -> tinyproxy rejects malformed CONNECT -> hang/timeout (worse than fail-fast). LIVE-CONFIRMED by router.",
   complementary_to: "VMT-8 (HONEST degrade) + F-MACRO-FETCH-DEADLINE (RELIABLE on hang); this makes get_vn_bop ACCURATE (real data).",
   files: ["apps/macro-indicators/pkg/application/usecases_vmt_bop.go"],
   serialize_note: "Same files/zone as the deadline fix -> do NOT dispatch in parallel; release only after F-MACRO-FETCH-DEADLINE merges.",
   source_signal: "dev-team-20260614T225734Z-vps-cluster-reconcile",
   created_at: $now,
   created_by: "po"
 }] end)

# --- F-NSO-SELECTOR (sequenced backlog) ---
| (if has_id("F-NSO-SELECTOR") then .
 else .task_board.backlog += [{
   id: "F-NSO-SELECTOR",
   type: "FIX",
   title: "NSO WordPress HTML changed -> 'bai-top' discovery selector stale -> trade/macro/cpi opaque Zone-A 500; update selector to current NSO markup; restores real data (accuracy, after deadline fix)",
   zone: "apps/macro-indicators/",
   owner: "dev-macro-indicators",
   status: "HELD-sequenced",
   sequence_after: "F-MACRO-FETCH-DEADLINE",
   priority: "high",
   size: "S",
   root_cause: "NSO WordPress markup changed; the 'bai-top' selector used in NSO Excel discovery is stale -> get_vn_trade_balance + get_vn_macro_indicators + get_cpi_components return opaque 'service unavailable' (Zone-A 500), LIVE-CONFIRMED even with proxy up.",
   complementary_to: "VMT-8 (HONEST) + F-MACRO-FETCH-DEADLINE (RELIABLE); this makes the 3 NSO-backed tools ACCURATE (real data).",
   files: ["apps/macro-indicators/pkg/infrastructure/cache_vmt_nso.go","apps/macro-indicators/pkg/infrastructure/parsers_vmt_gso_indicators.go"],
   selector_note: "Selector must be derived from a LIVE fetch of the current NSO index page, not the stale documented markup. Consider failing loud if discovery yields 0 candidates (avoid silent opaque-500).",
   serialize_note: "Same files/zone as the deadline fix -> do NOT dispatch in parallel; release only after F-MACRO-FETCH-DEADLINE merges.",
   source_signal: "dev-team-20260614T225734Z-vps-cluster-reconcile",
   created_at: $now,
   created_by: "po"
 }] end)

# --- resolve both NEW po signal rows ---
| .signal_queue.rows |= map(
    if .to=="po" and .status=="NEW" and .id=="dev-team-20260614T231805Z-vmt8-liveverify-fetch-deadline"
    then .status="RESOLVED"
       | .disposition="MINTED F-MACRO-FETCH-DEADLINE -> ready (lead reliability fix, /goal#1 completion for 4 fetch tools). Root confirmed by PO raw-read: vpsFetch already honors opts.TimeoutSec but callers set 30s (cache_vmt_nso 3x30s chain + bop 30s) >> gateway timeout. Absorbs standalone bop-timeout. VMT-8 done_verified gated on this fix's LIVE gate."
    elif .to=="po" and .status=="NEW" and .id=="dev-team-20260614T225734Z-vps-cluster-reconcile"
    then .status="RESOLVED"
       | .disposition="(C) MINTED F-BOP-ENCODING + F-NSO-SELECTOR -> backlog as HELD-sequenced (sequence_after F-MACRO-FETCH-DEADLINE; same files -> serialize). (B) 3 other VPS tasks NOT auto-closed (different roots): FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP already in backlog (ops/infra lane, lower urgency, kept open); OPS-POLLNEWS-NIGHT-ZERO = ops RSS-cadence lane. (D) tinyproxy ACL-open security note -> ops maintenance lane (claude-manager-helper / ops hardening), NOT dev-zone."
    else . end )

# --- stamp head: PO triage done, next_agent dev-team for BATCH dispatch ---
| .head.note = "PO TRIAGE 2026-06-14 (post VMT-8 live-verify PARTIAL): MINTED F-MACRO-FETCH-DEADLINE->ready (lead reliability, /goal#1 completion for trade/macro/cpi/bop). PO raw-confirmed root: vpsFetch.go adapter already honors http.Client{Timeout} from opts.TimeoutSec; bug = callers set 30s (cache_vmt_nso.go discoverAndFetch 3x chained 30s for NSO trade/macro/cpi; usecases_vmt_bop.go 30s) >> gateway timeout -> hang past deadline -> gateway timeout before VMT-8 degrade emits. Fix = bound budget ~8s < gateway timeout across all 5 use-cases (generic). SEQUENCED-AFTER (backlog, HELD-sequenced, same files serialize): F-BOP-ENCODING + F-NSO-SELECTOR (accuracy, restore real data). 3 other VPS tasks reconciled individually NOT auto-closed (different roots). tinyproxy ACL note -> ops lane. VMT-8 done_verified GATED on F-MACRO-FETCH-DEADLINE live re-probe (all 5 -> 200 within gateway deadline)."
| .head.updated_at = $now
| .head.updated_by = "po"
