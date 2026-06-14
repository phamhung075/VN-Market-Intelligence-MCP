# po-s54-vmt8-graceful-failclose-triage.jq
# VN-MACRO-TOOLING /goal#1 BEST-RESULT resilience gap (router F2, dev-team tick
# 20260615T0036Z). Code fix actionable NOW, independent of the F1 VPS-proxy incident.
#
# ROOT CAUSE (PO RAW-verified at code level, NOT the router badge):
#   The 4 Zone-A macro endpoints (trade-balance / bop / macro-indicators / cpi-components)
#   return HTTP 500 opaque error on upstream-fetch failure. The handlers in
#   pkg/interface/http/handlers_vmt_{trade,bop,macro,cpi}.go all do:
#       resp, err := uc.Execute(...); if err != nil { WriteHeader(500); ... }
#   and their use-case error builders (errorTradeResponse / errorBOPResponse /
#   errorMacroResponse / errorCPIResponse in pkg/application/usecases_vmt_*.go) ALL
#   return `..., fmt.Errorf(...)` — a NON-NIL error — so the handler emits a 500.
#   NOTE: errorLiquidityResponse ALSO returns a non-nil error (same latent bug); the
#   reason /liquidity-state currently serves a graceful 200 in the live incident is that
#   its providers read LOCAL market.db (not geo-blocked), so its Execute hits the happy
#   path. The DOCUMENTED intent (handlers_vmt_liquidity.go docstring + per-bloc
#   IsEstimate/BlockedReason fail-closed fields) is graceful-degrade; the error PATH
#   does not honor it. This is a generic resilience gap across ALL 5 endpoints.
#
# FIX (mirror the INTENDED liquidity fail-close pattern, /goal#2 one pattern for all):
#   On upstream-fetch failure, return a POPULATED response with HTTP 200, Status="degraded"
#   (or "estimate"), per-bloc IsEstimate=true + BlockedReason naming the unreachable source,
#   and a NIL error from Execute — so the thin HTTP handler emits 200, never opaque-500.
#   Transient upstream failures (even after the proxy is restored) must degrade HONESTLY.
#
# Single idempotent mutation: APPEND VMT-8-MACRO-GRACEFUL-FAILCLOSE to .task_board.backlog
# ONLY if its id is absent in ANY board array. Router dispatches from backlog (PO never
# stages orch-state — EDIT in place, RETURN BATCH to router).
#
# Usage:
#   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
#   jq --arg now "$NOW" -f scripts/po-s54-vmt8-graceful-failclose-triage.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp \
#      && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#      && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   # commit by EXPLICIT PATH only — and only the ROUTER stages orch-state.

def board_arrays: [.task_board.ready, .task_board.backlog, .task_board.in_progress,
                   .task_board.review, .task_board.done, .task_board.done_verified];

