# po-s54-macro-accuracy-pair-promote.jq
# Triage: promote the macro-indicators ACCURACY PAIR backlog -> ready, serialized.
#   F-BOP-ENCODING  (S, no-recon)        -> dispatched FIRST  (sequence_after: null)
#   F-NSO-SELECTOR  (S, ops recon-first) -> dispatched SECOND (sequence_after: F-BOP-ENCODING)
# Both rebase 94b49f44 (baseline_pass), zone apps/macro-indicators/, owner dev-macro-indicators.
# Idempotent: skips a task if its id already present in ANY board array. Sets head -> dev-team
# WITHOUT disturbing the separate BA-VN-MACRO-TOOLING/pm in_progress lane.
# Usage: jq --arg now "$NOW" -f scripts/po-s54-macro-accuracy-pair-promote.jq docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH)

# "already promoted" = id present in ANY board array OTHER than backlog (its source).
# (backlog is the source we move FROM, so its presence there is expected, not a skip signal.)
def already_present($id):
  [ .task_board | to_entries[]
    | select(.key != "backlog")
    | select(.value | type == "array")
    | .value[]? | (.id // "") ]
  | index($id) != null;

# --- promote F-BOP-ENCODING (FIRST) ---
def promote_bop:
  if already_present("F-BOP-ENCODING") then .
  else
    ( .task_board.backlog | map(select(.id != "F-BOP-ENCODING")) ) as $remaining
    | ( .task_board.backlog[] | select(.id=="F-BOP-ENCODING") ) as $node
    | .task_board.backlog = $remaining
    | .task_board.ready += [ $node
        + { status: "READY",
            owner_agent: "dev-macro-indicators",
            owner: "dev-macro-indicators",
            baseline_pass: "94b49f44",
            sequence_after: null,
            dispatch_order: 1,
            recon_first: false,
            triaged_at: $now,
            triaged_by: "po",
            po_triage_note: "S no-recon accuracy win: URL-encode SBV Liferay OData filter spaces in usecases_vmt_bop.go. bop degrade 'context deadline exceeded' = FetchBudgetSec=8s firing on a malformed (un-encoded) OData filter reaching SBV. Rebase 94b49f44 FIRST. Serialize w/ F-NSO-SELECTOR (same owner/zone) — dispatched first, no file conflict (bop=usecases_vmt_bop.go, nso=cache_vmt_nso.go+parsers)."
          } ]
  end;

# --- promote F-NSO-SELECTOR (SECOND, recon-first) ---
def promote_nso:
  if already_present("F-NSO-SELECTOR") then .
  else
    ( .task_board.backlog | map(select(.id != "F-NSO-SELECTOR")) ) as $remaining
    | ( .task_board.backlog[] | select(.id=="F-NSO-SELECTOR") ) as $node
    | .task_board.backlog = $remaining
    | .task_board.ready += [ $node
        + { status: "READY",
            owner_agent: "dev-macro-indicators",
            owner: "dev-macro-indicators",
            baseline_pass: "94b49f44",
            sequence_after: "F-BOP-ENCODING",
            dispatch_order: 2,
            recon_first: true,
            recon_owner: "ops-vps-fetch",
            triaged_at: $now,
            triaged_by: "po",
            po_triage_note: "RECON-FIRST. bai-top selector stale; NSO WordPress index HTML changed (live degrade blocked_reason proves selector no longer matches; index fetches ~85KB so proxy is UP — pure accuracy gap, NOT proxy-down). STEP 1 ops-vps-fetch: recon the NEW NSO WordPress HTML, capture the new selector/structure. STEP 2 dev-macro-indicators: implement new selector in cache_vmt_nso.go + parsers_vmt_gso_indicators.go. Rebase 94b49f44. sequence_after F-BOP-ENCODING (serialize same owner/zone)."
          } ]
  end;

promote_bop
| promote_nso
# --- head: route the accuracy-pair batch to dev-team; leave BA-VN-MACRO-TOOLING/pm lane untouched ---
# CANONICAL HEAD = TOP-LEVEL .head (NEVER .task_board.head — deprecated, see orch-state-access.md §4).
| .head = {
    status: "active",
    active_task_id: "F-BOP-ENCODING",
    next_agent: "dev-team",
    updated_at: $now,
    updated_by: "po",
    note: ("ACCURACY-PAIR TRIAGE (F-MACRO-FETCH-DEADLINE + VMT-8 done_verified; reliability layer COMPLETE). Promoted backlog->ready, SERIALIZED same owner/zone (dev-macro-indicators, apps/macro-indicators/), WIP<=2: [1] F-BOP-ENCODING (S, no-recon, FIRST) URL-encode SBV OData filter spaces in usecases_vmt_bop.go; [2] F-NSO-SELECTOR (S, RECON-FIRST, sequence_after F-BOP) ops-vps-fetch recons new NSO WordPress HTML -> dev-macro-indicators implements new selector in cache_vmt_nso.go+parsers. Both rebase 94b49f44; no file conflict between them. -> dev-team dispatch F-BOP-ENCODING first; NEVER parallel (file-conflict guard). === SEPARATE LIVE LANE (untouched): BA-VN-MACRO-TOOLING in_progress, status architect-probefold-done, next_agent=pm (pm task-plan PENDING) — do NOT lose. === HELD (unchanged): 07-06 methodology brief (sequenced-after-incident); F3 cronJobCount; VMT-3a-PMI blocked-probe5; ops/infra lane (FIX-SBV-FX-VPS-FETCHER-UNHEALTHY, FIX-NEWS-VPS-CRASH-LOOP, OPS-POLLNEWS-NIGHT-ZERO, tinyproxy ACL); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify) HELD — passive ops/cron live-probe, already owned by ARCH-CRON-SCHEDULER-RELIABILITY reverify_gate + FIX-COWORK-GUARANTEED-BACKSTOP, surfaces on its own gate tick (TNB c95 ACK confirms). Commit explicit path only.")
  }
| ._updated_at = $now
| ._updated_by = "po"
