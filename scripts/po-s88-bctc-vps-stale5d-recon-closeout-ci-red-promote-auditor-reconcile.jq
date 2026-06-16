# po-s88-bctc-vps-stale5d-recon-closeout-ci-red-promote-auditor-reconcile.jq
# Single-pass multi-mutation dev-team :07 tick triage (2026-06-16T15:26Z).
# Router RAW-verified every input first-hand; PO owns all triage/board-write decisions.
#
# Context: the ops-vps-fetch recon (docs/vps-sources/bctc-pipeline-stale-5d/recon.md)
# delivered verdict = pipeline_functional_source_non_filing. The actual BCTC breakage
# (afrLoop 26->27 rollover + HNX session cookie) was already fixed at c014 (2026-06-15T17:05Z)
# and the ENTIRE durability program (FIX-HNX-SESSION-COOKIE / FIX-SSC-C111-EMPTY-FALLBACK /
# FIX-BCTC-ZERO-URL-ALERT / FIX-BCTC-FRESHNESS-GATE) is already DONE_VERIFIED on the board.
# Remaining 0-results = genuine source-side non-filing (BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA).
# Only 3 NEW residual-risk gaps remain (recon §Residual Risks) — minted as children below.
#
#   M1 RECON-CLOSEOUT: relocate FIX-BCTC-VPS-PIPELINE-STALE-5D backlog[] -> done[]
#       (done_verified:TRUE — the recon IS the live RAW-verification: SSC HTTP 200 from VPS
#        @12:36Z, ACV Q1/2026 12.9MB discovered+cached, c014 fixes deployed & working in
#        live probes; the "DEAD>72h" framing is STALE — pipeline resumed 2026-06-15T17:05Z;
#        remaining 0-URL cycles = source-side non-filing, NOT pipeline failure -> NON-BUG).
#       Stamp recon doc path + verdict + the genuine-non-filer ticker list as evidence.
#       Idempotent: guarded by done[] membership (re-run relocates 0).
#
#   M2 AUDITOR-EMIT RECONCILE: relocate FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK
#       backlog[] -> review[] (next_agent=qa). Code fix LANDED at 220b48c5
#       "fix(agents/system-auditor): rewrite all post_agent_signal emit blocks to live
#        schema". Code complete != done_verified: the gate is a LIVE emit-success probe
#       (>=1 system-auditor anomaly signal reaches the coordination bus with the live
#        {from_agent,to_agent,signal_type,payload} schema, MCP -32602 gone). qa verifies.
#       Idempotent: guarded by review[] membership.
#
#   M3 CI-RED PROMOTE: relocate FIX-CI-RED-STANDING-1837A-1352A backlog[] -> ready[]
#       (status BACKLOG->READY + promotion stamps). Already fully specced (P2, size:S,
#        blocking:true, zone=apps/mcp-server, next_agent=dev-mcp-server, baseline_pass:false).
#       Router RAW-verified origin HEAD 207658f3 `bun test` RED = EXACTLY these 2 files
#        (1352a + 1837a). Per /goal#1 recheck-shipped-code both reds are real (not flaky);
#        blocking:true gates 4 ci_green_on_subsequent_push tasks from done_verified.
#       LEADS ready[] (unshift) — highest-leverage unblock; coding-WIP has a free slot.
#       Idempotent: skipped if id already in ANY non-backlog lane.
#
#   M4 MINT 3 residual-risk children (recon §Residual Risks), id-guarded:
#       (a) FIX-BCTC-SSC-503-RETRY -> ready[] (P2, dev-vps-crawls, vps-scripts/):
#           add 1-retry+60s backoff in _ssc_curl_search() step1 before returning None on
#           HTTPError 503 — a transient ~12:00Z UTC SSC maintenance 503 currently burns an
#           entire 6h cycle. NOT covered by the shipped C1-C4 (C4=ADF brittleness monitoring,
#           C1/C2=zero-result alert/health gate — none add a step1 503 retry). NEW.
#       (b) FIX-BCTC-QUEUE-MAXAGE-GATE -> backlog[] (P2, dev-mcp-server, apps/mcp-server/):
#           tickers with 0 results on ALL sources >30d -> mark 'no-filing-detected', drop
#           from the active SLA queue so genuine non-filers stop perpetually tripping
#           "SLA CRITICAL". DISTINCT from the shipped FIX-BCTC-FRESHNESS-GATE (which only
#           changes the HEALTH-status return idle-vs-unhealthy; this is a queue-ROW
#           lifecycle drop). NEW. WIP-deferred to backlog.
#       (c) SPIKE-BCTC-VEA-Q4-2025-SOURCE-PROBE -> backlog[] (recon, dev-vps-crawls):
#           VEA Q4/2025 not found on SSC or HNX UPCOM — probe cafef.vn / hsx.vn direct
#           disclosure to determine filed-elsewhere vs not-filed. Findings doc, time-box 120m.
#       All status BACKLOG/READY; idempotent (mint id-guarded).
#
#   HEAD: left IDLE deliberately — no single coding lane to point at; ready[] now carries
#       CI-RED (lead, blocking) + SSC-503-RETRY + the 3 pre-existing gatherer/newsscout/
#       marketwatcher FIXes. The router claims from ready[] honoring WIP<=2 coding lanes.
#       (Single-head SSOT — not a dispatch this tick.)
#
# HARD-CONSTRAINT (placement asserts, never mutate): the 5 review[] rows
#   (FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS + 4 others) untouched; in_progress
#   ARCH-CRON-SCHEDULER-RELIABILITY (architect) untouched; the 4 BCTC-durability
#   done_verified rows + ARCH-BCTC done row untouched; FIX-BCTC-ENRICH-SILENT-0ROWS
#   stays review (own C3 gate).
#
# Harness: CONSERVATION (backlog -3 relocations -0 +0 ... net: backlog -3 (3 relocate out)
#   +1 (QUEUE-MAXAGE mint) +1 (VEA spike mint) = backlog net -1; ready +1 (CI-RED) +1
#   (SSC-503) = +2; review +1 (AUDITOR); done +1 (BCTC-STALE-5D recon-closeout);
#   done_verified +0; in_progress +0; TOTAL +3 [the 3 mints]) + PLACEMENT guard +
#   IDEMPOTENCY re-run (delta 0).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s88-bctc-vps-stale5d-recon-closeout-ci-red-promote-auditor-reconcile.jq \
#   docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> idempotency -> rename;
#  commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band call.)

