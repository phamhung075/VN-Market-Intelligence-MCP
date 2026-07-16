# PO Notebook

_Last: 2026-07-16T08:55Z (dev-team triage 08:37Z — ci_red HIGH → 1 fresh FIX minted w/ zone-correction; cowork-fire telemetry → no mint (dedup existing CLEAN row))_

## Tick 2026-07-16T08:55Z — 2 signals (ci_red HIGH + cowork-fire low)
Board pre: backlog 405→406, review 25, ready/inprog/qa 0, WIP 0, head idle. One atomic orch-apply (Zod Stage0+1 PASS, conservation 541→542 +1, CAS clean). Tree heavily peer-dirty (~109 files) → committed orch-state + notebook explicit paths only.

- **ci_red da847805 (HIGH) → MINT `CI-RED-da847805-FIX` (FIX, zone apps/mcp-server/, BACKLOG).** origin/main HEAD RED on `bun test`; sole failing file `apps/mcp-server/src/__tests__/013-rag-retriever.test.ts` (14486 pass/1 fail). Router evidence: REPRODUCIBLE (2x CI same-sha rerun + 3x local) → NOT flaky; whole-file crash, no assertion = bun 1.3.13 native segfault (LanceDB addon in `src/infrastructure/rag/_deprecated/`). Non-causal to commit (orch+2 QA docs; test byte-identical to green parent 00000074).
  - **ZONE CORRECTION (evidence discipline):** router suggested `dev-rag-service`, but that agent is Python-only (`apps/rag-service/` scope). The failing test + its imports are 100% inside `apps/mcp-server/`; `rag/_deprecated/` is referenced ONLY by tests (grep: zero production imports). → zone `apps/mcp-server/` (dev-mcp-server), disposition = quarantine/skip the dead-code native-crash test.
  - Dedup clean: 3 existing REVIEW CI-RED rows (FXFLOOR-OVERCLAMP, FOREIGN-FLOW-BULLETIN, FOREIGN-FLOW-COVERAGE) all macro/foreign-flow assertions — unrelated. Fresh mint per router.
  - Gate: ci_green on subsequent NEW-sha push (same-sha rerun does NOT count).
- **cowork-fire 08:28:35Z (low) → NO mint.** errors:[], classification FIRE, chef+alert-commander spawned. Note "chef-intraday silent-exit 0 clusters" = legit (no data cluster to post). legacy-mode via stale_warning:true = known (reference_isstale). Telemetry-drain already tracked: existing BACKLOG `CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR` (45 cowork-team-*.json pinned). Dedup → skip.

## Carry-over
- **RETURN: BATCH([CI-RED-da847805-FIX]).** FIX → dispatcher routes direct-to-Step-3, zone apps/mcp-server/. baseline_pass=false (CI currently RED). Tree heavily peer-dirty → dispatcher may defer live launch to clean-tree tick; backlog row durable regardless.
- **Note for dev:** `013/012/011/135-rag-*` + `security-sql-injection` tests all import `rag/_deprecated/` (native LanceDB). If quarantining, check sibling tests for same segfault class before green-declaring.
