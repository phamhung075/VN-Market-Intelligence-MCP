---
sprint: P2-KD
task_id: P2-KD-G
title: "G5b — MCP Handler HTTP Rewire (6 Tools → Port 5005 + 4 New Endpoints)"
type: development
owner: dev-kinh-dich
zone: apps/kinh-dich-service
size: L
depends_on: [P2-KD-F]
blocks: [P2-KD-H]
estimated_hours: 3
ac_count: 8
goal_advanced: [G5b]
goal_flip: false
ssot_path: docs/data/pilot-status-kinh-dich.json
---

## TLDR

Rewire 6 MCP kinh-dich tools from direct domain imports (mcp-server parallel copy) to HTTP calls to port 5005. Add 4 new HTTP endpoints on kinh-dich-service for history, transitions, backtest, and hexagram explanation. Score-computation helpers stay in mcp-server.

## [PM] Planning Context

**Zone:** apps/kinh-dich-service (primary), apps/mcp-server/src/interface/mcp/tools/kinhdich/, apps/mcp-server/src/infrastructure/microservices/

**Blocked by:** P2-KD-F DONE (G5a move complete — kinh-dich-service module is the canonical interface)

**Blocks:** P2-KD-H (G5c zero-TODO audit + G5 evidence sign-off)

**Acceptance Criteria:**

- [ ] **AC-1** — Zero direct domain imports from mcp-server parallel copy:
  - `grep -rn "from.*domain/services/kinhDich\|from.*kinhDichReading\|from.*hexagramLibrary\|from.*hexagramBacktester\|from.*kinhDichFormatter\|from.*kinhDichWrapper\|from.*nguHanhClassifier\|from.*haoEncoder\|from.*hexagramResolver" apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts`
  - Must return 0 matches (no live imports from the parallel copy remain in `kinhDichTools.ts`)

- [ ] **AC-2** — HTTP client confirmed at correct port:
  - `grep -n "5005\|kinh-dich" apps/mcp-server/src/infrastructure/microservices/clients.ts`
  - Must return ≥1 match showing `5005` or `kinh-dich-service` (confirming HTTP integration to the correct port)

- [ ] **AC-3** — 4 new kinh-dich-service endpoints exist and respond:
  - `grep -n "/readings\|/hexagram\|/backtest" apps/kinh-dich-service/src/interface/handlers.ts`
  - Must return ≥4 matches (the 4 new route registrations):
    - `/readings/{code}/history`
    - `/hexagram/{number}/transitions`
    - `/backtest/{code}`
    - `/hexagram/{number}/explain`

- [ ] **AC-4** — Fence-C still holds post-rewire (no direct infra imports in rewired tools or module/primitives):
  - `grep -rn "from.*infrastructure" apps/mcp-server/src/interface/mcp/tools/kinhdich/ apps/kinh-dich-service/src/module/ apps/kinh-dich-service/src/primitive/`
  - Must return 0 matches

- [ ] **AC-5** — ESLint fence still clean:
  - `cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0`
  - Exits 0 after the endpoint additions

- [ ] **AC-6** — TypeScript compiles cleanly:
  - `cd apps/kinh-dich-service && bun run tsc --noEmit`
  - Exits 0

- [ ] **AC-7** — G12 DoD gate (sandbox 14/14 scenarios PASS):
  - `cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all`
  - Exits 0. Paste output summary to handoff before commit (≥14 scenarios PASS)

- [ ] **AC-8** — Score helpers remain in mcp-server (not migrated):
  - `grep -n "computeHaoScores\|computeSentimentScore\|computeFundamentalsScore" apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts`
  - Must return ≥1 match (score helpers stay in mcp-server as integration glue — they are NOT removed)

## Files to read first

- `apps/kinh-dich-service/src/application/usecases.ts` (lines: current ReadingUseCase.execute()  structure)
- `apps/kinh-dich-service/src/module/reading_composer/` (the module being called after rewire)
- `docs/data/system-map.json` (jq to query kinh-dich-service port — 5005; NEVER hardcode)
- `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md` (§P2-KD-G background for 6 tools rewire spec)

