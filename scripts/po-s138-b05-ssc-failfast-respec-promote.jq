# po-s138-b05-ssc-failfast-respec-promote.jq
# ---------------------------------------------------------------------------
# Single-task RE-SPEC + PROMOTE (idempotent): correct an INVERTED backlog-row
# spec, then promote backlog[] -> ready[] for the router to dispatch.
#
# Origin 2026-07-03 (po-s138), dev-team :07 PO triage tick. WIP=0, main free.
# The backlog row B-05-FU-SSC-503-RETRY carried an INVERTED spec ("add 1 retry
# + 60s backoff in _ssc_curl_search()") that DIRECTLY CONTRADICTS the B-05 RECON
# RAW-verified root cause: the SSC-503 fallback's ~60s blocking retry loop
# EXCEEDS mcp-server's ~5s discovery timeout -> discovery silently returns []
# -> ~328 queue items frozen in deferred_infra. Shipping the row as-written
# would ADD the very 60s-blocking behavior that freezes the queue. The correct
# fix is the OPPOSITE: BOUND the SSC curl to fail-fast STRICTLY UNDER the caller
# timeout (lesson: bounded fetch < caller timeout). This corrects the row in
# place and promotes it so dev-vps-crawls implements the right thing.
#
# Reusable pattern for "a backlog row's spec is semantically inverted vs the
# RAW-verified root cause — rewrite status_note/files_hint/acceptance in place,
# stamp scope_corrected + prior_spec, and promote backlog->ready".
#
# Idempotent: no-op if the id already sits in ANY non-backlog lane.
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s138-b05-ssc-failfast-respec-promote.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push
#  timer pushes. Provenance "po (router-dispatched)" — no session UUID.)
# ---------------------------------------------------------------------------

def is(id): (type == "object") and (.id == id);

("B-05-FU-SSC-503-RETRY") as $tid
| ( [ .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
      .task_board.done[]?, .task_board.done_verified[]? ]
    | map(select(type == "object") | .id)
    | index($tid) ) as $already
| if $already != null then .
  else
    ( [ .task_board.backlog[]? | select(is($tid)) ] ) as $rows
    | if ($rows | length) == 0 then .
      else
        ( $rows[0] + {
            status: "READY",
            size: "S",
            next_agent: "dev-vps-crawls",
            route_to: "dev-vps-crawls",
            promoted_at: $now,
            promoted_by: "po (router-dispatched)",
            scope_corrected: true,
            prior_spec: "INVERTED — original status_note asked to ADD 1 retry + 60s backoff in _ssc_curl_search(); that ~60s blocking loop is the FREEZE CAUSE (exceeds mcp ~5s discovery timeout), not a hardening.",
            status_note: "RE-SCOPED per B-05 RECON RAW-verified root cause: the SSC-503 fallback blocking retry (~60s) EXCEEDS mcp-server ~5s discovery timeout -> discoverHosePdfUrls silently returns [] -> ~328 queue items frozen in deferred_infra. FIX: in _ssc_curl_search() step1 of the VPS discover script, bound the SSC curl with a hard wall-clock cap STRICTLY UNDER the mcp discovery timeout (e.g. curl --max-time 4; confirm the exact caller value from apps/mcp-server first) and REMOVE the 60s retry/backoff loop; on 503/timeout return None FAST so discovery returns [] within the caller budget (honest fast-fail, NOT silent hang). This UNFREEZES the queue lifecycle (items get a proper 'no URLs' terminal/retry instead of frozen-deferred_infra). It does NOT restore discovery SUCCESS for HOSE tickers — that is the separate PRIMARY root (HSX Strategy-0 returns 0 URLs), which needs a focused SPIKE (see NEXT). Lesson: bounded fetch < caller timeout (feedback_graceful_degrade_needs_bounded_fetch).",
            files_hint: "VPS discover script _ssc_curl_search() (vps-crawls: discover-bctc-urls-browser.py / the ssc curl-search fetcher). Read the mcp-server discovery-timeout value from the caller path in apps/mcp-server to set --max-time strictly under it.",
            acceptance: "_ssc_curl_search() returns within <5s on a simulated 503/timeout; discoverHosePdfUrls returns [] fast (no silent hang past the caller timeout); an affected queue item transitions OUT of deferred_infra to a proper no-URLs terminal/retry state."
          } ) as $promoted
        | .task_board.backlog |= map(select(is($tid) | not))
        | .task_board.ready = ((.task_board.ready // []) + [$promoted])
      end
  end