def id_present($id):
  ([ board_arrays[] // [] | .[]? | select(.id == $id) ] | length) > 0;

("VMT-8-MACRO-GRACEFUL-FAILCLOSE") as $tid
| if id_present($tid) then .
  else
    .task_board.backlog += [{
      "id": $tid,
      "type": "FIX",
      "title": "Macro endpoints graceful fail-close — return 200 + is_estimate=true + per-bloc blocked_reason on upstream-fetch failure instead of opaque HTTP 500",
      "desc": "VN-MACRO-TOOLING /goal#1 BEST-RESULT resilience gap (router F2). The 4 Zone-A macro endpoints (POST /trade-balance, /bop, /macro-indicators, /cpi-components) return HTTP 500 with an opaque error whenever the upstream NSO/SBV fetch (VPS-proxied, currently dark per F1) fails, instead of degrading honestly the way /liquidity-state is DOCUMENTED to. This is a resilience defect that persists even after the proxy is restored: any transient upstream failure must degrade gracefully, never opaque-500. GENERIC across all endpoints (/goal#2 — ONE fix pattern, mirror the intended liquidity fail-close).",
      "zone": "apps/macro-indicators/",
      "owner": "dev-macro-indicators",
      "status": "BACKLOG",
      "priority": "P1",
      "size": "S",
      "market_independent": true,
      "weekend_safe": true,
      "independent_of_F1": true,
      "root_cause": "PO RAW-verified at code level: handlers_vmt_{trade,bop,macro,cpi}.go each do `resp, err := uc.Execute(...); if err != nil { w.WriteHeader(http.StatusInternalServerError); encode(resp); return }`. The use-case error builders errorTradeResponse / errorBOPResponse / errorMacroResponse / errorCPIResponse (pkg/application/usecases_vmt_{trade,bop,macro,cpi}.go) ALL return their populated degraded DTO TOGETHER WITH a non-nil `fmt.Errorf(...)`. Because Execute returns a non-nil error, the thin handler discards the carefully-populated fail-closed DTO and emits an opaque 500. errorLiquidityResponse has the SAME non-nil-error shape (same latent bug) — /liquidity-state only looks graceful in the live incident because its providers read local market.db (not geo-blocked) and hit the happy path; its error path would also 500.",
      "fix_spec": "Mirror the INTENDED liquidity fail-close pattern across ALL 5 macro use-cases. On UPSTREAM-FETCH failure (vpsFetch / NSO-Excel / SBV-HTML provider error or parse failure) — as distinct from a true programming/wiring fault (nil provider) — Execute MUST return (populatedDegradedResponse, nil): Status set to a non-error degraded value (e.g. \"degraded\" / \"estimate\"), every bloc IsEstimate=true, and each affected bloc's BlockedReason naming the unreachable source per bloc (e.g. \"NSO customs Excel unreachable via VPS proxy 125.212.251.27:3128\"). The thin HTTP handlers then emit HTTP 200 with the honest degraded payload. KEEP the nil-provider/wiring-fault path returning a real error -> 500 (that is a genuine internal fault, not a degrade-able upstream gap). Apply uniformly so /liquidity-state's error path is also hardened (not just the 4 dark ones). Do NOT special-case any single endpoint — one shared pattern.",
      "generic_mandate": "/goal#2 — one fix pattern for ALL macro endpoints. Refactor the shared shape (e.g. a common 'degrade vs hard-fail' decision: upstream-fetch/parse failure => degraded+nil; nil-provider/wiring => error) rather than copy-pasting per endpoint. Cover liquidity/trade/bop/macro/cpi. The PERMANENT is_estimate invariants already encoded (IRS DD-6, Interbank1W Decision B, VMT-1b bloc_split, VIRA/VARA) MUST be preserved — never flip a permanent is_estimate=true to false.",
      "verification_gate": "(G1) Unit test per use-case: inject an upstream-fetch/parse failure into the provider and assert Execute returns (resp, nil) with Status!=error, every bloc IsEstimate=true, and BlockedReason populated naming the source — NOT an error. (G2) Unit test the handler path: on the degraded use-case return, assert HTTP 200 (not 500) and the JSON body carries is_estimate=true + blocked_reason. (G3) Regression: nil-provider/wiring fault STILL returns error -> HTTP 500 (genuine-fault path preserved). (G4) Permanent-estimate invariants intact (IRS/Interbank1W/bloc_split/VIRA never flipped to false). (G5) LIVE proof while F1 proxy is still dark OR via a forced-failure fixture: curl POST each of /trade-balance /bop /macro-indicators /cpi-components -> HTTP 200 + is_estimate=true + blocked_reason naming the unreachable upstream (NOT 500). QA verifies LIVE raw payload, never badges. `go test ./...` GREEN BEFORE any ops rebuild (RED-PREPUSH). go vet / gofmt clean.",
      "mirrors_pattern_in": ["apps/macro-indicators/pkg/interface/http/handlers_vmt_liquidity.go", "apps/macro-indicators/pkg/application/usecases_vmt_liquidity.go"],
      "files": [
        "apps/macro-indicators/pkg/application/usecases_vmt_trade.go",
        "apps/macro-indicators/pkg/application/usecases_vmt_bop.go",
        "apps/macro-indicators/pkg/application/usecases_vmt_macro.go",
        "apps/macro-indicators/pkg/application/usecases_vmt_cpi.go",
        "apps/macro-indicators/pkg/application/usecases_vmt_liquidity.go",
        "apps/macro-indicators/pkg/interface/http/handlers_vmt_trade.go",
        "apps/macro-indicators/pkg/interface/http/handlers_vmt_bop.go",
        "apps/macro-indicators/pkg/interface/http/handlers_vmt_macro.go",
        "apps/macro-indicators/pkg/interface/http/handlers_vmt_cpi.go",
        "apps/macro-indicators/pkg/interface/http/handlers_vmt_liquidity.go"
      ],
      "baseline_pass": false,
      "depends_on": [],
      "blocks": [],
      "serialization_note": "Zone-A files (usecases_vmt_*.go) are under the VN-MACRO-TOOLING serialization guard (one dev-macro-indicators task at a time, merge-gate between). With WAVE-2 Zone-A serial chain A1-A5 now CLOSED, this fix can run as a single serial dev-macro-indicators task with no concurrent Zone-A writer. Recurring-bug escalation applies if a 2nd touch lands on the same usecases_vmt_*.go file.",
      "created_at": $now,
      "created_by": "po",
      "source": "router dev-team tick 20260615T0036Z finding F2 (/goal#1 best-result gap); PO RAW-verified root cause in handlers_vmt_*.go + usecases_vmt_*.go"
    }]
  end
