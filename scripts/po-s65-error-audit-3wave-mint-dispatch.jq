# po-s65-error-audit-3wave-mint-dispatch.jq
# Single-pass triage for the 2026-06-15 error-handling audit brief
# (docs/analysis-briefs/2026-06-15-error-handling-audit.md).
#
# Mints the 3-wave plan under epic ERROR-AUDIT-2026-06-15 and dispatches the
# ONE free coding lane (WIP<=2; pdf-extractor lane already active):
#   - DISPATCH (in_progress, dev-mcp-server, 1 free coding lane):
#       FIX-ERRAUDIT-W1-MCP-P0  — Wave-1 P0 pair (marketContextBuilder:417 +
#       tickerIntelligenceTools 6 logless catches). Pure error->marker, no fetch
#       surface touched.
#   - QUEUE (ready, dev-pdf-extractor, SAME-ZONE-SERIALIZED behind the active
#       FIX-BCTC-BANK-PDF-OCR-RASTERIZE lane via blocked_by — no concurrent
#       same-zone agent):
#       FIX-ERRAUDIT-W1-PEK-P0   — pek_engine_adapter:668 layout-crash mask +
#       :342/:717 PaddleOCR-load silent-None 0-row pass. DISTINCT from the active
#       OCR-rasterize fix (that touched ocr_adapter.py only — verified).
#   - BACKLOG (not promoted — groomed by a later tick / ba->architect chain):
#       Wave-2 helper+P1 cluster (mcp-server fetch-deadline, data-layer; frontend)
#       Wave-3 P2 consistency/observability cluster.
#
# All rows carry the no-fake-data DoD: a FORCED failure (drop model / lock DB /
# corrupt payload) must yield a tagged-degraded / "(loi truy van)" / "degraded:"
# / quarantined output — NOT an empty success; verify LIVE on the NAMED-VOLUME
# market.db (vn-market-intelligence-mcp_market_data); rebuild container after
# code change; done_verified = QA-green LIVE RAW, not a badge. generic_mandate:
# helpers are generic across ALL tickers/entities/sources — no per-instance
# hardcode/allowlist/date-literal.
#
# Idempotent: re-run mints 0 (every add is id-guarded across ALL board arrays).
# Atomic: harness does temp -> [ -s ] -> jq empty -> conservation -> rename.
# Does NOT touch in_progress[] rows owned by dev-pdf-extractor (race-safe).
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s65-error-audit-3wave-mint-dispatch.jq \
#      docs/data/orch/orch-state.json
# Commit orch-state by EXPLICIT PATH only. PUSH HELD (PO deferred call).

