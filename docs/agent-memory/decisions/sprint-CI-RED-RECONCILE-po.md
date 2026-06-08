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

### STEP po-S4: Triage tick 20260608T19xxZ — board hygiene merge + status reconcile + DEPGUARD activate (2026-06-08)
**task_id:** CI-RED-RECONCILE (sprint-level) + triage_key task:po-triage-20260608
- **what-done:**
  1. **SSOT dup-key merge.** `.task_board.active_sprints` had TWO entries logically keyed CI-RED-RECONCILE (index 24 `id=CI-RED-RECONCILE`, 6 tasks, rich PO history; index 25 `sprint_id=CI-RED-RECONCILE`, 2 tasks, dev REVIEW notes). Per feedback_ssot_duplicate_key (last-key-wins masks writes), the dev-team's REVIEW status + fix descriptions for FIX-MCP-TOOL-COUNT-DRIFT and FIX-MCP-CI-NETWORK-GUARD were hidden behind entry-24's stale TODO. Merged: absorbed entry-25's 2 task descriptions into entry-24's matching tasks, flipped both TODO→REVIEW, then deleted entry 25. Result: 26→25 sprints, 1 CI-RED-RECONCILE entry, all 6 tasks present.
  2. **CI status reconcile (verification gate).** RAW-VERIFIED: origin/main HEAD = 8ffb1985; local only 3 commits ahead, all chore(memory)/chore(cowork) — NO code pushed. Therefore the 4 CI fix tasks (FIX-MCP-TOOL-COUNT-DRIFT, FIX-MCP-CI-NETWORK-GUARD, FIX-MACRO-GO-DIRECTIVE, FIX-TA-GOLANGCI-CONFIG-V2) are fixed-LOCAL-but-UNPUSHED → stay REVIEW. NOT prematurely REVIEW: code is genuinely done locally per their decision journals; the gate that's unmet is "GREEN ci.yml on a sha != 8ffb1985", which needs an ops push. NO DONE flip.
  3. **FIX-TA-SANDBOX-DEPGUARD activated.** go-lint job RED on 8ffb1985 = cmd/sandbox/main.go:44 imports pkg/infrastructure (Fence-C depguard). Task ALREADY existed (backlog, created 2026-06-07T21:25:56Z) — NOT a new task (router context said "no task" but dedup found it). Surfaced now because FIX-TA-GOLANGCI-CONFIG-V2 migrated TA config to v2, removing the v1 parse-error mask. Real tracked debt; our config fix is correct (it revealed the debt). Activated TODO→IN_PROGRESS, priority→high. This is the net-new dev work needed for go-lint green.
- **what-considered:**
  - Flip FIX-MCP-*/FIX-MACRO/FIX-TA-GOLANGCI → DONE now: REJECTED (verification gate hard — no green run on a new sha; local green ≠ DONE).
  - Create a fresh FIX-TA-SANDBOX-DEPGUARD: REJECTED — dedup found existing backlog[49]; activated in place instead.
- **why-decision:** Dup-key merge recovers masked dev REVIEW status (data-integrity); REVIEW tasks held at the verification gate; the only dispatchable CI-green blocker (depguard) activated under WIP.
- **why-change:** sprint went 6 tasks (de-duplicated) + 1 backlog task activated; no DONE flips this tick.
- **recurring-bug check:** TA go-lint module — FIX-TA-GOLANGCI-CONFIG-V2 (config v2) and FIX-TA-SANDBOX-DEPGUARD (import boundary) are DISTINCT defects in the same zone, not a re-fix of one module. The depguard violation is debt the v1 config masked, not a regression introduced by the config fix. Architect escalation does NOT fire.