# ---- membership guards (idempotency) ----
([.task_board.done[].id]          | index("FIX-BCTC-VPS-PIPELINE-STALE-5D"))      as $stale_done
| ([.task_board.review[].id]      | index("FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK")) as $auditor_review
| ([ .task_board.ready[].id, .task_board.in_progress[].id, .task_board.review[].id,
     .task_board.done[].id, .task_board.done_verified[].id ] | index("FIX-CI-RED-STANDING-1837A-1352A")) as $cired_placed
| ([.task_board.ready[].id]       | index("FIX-BCTC-SSC-503-RETRY"))             as $ssc_minted
| ([ .task_board.ready[].id, .task_board.backlog[].id ] | index("FIX-BCTC-QUEUE-MAXAGE-GATE")) as $maxage_minted
| ([ .task_board.ready[].id, .task_board.backlog[].id ] | index("SPIKE-BCTC-VEA-Q4-2025-SOURCE-PROBE")) as $vea_minted

# captured matches (for relocation)
| (.task_board.backlog | map(select(.id == "FIX-BCTC-VPS-PIPELINE-STALE-5D"))      | .[0]) as $stale_row
| (.task_board.backlog | map(select(.id == "FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK")) | .[0]) as $auditor_row
| (.task_board.backlog | map(select(.id == "FIX-CI-RED-STANDING-1837A-1352A"))    | .[0]) as $cired_row

# ===== M1: RECON-CLOSEOUT FIX-BCTC-VPS-PIPELINE-STALE-5D backlog -> done (done_verified:true, NON-BUG) =====
| if ($stale_done != null) or ($stale_row == null) then .
  else
    .task_board.backlog |= map(select(.id != "FIX-BCTC-VPS-PIPELINE-STALE-5D"))
    | .task_board.done += [ $stale_row + {
        status: "DONE",
        done_verified: true,
        resolution: "non-bug — pipeline_functional_source_non_filing",
        done_at: $now, done_by: "po",
        verified_at: $now, verified_by: "po (recon RAW-verified)",
        done_evidence: "ops-vps-fetch recon (docs/vps-sources/bctc-pipeline-stale-5d/recon.md, 2026-06-16T12:40Z) RAW-verified LIVE: SSC HTTP 200 from VPS @12:36Z (afrLoop 27084144395994383, clean Oracle ADF, no CF/captcha/403); HNX+UPCOM session warmup 200. The actual breakage (afrLoop 26->27 rollover + HNX 302 no-session) was fixed at c014 2026-06-15T17:05Z — pipeline resumed then. The whole durability program is done_verified (HNX-SESSION-COOKIE, SSC-C111-EMPTY-FALLBACK, BCTC-ZERO-URL-ALERT, BCTC-FRESHNESS-GATE). The 'DEAD>72h' SLA framing is STALE: the 0-URL cycles since 17:05Z reflect SOURCE-SIDE NON-FILING (BDI/DAG/DLC/JSH/SIS/VDC have 0 SSC rows; VNH=annual-2025-only; VEA=latest-Q4/2025 — none filed Q1/2026 on monitored sources), NOT pipeline failure. ACV Q1/2026 IS discoverable (12.9MB cached, pushes next 18:00Z). NON-BUG.",
        recon_doc: "docs/vps-sources/bctc-pipeline-stale-5d/recon.md",
        residual_risks_spun_out: ["FIX-BCTC-SSC-503-RETRY","FIX-BCTC-QUEUE-MAXAGE-GATE","SPIKE-BCTC-VEA-Q4-2025-SOURCE-PROBE"]
      } ]
  end