# ---- helpers ---------------------------------------------------------------
# all ids currently present anywhere on the board (object rows only)
def all_ids:
  [ .task_board | to_entries[] | (.value // [])
    | (if type=="array" then .[] else empty end)
    | select(type=="object") | .id ];

# epic preamble shared across every minted row
def epic: "ERROR-AUDIT-2026-06-15";

# DoD boilerplate (no-fake-data goal#1) reused per row
def dod_forced_failure:
  "FORCED-FAILURE DoD: drop the model / lock the DB / corrupt the payload -> "
  + "output MUST be tagged-degraded / \"(loi truy van)\" / \"degraded:\" / "
  + "quarantined, NOT an empty success. Verify LIVE on NAMED-VOLUME "
  + "market.db (vn-market-intelligence-mcp_market_data), NOT host ./data decoy. "
  + "Rebuild container after code change. done_verified = QA-green LIVE RAW.";

def generic_mandate:
  "GENERIC across ALL tickers/entities/sources — NO per-instance hardcode / "
  + "allowlist / date-literal / special-case. Helpers are inherently generic; "
  + "keep migrations generic.";

# ---- the rows to mint ------------------------------------------------------
# Wave-1 DISPATCH: dev-mcp-server P0 pair -> in_progress (the 1 free coding lane)
def row_w1_mcp($now):
  {
    id: "FIX-ERRAUDIT-W1-MCP-P0",
    type: "FIX",
    epic: epic,
    wave: 1,
    priority: "P0",
    size: "M",
    status: "IN_PROGRESS",
    zone: "apps/mcp-server/",
    route_to: "dev-mcp-server",
    route: "ba->architect->pm->dev->qa",
    next_agent: "ba",
    title: "Wave-1 P0 data-masking pair (mcp-server): derive served status from query-success + fail-loud the 6 logless ticker-intelligence catches",
    desc: ("Two P0 fabricated-value sites on live served paths. "
      + "(A) marketContextBuilder.ts:417 hardcodes const status=\"ok\" over 3 swallowed DB queries (388/390,401-403,413-415) -> EVERY cowork agent reads a fabricated healthy status at cycle start (consumed by getCycleBootstrap.ts:105 + get_market_*). FIX: status DERIVED from query-success -> 'degraded: DB read failed' when any of the 3 reads throws. "
      + "(B) tickerIntelligenceTools.ts:119 (+139/171/206/266/298) — get_ticker_intelligence builds 6 sections each a bare LOGLESS catch{} returning its Vietnamese no-data default; a SQL error/missing-column/schema-drift/DB-lock is INDISTINGUISHABLE from 'this stock has no data' served to the user. FIX: each section logs on a THROWN error and emits a tagged-degraded marker (e.g. '(loi truy van)') distinct from the genuine no-data default. "
      + "SMALLEST CORRECT CHANGE — pure error->marker, NO fetch surface touched, no new helper required for this P0 (helper runSection/failLoud lands in Wave-2)."),
    files: [
      "apps/mcp-server/src/domain/services/marketContextBuilder.ts",
      "apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts"
    ],
    recurrence_class: "passive-health-masks-dead-data + BCTC-silent-0-rows-served-to-user",
    fail_loud_requirement: dod_forced_failure,
    generic_mandate: generic_mandate,
    baseline_pass: "done_verified: lock the named-volume market.db (or force a query throw) -> marketContextBuilder emits 'degraded: ...' NOT 'ok | 0 alerts'; get_ticker_intelligence(any ticker) under a DB error emits a tagged-degraded marker '(loi truy van)' NOT 'Gia hien tai: (khong co du lieu)'; a genuinely data-less ticker STILL shows the plain no-data default (no false-degraded). RAW-verified LIVE vs named-volume DB, container rebuilt.",
    source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P0 mcp-domain-sched-04, mcp-interface-03)",
    created_at: $now,
    created_by: "po-s65",
    dispatched_at: $now,
    dispatched_by: "po-s65",
    owner_agent: null,
    baseline_pass_note: "WIP<=2: this is the 1 free coding lane (pdf-extractor lane FIX-BCTC-BANK-PDF-OCR-RASTERIZE active)."
  };

