# po-qa-frontend-coverage-warn-fix-mint.jq
#
# Idempotent MINT of the {check_id}-FIX fix-tasks for the WARN checks surfaced by
# the 2026-07-24 quality-audit frontend page-coverage expansion
# (scripts/gen-frontend-page-checks.mjs). Each WARN in quality-checklist.json →
# one FIX row → .task_board.backlog[], owner = zone_owner (dev-frontend),
# status_note AC = "{check_id} re-check returns PASS".
#
# ID-GUARDED: skips any id already present in ANY board lane → re-run mints 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-qa-frontend-coverage-warn-fix-mint.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# Collect every id already present across all lanes (idempotency guard).
( [ .task_board.backlog, .task_board.ready, .task_board.in_progress,
    .task_board.review, .task_board.qa, .task_board.done,
    .task_board.done_verified, .task_board.archive ]
  | map(.[]?.id) | flatten ) as $existing
|
( [
    { check_id: "FE-PG-BCTC-EVAL-_INDEX-FUNC",
      priority: "P1",
      title: "Fix /dashboard/bctc-eval HTTP 500 — loader throws on upstream /api/bctc-eval 404 instead of rendering a recoverable Card (user-visible broken page)",
      note: "Quality-audit frontend page-coverage 2026-07-24 (FE-PG-BCTC-EVAL-_INDEX-FUNC, FAIL — LIVE probe). SYMPTOM: GET /dashboard/bctc-eval returns HTTP 500 (root error boundary 'Something went wrong'); the eval scorecard list never renders. ROOT CAUSE: the loader fetches /api/bctc-eval which returns HTTP 404 ({\"error\":\"Not found\",\"path\":\"/api/bctc-eval/\"}) and THROWS, violating the route's own JSDoc contract ('show Card with API error, do NOT throw'). TRIAGE HINT (verify, do not assume): determine whether the frontend proxy forwards a trailing slash the mcp-server route rejects (path shows '/api/bctc-eval/') OR the mcp-server GET /api/bctc-eval handler is unregistered — escalate to dev-mcp-server if server-side. Also closes the same-root-cause NEEDS_REVIEW rows FE-PG-BCTC-EVAL-_INDEX-{FRESH,OBS,DEGR,CORR} + FE-PG-BCTC-EVAL-$REPORTID-FUNC. AC: FE-PG-BCTC-EVAL-_INDEX-FUNC re-check returns PASS (GET /dashboard/bctc-eval → 200 + eval table renders)." },
    { check_id: "FE-PG-_INDEX-FRESH",
      title: "Add page-level freshness/staleness indicator to /dashboard (Market Overview) — CHEF digest shows only per-dish timestamps, no page-level stale flag",
      note: "Quality-audit frontend page-coverage 2026-07-24 (FE-PG-_INDEX-FRESH, WARN). GAP: dashboard._index (market overview front page) renders only per-dish ClientTimestamp; there is no <FreshnessBadge> / page-level staleness SLA, so a stale synthesis feed is not flagged. Ref: project_frontend_freshness_transparency. AC: FE-PG-_INDEX-FRESH re-check returns PASS (page-level 'data as of' + stale indicator visible)." },
    { check_id: "FE-PG-BCTC-FRESH",
      title: "Flag stale reports on /dashboard/bctc (Financial Reports hub) — per-item updated_at shown but old reports not visually flagged as stale",
      note: "Quality-audit frontend page-coverage 2026-07-24 (FE-PG-BCTC-FRESH, WARN). GAP: dashboard.bctc renders generated_at + per-item updated_at (recency visible) but no <FreshnessBadge> / stale flag on the report list, so an old brief is not visually flagged. Ref: project_frontend_freshness_transparency. AC: FE-PG-BCTC-FRESH re-check returns PASS (stale reports visually flagged on the hub)." },
    { check_id: "FE-PG-INTEL-FRESH",
      title: "Add page-level freshness/staleness indicator to /dashboard/intel (AI Bulletin Hub) — only per-item timestamps, no page-level stale flag",
      note: "Quality-audit frontend page-coverage 2026-07-24 (FE-PG-INTEL-FRESH, WARN). GAP: dashboard.intel renders only per-item ts (ClientTimestamp); no <FreshnessBadge> / page-level staleness SLA on the AI bulletin hub, so old bulletins are not flagged as stale. Ref: project_frontend_freshness_transparency. AC: FE-PG-INTEL-FRESH re-check returns PASS (page-level freshness/staleness indicator visible)." }
  ]
  | map(
      . as $w
      | {
          id: ($w.check_id + "-FIX"),
          type: "FIX",
          title: $w.title,
          status: "BACKLOG",
          priority: ($w.priority // "P2"),
          size: "S",
          zone: "apps/frontend/",
          sprint: "QUALITY-AUDIT-FRONTEND-COVERAGE",
          source: "quality-audit-frontend-page-coverage-20260724",
          owner: "dev-frontend",
          next_agent: "dev-frontend",
          check_id: $w.check_id,
          status_note: ($w.check_id + " re-check returns PASS"),
          note: $w.note,
          created_at: $now,
          created_by: "po"
        }
    )
  | map(select(.id as $id | ($existing | index($id)) | not))
) as $new_rows
|
.task_board.backlog += $new_rows
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
