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

## c · 2026-06-08T19xxZ — Triage tick (task:po-triage-20260608): dup-key merge + DEPGUARD activate + CI-bridge UNBLOCK

**Drained 8 signals + 1 signal_queue NEW row. Board mutated atomic temp→rename.**
- **SSOT dup-key merge.** active_sprints had 2 CI-RED-RECONCILE entries (idx24 `id=`, 6 tasks; idx25 `sprint_id=`, 2 dev REVIEW tasks). Per feedback_ssot_duplicate_key, idx25's REVIEW status for FIX-MCP-TOOL-COUNT-DRIFT + FIX-MCP-CI-NETWORK-GUARD was masked behind idx24's stale TODO. Merged into idx24 (both → REVIEW), deleted idx25. 26→25 sprints.
- **CI status reconcile.** origin/main=8ffb1985; local +3 commits all chore/memory/cowork (NO code). All 4 CI fixes (FIX-MCP-* , FIX-MACRO-GO, FIX-TA-GOLANGCI) = fixed-LOCAL-unpushed → HELD at REVIEW. Verification gate (green ci.yml on sha!=8ffb1985) UNMET → NO DONE flip. Need ops push.
- **FIX-TA-SANDBOX-DEPGUARD → IN_PROGRESS** (was backlog TODO; dedup found it — NOT new). cmd/sandbox/main.go:44 imports pkg/infrastructure (Fence-C). Surfaced after FIX-TA-GOLANGCI-CONFIG-V2 removed v1 parse-error mask → real debt the v1 config hid. The only net-new dev work for go-lint green.
- **CI-HEALTH-FIX-BRIDGE → UNBLOCK** (brief READY). Route agent-father (4 flow/md edits) + developer (scripts/agents-flow/ci-health-probe.js). Institutionalizes user Message-4 (auto-detect CI RED in dev-team flow). Encodes STALE-RUN GATE / 3-layer DEDUP / VERIFICATION GATE / SAFE-JSON.
- **Skipped/judged:** bctc-analyst+BATCH_RELEASE escalation (CTG cycle25+, 6 tickers empty-despite-stored-PDF) = recurring re-escalation → HELD as pendingObservation for next-tick architect SPIKE (WIP at cap; new nuance = current-Q stored PDFs not picked up by refine, distinct from DEFERRED historical backfill). FPT routine = informational skip. context-bloat×3 = janitor notebook trim ≤200L. cowork tick = skip. sau-c118-cron-crash (CRITICAL) → TRIAGED, TRANSIENT (single crash, 1 run), WATCH for 2nd.

**WIP post-tick = 2 (DEPGUARD + ci-health-probe.js) — at cap.**

## Carry-over
- CI sign-off blocked on ops push: after DEPGUARD + the 4 REVIEW fixes are all local-green, ops pushes → read next ci.yml run on new sha → THEN flip DONE. Local green ≠ DONE.
- pendingObservation: bctc current-Q stored-PDF-not-extracted → architect SPIKE next tick (recurring-bug, not point-patch).
- WATCH: vnstockFundamentalsRefresh — 2nd crash next auditor tick → FIX (recurring), zone dev-mcp-server.
- Journal: docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-po.md (steps po-S1..S6).
