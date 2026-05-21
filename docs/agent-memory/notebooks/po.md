# PO Notebook

## Last updated: 2026-05-21T19:10:46Z · Cycle: c235 — Sprint 1968 kickoff (Phase 1 token/tool-call economy, gated mini-sprint)

### c235 trigger
INBOUND signal from agents-architect: `docs/signals/token-toolcall-economy-20260521T190909Z.json` + brief `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md`. 9 levers across 3 phases. Phase 1 (L-1..L-5) is agent-father-only zero-code (.md surgery), risk LOW, expected 25–35% per-cycle context reduction + ~56 fewer MCP calls/trading-day.

### Decisions taken (c235)
1. **Brief SIGNED OFF** — scope respects DDD (Phase 1+2 are .md edits, no domain/app/infra layer); no SSOT collisions; tree-map DAG respected; fail-loud preserved; system-auditor audit trail preserved (archive-before-overwrite for notebooks).
2. **Sprint 1968 OPENED as mini-sprint** — Phase 1 only this cycle; Phase 2 (L-4 + L-7) sequenced cycle-2; Phase 3 (L-6/L-8/L-9) routed through PM as TASK_NNN slate after Phase 1 ratified.
3. **HARD GATE on 1967b** — agent-father must NOT start 1968a until Sprint 1967b architect brief lands at `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` AND PO sanity-checks overlap with 1968 brief levers L-1..L-3. Prevents double-fix on same .md surface. ETA ~22:01Z (1967b 4h time-box from 19:01Z).
4. **Cross-ref verified** — alert-commander.md lines 82-84 still has `mcp-tools.md trigger: startup`. The 1963-MW-IDENTITY agent-father fix promoted mcp-tools.md to `always_load` for **market-watcher only**, NOT alert-commander. L-1 alert-commander work remains valid. Handoff doc recommends promote-to-always_load (alert-commander makes MCP calls every cycle for write_alert_verdict + post_agent_signal).
5. **Conflict check vs Sprint 1967** — 1967 = orchestration BUG audit (correctness). 1968 = STEADY-STATE COST. Orthogonal. 1964-AC-ENUM (1967 scope) is schema-fix; L-3 (1968) is payload-size — different layers. Safe to parallel.
6. **WIP/zone safety** — agent-father owns 1968 alone; does not collide with dev-mcp-server (1965b done, 1967 audit not on dev-mcp-server), dev-rag-service (1959-watchdog-4 hold), ba (1967a in flight), architect (1967b in flight).

### Files touched this cycle
- `docs/SPRINT_GOAL.md` — Sprint 1968 head prepended above Sprint 1967 (preserved).
- `docs/TASKS.md` — 3 Backlog rows added (1968a HARD-GATED on 1967b; 1968b/1968c PENDING).
- `docs/signals/DASHBOARD.md` — _Updated_ timestamp refreshed + `## agent-father` 1968a-PHASE1 GATED row prepended above 1965a-DESIGN DONE row.
- `docs/signals/po-1968-signoff-and-kickoff.json` — kickoff signal (caveman ULTRA tier, applies new L-3 payload pointer discipline a priori).
- `docs/handoffs/TASK_1968a-phase1.md` — detailed agent-father execution doc with per-lever target file table + AC list + coordination notes.
- `docs/agent-memory/notebooks/po.md` — this file (OVERWRITE).

### Channel audit (Step 0 — c235)
Cycle-bound, no fresh MARKET/WORK/BUG audit — c234 audit + DASHBOARD reads still recent (<30 min). DASHBOARD `## po` already-known rows: tnb c75 audit (deferred to next routine cycle), 1953-G-FAIL (under 1954c freeze, do-not-dispatch sentinel), 1965-CLOSE + 1967-KICKOFF status both green. No new triage required for 1968 work.

### Watchpoints for c236+
- **2026-05-21T~22:01Z** — Sprint 1967b architect brief lands. PO sanity-check overlap with 1968 levers L-1..L-3. If clear → release 1968a dispatch to agent-father. If 1967b finds additional drift in same files → agent-father merges fixes in single touch.
- **2026-05-22T03:00Z** — first tasksMdJanitor cron fire (1965c soak observation #1).
- **2026-05-22T21:00Z** — 1959-watchdog-4 + 1964-AC-ENUM + OBSERVE-1955e soak unlock.
- **2026-05-23T03:00Z** — second tasksMdJanitor fire (1965c soak observation #2).
- **2026-05-23T07:05Z** — OBSERVE-1957d BCTC cadence 72h tracker.
- **2026-05-23T18:00Z** — 1965c soak ends → qa emits qa-1965c-soak-result.json.
- **After 1968a Phase 1 lands** — PO ratifies via `docs/signals/po-1968a-phase1-approved.json` → dispatches 1968b Phase 2 (L-4 + L-7). After 1968b → PM 1968c Phase 3 slate.

### Lessons encoded this cycle
- L29: **Sprint mini-pattern works for cost-reduction work** — single-executor agent-father-only sprints don't need full PO→BA→architect→PM chain when scope is non-functional (.md surgery) and risk is LOW. Mini-sprint keeps cognitive load low + zero WIP collision.
- L30: **Cross-ref verification before dispatch is mandatory when two briefs overlap** — Sprint 1967 orchestration audit + Sprint 1968 token economy both touch agent .md files. Always check whether prior fix already covered a target; otherwise duplicate-edit waste + churn risk.
- L31: **Hard-gate parallel sprints when surface overlaps** — agent-father gated on 1967b landing is cheap insurance; principle: when two parallel sprints both touch the same .md surface, the second-to-land sprint waits for the first brief to materialize so fixes merge in single touch.

### Carry-over from c229–c234
- Sprint 1959 STAYS OPEN until watchdog-4 ships (~2026-05-22T21:00Z+)
- Sprint 1965 in soak (1965c OBSERVE through 2026-05-23T18:00Z)
- Sprint 1967 active (BA 1967a in flight; architect 1967b PENDING on BA approval; PM 1967c + dev-team slate downstream)
- Sprint 1968 OPEN-GATED (Phase 1 agent-father held until 1967b lands ~22:01Z)
- BCTC freeze in force; 1954c is the next structural unlock
- 1964-AC-ENUM (LOW) queued for 2026-05-22T21:00Z soak release (separate from 1968 L-3 payload work)
- L18 idle-EXIT, L19 maintenance-dashboard ≠ dev-backlog, L20 silent-cowork-fires-not-signals, L21 parallel-sprint OK when zones+agents don't collide, L22 housekeeping-cycles-return-NOTHING, L23 DASHBOARD-pruning, L24 sprint-kickoff-from-user-feedback, L25 PO-pre-curated-seed-evidence, L26 read-only-find-vs-fix, L27 /goal-is-scope-upgrade, L28 BA-gate-via-signal-hard-gate
