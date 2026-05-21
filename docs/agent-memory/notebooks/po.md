# PO Notebook

## Last updated: 2026-05-21T19:02:30Z · Cycle: c234 — Sprint 1967 KICKOFF + SCOPE UPGRADE (user /goal full-chain BA-first)

### c234 trigger (composite — two writes merged)
1. **18:55Z (first write):** Direct user feedback "Need virtual dev team working on finding bugs or conflicts in actual system orchestration agent setup." → opened Sprint 1967 as read-only audit, dispatched 1967a directly to agents-architect.
2. **19:02Z (this write):** User /goal directive "fix all bugs/conflicts in orchestration agent system" + "Use the full standard sprint chain, do NOT skip BA". → SCOPE UPGRADE: extend Sprint 1967 head, re-route 1967a to ba, gate architect on BA approval, drive to FIX not just catalogue.

### Decisions taken
1. **Sprint 1967 OPENED + SCOPE-UPGRADED** in place (no Sprint 1968 fork). Vision: detect, catalogue, AND fix every orchestration bug/conflict. Chain: PO → BA → architect → PM → dev-team → qa.
2. **Task 1967a RE-ROUTED:** agents-architect → ba. Architect dispatch (1967b) HARD-GATED on `docs/signals/po-1967-ba-approved.json`. PM (1967c) gated on architect brief. dev-team slate gated on PM. qa sprint sign-off gated on all CONFIRMED bugs Done OR DEFERRED-with-signoff. Session-scoped goal hook enforces non-closure.
3. **Surfaces expanded 6 → 7** to include lock-contention + race conditions as standalone surface 7 (was implicit in surface 4; now explicit per Phase 1–4 task-lock + TASKS.md concurrent-write evidence E-3 + E-7).
4. **AC matrix expanded AC-1..AC-5 → AC-1..AC-7** covering BA gate, architect brief, PM slate, dev-team fixes, qa sprint sign-off, regression guard, cross-link integrity.
5. **All 7 seed evidence rows preserved** from the 18:55Z write (E-1..E-7).
6. **NO new dispatch to agents-architect this cycle** — its 1967a-AUDIT DASHBOARD row flipped to SUPERSEDED-WAIT until BA gate completes.

### Files touched this cycle (composite)
- `docs/SPRINT_GOAL.md` — Sprint 1967 head rewritten (chain section added, scope expanded to 7 surfaces, AC matrix expanded).
- `docs/TASKS.md` — Backlog: 1967a re-routed to ba, 1967b (architect, gated) + 1967c (pm, gated) added.
- `docs/handoffs/TASK_1967a-ba-decomp.md` — NEW handoff doc for BA.
- `docs/signals/po-1967-kickoff.json` — NEW kickoff signal (BA target, caveman ultra).
- `docs/pipeline-state.json` — full refresh (status=active-orchestration-bug-hunt, activeTaskId=1967a, nextAgent=ba).
- `docs/signals/DASHBOARD.md` — _Updated_ refreshed; `## po` row `1967-KICKOFF` appended; `## agents-architect` row `1967a-AUDIT` flipped SUPERSEDED-WAIT; NEW `## ba` section with `1967a-DECOMP`.
- `docs/signals/po-1967a-kickoff.json` (from 18:55Z write) — superseded by po-1967-kickoff.json (target = ba now, not agents-architect).
- `docs/agent-memory/notebooks/po.md` — this file (OVERWRITE).

### Chain enforcement
```
PO (c234, DONE)
  -> BA (1967a, ACTIVE)              ←── dispatched via docs/signals/po-1967-kickoff.json
     -> architect (1967b, GATED on docs/signals/po-1967-ba-approved.json)
        -> PM (1967c, GATED on architect brief)
           -> dev-team (1967-bug-NN slate, GATED on PM slate)
              -> qa (1967z sprint sign-off) → po close
```

### 7 Seed Evidence Rows (preserved from 18:55Z write)
- E-1: 1963-MW-IDENTITY recurrence (market-watcher intermittent MCP-tool-awareness failure post agent-father fix)
- E-2: OBSERVE-1955d FAIL (`crashed` cron status blocks re-fire — vnstockTradingStatsRefresh + vnstockFundamentalsRefresh wedged 3 days)
- E-3: 1962-B-01 signal-timing race (pm signal landed after PO closed sprint)
- E-4: 1964-AC-ENUM (MCP enum + documented fallback both rejected — silent degradation)
- E-5: 1965-COVERAGE-SWEEP (capability-text vs flow.md execution drift)
- E-6: cowork-team-20260521T185005Z drift_min=5 (dispatcher fire-time drift)
- E-7: recurring-bug-freeze policy effectiveness test (multiple sprints in parallel while 1954c blocked)