# ===== M2: AUDITOR-EMIT RECONCILE backlog -> review (next_agent=qa, code landed 220b48c5) =====
| if ($auditor_review != null) or ($auditor_row == null) then .
  else
    .task_board.backlog |= map(select(.id != "FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK"))
    | .task_board.review += [ $auditor_row + {
        status: "REVIEW",
        next_agent: "qa",
        code_landed_commit: "220b48c5",
        moved_to_review_at: $now, moved_by: "po",
        qa_gate: "LIVE emit-success probe — confirm >=1 system-auditor anomaly signal reaches the coordination bus via post_agent_signal with the live {from_agent,to_agent,signal_type(in enum),payload} schema (the 3 emit sites system-auditor/flow/main.md L193/L482/L509 rewritten at 220b48c5). PASS = a real anomaly signal lands (no MCP -32602), get_agent_signals returns it. Stale health-rechecks 3182..3198 still report BUG-3 because they predate/don't re-probe the committed fix — qa RAW-verifies the live emit path, not the stale report.",
        reconcile_note: "Code fix committed locally at 220b48c5; reconciled backlog->review (was BACKLOG, never QA-gated). done_verified withheld until live emit verified."
      } ]
  end

# ===== M3: CI-RED PROMOTE backlog -> ready (LEAD, blocking) =====
| if ($cired_placed != null) or ($cired_row == null) then .
  else
    .task_board.backlog |= map(select(.id != "FIX-CI-RED-STANDING-1837A-1352A"))
    | .task_board.ready = ([ ($cired_row + {
        status: "READY",
        promoted_at: $now, promoted_by: "po",
        promotion_reason: "Router RAW-verified origin HEAD 207658f3 `bun test` RED = EXACTLY 1352a-async-extraction-race + 1837a-pipeline-state (13064 pass/53 skip/5 fail). Per /goal#1 recheck-shipped-code both reds are REAL (deterministic, reproduced local+rerun), not flaky. blocking:true: gates 4 ci_green_on_subsequent_push tasks (CI-RED-b7b84d9b-FIX, CI-RED-d20468c0-FIX, VMT-8-MACRO-GRACEFUL-FAILCLOSE, FIX-FOREIGN-FLOW-DEAD-ENDPOINT) from done_verified. Coding-WIP has a free slot (only architect ARCH-CRON in_progress). Leads ready[].",
        next_agent: "dev-mcp-server"
      }) ] + .task_board.ready)
  end

# ===== M4: MINT residual-risk children =====
# (a) FIX-BCTC-SSC-503-RETRY -> ready (P2, dev-vps-crawls)
| if $ssc_minted != null then .
  else
    .task_board.ready += [ {
      id: "FIX-BCTC-SSC-503-RETRY",
      title: "FIX-BCTC-SSC-503-RETRY — add 1-retry+60s backoff in _ssc_curl_search() step1 before returning None on a transient SSC HTTP 503",
      type: "FIX", owner: "po", status: "READY",
      priority: "P2", size: "S",
      zone: "apps", next_agent: "dev-vps-crawls",
      created_at: $now, created_by: "po",
      source: "recon docs/vps-sources/bctc-pipeline-stale-5d/recon.md §Residual Risks #1 (2026-06-16). SSC returns HTTP 503 on ALL tickers at ~12:00Z UTC (19:00 ICT, scheduled maintenance window); self-recovers by ~12:36Z. Current _ssc_curl_search() has NO 503 retry -> returns None -> SKIP -> an entire 6h cycle burned for a 6-min transient.",
      root_cause: "_ssc_curl_search() step1 returns None on the first HTTPError 503 with no retry; the ~daily ~12:00Z SSC maintenance restart therefore drops a full 6h discovery cycle.",
      fix_spec: "In _ssc_curl_search() step1: on HTTPError 503, retry ONCE after a 60s backoff before returning None. Keep fail-loud-per-ticker on the 2nd 503 (return None -> SKIP, do NOT fabricate). Bound the retry so total step1 time stays well under the cycle budget. No change to the afrLoop/ViewState happy path.",
      generic_mandate: "/goal#2 GENERIC — retry keys on HTTP status 503 only, applies to ANY ticker/exchange; no per-ticker/date literal.",
      verification_gate: "LIVE: next ~12:00Z UTC cycle that hits an SSC 503 recovers within the same cycle (retry succeeds at 200) instead of SKIP-all; OR a forced 503 replay shows the retry path. NOT covered by the shipped C1-C4 durability fixes.",
      files: ["vps-scripts/discover-bctc-urls-browser.py"],
      baseline_pass: false
    } ]
  end