# Wave-1 QUEUE: dev-pdf-extractor P0 pair -> ready, blocked behind active lane
def row_w1_pek($now):
  {
    id: "FIX-ERRAUDIT-W1-PEK-P0",
    type: "FIX",
    epic: epic,
    wave: 1,
    priority: "P0",
    size: "M",
    status: "READY",
    zone: "apps/pdf-extractor/",
    route_to: "dev-pdf-extractor",
    route: "ba->architect->pm->dev->qa",
    next_agent: "ba",
    blocked_by: "FIX-BCTC-BANK-PDF-OCR-RASTERIZE",
    hold_reason: "SAME-ZONE-SERIALIZED: apps/pdf-extractor/ is actively edited by dev-pdf-extractor on FIX-BCTC-BANK-PDF-OCR-RASTERIZE (same FIX-BCTC-ENRICH-SILENT-0ROWS class). NO concurrent same-zone agent — dispatch only after the active lane reports done. VERIFIED DISTINCT: active commits fffef229/56129626 touched ocr_adapter.py + test + docs ONLY; pek_engine_adapter.py:668/:342/:717 are unmodified on disk — NOT a duplicate.",
    title: "Wave-1 P0 PEK data-masking pair: layout-crash + PaddleOCR-load failure served as a successful 0-row extraction",
    desc: ("Two P0 sites in pek_engine_adapter.py where a CRASHED model is served as a clean 0-row 'pass' (FIX-BCTC-ENRICH-SILENT-0ROWS class). "
      + "(A) :668 — DocLayout-YOLO layout-detection crash (OOM/native-lib fault on 8GB host) is logged at 668-673 then CONTINUES with empty pages_bboxes -> total_pages=0 (687), units_in_map=[] (700); caller pushes a fully-formed result dict as a SUCCESSFUL extraction. A model crash is indistinguishable from a PDF with no tables. "
      + "(B) :342 (+ guard :717) — PaddleOCR PP-StructureV2 load fail -> warning only, paddle_table stays None; the 'if paddle_table is not None' guard at 717 silently skips table extraction -> units assemble row_count=0 with quarantined=False = clean-looking 0-row pass (units_passing==units_total). Contrast extract_layout_first_usecase.py:450 which correctly quarantines. "
      + "FIX: re-raise OR tag extraction_status='degraded'/quarantined=True (ship the Python helper fail_loud_or_tag_degraded here as a by-product) so a crashed model is NEVER served as a successful 0-row extraction."),
    files: [
      "apps/pdf-extractor/infrastructure/pek_engine_adapter.py"
    ],
    recurrence_class: "BCTC-silent-0-rows (FIX-BCTC-ENRICH-SILENT-0ROWS)",
    fail_loud_requirement: dod_forced_failure,
    generic_mandate: generic_mandate,
    baseline_pass: "done_verified: force a layout-detection crash (drop/break DocLayout-YOLO) AND force a PaddleOCR load failure -> the extraction result is tagged degraded/quarantined (extraction_status reflects the crash), NOT a 0-row success with quarantined=False; a genuinely table-less PDF STILL lands a clean 0-row pass (no false-quarantine). RAW-verified LIVE on named-volume DB; container rebuilt.",
    source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P0 pdf-extractor-02, pdf-extractor-03)",
    created_at: $now,
    created_by: "po-s65"
  };

