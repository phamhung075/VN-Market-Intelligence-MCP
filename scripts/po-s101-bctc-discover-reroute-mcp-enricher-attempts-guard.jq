# po-s101 — BCTC discover-zero-push reroute: dev-vps-crawls DISPROVED the discovery-outage
# hypothesis (RAW VPS probes: VCB/HPG Q1-2026 URLs return <1s; the 9 pending are GENUINELY
# absent, not an outage). Real root = apps/mcp-server enricher attempts===0 guard that never
# terminalizes genuinely-absent rows → zero-url counter climbs unbounded → bctc SLA FALSE-CRITICAL.
#
# M1 (in-place REROUTE + RECLASSIFY): rewrite the in_progress FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH
#   row — zone apps/vps-client→apps/mcp-server, next_agent dev-vps-crawls→dev-mcp-server,
#   severity CRITICAL→HIGH (P0→P1), description→real root, files→enricher, fresh verification_gate.
#   SAME coding lane (re-route, not a new lane) → WIP stays 2.
# M2 (id-guarded MINT, backlog): FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL — SLA-metric follow-on so
#   url_not_found rows don't inflate freshness age forever. BACKLOG (deferred, not ready) → no 3rd lane.
#   Skipped if id already present in ANY board array.
#
# Idempotent: M1 guarded by next_agent already==dev-mcp-server; M2 by id-presence.
# Harness: CONSERVATION (in_progress LENGTH byte-stable [M1 in-place], backlog +0/+1, others stable).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s101-...jq docs/data/orch/orch-state.json

