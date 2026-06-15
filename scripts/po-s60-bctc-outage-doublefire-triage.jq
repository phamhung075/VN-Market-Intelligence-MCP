# po-s60-bctc-outage-doublefire-triage.jq
# Single-pass dev-team :07 triage (now=2026-06-15T16:27Z) — atomic multi-mutation:
#   (1) MINT 4 new tasks -> ready[] (id-guarded across ALL board arrays — never dup):
#         OPS-BCTC-PIPELINE-RECON (P0, ops-vps-fetch, NOT a coding lane, dispatch-now)
#         FIX-GATHERER-DOUBLEFIRE-DISPATCHER (root A, cowork-schedule/dispatcher zone)
#         FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE (root B, dev-mcp-server — BUSY, deferred)
#         FIX-MARKETWATCHER-GW-CORROBORATION-GATE (root C, dev-mcp-server — BUSY, deferred)
#   (2) ANNOTATE existing backlog FIX-BCTC-VPS-PIPELINE-STALE-5D with the 2nd-recurrence
#       evidence (no dup of BUG-2; recon supersedes/feeds it).
#   (3) ACK signal_queue row gatherer-manual-cloud-doublefire NEW -> READ (roots minted;
#       not RESOLVED until fixes ship).
# HARD CONSTRAINT: FIX-SIGNAL-CONFIDENCE-DEFAULT-50 (review[]) left EXACTLY as-is.
# Invoke: jq --arg now "$NOW" -f scripts/po-s56-bctc-outage-doublefire-triage.jq orch-state.json
# Atomic harness: temp -> [ -s ] -> jq empty -> conservation guard -> rename. Commit by EXPLICIT PATH.