# Wave-2: shared helpers + P1 (backlog — not promoted)
def rows_wave2($now):
  [
    {
      id: "FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE",
      type: "FIX", epic: epic, wave: 2, priority: "P1", size: "L",
      status: "BACKLOG", zone: "apps/mcp-server/", route_to: "dev-mcp-server",
      route: "ba->architect->pm->dev->qa", next_agent: "ba",
      title: "Wave-2 helpers: withDeadline<T> + macroFetch<T> — close the whole bounded-fetch / F-MACRO-FETCH-DEADLINE cluster in one edit",
      desc: ("Land withDeadline<T>(fn(signal),ms,label) [throws typed DeadlineError] and macroFetch<T>(path,body,{deadlineMs}) [discriminated {ok}|{degrade}]. "
        + "macroFetch one-edit migrates 8 macro-proxy sites: macroTools:446, tradeBalance:96, bop:119, liquidityState:137, cpiComponents:95, macroIndicatorsVn:80, dinhGia:56, carry:57+134 (carries F-MACRO-FETCH-DEADLINE everywhere; deletes ~25 lines x 8). "
        + "withDeadline migrates the unbounded-fetch-hang P1s: muasamcong:216, sscInsider:134, newsHeadlinesRefreshJob:41(+pushToMcpServer:79), bctcPdfPullJob:165, server.ts:642 — a HANG (not just a connection ERROR) starves the well-written degrade path; deadline MUST be < gateway 60s budget. Promotes the inline copies already in taOhlcvBackfillJob/deepFetchVpsJob to one util."),
      replaces_sites: ["macroTools:446","tradeBalance:96","bop:119","liquidityState:137","cpiComponents:95","macroIndicatorsVn:80","dinhGia:56","carryTools:57+134","muasamcong:216","sscInsider:134","newsHeadlinesRefreshJob:41","bctcPdfPullJob:165","server.ts:642","mcp-interface-05"],
      recurrence_class: "graceful-degrade-needs-bounded-fetch / F-MACRO-FETCH-DEADLINE",
      fail_loud_requirement: dod_forced_failure, generic_mandate: generic_mandate,
      baseline_pass: "done_verified: a stalled upstream (sleep > deadline) makes the wrapped call THROW DeadlineError within deadlineMs < gateway budget -> structured degrade NOT a gateway-timeout false 'gateway down'; macroFetch degrade envelope distinct from a real 200; LIVE-verified across timing.",
      source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P1 mcp-interface-01/05, mcp-infra-01/03, mcp-domain-sched-02/03, mcp-interface-08)",
      created_at: $now, created_by: "po-s65"
    },
    {
      id: "FIX-ERRAUDIT-W2-MCP-DATALAYER",
      type: "FIX", epic: epic, wave: 2, priority: "P1", size: "L",
      status: "BACKLOG", zone: "apps/mcp-server/", route_to: "dev-mcp-server",
      route: "ba->architect->pm->dev->qa", next_agent: "ba",
      title: "Wave-2 helpers: safeQuery<T> + runSection/withSection + failLoud — kill the confidence_score=50 / fabricated-default class at source",
      desc: ("Land safeQuery<T>(db,sql,params,ctx) [{ok,rows}|{ok:false,reason:'db-error'|'no-rows'}], runSection/withSection (composite-brief section runner: fail-loud on error, no-data ONLY on genuine empty), and failLoud(logger,err,ctx) (structured-degrade logger replacing bare catch{return []|null|0}). "
        + "Migrate: imfConvictionBridge:91 (+line-71 no-rows conflation), scanMarket getAvgVolumeSync:120 (catch->0 collides with legit insufficient-history 0), imfDataFetcher:136 (parseImfApiResponse catch->null no log -> stale-served-as-fresh), assembleBriefing 7 best-effort catches (957/964/983/1026/1036/1057/1067 -> macroSnapshot=[] served as 'no macro'), marketContextBuilder buildMacroSection 216/240/256, scanMarket getThresholds:175. "
        + "A DB error can no longer collapse to the same number as a real reading — callers DROP the dimension instead of feeding a fake 0/1.0/neutral. "
        + "ALSO: mcp-infra-06 vnstockBridge.ts:477 pe/pb/roe/roa=0.0 fallback -> Python None-on-miss for the vnstock ratio columns (a bank roe:0 is implausible-but-non-empty)."),
      replaces_sites: ["imfConvictionBridge:91","scanMarket getAvgVolumeSync:120","imfDataFetcher:136","assembleBriefing:957/964/983/1026/1036/1057/1067","marketContextBuilder:216/240/256","scanMarket getThresholds:175","vnstockBridge:477"],
      recurrence_class: "confidence_score=50 destructuring + silent-swallow-serial-bugs + contract-from-live-payload",
      fail_loud_requirement: dod_forced_failure, generic_mandate: generic_mandate,
      baseline_pass: "done_verified: force a SQL throw on each migrated read -> safeQuery returns {ok:false,reason:'db-error'} (logged) and the caller DROPS the dimension/section (NOT a fabricated 0/1.0/neutral/[]); a genuine 0-row query returns reason:'no-rows' and the legit empty path is preserved. LIVE-verified vs named-volume DB.",
      source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P1 mcp-app-01/02/03/06, mcp-infra-06)",
      created_at: $now, created_by: "po-s65"
    },
    {
      id: "FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH",
      type: "FIX", epic: epic, wave: 2, priority: "P1", size: "L",
      status: "BACKLOG", zone: "apps/frontend/", route_to: "dev-frontend",
      route: "ba->architect->pm->dev->qa", next_agent: "ba",
      sequence_after: "FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE",
      title: "Wave-2 frontend helpers: safeFetch/proxyUpstream/safeFetchOrNull + one DEADLINE_MS — fix timeout+duplication+logging in 3 places not 55",
      desc: ("Land safeFetch<T>(url,{parse,deadlineMs}) [26 dashboard loaders], proxyUpstream(upstreamUrl,init) [29 api.*.tsx proxies -> 504 on abort / 502 on net error], safeFetchOrNull<T>(url) [4 non-fatal client wrappers, preserve null/[]/{} contract], one shared DEADLINE_MS < gateway, one structured console.error per degrade. "
        + "Closes frontend-01/02/03 (NOT one of ~60 fetch sites has a timeout; loaders fetch the also-unbounded proxies = two unbounded hops), frontend-04 (same ~40-line block x 55), frontend-06 (ZERO server-side logging), frontend-07 (4 bare-catch-to-null wrappers). "
        + "SEQUENCE AFTER FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE so the two unbounded hops are closed inner-first."),
      replaces_sites: ["client.ts:40","~26 dashboard loaders","~29 api.*.tsx proxies","4 non-fatal client wrappers"],
      recurrence_class: "graceful-degrade-needs-bounded-fetch / inconsistent-adhoc / no-server-side-logging",
      fail_loud_requirement: dod_forced_failure, generic_mandate: generic_mandate,
      baseline_pass: "done_verified: a stalled upstream makes a loader/proxy return 504/502 within DEADLINE_MS (NOT an indefinite hang) with one structured console.error; non-fatal wrappers still return null/[]/{} on a genuine empty. LIVE-verified after mcp-server deadlines land.",
      source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P2 frontend-cluster -> Wave-2 helper)",
      created_at: $now, created_by: "po-s65"
    }
  ];

