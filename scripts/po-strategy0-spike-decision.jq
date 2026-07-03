# scripts/po-strategy0-spike-decision.jq
# PO 3-part sprint decision on router-verified SPIKE-HSX-STRATEGY0-0URLS (PREMISE_FALSIFIED).
# Applied via: jq --arg now <ISO> -f scripts/po-strategy0-spike-decision.jq \
#              docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (a) retire superseded "Strategy-0 broken" framing (decision_journal guard; no live task to close)
# (b) mint cheap loop-closer VERIFY-BCTC-STRATEGY0-QUARTER-PARAM-CONTRACT (FIX/S/low)
# (c) keep 293-row historical backfill DEFERRED — upgrade precision of existing BCTC-ENRICHER-OLD-QUARTERS
#     (no new row — no-duplication); document turnkey revival scope + separate SELECT-arm policy dependency

# --- (c) enrich the existing DEFERRED older-quarter item (keep DEFERRED) ---
.task_board.backlog |= (map(
  if .id == "BCTC-ENRICHER-OLD-QUARTERS" then
    . + {
      "verify_note": "PO 2026-07-03: KEEP DEFERRED — discretionary historical backfill, NOT an incident (current/recent-quarter discovery verified working live; active Q2-2026 earnings window). DISTINCT from the falsified current-quarter '0 URLs' framing (SPIKE-HSX-STRATEGY0-0URLS = PREMISE_FALSIFIED).",
      "note": "Confirmed root cause (SPIKE-HSX-STRATEGY0-0URLS Finding 2): fetchMediafileUrls() hardcodes pageIndex=1 (no pagination — older filings live on pages 2+, hsx.vn totalPages=4 for FPT back to 2015) AND exact-match filter fileType !== \".pdf\" drops legacy \"application/pdf\" MIME-typed older entries (apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts:328-330 + :358). TURNKEY REVIVAL = 2 additive changes in fetchMediafileUrls() ONLY: (a) paginate pageIndex up to paging.totalPages (bounded cap ~5); (b) accept both \".pdf\" and \"application/pdf\". SEPARATE deliberate decision required (architect+PO): widen bctcQueueEnricherJob SELECT arms to match status='deferred_infra' AND source_url IS NULL within a bounded hsx.vn coverage window — queue-policy change, NOT a bug fix; do NOT bundle into the fetcher fix. Covers ~293 static deferred_infra rows from FIX-BCTC-VPS-QUEUE-STALE-TRIAGE (2026-06-08, predates 06-16 incident)."
    }
  else . end
))

# --- (b) mint the cheap loop-closer verification task ---
| .task_board.backlog += [{
    "id": "VERIFY-BCTC-STRATEGY0-QUARTER-PARAM-CONTRACT",
    "type": "FIX",
    "status": "TODO",
    "priority": "low",
    "size": "S",
    "zone": "apps/mcp-server/",
    "created_at": $now,
    "title": "Confirm HSX Strategy-0 false '0 URLs' = ops-recon test-harness type bug (quarter:4 numeric vs required 'Q4' string) + add durable guard",
    "note": "Loop-closer for the falsified ops recon 'RECON-BCTC-ENRICH-0ROWS' 0-URLs claim (SPIKE-HSX-STRATEGY0-0URLS = PREMISE_FALSIFIED). Deliverable: (1) re-run discoverHosePdfUrls/fetchHsxBctcUrls with quarter:'Q4' (string) AND quarter:4 (number) side-by-side to confirm numeric -> quarterToMonthPrefix .toUpperCase() TypeError -> silent [] degradation (hsxBctcFetcher.ts:264, try/catch L335-379) is the root, ruling out a transient hsx.vn WAF blip; (2) add a small regression test asserting the quarter-must-be-string contract (numeric input surfaces, does NOT silently degrade to []); (3) append a one-line SUPERSEDED stamp to docs/agent-memory/notebooks/ops.md RECON-BCTC-ENRICH-0ROWS section pointing to the SPIKE verdict so the falsified '0 URLs'/'not HOSE-listed' claims are not re-escalated. NO production behaviour change beyond the guard. Files: apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts, apps/mcp-server/src/domain/services/bctcDiscovery.ts. Minted by PO (router-dispatched) from SPIKE-HSX-STRATEGY0-0URLS decision."
  }]

# --- (a) durable decision_journal guard: retire superseded framing + record (b)/(c) ---
| .decision_journal += [{
    "agent": "po",
    "task_id": "SPIKE-HSX-STRATEGY0-0URLS",
    "timestamp": $now,
    "decision": "3-part sprint decision on the router-verified SPIKE (PREMISE_FALSIFIED — HSX Strategy-0 is NOT broken for current/recent quarters; live re-test of unmodified prod fetchHsxBctcUrls/discoverHosePdfUrls returned valid PDF URLs for all 8 named tickers at Q4-2025/Q1-2026, corroborated by the same-day architect brief). (a) RETIRE the superseded 'Strategy-0 0-URLs = PRIMARY dead-pipeline root' framing for the 06-16 incident: NO live actionable task exists to close — the framing lived only in the router head (already SUPERSEDED) and the done_verified SPIKE item (spike_verdict=PREMISE_FALSIFIED). The 06-16 actionable backlog is ALREADY done_verified (FIX-BCTC-ENRICHER-STUCK-BACKLOG + FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD). GUARD: downstream dev-team planning MUST NOT re-mint a Strategy-0 current-quarter discovery fix. (b) MINTED cheap loop-closer VERIFY-BCTC-STRATEGY0-QUARTER-PARAM-CONTRACT (FIX/S/low, backlog TODO) — confirm the numeric-quarter type-mismatch, add a durable guard test, and supersede the ops.md RECON false claim. (c) Historical ~293-row deferred_infra backfill = KEEP DEFERRED (discretionary feature, not an incident; current quarters work; active Q2-2026 earnings window). Folded the SPIKE's confirmed root cause + turnkey revival scope + the separate SELECT-arm queue-policy dependency into the existing DEFERRED BCTC-ENRICHER-OLD-QUARTERS (no new row — no-duplication).",
    "what_considered": "(a) mint a new 'retire framing' task — rejected: no live task to retire; the decision_journal guard is the durable record future planning reads. (b) mint vs skip — chose mint as a cheap S loop-closer to permanently kill the false signal (ops.md still asserts '0 URLs'/'not HOSE-listed') and leave a regression guard; skipping risks re-escalation by a future auditor cycle (feedback_auditor false-positive recurrence class). (c) mint an M fetcher+policy fix now — rejected as discretionary non-incident during an active earnings window; upgraded the existing DEFERRED item's precision instead so revival is turnkey.",
    "why_change": "Router-dispatched sprint decision on done_verified SPIKE-HSX-STRATEGY0-0URLS (commit eac9a3c16); supersedes the prior 'Strategy-0 0-URLs is PRIMARY dead-pipeline root' framing, which traced to the same falsified ops recon (quarter:4 numeric probe bug)."
  }]
