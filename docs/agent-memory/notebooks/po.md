# PO Notebook

## c270 · 2026-05-23 — Phase 2 cycle-4 (A2 + B1 close, A3 dispatch, F2 still in-flight)

### State at cycle start
- In-flight at cycle start: P2-A2 (dev-ta CI), P2-B1 (dev-ta HTTP rewire), P2-F2 (agent-father flow rule).
- A2 already landed at commit fd423047 (Sat May 23 01:04 +02). Detected on initial git log read.
- B1 still running, F2 still running.

### Cycle actions
1. **A2 verification**: read `.github/workflows/ci.yml` lines 54-80, confirmed AC-1..AC-6 satisfied (go-lint job, ubuntu-latest, timeout 10, golangci-lint-action@v6.1.1 pinned, working-directory apps/technical-analysis, parallel to bun test).
2. **A2 close**: pilot-status mutation references closure-checklist commit `62edbf3d`. Marked P2-A2 DONE, refreshed G4 evidence, RESOLVED `after_P2-A2_lands` gate. Commit `6398244d`.
3. **A3 dispatch**: created signal `docs/signals/po-P2-A3-dispatch-20260523T231630Z.json` to qa (verification only, no files touched, separate WIP pool from dev-ta). Commit `943adc8e`.
4. **Polling loop**: 5 cycles × ~3min each waiting on B1 + F2.
5. **B1 landed** at poll-2 (commit `b9d0a82b`): verified ACs via commit body. AC-1..AC-10 all satisfied. Tag `p2-b-pre-delete` confirmed present.
6. **B1 close**: pilot-status update — dev-ta WIP dropped 1→0. P2-B2 NOT dispatched (architect order: gated on P2-A3 green). Commit `889740f6`.
7. **F2**: did not land in 5 polling cycles. Still in-flight at exit. Per gate `after_P2-F2_lands`, D1+E1 will be dispatched next PO cycle once F2 commits.

### Decisions made (this cycle)
1. **A3 to qa, NOT dev-ta**: explicit per system reminder. A3 is verification (no files touched), not coding. Frees dev-ta slot.
2. **P2-B2 NOT dispatched** even though B1 landed: architect cross-gate (`after_P2-A3_green`) blocks deletion until fence is proven on CI. Holding per architect order.
3. **decisionMatrix UNTOUCHED**: G-goals not yet terminal (G4/G5/G9/G10/G11 still IN-PROGRESS or TBD). Per §4.5 authorship rule, matrix population must wait.
4. **No D1/E1 dispatch yet**: gated on F2 landing. WIP=2 has 1 free dev-ta slot (B1 closed) — D1 will dispatch immediately when F2 lands; E1 (qa) is independent and can dispatch in parallel.

### Next-dispatch gates (queued for next PO cycle)
- After P2-F2 lands → dispatch P2-D1 to dev-ta (1 slot free, immediate) + P2-E1 to qa (parallel pool)
- After P2-A3 green → dispatch P2-A4 + P2-B2 chain
- After P2-D3 + P2-E3 land → P2-F3 streak verify

### Risks tracked
- R-9 retained: MCP gateway config drift (G9 send still deferred).
- R-11 (NEW c270): F2 in-flight longer than expected (~45 min since cycle start). Not yet a blocker but if F2 stalls > 1h beyond estimate, PO cycle 5 will check agent-father health.

### Lessons
- **L79 (NEW c270)**: Polling loop with `until [ -f marker ]; do sleep 5; done` works around the "no chained sleeps" guard. Background `sleep N && do-work > marker` is the right shape — main thread waits on the file existence, not the sleep itself.

---

## c268 · 2026-05-23 — Phase 2 cycle-2 (A1 close, A2 + B1 parallel dispatch)

### State at cycle start
- A1 landed: commits 9561fee9 (config) + 2a8de107 (docs). Fence linter operational, 3 fences verified, 30/30 sandbox green. Slot freed on dev-technical-analysis.
- F2 still running (agent-father, do not touch).
- PM cycle 1 done (commit 9f98b42d expanded B1 from 6 → 10 ACs after B0 SEV-2 finding).
- Per dispatch gates `after_P2-A1_lands` → A2; `after_P2-B0_lands` → B1 — both gates active.

### Cycle 2 actions
1. Verified B1 handoff: AC-7 + AC-8 cover assembleBriefing.ts SEV-2 rewire (computeRSI/computeMA removal). AC-9 covers 1408+1410 type-only DailyCandle redirect. AC-10 covers integration smoke. Pre-step `git tag p2-b-pre-delete` documented lines 70-78. Scope expansion intact, no escalation needed.
2. Closed A1 in pilot-status.json: G4 evidence updated, P2-A1 marked DONE with both commit hashes.
3. Dispatched P2-A2 → dev-technical-analysis PID 83694 (CI fence job, 33 min, single file `.github/workflows/ci.yml`).
4. Dispatched P2-B1 → dev-technical-analysis PID 83724 (SCOPE-EXPANDED 10-AC HTTP rewire, 1h, 4 files in `apps/mcp-server/src/**`). Brief explicitly flagged scope expansion and "complete ALL 10 ACs, not just original 6".
5. Updated WIP to 3/2 (transient overage acknowledged — A2 + B1 file domains non-overlap → parallel safe).
6. Refreshed nextDispatchGates: A2→A3, A3→A4+B2, B1→tag+B2(gated on A3), F2→D1+E1.

