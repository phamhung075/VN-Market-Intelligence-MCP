# PO Notebook

## Last updated: 2026-05-21T19:19:20Z · Cycle: c236 — Sprint 1967 AC-1 PASS + 1968a gate released

### c236 trigger
INBOUND: BA 1967a DONE @ commit f7ef1b23 — `docs/signals/ba-1967a-spec-ready.json` (REQ_1967.md, 7 REQ + 5 NFR + 0 PO blockers). Parallel hold: agent-father 1968a awaiting overlap sanity-check.

### Decisions taken (c236)
1. **AC-1 PASS on 1967a** — REQ_1967.md verified: 7 atomic REQs (one per orchestration surface), DDD layers tagged each, NFR section present (NFR-1..5), out-of-scope mirrors SPRINT_GOAL §Scope OUT verbatim, testable check-lists per REQ, done-criteria per REQ, glossary present, 0 blockers. Signal emitted `docs/signals/po-1967-ba-approved.json`.
2. **1967b decision = RE-RUN, not RATIFY** — Early architect brief (`docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`, 13 items / 5 HIGH / 7 MED) authored pre-BA scope. Coverage of REQ_1967 testable checklists ≈ 50%. Gaps spanning REQ-1967-1b/1d/2a/2b/2d/3a-3e/4a/4d/5b/5c/5e/6a/6c/6d/6e/7e/7f are too wide to ratify. Decision: mark early brief SUPERSEDED in header (evidence-only); spawn fresh architect 1967b with REQ_1967 as scope contract. Re-run signal `docs/signals/po-1967b-rerun.json`.
3. **1968a gate RELEASED — overlap audit CLEAN** — Cross-checked L-1..L-5 against REQ_1967 checklists. L-1↔REQ-1967-6b: REQ explicitly defers fix authority to Sprint 1968; architect = evidence only. L-2↔REQ-1967-6c: different surfaces (L-2 is notebook size cap, REQ-6c is always_load file audit). L-3↔REQ-1967-4f: REQ explicitly defers to Sprint 1968 L-3. L-5↔REQ-1967-1d: REQ is audit/finding only; L-5 implements ULTRA on specific files. No double-fix risk. agent-father may start file surgery immediately in parallel with 1967b architect re-run. Signal emitted `docs/signals/po-1968a-gate-released.json`.
4. **WIP/zone safety** — architect on 1967b (read-only diagnostic, no zone), agent-father on 1968a (.md surgery, agent-father-only). Zero collision. dev-mcp-server idle on 1967/1968. dev-rag-service on 1959-watchdog-4 hold. qa on 1965c-soak. BCTC paths frozen.
5. **Channel audit deferred** — DASHBOARD `## po` rows (tnb c75, 1953-G-FAIL freeze sentinel, 1965-CLOSE, 1967-KICKOFF) all current from c235. tnb c75 NEEDS_ATTENTION still queued for next routine cycle. No MARKET/WORK/BUG fresh scan needed for AC-1 gate work.

### Files touched this cycle
- `docs/signals/po-1967-ba-approved.json` — AC-1 PASS signal (caveman ultra payload).
- `docs/signals/po-1967b-rerun.json` — RE-RUN dispatch to architect.
- `docs/signals/po-1968a-gate-released.json` — gate release signal (caveman ultra).
- `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` — header SUPERSEDED notice prepended (file kept as evidence input).
- `docs/signals/DASHBOARD.md` — _Updated_ + ## po (3 new rows) + ## agent-father (1968a flipped to RELEASED) + ## agents-architect (1967b-RERUN row added, 1967a-AUDIT marked SUPERSEDED-CLEARED) + ## ba (1967a-DECOMP marked DONE).
- `docs/TASKS.md` — 1967b row Blocked-by cleared + scope rewritten to RE-RUN spec; 1967a migrated to Done section.
- `docs/pipeline-state.json` — activeTaskId 1967a→1967b, nextAgent ba→agents-architect, full RE-RUN prompt embedded.
- `docs/agent-memory/notebooks/po.md` — this file (OVERWRITE).

### Watchpoints for c237+
- **Architect 1967b lands** — review canonical brief vs REQ_1967 checklists (silence-≠-pass enforcement); if PASS → dispatch PM 1967c slate; if FAIL → return brief with gap list.
- **agent-father 1968a-phase1-done.json** — review 5-lever execution; emit `po-1968a-phase1-approved.json` to unlock 1968b; verify L-1 alert-commander promote-to-always_load decision documented.
- **2026-05-22T03:00Z** — first tasksMdJanitor cron fire (1965c soak observation #1).
- **2026-05-22T21:00Z** — 1959-watchdog-4 + 1964-AC-ENUM + OBSERVE-1955e soak unlock.
- **2026-05-23T18:00Z** — 1965c soak ends → qa emits qa-1965c-soak-result.json.
- **Sequence after Phase 1+1967b** — Sprint 1968b (L-4 + L-7), then 1967c PM slate decomposition, then PM 1968c Phase 3 slate.

### Lessons encoded this cycle
- L32: **RE-RUN vs RATIFY decision matrix** — when a pre-BA architect brief lands and a BA spec then materializes, default = RE-RUN unless coverage of BA testable checklists ≥80%. Below 80% the gaps will leak into PM slate or downstream code as silent omissions. Cheaper to re-spend architect cycles than to find missing audit later.
- L33: **Mark superseded ≠ delete** — early brief stays in tree as evidence input for canonical architect run; the 13 ITEM rows can be ratified verbatim into the canonical brief when they map 1:1 to REQ_1967 check-list items. Architect saves rediscovery cost.
- L34: **Cross-sprint overlap CLEAN verdict requires "evidence only on architect side"** — sprint X may fix surface Y while sprint Z audits the same Y, BUT only if Z's NFR explicitly states evidence-only / no fix proposals. REQ_1967 §Cross-sprint boundary notes nailed this for 1968 L-1/L-2/L-3/L-5. Sufficient to release the parallel gate immediately, no need to wait for architect brief landing.
- L35: **Three-signal cycle (approve + rerun + gate-release) is one PO cycle** — when gates fan out in parallel, batch all signals + DASHBOARD edits + pipeline-state + TASKS.md in a single commit; downstream agents read consistent state, no torn-write race.

### Carry-over from c229–c235
- Sprint 1959 STAYS OPEN until watchdog-4 ships (~2026-05-22T21:00Z+)
- Sprint 1965 in soak (1965c OBSERVE through 2026-05-23T18:00Z)
- Sprint 1967 active (BA 1967a DONE+APPROVED c236; architect 1967b RE-RUN dispatched c236; PM 1967c + dev-team slate downstream)
- Sprint 1968 OPEN (Phase 1 agent-father GATE RELEASED c236 — runs parallel to 1967b)
- BCTC freeze in force; 1954c is the next structural unlock
- 1964-AC-ENUM (LOW) queued for 2026-05-22T21:00Z soak release (separate from 1968 L-3 payload work)
- L18 idle-EXIT, L19 maintenance-dashboard ≠ dev-backlog, L20 silent-cowork-fires-not-signals, L21 parallel-sprint OK when zones+agents don't collide, L22 housekeeping-cycles-return-NOTHING, L23 DASHBOARD-pruning, L24 sprint-kickoff-from-user-feedback, L25 PO-pre-curated-seed-evidence, L26 read-only-find-vs-fix, L27 /goal-is-scope-upgrade, L28 BA-gate-via-signal-hard-gate, L29 mini-sprint-pattern-for-cost-reduction, L30 cross-ref-verify-before-dispatch, L31 hard-gate-parallel-sprints-when-surface-overlaps