# Wave-3: P2 consistency & observability (backlog — not promoted)
def rows_wave3($now):
  [
    {
      id: "FIX-ERRAUDIT-W3-MCP-P2",
      type: "FIX", epic: epic, wave: 3, priority: "P2", size: "M",
      status: "BACKLOG", zone: "apps/mcp-server/", route_to: "dev-mcp-server",
      route: "ba->architect->pm->dev->qa", next_agent: "ba",
      sequence_after: "FIX-ERRAUDIT-W2-MCP-DATALAYER",
      title: "Wave-3 P2 mcp-server: silent-swallow + parse_or_warn + null-not-0 confidence + final macro-proxy de-dup",
      desc: ("mcp-domain-sched-05 (buildMacroSection 216/240/256 conflate missing-table with real DB error), mcp-app-08 (scanMarket getThresholds:175 -> empty Map reverts every stock to DEFAULT_DROP_PCT), mcp-app-09 (remove the dead/redundant outer swallow around the IMF bridge ONCE FIX-ERRAUDIT-W2-MCP-DATALAYER lands — else it re-masks), mcp-interface-04 (alertsHandler parseSignalsJson/parseAffectedActionsJson silent [] + confidence?:0 -> parse_or_warn + null-not-0), mcp-interface-08 (final macroFetch de-dup of the 8 hand-copied blocks — the root cause of interface-01/02), mcp-infra-11 (hsxBctcFetcher:377 catch->[] no log -> transient hsx.vn 500/SSL-outage indistinguishable from non-HOSE empty)."),
      recurrence_class: "silent-swallow-serial-bugs + inconsistent-adhoc + parser-fails-closed",
      fail_loud_requirement: dod_forced_failure, generic_mandate: generic_mandate,
      baseline_pass: "done_verified: each migrated swallow now logs + emits a degraded marker distinct from genuine-empty under a forced error; mcp-app-09 dead swallow removed only after W2-DATALAYER lands (no re-mask). LIVE-verified.",
      source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P2 mcp-domain-sched-05, mcp-app-08/09, mcp-interface-04/08, mcp-infra-11)",
      created_at: $now, created_by: "po-s65"
    },
    {
      id: "FIX-ERRAUDIT-W3-PEK-P2",
      type: "FIX", epic: epic, wave: 3, priority: "P2", size: "S",
      status: "BACKLOG", zone: "apps/pdf-extractor/", route_to: "dev-pdf-extractor",
      route: "ba->architect->pm->dev->qa", next_agent: "ba",
      sequence_after: "FIX-ERRAUDIT-W1-PEK-P0",
      title: "Wave-3 P2 pdf-extractor: validate_or_unknown (services.py:91) + parse_or_raise (extraction_engine.py:102)",
      desc: ("pdf-extractor-01 (services.py:91 validate_financial_figures always called all-None -> confidence_financial hardcoded 1.0 for EVERY /extract, feeds composite_confidence signal gating; FIX validate_or_unknown returns None on all-None input not 1.0), pdf-extractor-04 (extraction_engine.py:102 _extract_tables_sync bare except:pass no log -> error and table-less PDF both yield []; FIX parse_or_raise logs ctx + raises typed PDFProcessingError)."),
      recurrence_class: "confidence_score=50 + parser-fails-closed",
      fail_loud_requirement: dod_forced_failure, generic_mandate: generic_mandate,
      baseline_pass: "done_verified: all-None figures -> confidence None NOT 1.0; a table-extraction error raises PDFProcessingError (logged) distinct from a genuinely table-less []; signal-gating no longer fed a fabricated 1.0. LIVE-verified.",
      source: "docs/analysis-briefs/2026-06-15-error-handling-audit.md (P2 pdf-extractor-01, pdf-extractor-04)",
      created_at: $now, created_by: "po-s65"
    }
  ];