# (b) FIX-BCTC-QUEUE-MAXAGE-GATE -> backlog (P2, dev-mcp-server) — WIP-deferred
| if $maxage_minted != null then .
  else
    .task_board.backlog += [ {
      id: "FIX-BCTC-QUEUE-MAXAGE-GATE",
      title: "FIX-BCTC-QUEUE-MAXAGE-GATE — mark tickers with 0 results on ALL sources >30d as 'no-filing-detected' + drop from the active SLA queue",
      type: "FIX", owner: "po", status: "BACKLOG",
      priority: "P2", size: "S",
      zone: "apps/mcp-server", next_agent: "dev-mcp-server",
      created_at: $now, created_by: "po",
      source: "recon docs/vps-sources/bctc-pipeline-stale-5d/recon.md §Residual Risks #2 (2026-06-16). A 10-item queue of GENUINE non-filers (BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA) keeps the 'SLA CRITICAL' alarm perpetually alive (health-rechecks every 2h report BCTC-DEAD off these), masking real outages.",
      root_cause: "bctc_vps_queue rows for tickers that have not filed on ANY monitored source never age out -> perpetual 'pending'/'url_not_found' rows trip the SLA-CRITICAL freshness alarm even when the pipeline is functional (source-side non-filing).",
      fix_spec: "Add a max-age gate: when a queue row has 0 discovered URLs on ALL sources for >30d (track via a first_seen/last_zero timestamp), transition its status to 'no-filing-detected' and EXCLUDE it from the active SLA/freshness queue count. Re-arm: if a later cycle discovers a URL for that ticker, clear the marker and re-activate. AGGREGATE-safe: a partial success on any ticker must not mask another's staleness.",
      generic_mandate: "/goal#2 GENERIC — keyed on per-row age + zero-result-on-all-sources, no ticker allowlist/date literal.",
      verification_gate: "LIVE: a >30d-zero non-filer (e.g. VEA) transitions to 'no-filing-detected' and DROPS out of the SLA-CRITICAL count, while the health-recheck still surfaces a REAL stall (>=1 actionable pending row stale). DISTINCT from the shipped FIX-BCTC-FRESHNESS-GATE (which only changes the health-status return idle-vs-unhealthy, NOT the queue-row lifecycle).",
      files: ["apps/mcp-server/src/interface/scheduler/bctcQueueEnricherJob.ts"],
      baseline_pass: false,
      hold_reason: "WIP-deferred to backlog: P2 queue-lifecycle hardening, not on the critical path (pipeline already functional). Promote to ready when a coding lane frees."
    } ]
  end

# (c) SPIKE-BCTC-VEA-Q4-2025-SOURCE-PROBE -> backlog (recon spike)
| if $vea_minted != null then .
  else
    .task_board.backlog += [ {
      id: "SPIKE-BCTC-VEA-Q4-2025-SOURCE-PROBE",
      title: "SPIKE-BCTC-VEA-Q4-2025-SOURCE-PROBE — probe cafef.vn / hsx.vn direct disclosure for VEA Q4/2025 (not found on SSC or HNX UPCOM)",
      type: "SPIKE", owner: "po", status: "BACKLOG",
      question: "Is VEA Q4/2025 BCTC filed on cafef.vn or hsx.vn direct disclosure (filed-elsewhere), or genuinely not filed? If discoverable elsewhere, what is the working request recipe to add that source?",
      mode: "spike", timebox: 120,
      zone: "apps", next_agent: "dev-vps-crawls",
      created_at: $now, created_by: "po",
      source: "recon docs/vps-sources/bctc-pipeline-stale-5d/recon.md §Residual Risks #3 (2026-06-16). VEA Q4/2025 queue item returns 0 results on SSC AND HNX UPCOM; possibly filed on cafef/hsx.vn direct, or not filed at all.",
      deliverable: "Findings doc: filed-elsewhere vs not-filed verdict + (if found) the source URL + working request recipe to wire that source into discovery.",
      baseline_pass: true
    } ]
  end

# ---- metadata bump ----
| .task_board.updated_at = $now
| .task_board.updated_by = "po"
