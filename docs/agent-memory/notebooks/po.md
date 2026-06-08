# PO Notebook

## c · 2026-06-08T17:17Z — CI-RED-RECONCILE: gate resolved, 2 residuals scoped on FRESH code

**Trigger:** ops landed PUSH-CI-FIX-TO-REMOTE (HEAD 9f063c9a → origin; dd79f811 verified pushed). Fresh run 27153704278 validates fresh code. Original lint fix proved out: 5 Go lints + py-lint PASS, kinh-dich-ts-lint job deleted. PO resolves BUN-TEST-CI-GATE + triages 2 residuals.

**Decisions (board mutated atomic temp→rename; sprint active_sprints[24]):**
- **PUSH-CI-FIX-TO-REMOTE → DONE.** **BUN-TEST-CI-GATE → DONE** (spike complete; NOT noop — RED on fresh code).
- Split bun-test RED by root cause (read raw failed log, not blanket fix):
  - **FIX-MCP-TOOL-COUNT-DRIFT** (dev-mcp-server, XS, apps/mcp-server/) — 123-integration-mcp:867 `>=16`→Received 15. All 14 named toContain PASS → a non-enumerated registered tool dropped. GENUINE drift, not network. Test counts LOCAL `_registeredTools`, not gateway-146. Owner verifies real count → fix assertion (intentional removal) OR restore tool (accidental break).
  - **FIX-MCP-CI-NETWORK-GUARD** (dev-mcp-server, S, apps/mcp-server/) — yahoo(8)+yahoo-ext(3)+sbv(10+)+insider(2)+news-rag(2) = live sources null/0 in CI sandbox = ENV flakiness. Guard/skip-in-CI/mock. LINK: CI-subset of FIX-MCP-SUITE-HEALTH-BASELINE (keep separate, cross-ref).
- GO-VERSION residual — diagnosed BEFORE assigning; raw log shows TWO DISTINCT causes (ops journal wrongly merged them):
  - **FIX-MACRO-GO-DIRECTIVE** (dev-macro-indicators, XS) — go.mod `go 1.25.0` (sole over-declarer; others go 1.22) > golangci v2 builder go1.24. Align to `go 1.22`.
  - **FIX-TA-GOLANGCI-CONFIG-V2** (dev-technical-analysis, XS) — `.golangci.yml` MISSING `version:"2"` (only 1 of 6); golangci v2.0.2 rejects v1 config. CONFIG-migration leftover from FIX-CI-LINT-STACK, NOT go-version. Add `version:"2"`.

**Dedup/WIP/escalation:** in_progress=0 → all 3 dispatchable fixes fit cap. Recurring-bug rule does NOT fire (first fresh-code run; TA config is a leftover of the lint fix, not a re-occurrence). No architect.

**Verification gate:** every fix proves out ONLY on GREEN ci.yml after a subsequent push. Local green ≠ DONE. After dev-* land → ops pushes → read next run → then DONE.

## Carry-over
- All 3 FIX tasks are parallel-safe (distinct zones). Main terminal: spawn dev-mcp-server (2 tasks, same zone — sequence), dev-macro-indicators, dev-technical-analysis. After all land → ops push → PO reads next ci.yml run for sign-off.
- 123-integration drift: owner must verify LOCAL registry count, not trust the gateway 146 surface.
- Journal: docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-po.md (steps po-S1..S3).