# ---- compose mutation ------------------------------------------------------
( all_ids ) as $present
| ( [ row_w1_mcp($now) ] | map(select(.id as $i | $present | index($i) | not)) ) as $mint_ip
| ( [ row_w1_pek($now) ] | map(select(.id as $i | $present | index($i) | not)) ) as $mint_ready
| ( ( rows_wave2($now) + rows_wave3($now) ) | map(select(.id as $i | $present | index($i) | not)) ) as $mint_backlog
| ( ($mint_ip|length) + ($mint_ready|length) + ($mint_backlog|length) ) as $n_minted
| .task_board.in_progress += $mint_ip
| .task_board.ready       += $mint_ready
| .task_board.backlog     += $mint_backlog
| .task_board._updated_at  = $now
| .task_board._updated_by  = "po-s65"
# CANONICAL HEAD = TOP-LEVEL .head (NEVER .task_board.head — deprecated, see
# orch-state-access.md §4). dev-team flow Step 0b + router-d1-claim read .head.
| .head.status = "active"
| .head.active_task_id = (if ($mint_ip|length) > 0 then "FIX-ERRAUDIT-W1-MCP-P0" else .head.active_task_id end)
| .head.next_agent = (if ($mint_ip|length) > 0 then "dev-team" else .head.next_agent end)
| .head.updated_at = $now
| .head.updated_by = "po-s65"
| .head.note = (if $n_minted > 0 then
    ("ERROR-HANDLING AUDIT 3-WAVE MINT (po-s65, brief 2026-06-15-error-handling-audit.md). "
     + "MINTED \($n_minted) under epic ERROR-AUDIT-2026-06-15 (all id-guarded, dedup-clean). "
     + "DISPATCHED \($mint_ip|length): FIX-ERRAUDIT-W1-MCP-P0 (P0 pair, dev-mcp-server, the 1 free coding lane; pure error->marker, no fetch surface) -> in_progress. "
     + "QUEUED \($mint_ready|length): FIX-ERRAUDIT-W1-PEK-P0 (P0 pair, dev-pdf-extractor) -> ready BLOCKED_BY FIX-BCTC-BANK-PDF-OCR-RASTERIZE (SAME-ZONE-SERIALIZED; verified DISTINCT from active OCR-rasterize fix which touched ocr_adapter.py only). "
     + "BACKLOG \($mint_backlog|length): Wave-2 (withDeadline+macroFetch | safeQuery+runSection+failLoud | frontend safeFetch) + Wave-3 (mcp P2 | pek P2) — NOT promoted, ba->architect chain grooms later. "
     + "WIP<=2 RESPECTED: pdf-extractor lane FIX-BCTC-BANK-PDF-OCR-RASTERIZE active + ARCH-CRON-SCHEDULER-RELIABILITY (architect-design, not coding WIP); 1 free coding lane consumed by W1-MCP-P0. "
     + "UNTOUCHED: both pre-existing in_progress rows (dev-pdf-extractor race-safe). PUSH HELD (origin 72-ahead cloud-chore divergence; PO deferred call).")
   else .head.note end)
