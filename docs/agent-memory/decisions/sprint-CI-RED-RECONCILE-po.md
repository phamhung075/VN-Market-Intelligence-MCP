# Sprint: CI-RED-RECONCILE (po agent)

## Context
ops landed PUSH-CI-FIX-TO-REMOTE (HEAD 9f063c9a → origin/main; dd79f811 FIX-CI-LINT-STACK verified in pushed set). Fresh run 27153704278 now validates fresh code: original lint fix proved out (5 Go lints + py-lint PASS, kinh-dich-ts-lint job deleted). TWO residuals visible on fresh code: GO-VERSION-class lint failures (2 jobs) + bun-test external-source failures. PO triages, resolves BUN-TEST-CI-GATE, opens GO-VERSION task(s), dedups, journals.

## Decision Journal

### STEP po-S1: Resolve BUN-TEST-CI-GATE (gate-clear → scope atomic FIX) (2026-06-08T17:17Z)
**task_id:** BUN-TEST-CI-GATE
- **what-done:** Gate dependency PUSH-CI-FIX-TO-REMOTE landed → gate unblocked. Pulled fresh-run failed log (run 27153704278) and classified the bun-test failures into two disjoint classes.
- **what-considered:**
  - Path A — close NOOP (stale-run artifact): REJECTED. bun test is RED on FRESH code, not stale.
  - Path B — one blanket "fix all bun failures" dev task: REJECTED (conflates two unrelated root causes; violates atomic-FIX).
  - Path C (CHOSEN) — split by root cause: (1) external-source network class → CI-environment flakiness (network-guard/skip-in-CI), (2) 123-integration-mcp count drift → genuine regression, singled out per router instruction.
- **why-decision:** Log evidence is decisive. The yahoo/sbv/insider/news failures all share the signature "live external source returns null/0 in CI sandbox" (network-blocked) — env flakiness, not logic. The 123-integration-mcp failure is at line 867 `expect(toolNames.length).toBeGreaterThanOrEqual(16)` → Received 15; ALL 14 named `toContain` core-tool assertions PASSED. So the count dropped because a NON-enumerated registered tool was removed — a real in-process `_registeredTools` registry drift, NOT network. Two root causes → two scopes.
- **why-change:** BUN-TEST-CI-GATE itself RESOLVED (its spike job — read fresh run, isolate real assertion, scope FIX — is complete). Spawned children: FIX-MCP-TOOL-COUNT-DRIFT (real) + folded network class into FIX-MCP-CI-NETWORK-GUARD. Dedup note: network-guard overlaps existing FIX-MCP-SUITE-HEALTH-BASELINE (TODO) — see po-S3.

### STEP po-S2: GO-VERSION residual — diagnose root cause BEFORE assigning (2026-06-08T17:17Z)
**task_id:** GO-VERSION-MISMATCH (diagnosis)
- **what-done:** Compared all 6 services' go.mod `go`/`toolchain` directives + each job's golangci-lint config + pulled the actual exit-3 error line for BOTH failing jobs.
- **what-considered:**
  - Hypothesis A — global ci.yml setup-go regression: REJECTED. ci.yml uses per-service `go-version-file: apps/<svc>/go.mod`; 4 of 6 services pass. Not a workflow-wide bug.
  - Hypothesis B — both failures = same "go1.24 < go1.25" cause (ops journal claim): REJECTED after reading raw logs. The two jobs fail for DIFFERENT reasons.
- **why-decision:** Raw log proves two distinct root causes:
  1. **macro-indicators** (`Macro Indicators Go Lint`): `Error: can't load config: the Go language version (go1.24) used to build golangci-lint is lower than the targeted Go version (1.25.0)`. macro-indicators/go.mod declares `go 1.25.0` — the ONLY service that over-declares (other 5 = `go 1.22`). golangci-lint v2.0.2 binary is built with go1.24 → exit 3. ROOT CAUSE = go.mod over-declaration vs repo standard. ZONE FIX (not ci.yml): align `go 1.25.0` → `go 1.22`. Owner: dev-macro-indicators.
  2. **technical-analysis** (`go-lint`): `Error: can't load config: unsupported version of the configuration: ""`. apps/technical-analysis/.golangci.yml is the ONLY one of 6 MISSING the `version: "2"` field (other 5 all have it); golangci-lint v2.0.2 requires it → exit 3. This is NOT a go-version issue at all — it is a v1→v2 config-migration miss left over from FIX-CI-LINT-STACK (which bumped the action to v7/golangci v2 but didn't migrate this one config). ZONE FIX: add `version: "2"`. Owner: dev-technical-analysis.
- **why-change:** Renamed the umbrella from one "GO-VERSION-MISMATCH" task into TWO atomic single-zone FIX tasks (different owners, different files, no shared commit) — FIX-MACRO-GO-DIRECTIVE + FIX-TA-GOLANGCI-CONFIG-V2. Neither is a ci.yml/workflow change; both are config alignment to the existing repo standard. NOT cross-service.

### STEP po-S3: Dedup + WIP + escalation check (2026-06-08T17:17Z)
**task_id:** CI-RED-RECONCILE (sprint-level)
- **what-done:** Cross-checked the 4 new tasks against board backlog; checked in_progress count vs WIP; ran recurring-bug rule.
- **what-considered / decisions:**
  - DEDUP: FIX-MCP-CI-NETWORK-GUARD overlaps FIX-MCP-SUITE-HEALTH-BASELINE (TODO, po, apps/mcp-server — "classify standing bun-test baseline 40 fail / 848 pass, define green baseline"). DECISION: keep them separate but LINK — NETWORK-GUARD is the CI-specific subset (guard live-source tests so ci.yml goes green); SUITE-HEALTH-BASELINE is the broader local-baseline definition. NETWORK-GUARD is the CI-blocking atomic slice; SUITE-HEALTH stays as the umbrella. Annotated cross-ref in both task notes.
  - WIP: in_progress = 0 → all 3 new dispatchable FIX tasks fit under cap. No throttle needed.
  - ESCALATION: recurring-bug rule (2+ commits same module → architect) does NOT fire. This is the FIRST fresh-code run. FIX-CI-LINT-STACK was the only prior CI commit (different defect: action version + ts-lint deletion). The TA golangci config miss is a LEFTOVER of that same fix, not a re-occurrence on a re-fixed module. No architect.
- **why-decision:** Atomic, single-zone, owner-clear fixes; no design needed; WIP-safe; no recurring-bug trigger.
- **why-change:** no change from plan.

## VERIFICATION GATE
Each fix proves out ONLY on a GREEN ci.yml run after a subsequent push. Local green ≠ done. After dev-* lands all 3 fixes locally → ops pushes → read next ci.yml run → only then mark DONE. Local-only fixes do not count.

## References
- Fresh run: https://github.com/phamhung075/VN-Market-Intelligence-MCP/actions/runs/27153704278
- ops journal: docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-ops.md
- macro go.mod: apps/macro-indicators/go.mod (`go 1.25.0`, outlier)
- TA config: apps/technical-analysis/.golangci.yml (missing `version: "2"`)
- drift assertion: apps/mcp-server/src/__tests__/123-integration-mcp.test.ts:867