### STEP po-S5: ci-health-fix-bridge brief → UNBLOCK (agent-father + developer) (2026-06-08)
**task_id:** CI-HEALTH-FIX-BRIDGE (new)
- **what-done:** Read brief docs/architecture-briefs/2026-06-08-ci-health-fix-bridge.md (READY-FOR-IMPLEMENTATION). Per triage-signals.md brief_complete routing (targets docs/agents/* flow + a canonical script) → UNBLOCK, route agent-father (4 md/flow edits: ci-health-probe.md SSOT spec, main.md JUMP-TO+Step-0a.5, drain-signals.md ci_red row, triage-signals.md ci_red handler) + developer (scripts/agents-flow/ci-health-probe.js canonical script, gated on the flow SSOT).
- **why-decision:** This institutionalizes the user's standing Message-4 request (auto-detect CI failures in the dev-team flow). The brief is self-grounding (this very CI-RED-RECONCILE sprint is the motivating incident) and encodes the 4 hard constraints we relied on this session (STALE-RUN GATE proven by the 9f063c9a stale-run trap, 3-layer DEDUP, VERIFICATION GATE = green-on-subsequent-push, SAFE-JSON = no field interpolation). Agent-father md track does not consume dev WIP; developer script = the 2nd dispatch slot.
- **WIP:** post-tick WIP = FIX-TA-SANDBOX-DEPGUARD (dev) + ci-health-probe.js (dev via agent-father chain) = 2, at cap. bctc-analyst recurring escalation held as pendingObservation (below).

### STEP po-S6: other signals — judged, not actioned (2026-06-08)
- **bctc-analyst escalation + bctc_signal BATCH_RELEASE (cycle 25+, 6 release tickers CTG/VCB/REE/NVL/D2D/TCH get_bctc_full EMPTY despite stored PDFs; ACB/EIB PUB-5-blocked):** RECURRING (>2 fix cycles → recurring-bug rule). Largely a RE-ESCALATION of known work: get_bctc_full-empty root-caused in BEQ-1 (DONE); CTG fetch in FIX-CTG-1/2/3 (DONE); historical depth in BCTC-HIST-VPS-BACKFILL + BCTC-ENRICHER-OLD-QUARTERS (both DEFERRED-INFRA, VPS-upstream-blocked). NEW nuance worth an architect SPIKE: current-quarter PDFs are NOW physically stored (CTG 6MB/VCB 8.1MB dated 2026-06-05/08) yet serve EMPTY — i.e. the freshly-stored current-Q PDFs are not being picked up by refine/extraction (distinct from the historical-backfill defer). HELD this tick (WIP at cap); recorded as pendingObservation → next-tick architect SPIKE (recurring-bug-escalation, NOT point-patch) to pin why stored-current-Q PDFs don't reach get_bctc_full.
- **bctc_signal FPT routine:** informational analysis (esc_1..5 all false / DATA-COV-LIM; trick=medium seasonal OCF). Not dev work → skip.
- **context-bloat × 3 (dev-macro-indicators 172916Z, dev-mcp-server 173510Z+180055Z notebooks):** route per context-bloat-governance — notebook trim to ≤200L (janitor/agent-father op). CHORE/CLEAN, no dev WIP consumed.
- **cowork-team-20260608T180631Z:** cowork tick → informational, skip.
- **sau-c118-cron-crash (CRITICAL, vnstockFundamentalsRefresh 0%/1 run, zone dev-mcp-server):** signal_queue row → TRIAGED. JUDGMENT: TRANSIENT, no task. Single observation; FIX-MACRO-REFRESH-DEAD (b7ce338f) shipped this session may have perturbed the worker. WATCH: a 2nd crash next auditor tick → escalate FIX (recurring).

## VERIFICATION GATE
Each fix proves out ONLY on a GREEN ci.yml run after a subsequent push. Local green ≠ done. After dev-* lands all 3 fixes locally → ops pushes → read next ci.yml run → only then mark DONE. Local-only fixes do not count.

## References
- Fresh run: https://github.com/phamhung075/VN-Market-Intelligence-MCP/actions/runs/27153704278
- ops journal: docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-ops.md
- macro go.mod: apps/macro-indicators/go.mod (`go 1.25.0`, outlier)
- TA config: apps/technical-analysis/.golangci.yml (missing `version: "2"`)
- drift assertion: apps/mcp-server/src/__tests__/123-integration-mcp.test.ts:867