# --- id-guard: collect every task id already present across the 5 board arrays ---
( [ .task_board | to_entries[] | select(.value|type=="array") | .value[] | (.id // .task_id // empty) ] ) as $existing
|
# --- task definitions ---
( {
    "id": "OPS-BCTC-PIPELINE-RECON",
    "type": "FIX",
    "priority": "P0",
    "status": "READY",
    "route_to": "ops-vps-fetch",
    "zone": "apps/pdf-extractor/",
    "mode": "recon-first",
    "title": "BCTC pipeline DEAD 34.3h — recon to isolate {VPS-down | bctc-push-cron-stopped | geo-block/SSL regression | enricher 0-URL discovery stall}",
    "desc": "RAW-CONFIRMED real outage (PO :07 tick 2026-06-15T16:31Z): get_bctc_full('VCB')->'Chua co du lieu BCTC' (empty); get_bctc_full('FPT')->data but Published 2026-05-24 (stale >22d, last fresh ingest May 24). VPS bctc 0 pushes/24h since 2026-06-13 23:45Z. 27 tickers filed Q1 absent from DB. bctcQueueEnricher returns 0 URLs for all tickers. Violates no-fake-data/real-fetch standing goal (core BCTC domain serving stale/empty). 2ND RECURRENCE of FIX-BCTC-VPS-PIPELINE-STALE-5D mechanism (prior self-recovered Jun13 22:45, re-stalled since 23:45) -> recurring-bug-escalation class.",
    "recon_scope": "SSH Vinahost VPS. curl /proxy/bctc-discover/VCB to isolate the layer. Check (1) vn-bctc-fetch process + push-cron alive (last successful push age); (2) iboard/HNX discovery returns URLs for Q1 tickers or 0 (enricher stall = same root as prior); (3) geo-block/SSL-chain regression (cf. prior 13-day HNX TLS outage, --cacert hardening); (4) parser/pdf-extractor rejection. DO NOT guess the layer before recon.",
    "route_after_recon": "Per recon verdict -> dev-vps-crawls (push-cron/discovery) | dev-pdf-extractor (parser) | dev-mcp-server (bctcQueueEnricher 0-URL alerting + vpsHealthPoller active-freshness, already specced in FIX-BCTC-VPS-PIPELINE-STALE-5D handoff items 1-2).",
    "supersedes_note": "Recon FIRST; the structural fix items (active freshness health + enricher zero-URL alerting + HNX/UPCOM discovery coverage for 9 url-less tickers) are already enumerated in backlog FIX-BCTC-VPS-PIPELINE-STALE-5D — recon decides which to dispatch.",
    "size": "S",
    "baseline_pass": "get_bctc_full('VCB') returns LIVE Q1-2026 data (not empty); VPS bctc push age <24h; >=20 of 27 Q1 tickers present in DB with current-quarter ingest. done_verified = live VARIED data vs named-volume market.db, never a badge (/goal#1).",
    "folds": ["BUG-3 bctcReparseJob 79.7% (downstream symptom of this outage)"],
    "source": "health-recheck B2 (analysis-agent 2h cloud trigger) + PO RAW-confirm 2026-06-15T16:31Z",
    "created_at": $now,
    "dispatch_note": "DISPATCH NOW — ops-vps-fetch recon is NOT a coding lane; does not consume the WIP<=2 CODING budget (1 active: FIX-SIGNAL-CONFIDENCE). HIGHEST priority this tick."
  } ) as $t_recon
|
( {
    "id": "FIX-GATHERER-DOUBLEFIRE-DISPATCHER",
    "type": "FIX",
    "priority": "MEDIUM",
    "status": "READY",
    "route_to": "agents-architect",
    "zone": "docs/data/cowork-schedule.json",
    "title": "Root A: dispatcher DEFER offhours-gatherer fire when leader-lock unreadable AND within :00-:15 cloud-backstop window of a 4h-boundary hour",
    "desc": "Manual */15 dispatcher fired news-scout-offhours + market-watcher-eod at 16:07Z (last_fired read 12:09Z=stale); cloud backstop independently fired the offhours pair ~16:12Z AFTER the staleness check; task_list_held (leader-lock) read timed out so dispatcher could not defer -> double-fire. FIX: when leader-lock unreadable AND within the :00-:15 cloud-backstop window of a 4h-boundary hour, DEFER one tick + re-check next tick (do not fire on stale last_fired). SSOT cowork-schedule.json is _maintained_by agent-father via architect brief ONLY (never direct edit). Distinct from FIX-CADENCE-COWORK-DUP-MARKET-WATCHER (that = slot-overlap cadence; this = leader-lock-unreadable backstop-window defer).",
    "size": "S",
    "baseline_pass": "Simulate stale-last_fired + unreadable-lock within backstop window -> dispatcher DEFERs (no fire); next readable tick fires once. No double internal signals.",
    "source": "signal_queue cowork-team-20260615T1620Z-gatherer-manual-cloud-doublefire (root A)",
    "created_at": $now,
    "dispatch_note": "Routes via architect brief -> agent-father (cowork-schedule.json edit path). Independent of dev-mcp-server lane."
  } ) as $t_rootA
|
( {
    "id": "FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE",
    "type": "FIX",
    "priority": "MEDIUM",
    "status": "READY",
    "route_to": "dev-mcp-server",
    "zone": "apps/mcp-server/",
    "title": "Root B: news-scout SELF_SIGNALS_CACHE must include just-committed sibling signals from signal_bus to dedup concurrent fires",
    "desc": "Double-fire ran news-scout twice (c100 16:12Z #6209-6212 cloud + c101 16:15Z #6213-6215 manual); both cycles had SELF_SIGNALS_CACHE=[] so the 2nd was BLIND to the 1st just-posted signals -> ~2-3 duplicate internal signals (#6213 US-Iran-peace dup of #6210; #6214 VIC dup of #6211). Internal signal_bus only, NO public MARKET double-post, but CHEF/alert-commander convergence may over-weight US-Iran peace. FIX: SELF_SIGNALS_CACHE must read just-committed sibling signals from signal_bus (recent window, not only own prior committed cycle) so a concurrent sibling fire is deduped. GENERIC across all signal types (/goal#2 — no allowlist).",
    "size": "S",
    "baseline_pass": "Two concurrent news-scout fires within the same minute produce 0 duplicate internal signals (2nd sees the 1st's committed signals in cache).",
    "source": "signal_queue cowork-team-20260615T1620Z-gatherer-manual-cloud-doublefire (root B)",
    "created_at": $now,
    "dispatch_note": "DEFERRED — dev-mcp-server is BUSY (FIX-SIGNAL-CONFIDENCE active). Dispatch after that lane frees. May combine with root C (same agent+zone) into one dev-mcp-server task."
  } ) as $t_rootB
|
( {
    "id": "FIX-MARKETWATCHER-GW-CORROBORATION-GATE",
    "type": "FIX",
    "priority": "MEDIUM",
    "status": "READY",
    "route_to": "dev-mcp-server",
    "zone": "apps/mcp-server/",
    "title": "Root C: market-watcher Step 0-GW apply sibling-success/retry corroboration gate before filing gateway-down BUG",
    "desc": "market-watcher cloud offhours run BLOCKED at Step 0-GW (get_system_status timeout x2) and filed a FALSE gateway-down BUG; gateway was NOT down (dispatcher probe 16:09Z got fast structured error; market-watcher-eod SIBLING SUCCEEDED 7 anomalies+ledger+price_anomaly_20260615T1600.json). False-infra-failure (false-infra-failure-corroboration-gate + overparallel-fanout-host-starvation lessons — 16:1xZ host load-205 spike caused the timeout, not a real outage). FIX: Step 0-GW must apply a corroboration gate (sibling-success check / retry-backoff) before filing a gateway-down BUG escalation. GENERIC.",
    "size": "S",
    "baseline_pass": "Inject a Step-0-GW timeout while a sibling gatherer succeeds -> market-watcher does NOT file gateway-down BUG (corroboration suppresses); files only when sibling ALSO fails + retry exhausted.",
    "source": "signal_queue cowork-team-20260615T1620Z-gatherer-manual-cloud-doublefire (root C)",
    "created_at": $now,
    "dispatch_note": "DEFERRED — dev-mcp-server is BUSY. Combine with root B (same agent+zone+lesson family) into one dev-mcp-server task when lane frees."
  } ) as $t_rootC
|
([ $t_recon, $t_rootA, $t_rootB, $t_rootC ]
  | map(select((.id) as $id | ($existing | index($id)) | not))) as $mints
|
# --- (1) append id-guarded mints to ready[] ---
.task_board.ready += $mints
|
# --- (2) annotate existing backlog FIX-BCTC-VPS-PIPELINE-STALE-5D with 2nd-recurrence note ---
.task_board.backlog |= map(
  if (.id // "") == "FIX-BCTC-VPS-PIPELINE-STALE-5D"
  then . + {
    "recurrence_note": ("2ND RECURRENCE confirmed " + $now + ": prior self-recovered Jun13 22:45Z, re-stalled since 23:45Z. get_bctc_full('VCB') empty, FPT stale (Published 2026-05-24). OPS-BCTC-PIPELINE-RECON minted to ready[] to re-isolate layer + route the structural items (1) active-freshness vpsHealthPoller + (2) enricher zero-URL alerting + (3) HNX/UPCOM discovery coverage. recurring-bug-escalation class."),
    "recurrence_count": 2
  }
  else . end
)
|
# --- (3) ACK signal_queue.rows gatherer-doublefire NEW -> READ ---
.signal_queue.rows |= map(
  if (.id // "") == "cowork-team-20260615T1620Z-gatherer-manual-cloud-doublefire"
  then . + {
    "status": "READ",
    "disposition": ("ACK (PO :07 tick " + $now + "): 3 roots minted to ready[] — FIX-GATHERER-DOUBLEFIRE-DISPATCHER (A, architect->agent-father), FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE (B, dev-mcp-server BUSY=deferred), FIX-MARKETWATCHER-GW-CORROBORATION-GATE (C, dev-mcp-server BUSY=deferred). FALSE gateway-down disproven (sibling market-watcher-eod succeeded; load-205 transient). No public MARKET double-post. READ not RESOLVED until B+C ship."),
    "resolved_by": "po"
  }
  else . end
)
|
# --- bump SSOT bookkeeping ---
.signal_queue._updated_at = $now
| .signal_queue._updated_by = "po"