def already_minted($id):
  ([ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
     .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
   | map(.id) | any(. == $id));

.task_board.in_progress |= map(
  if .id == "FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH" then
    (.severity = "HIGH")
    | .priority = "P1"
    | .title = "BCTC enricher: attempts===0 guard never terminalizes genuinely-absent tickers → zero-url counter unbounded → bctc SLA FALSE-CRITICAL"
    | .description = "REROUTED 2026-06-17 (zone correction). dev-vps-crawls DISPROVED the discovery-outage hypothesis via RAW VPS probes: bctc-discover returns Q1-2026 URLs for VCB/HPG <1s; 65 Q1-2026 tickers already in done[] with real URLs. The 9 pending tickers (BDI,DAG,DLC,JSH,SIS,VDC,VNH,VEA + VEA-Q4-2025) are GENUINELY ABSENT (no Q1-2026 filing exists yet on SSC — honest gap per /goal#1), NOT an outage. REAL ROOT (apps/mcp-server, dev-mcp-server zone): bctcQueueEnricherJob.ts lines 497-513 — when discovery returns 0 URLs and attempts===0, the else branch leaves the row pending at 0 and NEVER increments. Genuinely-absent rows are forever stuck at attempts=0, never reach MAX_ENRICH_ATTEMPTS(5), never marked url_not_found, cycle forever (210+ zero-url cycles). The zero-url counter climbs every cron tick → bctc SLA reads 1332/360min breached CRITICAL and STILL CLIMBING — a metric/accounting ARTIFACT of the stuck-9, NOT real staleness (current-quarter data is healthy). RECLASSIFIED CRITICAL→HIGH: not a data-loss CRITICAL (data healthy), but the permanently-stuck false-CRITICAL SLA masks ALL FUTURE real bctc breaches — a real observability fix."
    | .owner = "dev-mcp-server"
    | .next_agent = "dev-mcp-server"
    | .zone = "apps/mcp-server/"
    | .route = "dev-mcp-server"
    | .files = [ "apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts" ]
    | .fix_spec = "Remove the attempts===0 special-case (else branch, lines 509-513) that prevents increment. GENERIC (no per-ticker allowlist, no date-literal — /goal#2): when discovery REACHES the source and returns 0 URLs (real network-level discovery, NOT a pre-network error — keep the existing error-path no-increment at lines 526+), ALWAYS increment attempts regardless of current value. Optionally distinguish 'first real attempt' via last_attempt IS NULL rather than attempts===0. Any genuinely-absent row then accumulates attempts → reaches MAX_ENRICH_ATTEMPTS(5) → marked url_not_found (honest terminal) → drops out of the pending cycle → zero-url counter resets → bctc SLA stops growing."
    | .generic_mandate = "Fix MUST be ticker-agnostic and date-agnostic: any ticker whose filing is genuinely absent terminalizes after N real-discovery attempts. No allowlist of the current 9, no Q1-2026 literal."
    | .rebuild_required = true
    | .verification_gate = "DONE_VERIFIED gate (/goal#1): (1) live get_sla_status shows bctc age FALLING (not climbing) after the 9 absent rows terminalize; (2) the 9 absent tickers in url_not_found terminal state (attempts reached 5 via real-discovery increments); (3) the 65 done[] Q1-2026 rows UNTOUCHED (no real data lost); (4) zero-url counter no longer climbing every tick. NOT just green tests — RAW live SLA probe required (a SQL flush of attempts is a graceful workaround, the CODE fix is the durable terminal)."
    | .source = "ROUTER-VERIFIED reroute 2026-06-17T18:55Z (signal po-2026-06-17T18-55-00Z-bctc-discover-reroute.json; diagnosis commit 5a94f08e). Router RAW-confirmed: get_bctc_full(VCB)=Q1-2026 healthy; get_bctc_full(VEA)=latest 2025-Q4 (genuine absence); get_sla_status bctc 1332/360min climbing."
    | .rerouted_at = $now
    | .rerouted_from = "dev-vps-crawls (hypothesis disproven, zone correction)"
    | .sequencing = "WIP=2 (1 ARCH-CRON designer-exempt + this re-routed coding lane). SAME lane re-routed dev-vps-crawls→dev-mcp-server — NOT a new lane. WIP unchanged."
    | .claimed_at = null
    | .claimed_by = null
    | .baseline_pass = false
  else . end
)
# M2 — SLA-freshness follow-on (id-guarded, BACKLOG, deferred — folds the residual)
| . as $root
| if ($root | already_minted("FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL")) then .
  else
    .task_board.backlog += [ {
      id: "FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL",
      type: "FIX",
      severity: "LOW",
      priority: "P3",
      status: "BACKLOG",
      title: "bctc SLA freshness metric must exclude url_not_found terminal rows so genuinely-absent tickers can't breach forever",
      description: "RESIDUAL of the FIX-BCTC-DISCOVER reroute. The enricher attempts-guard fix neutralizes the IMMEDIATE breach (the 9 stuck rows terminalize → counter resets). But the SLA freshness metric still keys on queue-staleness in a way that lets a genuinely-absent ticker contribute to bctc SLA age indefinitely. Durable hardening: exclude rows in url_not_found (and other terminal states) from the freshness-age computation so bctc SLA reflects ACTUAL data freshness of FILEABLE rows, not honest-gap rows. FOLD-vs-MINT decision: minted SEPARATE (deferred backlog) because it is a metric-semantics change distinct from the enricher terminal fix; do NOT block the enricher fix on it. If the enricher fix's done_verified shows the SLA fully stable with terminal rows present, this can be closed no-op.",
      zone: "apps/mcp-server/",
      files: [],
      depends: [ "FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH" ],
      generic_mandate: "Exclude ALL terminal states (url_not_found etc.) generically from freshness age — no per-ticker carve-out.",
      verification_gate: "After enricher fix lands, get_sla_status bctc age reflects only fileable-row staleness; url_not_found rows do not contribute to age.",
      baseline_pass: true,
      source: "PO reroute triage 2026-06-17 (router-verified) — SLA-metric residual",
      minted_at: $now,
      minted_by: "po"
    } ]
  end
| .meta = ((.meta // {}) + { last_po_triage: $now, last_po_triage_by: "po-s101-bctc-discover-reroute" })