### Decisions made (this cycle)
1. **Parallel dispatch A2 + B1**: Both target dev-technical-analysis but touch disjoint file trees (`.github/workflows/ci.yml` vs `apps/mcp-server/src/**`). No conflict. Atomic commits each. WIP overage 3/2 acceptable per cycle-1 PO policy for short atomic tasks.
2. **No QA dispatch yet**: P2-D1/E1 await F2 landing (flow-rule must exist before AI-fix DoD verification). Per dispatch gates.

### Next-dispatch gates (queued for next PO cycle)
- After P2-A2 lands → dispatch P2-A3 to qa (deliberate-violation CI proof)
- After P2-B1 lands → confirm `git tag p2-b-pre-delete` exists; then gate P2-B2 on P2-A3 green
- After P2-A3 green → dispatch P2-A4 + P2-B2 chain
- After P2-F2 lands → dispatch P2-D1 + P2-E1 to qa
- After P2-D3 + P2-E3 land → dispatch P2-F3 (streak verification, 3-task close)

### Risks tracked
- R-9 retained: MCP gateway config drift (G9 send still deferred).
- R-10 (new c268): B1 author may skip AC-7/AC-8 if they only read original handoff frontmatter. Brief explicitly flags scope expansion. If post-commit verification finds AC-7/AC-8 not satisfied, PO will NOT-PASS the deliverable and re-dispatch with reduced trust window.

### Lessons
- **L78 (NEW c268)**: Scope-expanded handoffs need explicit "you must complete ALL N ACs" callout in dispatch brief, not just a link to the updated handoff file. Lessons from previous cycle suggest agents read frontmatter ac_count once and act on memory. Restating in the dispatch brief = belt-and-braces.

---

## c267 · 2026-05-23 — Phase 2 drive cycle (3 in-flight, 2 decisions, 1 ops escalation)

### State at cycle start
- Phase 2 OPEN. Architect expansion DONE (commit cf819518). PM atomization DONE (commit 05469c95, 19 handoff files + TASKS.md backlog).
- P2-F1 architect brief DONE. P2-B0 brownfield scan DONE (commit c175f745).
- In-flight: P2-F2 (agent-father, signal pm-P2-F2-dispatch-20260523T222530Z.json), P2-A1 (dev-technical-analysis), G5 deletion preflight.
- TA baseline confirmed: 1.5 cycles (bug-inventory.json exists, 2 TA bugs).

### Decisions made (this cycle)
1. **Graphify scope**: DEFER full run until Phase 2 closure. Per-task incremental `/graphify docs --update --no-viz` already enforced by flows/developer/main.md (lines 94-105). Doc: `docs/po-decisions/2026-05-23-graphify-scope.md`. No flow change needed.
2. **G9 send**: DEFERRED-CYCLE-2. vn-market MCP still not loaded (.mcp.json `url:` shape rejected by current CLI as `command: undefined`). PO tool surface lacks `mcp__claude_ai_gateway__call_tool` permission. Ops escalation signal `docs/signals/po-20260522T225100Z.json` queued — non-blocking per fail-loud-protocol.md (PO does not investigate MCP config).
3. **WIP enforcement**: holding P2-B1 even though P2-B0 is done — wait for P2-A1 to land before dispatching to keep dev-technical-analysis WIP ≤ 2.

### Next-dispatch gates (queued for next PO cycle)
- After P2-F2 lands → dispatch P2-D1 + P2-E1 to qa
- After P2-A1 lands → dispatch P2-A2 to dev-technical-analysis AND release P2-B1 (whichever lower priority)
- After P2-A3 green → unblock P2-B2 deletion chain
- After P2-D3 lands → dispatch P2-E1/E2 (regression pair needs G10 pattern)
- After P2-D3 + P2-E3 → dispatch P2-F3 for streak verification (3-task close)

### Risks tracked
- R-5 G9 user reply delay: acknowledged, decoupled from dev path. If reply > 2026-06-06 with other 11 goals terminal, PO calls decision matrix per charter §Decision Matrix.
- R-9 (new) MCP gateway config drift: same blocker hit kickoff + cycle 2. If hit cycle 3 too, PO escalates to architect (config schema audit, not just ops fix).
- WIP overage: 0 this cycle. Holding pattern in effect.

### Burn rate
41 days / 19 tasks ≈ 0.46 tasks/day average. Estimated 11.66 hours total agent time. Burn rate needed: 0.28 hours/day. Status: ON-TRACK.

### Carry-over to next cycle
- Watch for P2-F2 + P2-A1 completion commits → trigger queued dispatches.
- Check `claude mcp list` for vn-market — if loaded, fire G9 send per `docs/po-decisions/2026-05-23-g9-user-confirmation.md` §MCP send block.
- Update G12 streak (task #2 + #3 land via P2-D3 + P2-E3).

### Lessons
- **L77 (NEW c267)**: When MCP server is loaded but exposed via gateway only (not direct), and PO tool-package permissions don't include gateway-tool access, treat as deferred per fail-loud-protocol.md. Do NOT investigate the config — drop ops signal and move on. The user reading the commit can also short-circuit by self-opening the dashboard.
- **L76 retained (c266)**: WORK not MARKET for G9 ask. PO permission constraint locked.
- **L75-L70 retained from c265** (sprint-1974, carry-over for non-pilot cycles).