### Out-of-scope inputs noted (NOT dispatched)
- 3 CRITICAL ops-lane rows (1959-B-01 / 1959-B-04 / 1959-B-05) — ops-lane, not orchestration.
- 1953-G-FAIL sentinel (BCTC freeze) — sentinel-only.
- 1965-COVERAGE-SWEEP (agents-architect lane, OPEN) — distinct cowork-coverage design ask; E-5 cross-links it, does NOT duplicate.
- tnb c75 audit-handoff — routine PO cycle, not 1967 scope.

### Watchpoints for c235+
- 2026-05-21T19:30Z+: BA completes 1967a → emits ba-1967a-spec-ready.json → PO runs po/review-ba-spec.md sub-flow → emits po-1967-ba-approved.json (or rejection with feedback).
- 2026-05-22T03:00Z: first tasksMdJanitor cron fire — qa observation (parallel 1965c-soak).
- 2026-05-22T21:00Z: 1959-watchdog-4 soak unlock + 1964-AC-ENUM unblocks + OBSERVE-1955e DEEP HOLD release.
- 2026-05-23T03:00Z: second tasksMdJanitor fire — soak completion gate.
- 2026-05-23T07:05Z: OBSERVE-1957d BCTC cadence 72h tracker.
- 2026-05-23T18:00Z: 1965c soak ends → qa emits qa-1965c-soak-result.json.
- 2026-05-24T13:47Z: digest-sunday natural fire (OBSERVE-1907a-verify gate 14:30Z).
- 2026-05-25T01:30Z: OBSERVE-1955c vnstockFundamentalsRefresh first scheduled fire post-deploy.

### Lessons encoded this cycle
- L24: **Sprint kickoff from direct USER feedback follows sprint-kickoff sub-flow even when 2 soaks already in flight** — parallelism is fine if agent+zone don't collide; agents-architect read-only briefs never collide with dev-team code work.
- L25: **PO can pre-curate seed evidence inside SPRINT_GOAL.md** — saves agents-architect cycle minutes; ≥5 well-anchored evidence rows is the floor, ceiling open. Architect must still scan-beyond and call out "no findings" per clean surface.
- L26: **Read-only diagnostic sprints decouple "find" from "fix"** — UPDATED 19:02Z: user can override this with a /goal directive to require fix-to-completion. When that happens, extend the current sprint head + re-route the anchor task to BA + gate architect on BA approval. Do NOT fork a new sprint.
- L27: **User /goal directive ≡ scope upgrade, not scope replacement.** When sibling PO has already touched SPRINT_GOAL.md, preserve sibling work where compatible — keep all evidence rows, expand scope, re-route only the anchor task, mark superseded rows explicitly in DASHBOARD. New sprint number only if scope is genuinely orthogonal.
- L28: **BA gate enforced via signal hard-gate, not flow-level handshake alone.** Architect dispatch (1967b) blocked on `po-1967-ba-approved.json` file existence. Even if architect runs its own cron, it should re-read SPRINT_GOAL §Chain and EXIT when gate signal missing. Belt-and-suspenders: flow says "wait for PO", dashboard row says SUPERSEDED-WAIT, signal-bus has no approval.

### Carry-over from c229–c233
- Sprint 1959 STAYS OPEN until watchdog-4 ships (~2026-05-22T21:00Z+)
- Sprint 1965 cascade CLOSED 2026-05-21T18:00Z; 1965c-soak active through 2026-05-23T18:00Z (qa-owned).
- BCTC freeze in force (recurring-bug-escalation); 1954c is the next structural unlock; 1967-bug-NN fixes touching BCTC routed to gate-1954c.
- OBSERVE-1955e queued behind soak boundary; batch with 1955c diagnosis on 2026-05-25.
- 1964-AC-ENUM (LOW) queued for soak release.
- 1965-COVERAGE-SWEEP (agents-architect) OPEN; 1963-MW-IDENTITY (agent-father DONE).
- L18: Idle-EXIT is a feature during soak; L19: maintenance-agent dashboard rows ≠ dev-team backlog; L20: silent cowork-fires are not signals; L21: parallel-sprint OK when zones+agents don't collide; L22: housekeeping cycles return NOTHING; L23: DASHBOARD `## po` row pruning policy.