## Files to create

- `apps/kinh-dich-service/src/interface/handlers.ts` — HTTP endpoint handlers (if not already present; may be merged into src/index.ts or kept separate)

## Files to modify

- `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` — Rewire 6 tools from direct domain imports to HTTP POST/GET calls to port 5005
- `apps/kinh-dich-service/src/interface/handlers.ts` or equiv — Add 4 new HTTP endpoints
- `apps/kinh-dich-service/src/application/usecases.ts` — Add use case implementations for the 4 new endpoints (if needed)
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — Add kinh-dich HTTP client function(s) routing to port 5005

## Dependencies

- P2-KD-F (G5a move complete)
- Phase-1 baseline: kinh-dich-service primitives + reading_composer module stable + sandbox green 14/14

## Knowledge needed

- `docs/policies/dev-standards.md` (L84 explicit staging, commit convention)
- `docs/protocols/fail-loud-protocol.md` (anchor discipline, no destructive git)
- Charter `§G5b MCP Handler HTTP Rewire` section (6 tools table, port 5005 resolution, score-helper boundary)
- System-map.json jq query for kinh-dich port (never hardcode)
- G12 DoD gate: sandbox baseline 14/14 scenarios PASS on every task that produces sandbox-runnable artefacts

## G-Goal Posture

**NO goal flips.** G5b advances but does NOT flip to YES. Charter §4.5 SSOT untouched:
- `decisionMatrix` stays all TBD
- `goalsEarned` stays 0
- `phase2.current_task` flips to P2-KD-G (set by PM on dispatch)

## Historical Context

**Phase 2 Status:** P2-KD-F DONE (5641f2a1, atomic move verified no orphaned originals), P2-KD-E DONE (tag created), P2-KD-D DONE (G4 freeze confirmed).

**Highest-Risk Finding:** HIGH-RISK G5b per brownfield §5. The 6 tools use direct imports from mcp-server's parallel domain copy. Rewire requires zero live imports post-completion (AC-1 strict).

**Port 5005 Resolution:** Query `docs/data/system-map.json` with jq: `jq '.services[] | select(.id=="kinh-dich-service") | .port'` — NEVER hardcode. The HTTP client in mcp-server microservices must use this same port value.

---

## Commit Convention

**Subject pattern:**
```
feat(kinh-dich): P2-KD-G — G5b MCP HTTP rewire (6 tools → port 5005) + 4 new kinh-dich-service endpoints
```

**Trailers:**
```
AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8
Task: P2-KD-G
```

---

## Sandbox Evidence Section

```
[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json
[PASS] hao-encoder-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] PASS 14/14 scenarios (0 failed, 0 skipped)
```

AC-7: PASS. bun tsc --noEmit: EXIT 0. bunx eslint src/ --max-warnings 0: EXIT 0.

---

## RETURN

When complete, emit signal:
```json
{
  "agent": "dev-kinh-dich",
  "task_id": "P2-KD-G",
  "status": "DONE",
  "commit_sha": "<your-commit-sha>",
  "sandbox_verified": true,
  "ac_verdicts": {
    "AC-1": "PASS",
    "AC-2": "PASS",
    "AC-3": "PASS",
    "AC-4": "PASS",
    "AC-5": "PASS",
    "AC-6": "PASS",
    "AC-7": "PASS",
    "AC-8": "PASS"
  },
  "next_actor": "pm",
  "next_action": "verify P2-KD-G (G5b HTTP rewire complete), then sequence P2-KD-H (G5c zero-TODO audit)"
}
```

Signal file: `docs/signals/dev-kinh-dich-P2-KD-G-done-<UTC>.json`

---

## Acceptance Gate

All 8 ACs PASS + sandbox green 14/14 + anchor INTACT (debba8eaff0724d1fb32fc9d28640201cc32d1cc is ancestor of HEAD).
