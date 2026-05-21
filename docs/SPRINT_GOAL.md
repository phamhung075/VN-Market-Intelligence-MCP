# Sprint 1968c Goal — Token & Tool-Call Economy Phase 3 (Tier 2/3 implementation)

**Status:** OPEN 2026-05-21T21:15:41Z (po c240 kickoff) | **Brief:** `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § Phase 3 | **Severity:** MEDIUM (cost-reduction, no incident) | **Owner:** agent-father + dev-mcp-server (paired) | **Parent:** Sprint 1968 CLOSED (Phase 3 deferred per L42 sprint hygiene) | **Parallel with:** Sprint 1959 soak (watchdog-4 unlock 2026-05-22T21:00Z) + Sprint 1965c soak (through 2026-05-23T18:00Z) + Sprint 1967 dev fix slate.

## Vision
Land the 3 deferred Phase 3 levers (L-6 tick-snapshot, L-8 composite step-0 skill, L-9 server-side signal_type filter). Target: ~50% cumulative token reduction (1968a + 1968b + 1968c) + ~100 fewer MCP calls/trading-day. Additive API change (L-9 default=null preserves backward compat); ephemeral file write (L-6, gitignored); composite skill consolidation (L-8, 3 skill reads → 1 per cowork agent cycle).

## Sequencing (PO decided c240)
**Wave 1 (NOW):** P01 (agent-father lead + dev-mcp-server pair on apps/mcp-server/ portion) + P02 (agent-father solo). Both parallel-safe: P01 writes cowork-team.md + cycle-bootstrap SKILL; P02 creates NEW step-0-cowork SKILL + updates 7 agent always_load entries — different files in .claude/.
**Wave 2 (gated on agent-father-1968c-p01-done.json):** P03 (dev-mcp-server) — releases dev-mcp-server slot from P01's apps/mcp-server/ portion before starting schema work on getAgentSignals.ts. Avoids same-agent context-switching collision (1962-B-01 precedent).
**Anti-pattern rejected:** Firing all 3 in parallel. P01 + P03 both load dev-mcp-server zone; recurring-bug-escalation policy + 1962-B-01 race evidence say serialize same-zone work.

## Scope
**IN:**
- **1968c-P01:** L-6 tick-snapshot file writer. Cowork-team dispatcher writes `docs/data/cycle-snapshot-<TICK>.json` pre-spawn; 3-5 cowork agents read if ±7m fresh; fallback to direct `get_cycle_bootstrap` if absent/stale. Atomic write. Gitignored. Est savings: ~168 MCP calls/trading-day. Owner: agent-father + dev-mcp-server. Handoff: `docs/handoffs/TASK_1968c-P01-tick-snapshot.md`.
- **1968c-P02:** L-8 composite `step-0-cowork` skill consolidating notebook-read + cycle-bootstrap + regime-extraction. Target ~60L. Error boundaries preserved (fail-loud intact). 7 cowork agents updated to call composite. Est savings: 14 Read I/O per 15-min tick. Owner: agent-father. Handoff: `docs/handoffs/TASK_1968c-P02-step0-skill.md`.
- **1968c-P03:** L-9 `get_agent_signals` optional `signal_type` parameter (additive, default=null = all). Server-side filter applied pre-serialization. 3 agents updated (news-scout, alert-commander, market-watcher). 40-60% payload reduction verified. Owner: dev-mcp-server. Handoff: `docs/handoffs/TASK_1968c-P03-server-filter.md`.

**OUT:**
- Any BCTC path touch (NFR-3 freeze in force).
- Any DB schema change (NFR-2).
- Any cron schedule change.
- Retroactive bootstrap-pattern rewrite for non-cowork agents.

## Success Metric
- **AC-1 (P01):** `docs/data/cycle-snapshot-<TICK>.json` written by cowork-team dispatcher pre-spawn; 5 cowork agents read with ±7m freshness check; fallback path on cache miss; gitignored. 2 fewer get_cycle_bootstrap + 2 fewer get_macro_snapshot per tick measured in cowork cycle logs.
- **AC-2 (P02):** `.claude/skills/step-0-cowork/SKILL.md` ≤120L; 7 cowork agents reference in always_load; error boundary tests GREEN (notebook fail STOP, bootstrap fail STOP, regime fail FALLBACK NEUTRAL); tsc 0 errors + bun test GREEN.
- **AC-3 (P03):** `signal_type` Zod parameter added; server-side filter applied; backward compat verified (no-param call returns full set); 40-60% payload reduction measured for filtered calls; ≥3 agents updated; existing tests baseline ≥9358 PASS (NOTE: PO refresh of P03 AC-8 anchor from ≥9277 to ≥9358 per dev-mcp-server-1967-02-done.json verified baseline).
- **AC-4 (sprint close):** All 3 P-tasks QA APPROVED → PO emits `docs/signals/po-1968c-close.json` with cumulative Phase 1+2+3 savings tally.

## Tasks
| ID | Title | Priority/Size | Owner | Zone | Status | Depends |
|----|-------|---------------|-------|------|--------|---------|
| 1968c-P01 | L-6 tick-snapshot file writer (cowork-team + cycle-bootstrap) | HIGH / M | agent-father + dev-mcp-server | `.claude/` + `apps/mcp-server/` | READY (wave 1) | — |
| 1968c-P02 | L-8 composite step-0-cowork skill | HIGH / M | agent-father | `.claude/` | READY (wave 1, parallel with P01) | — |
| 1968c-P03 | L-9 get_agent_signals server-side signal_type filter | HIGH / M | dev-mcp-server | `apps/mcp-server/` | GATED (wave 2, after P01 done) | P01 |

## Dispatch Slate — Wave 1 (this kickoff)
```
DISPATCH:
  - agent-father → 1968c-P01 (lead) + dev-mcp-server pair-claim on apps/mcp-server/ portion
      inner self-claim task:1968c-P01 (kind=sprint-task, ttl=7200s)
      run .claude/flows/agent-father/main.md
      read docs/handoffs/TASK_1968c-P01-tick-snapshot.md
      read docs/architecture-briefs/2026-05-21-token-toolcall-economy.md § L-6 Tier 2
      execute .claude/ + apps/mcp-server/ surgery per AC-1..AC-8
      emit docs/signals/agent-father-1968c-p01-done.json
      handoff to QA for AC validation
  - agent-father → 1968c-P02   inner self-claim task:1968c-P02 (kind=sprint-task, ttl=7200s)
      run .claude/flows/agent-father/main.md
      read docs/handoffs/TASK_1968c-P02-step0-skill.md
      read docs/architecture-briefs/2026-05-21-token-toolcall-economy.md § L-8 Tier 3
      create .claude/skills/step-0-cowork/SKILL.md + update 7 cowork agent always_load entries
      emit docs/signals/agent-father-1968c-p02-done.json
      handoff to QA for AC validation
PENDING (wave 2, after agent-father-1968c-p01-done.json):
  - dev-mcp-server → 1968c-P03   inner self-claim task:1968c-P03 (kind=sprint-task, ttl=7200s)
      run .claude/flows/dev-mcp-server/main.md
      read docs/handoffs/TASK_1968c-P03-server-filter.md
      read docs/architecture-briefs/2026-05-21-token-toolcall-economy.md § L-9 Tier 3
      add signal_type optional param to getAgentSignals.ts + tests + flow updates
      emit docs/signals/dev-mcp-server-1968c-p03-done.json
GATED (sprint close):
  - po close → when all 3 P-tasks QA APPROVED + cumulative Phase 1+2+3 impact tallied
```

## Constraints / Boundary
- **No BCTC touch.** All 3 tasks are .claude/ + apps/mcp-server/ scope; BCTC freeze irrelevant.
- **WIP cap 2/2.** Wave 1 uses agent-father (1 slot) + agent-father (2 slots — same agent serial-claims both, OR splits into two agent-father instances per task-lock Phase 4). dev-mcp-server pair-claim on P01 counts toward dev-mcp-server WIP. Wave 2 uses dev-mcp-server (1 slot, P03 only).
- **Phase 3 routed correctly through PM → PO → dev-team.** PO does not bypass PM decomposition.
- All standing OBSERVE gates preserved (1957d, 1955c, 1907a-verify, 1941b, 1922g, 1965c-soak, 1959-watchdog-4 hold). None touch 1968c scope.

## Cross-Refs
- Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § Rollout Plan § Phase 3
- Parent close: `docs/signals/po-1968-closed.json` (1968 closed; Phase 3 deferred to 1968c per L42)
- Signals: `docs/signals/po-1968c-approved.json` + `docs/signals/pm-1968c-opened.json`

---

# Sprint 1968 Goal — Token & Tool-Call Economy Phase 1 (agent-father-only, zero-code) [CLOSED 2026-05-21T20:53Z]

**Status:** OPEN 2026-05-21T19:10Z (po c235 kickoff) | **Brief:** `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` | **Severity:** MEDIUM (cost-reduction, no incident) | **Owner:** agent-father (single executor, Phase 1 only) | **Parallel with:** Sprint 1959 soak (watchdog-4 unlock 2026-05-22T21:00Z) + Sprint 1965 soak (1965c qa OBSERVE through 2026-05-23T18:00Z) + Sprint 1967 orchestration audit (read-only architect in flight, brief expected ~22:01Z).

## Vision
Land 5 zero-risk levers (L-1..L-5 from brief) that reduce per-cycle context size 25–35% and remove ~56 redundant MCP calls/trading-day. All edits are agent-system .md surgery — no production code, no Docker rebuild, no schema change. Phase 2 (L-4 consolidated `get_agent_signals` + L-7 EOD notebook commit batch) folds into Sprint 1968 cycle-2 after Phase 1 lands. Phase 3 (L-6 tick snapshot, L-8 composite skill, L-9 server-side filter) is deferred — requires dev-team via PM after Phase 1 ratification.

## Coordination Point (HARD)
Agent-father MUST NOT start 1968a until Sprint 1967b architect brief lands (`docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`). The 1967 audit may surface additional always_load / notebook / signal-schema drift findings that overlap with brief levers L-1..L-3. Agent-father reads BOTH briefs before file surgery to avoid double-fixing the same agent .md. If 1967b finds nothing in these zones, agent-father proceeds with 1968 brief as-is. ETA: ~2026-05-21T22:01Z (1967b time-box).

## Cross-Ref Check Completed (PO c235)
- 1963-MW-IDENTITY: alert-commander.md line 82–84 still has `mcp-tools.md trigger: startup`. The MW-identity fix did NOT promote it to always_load. **L-1 for alert-commander remains valid.** Agent-father should decide L-1 outcome based on whether the structural runtime test (does alert-commander need mcp-tools.md on every cycle to construct MCP calls?) returns YES → promote to always_load; NO → change `trigger: startup` → `trigger: mcp_tool_unavailable`.
- 1964-AC-ENUM: schema-fix is a dev-mcp-server task (Sprint 1967 slate). L-3 (signal payload pointer rule) is additive to signal-dashboard skill — orthogonal, no conflict.
- 1965-COVERAGE-SWEEP: capability-vs-flow drift — orthogonal to Phase 1 token surgery.
- BCTC freeze: Phase 1 is agent-system .md only — no BCTC paths touched. Safe.

## Scope
**IN (Phase 1 — Cycle 1, agent-father only):**
- L-1: Fix `trigger: startup` lazy-load semantics in 4 agents (news-scout, alert-commander, financial-analyst, report-analyzer). Convert to real conditional triggers OR promote to `always_load` with size-justification comment. SSOT knowledge files unchanged; only the trigger field semantics changes.
- L-2: Archive + trim 7 over-size notebooks to ≤120L (qa=1149L, dev-frontend=384L, architect=310L, dev-team=286L, pm=269L, ba=234L, system-auditor=211L). Archive remainder to `docs/archive/notebooks/<agent-id>-2026-05-21.md` BEFORE overwrite. Preserve `## Carry-over` section in live notebook. Update `.claude/skills/notebook-write/SKILL.md` hard cap to 120L.
- L-3: Add signal payload pointer rule to `.claude/skills/signal-dashboard/SKILL.md` — DASHBOARD summary >120 chars → truncate to 80 chars + `→ docs/handoffs/...` pointer. pm sprint signals payload ≤800 chars JSON (title + scope + task IDs only); full plan goes in `docs/handoffs/SPRINT_NNN.md`. No retroactive payload rewrite — applies to NEW signals from cycle-2 onward.
- L-5: Apply ULTRA caveman tier to cycle-status pings in news-scout (`stage-log-notify.md`) + market-watcher (`cycle.md` Step 5b) + alert-commander session-log headers. No format invention — ULTRA tier already defined in `.claude/skills/caveman/SKILL.md`.

**IN (Phase 2 — Cycle 2, dispatched only after Phase 1 ratified):**
- L-4: Consolidate news-scout `get_agent_signals` 3 calls → 1 call at stage-bootstrap with SELF_SIGNALS_CACHE; downstream dedup checks read cache. Must confirm `get_agent_signals` supports `hours_back=7` parameter; if not, file a PM TASK_NNN dependency-spec to dev-mcp-server.
- L-7: Move market-watcher + news-scout notebook commit from per-cycle to EOD batch (08:59 UTC) under market-watcher `eod.md`. Off-hours cycles (every 4h) keep per-cycle commits — too rare to batch.

**OUT (Phase 3 — DEFERRED, requires PM TASK_NNN + dev-team execution after Phase 1 lands):**
- L-6 tick-snapshot cache (`docs/data/cycle-snapshot-<TICK>.json` + cowork-team write step + 3 cowork agent fallback read paths). Requires dev-mcp-server + agent-father co-execution.
- L-8 composite step-0-cowork skill. Requires careful error-boundary preservation; needs qa ratification.
- L-9 `get_agent_signals` server-side `signal_type` filter. Requires dev-mcp-server tool-schema change.

**OUT (this sprint never):**
- Any production code change.
- Any Docker rebuild.
- Any DB schema change.
- Any BCTC path edit (BCTC freeze in force until 1954c lands).
- Any cron schedule change.

## Success Metric
- **AC-1 (L-1):** All 4 agent .md files have `trigger: startup` replaced with a real conditional trigger OR `always_load` promotion. Each promotion to `always_load` carries an inline `# justification: ...` comment. PO sanity-checks the 4 files.
- **AC-2 (L-2):** 7 notebooks ≤120L. Archive files exist at `docs/archive/notebooks/<agent-id>-2026-05-21.md` with the trimmed content. `## Carry-over` section present in every live notebook. `.claude/skills/notebook-write/SKILL.md` hard cap updated to 120L.
- **AC-3 (L-3):** `.claude/skills/signal-dashboard/SKILL.md` contains the new "payload pointer rule" section. No retroactive rewrite needed.
- **AC-4 (L-5):** news-scout `stage-log-notify.md` + market-watcher `cycle.md` Step 5b + alert-commander session-log header lines route cycle-status pings through ULTRA tier per caveman skill.
- **AC-5 (commit):** Single commit per lever (5 commits) OR one batched commit if all 5 land same cycle. Commit messages follow `docs/policies/commit-convention.md`.
- **AC-6 (ratification):** PO sanity-check after agent-father emits `docs/signals/agent-father-1968a-phase1-done.json`. PO closes Phase 1 with `docs/signals/po-1968a-phase1-approved.json` → dispatches Phase 2 (cycle-2).

## Tasks
| ID | Title | Priority/Size | Owner | Zone | Status | Depends |
|----|-------|---------------|-------|------|--------|---------|
| 1968a | **Sprint 1968 ANCHOR — Phase 1 token/tool-call surgery (L-1..L-5).** Read brief §2 Tier-1 + this SPRINT_GOAL §Scope (Phase 1) + Sprint 1967b architect brief (when it lands). Execute 5 levers as .md edits. Emit `docs/signals/agent-father-1968a-phase1-done.json` (caveman ultra) with per-lever ACK lines. Time-box 2h. | HIGH / M | agent-father | `.claude/` + `docs/` (read-only on architecture-briefs) | BLOCKED (gated on 1967b brief landing) | 1967b-brief-landed |
| 1968b | **Sprint 1968 Cycle-2 — PENDING: Phase 2 (L-4 + L-7).** Dispatched only after PO emits `docs/signals/po-1968a-phase1-approved.json`. L-4 = news-scout `get_agent_signals` consolidation in stage-bootstrap + stage-signals. L-7 = market-watcher + news-scout EOD notebook commit batch. PRE-CONDITION CHECK: agent-father MUST verify `get_agent_signals` supports `hours_back=7` parameter; if not, escalate to PM as TASK_NNN dependency-spec to dev-mcp-server BEFORE proceeding with L-4. Time-box 2h. | MEDIUM / S | agent-father | `.claude/` | PENDING | 1968a-approved |
| 1968c | **Sprint 1968 Phase 3 — PENDING: PM conversion to TASK_NNN slate.** Dispatched only after 1968b approved. L-6 tick-snapshot + L-8 composite skill + L-9 server-side filter → each gets a TASK_NNN row with zone + size + dependency. Cross-reference brief §2 Tier-2/Tier-3 + §3 Context-Tracking Safeguards. Time-box 1h. | MEDIUM / S | pm | `docs/` | PENDING | 1968b-approved |

## Dispatch Slate — Cycle 1 (this kickoff)
```
DISPATCH:
  - (no immediate dispatch — agent-father gated on 1967b brief landing ~22:01Z)
PENDING (auto-dispatch when 1967b brief lands AND po sanity-check on 1967b passes):
  - agent-father → 1968a   inner self-claim task:1968a (kind=sprint-task, ttl=7200s)
                            run .claude/flows/agent-father/main.md
                            read docs/architecture-briefs/2026-05-21-token-toolcall-economy.md §2 Tier-1
                            read docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md (for overlap merge)
                            read docs/SPRINT_GOAL.md §Sprint 1968 §Scope
                            execute L-1..L-5 as .md edits (no code, no Docker)
                            emit docs/signals/agent-father-1968a-phase1-done.json (caveman ultra)
                            handoff to PO for AC-6 sanity-check + ratification
PENDING (Cycle 2, after po-1968a-phase1-approved.json):
  - agent-father → 1968b   Phase 2 levers L-4 + L-7
PENDING (Cycle 3, after po-1968b-phase2-approved.json):
  - pm → 1968c             decompose Phase 3 levers into TASK_NNN slate for dev-team
GATED (Sprint close):
  - po close → when Phase 1 + Phase 2 ratified + Phase 3 PM slate created
```

## Constraints / Boundary
- **No code change.** Phase 1 + Phase 2 are agent-system .md surgery only.
- **No Docker rebuild.** Phase 1 + Phase 2 are filesystem edits + signal emit.
- **1967b gate.** Agent-father waits for 1967b brief to land (~22:01Z) and PO sanity-checks the overlap window before dispatching 1968a. Prevents double-fixing the same .md surface.
- **Phase 3 routed through PM.** L-6/L-8/L-9 are dev-team work; PO does not bypass PM.
- **BCTC freeze in force.** Phase 1 + Phase 2 don't touch BCTC paths — safe by scope.
- **WIP cap.** agent-father is its own zone; does not collide with dev-mcp-server (1965b done, 1967 in audit) or dev-rag-service (1959-watchdog-4 hold) or ba (1967a in flight) or architect (1967b in flight).
- All standing OBSERVE gates preserved (1957d, 1955c, 1907a-verify, 1941b, 1922g, 1965c-soak, 1959-watchdog-4 hold). None touch 1968 scope.

---

# Sprint 1967 Goal — Orchestration Bug & Conflict Audit + FIX (full chain)

**Status:** OPEN 2026-05-21T19:01Z (po c234 kickoff) — SCOPE UPGRADE 2026-05-21T19:02Z (user /goal): full chain PO → BA → architect → PM → dev-team; drive to FIX, not just catalogue | **Brief target:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` | **Severity:** HIGH | **Parallel with:** Sprint 1959 soak (watchdog-4 unlock 2026-05-22T21:00Z) + Sprint 1965 soak (1965c qa OBSERVE through 2026-05-23T18:00Z).

## Vision
User-direct request (upgraded 2026-05-21T19:02Z): "fix all bugs/conflicts in orchestration agent system". Detect, catalogue, **AND fix** every orchestration bug, race, dispatch conflict, signal collision, cron overlap, agent-spawning recursion, dead-handoff, identity-confusion, and lock-contention surface currently in the live agent system. Do NOT stop at a catalogue — drive each CONFIRMED finding to "fixed" state via dev-team. DEFERRED findings require explicit architect+PO sign-off.

## Chain — Strict Order (per user directive 2026-05-21T19:02Z)
```
PO (this commit)
  -> BA               (decompose audit scope into atomic requirements per surface 1-7)
     -> architect    (run orchestration audit; brief listing each bug w/ severity+repro+fix design)
        -> PM        (convert findings -> TASK_NNN with handoff doc + zone + size + dependency)
           -> dev-team (developer + zone specialists apply fixes; WIP 2/2; task-lock Phase 4)
              -> qa  (per-task APPROVE + sprint sign-off when all CONFIRMED bugs DONE)
```
Hard rule: BA gate is mandatory. Architect cannot start until PO approves REQ_1967.

## Scope
**IN (audit surfaces — same as before, now driven to fix):**
1. Inter-agent comms layer — signal-bus payload schemas, MCP tool enums (e.g. 1964-AC-ENUM), DASHBOARD row reader/writer contracts, caveman handoff format, signal-file naming + write contract.
2. Flow files — race/idempotency in flows/*/main.md, sub-flow boundaries (e.g. po/main.md JUMP-TO + RETURN block discipline), recursive spawn risk (dev-team / cowork-team dispatcher), agent identity declarations (1963-MW-IDENTITY).
3. Dispatch routing — `.claude/skills/dispatch/SKILL.md` table coverage, hidden general-purpose fallbacks, dispatcher-wrap vs inner self-claim symmetry, task-lock acquisition/release path (`.claude/skills/task-lock/SKILL.md`).
4. Signal bus + DASHBOARD — race between writer prune and reader scan, stale-race (e.g. 1962-B-01 pm signal landed after PO closed sprint), missing dedup keys, processed/ migration races.
5. Cron schedule — overlap windows, `crashed` status that blocks re-fire (OBSERVE-1955d evidence), watchdog grace-period vs scheduler tick collision, master cowork dispatcher fire-drift (cowork-team-20260521T185005Z drift_min=5).
6. Agent definition pathology — capability text vs flow execution drift (1965-COVERAGE-SWEEP), `always_load` discipline, lazy-load triggers, identity stanza completeness.
7. Lock contention + race — task-lock Phases 1–4 stale-claim TTL, dispatcher-wrap leak, inner-claim missed on agent crash, dual-claim conflict, TASKS.md / DASHBOARD / pipeline-state.json concurrent-writer last-writer-wins.

**OUT:**
- Microservice-internal concurrency (e.g. node-cron starvation already shipped 1958a). Only orchestration-layer instances counted here.
- Re-running deep RCAs already captured (1958-rca, 1958-rca-2, 1954-bctc-write-chain) — link them, don't redo.
- Live ops data-staleness (1959-B-01/B-04/B-05) — ops-lane, not orchestration.
- Cosmetic doc drift unless it affects orchestration behaviour.

## Success Metric
- **AC-1 (BA):** `docs/REQ_1967.md` exists with ≥7 atomic requirements REQ-1967-1..7 (one per surface). PO ratifies via `docs/signals/po-1967-ba-approved.json`. **Hard gate: architect cannot start until this signal lands.**
- **AC-2 (architect):** Brief at `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` (≤600 L). Each item: `{id, surface, severity (CRIT/HIGH/MED/LOW), repro_or_evidence_pointer, current_behaviour, expected_behaviour, suggested_fix_design, suggested_fix_owner, suggested_fix_size (XS/S/M/L), depends_on}`. Minimum 5 items; "no findings" per surface must be explicit (silence ≠ pass).
- **AC-3 (PM):** Each architect CONFIRMED finding has a TASKS.md Backlog row `1967-bug-NN` with handoff doc `docs/handoffs/TASK_1967-bug-NN.md`. DEFERRED findings get a row with "Blocked by" = "architect+PO sign-off required".
- **AC-4 (dev-team):** All CONFIRMED-severity tasks ship with passing tests + tsc 0 errors + qa APPROVE signal `docs/signals/qa-1967-bug-NN-approved.json`. Zone-routing per `.claude/skills/dispatch/SKILL.md`. WIP 2/2 + task-lock Phase 4 dispatcher-wrap respected.
- **AC-5 (qa sprint sign-off):** `docs/signals/qa-1967-sprint-signoff.json` emitted only when ALL CONFIRMED-severity tasks status=Done OR DEFERRED-with-signoff. No silent skips.
- **AC-6 (regression guard):** post-sprint smoke: TASKS.md janitor (Sprint 1965) shows zero divergence; cron_job_runs shows zero overlap windows 7d post-deploy; DASHBOARD has zero `## po` rows of type `orchestration-anomaly` for 48h.
- **AC-7 (cross-link):** Brief cross-links 1963-MW-IDENTITY, OBSERVE-1955d/e, 1962-B-01, 1964-AC-ENUM, 1965-COVERAGE-SWEEP so chain is auditable.

## Seed Evidence (PO pre-curated from c234 audit)
| # | Surface | Evidence | Notes |
|---|---------|----------|-------|
| E-1 | Agent identity / MCP tool awareness | 1963-MW-IDENTITY recurrence pattern (170504Z FAIL after 163840Z SUCCESS) — market-watcher cycles intermittently claim "cannot directly call MCP tools through the gateway" | agent-father shipped a fix; question: is the fix structurally sufficient or is there an underlying race in the agent-spawning prompt-construction layer? |
| E-2 | Cron re-fire after crash | OBSERVE-1955d FAIL — both `vnstockTradingStatsRefresh` + `vnstockFundamentalsRefresh` crashed once on 2026-05-18, NEVER refired despite weekly schedule. `cronJobRepo.markCrashed()` may not release schedule slot | Architect must confirm whether `status=crashed` blocks scheduler re-pickup; could affect ALL cron jobs sharing this status path |
| E-3 | Signal-timing race PM ↔ PO | 1962-B-01: pm `plan_blocked` signal at 22:30Z fired AFTER po had already closed sprint at 20:48Z. Sprint state changed between pm's read and pm's write | Indicates missing CAS/version-check on sprint-state transitions, or pm reading stale TASKS.md snapshot |
| E-4 | MCP signal enum schema | 1964-AC-ENUM: alert-commander's `verified_decision` signal_type rejected by `post_agent_signal` schema; documented fallback `signal_feedback` ALSO rejected. Agent silently degraded | Schema vs documented contract drift — how many other "documented but not implemented" signal types exist? |
| E-5 | Capability vs execution drift | 1965-COVERAGE-SWEEP: news-scout.md + market-watcher.md claim "all watchlist tickers" but execution touches 5/34 (PC1/GAS/PLX/VIC/VPB) | Identity/capability text is documentation; flow.md is execution truth. Are there other documented-but-not-executed capabilities across the 35 agents? |
| E-6 | Cowork dispatcher drift | `cowork-team-20260521T185005Z.json` shows `drift_min=5` (fire-time vs schedule slot). `silent=true matched_slots=[]` — was this a wasted tick or a correctly idle one? | Drift accumulation may explain market-watcher intermittent failures (E-1) — same root? |
| E-7 | Recurring-bug-escalation effectiveness | BCTC freeze in force since 1954c gate; multiple sprints (1965, 1959, 1967) running in parallel while 1954c sits BLOCKED. Is the freeze policy actually freezing, or is unrelated work bypassing intent? | Policy/orchestration contract test |

## Tasks (Cycle 1 — this kickoff)
| ID | Title | Priority/Size | Owner | Zone | Depends |
|----|-------|---------------|-------|------|---------|
| 1967a | **BA decomposition** — produce `docs/REQ_1967.md` with ≥7 atomic requirements REQ-1967-1..7 (one per surface 1–7 in §Scope). Each REQ has check-list testable items mapping to surface bullets. No architecture proposals — pure decomposition. Explicit out-of-scope subsection mirroring §Scope OUT. Use 7 seed evidence rows below as testability anchor. | HIGH / 2h | ba | `docs/` | — |

## Pending Tasks (later cycles — sequenced)
| ID | Title | Priority/Size | Owner | Zone | Depends |
|----|-------|---------------|-------|------|---------|
| 1967b | **Architect audit** — read-only orchestration scan; produce `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` enumerating every CONFIRMED bug per surface with severity + repro + fix design. Cross-link 1963-MW-IDENTITY, OBSERVE-1955d/e, 1962-B-01, 1964-AC-ENUM, 1965-COVERAGE-SWEEP. SUSPECTED entries flagged DEFERRED-NEEDS-PROBE. | HIGH / 4h | architect | multi (read-only) | 1967a APPROVED |
| 1967c | **PM task slate** — convert each architect CONFIRMED finding into one TASKS.md row `1967-bug-NN` with handoff doc `docs/handoffs/TASK_1967-bug-NN.md`. DEFERRED findings get row with explicit "Blocked by". WIP-cap priority queue documented in dispatch slate. | HIGH / 2h | pm | `docs/` | 1967b brief landed |
| 1967-bug-NN (slate) | **dev-team fix tasks** — apply fixes per PM slate; per-task qa APPROVE; zone-routing per dispatch skill; WIP 2/2 respected. | per-finding | dev-team | per-finding | 1967c slate complete |
| 1967z | **qa sprint sign-off** — emit `docs/signals/qa-1967-sprint-signoff.json` when all CONFIRMED bugs Done. PO closes via `docs/signals/po-1967-close.json`. | HIGH / XS | qa | qa | all 1967-bug-NN Done |

## Dispatch Slate — Cycle 1 (this kickoff)
```
DISPATCH:
  - ba → 1967a   inner self-claim task:1967a (kind=sprint-task, ttl=7200s)
                 run .claude/flows/ba/main.md
                 read docs/SPRINT_GOAL.md §Scope + §Seed Evidence
                 produce docs/REQ_1967.md (≥7 REQ items, one per surface)
                 emit docs/signals/ba-1967a-spec-ready.json (caveman ultra)
                 handoff to PO for AC-1 approval gate
PENDING (Cycle 2, after po-1967-ba-approved.json):
  - architect → 1967b   read REQ_1967 + SPRINT_GOAL.md §Scope; run audit; brief landed
PENDING (Cycle 3, after 1967b brief + PO sanity check):
  - pm → 1967c    decompose findings into TASK_1967-bug-NN slate
PENDING (Cycle 4+, after pm slate complete):
  - dev-team → 1967-bug-NN slate   apply fixes per priority + WIP cap; qa validates each
GATED (Sprint close):
  - qa sprint sign-off → po close   when all CONFIRMED bugs Done or DEFERRED-with-signoff
```

## Gate decision after 1967b (architect brief)
- ≥1 CRITICAL with clear repro → PM dispatches CRITICAL fix tasks immediately under WIP 2/2 (parallel to 1959 if zones don't collide).
- All HIGH/MED → PM queues against current WIP; dispatch can start once 1965c soak ends (2026-05-23T18:00Z) for any dev-mcp-server-zone fix.
- "No findings" on a surface → architect must explicitly state "scanned, no orchestration risk found" (silence ≠ pass).
- ≥3 findings on same surface → recurring-bug-escalation triggers; architect runs structural design pass before dev fixes that surface.

## Constraints / Boundary
- **BA gate is mandatory.** Architect cannot start until `docs/signals/po-1967-ba-approved.json` lands. User explicit directive 2026-05-21T19:02Z: do NOT skip BA.
- **Fix to completion.** PO does NOT close Sprint 1967 until ALL CONFIRMED bugs status=Done OR DEFERRED with architect+PO sign-off. Session-scoped goal hook enforces this.
- **WIP cap unchanged** (2/2 dev-zone). Sprint 1967 fix tasks interleave with 1959-watchdog-4 (unlock 2026-05-22T21:00Z) and 1965c-soak (qa-owned).
- **Parallel sprint rule:** Sprint 1967 runs IN PARALLEL with 1959 + 1965 soaks (different agents/zones).
- **BCTC freeze in force.** 1967-bug-NN tasks MUST NOT touch BCTC paths until 1954c lands; route to separate slate row gated on 1954c.
- **Task-lock Phase 4 dispatcher-wrap** applies to every dev spawn; inner self-claim respected.
- All standing OBSERVE gates preserved (1957d, 1955c, 1907a-verify, 1941b, 1922g, 1965c-soak, 1959-watchdog-4 hold). None touch 1967 scope.
- Architect audit itself is read-only; fixes ship via dev-team in later cycles.

---

# Sprint 1965 Goal — TASKS.md Hardening Phase 1 (Option A — janitor cron)

**Status:** OPEN 2026-05-21T17:22Z (po c232 kickoff) | **Brief:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` | **Severity:** MEDIUM (preventive — divergence detection only, zero code change on auditor side) | **Parallel sprint:** Sprint 1959 (still OPEN-IN-SOAK until watchdog-4 ships post-2026-05-22T21:00Z)

## Vision
Surface task-lock vs TASKS.md vs pipeline-state divergence within 24h so PO can reconcile manually — without coupling coordination.db health to TASKS.md writability. If divergence is rare (≤2/week), Option C echo cron stays deferred indefinitely; if frequent, that data justifies Sprint 1966 Phase 2.

## Scope
**IN:**
- 1965a — agent-father DESIGN: new section `## TASKS.md Reconciliation Pass` in `docs/agents/system-auditor/handlers.md` + new dimension D4 in `docs/agents/system-auditor/audit-dimensions.md` (no code).
- 1965b — dev-mcp-server IMPLEMENT + smoke: system-auditor 03:00Z pass calls `task_list_held`, emits DASHBOARD `## po` row per `.claude/skills/signal-dashboard/SKILL.md` on divergence (AC-1..AC-5 per brief §6).
- 1965c — qa OBSERVE 48h soak across 2 cron passes verifying AC-1..AC-5.

**OUT:**
- Sprint 1966 Option C echo cron (brief §7 rows d/e) — gated on 1965c PASS + 1959-watchdog-4 soak complete (2026-05-22T21:00Z). Do NOT open in this kickoff.
- Option B edit-guard — ruled out per brief §5 (couples coordination.db health to governance layer).

## Success Metric
- AC-1: system-auditor session log shows `task_list_held` call at 03:00Z±5min on both observation days.
- AC-2: When a sprint-task lock is held with TASKS.md status ≠ `In Progress`, DASHBOARD `## po` row appears within 24h.
- AC-3: Clean-day pass produces ZERO false-positive `## po` rows.
- AC-4: `task_list_held` empty AND `pipeline-state.json` `activeTaskId` non-null → DASHBOARD alert emitted.
- AC-5: `git log --all --oneline -- docs/TASKS.md` detects any pair of commits <30s apart on same row → alert.

## Tasks
| ID | Title | Priority/Size | Owner | Zone | Depends |
|----|-------|---------------|-------|------|---------|
| 1965a | Design system-auditor TASKS.md reconciliation pass (handlers.md + audit-dimensions.md D4) | HIGH / 1h | agent-father | `.claude/` | — |
| 1965b | Implement + smoke: janitor 03:00Z calls task_list_held, emits DASHBOARD row on divergence | HIGH / 2h | dev-mcp-server | `apps/mcp-server/` | 1965a |
| 1965c | QA: 48h soak verifying AC-1..AC-5 across 2 observation days | MEDIUM / OBSERVE | qa | qa | 1965b |

## Dispatch Slate — Cycle 1 (this kickoff)
```
DISPATCH:
  - agent-father  → 1965a   inner self-claim task:1965a (kind=sprint-task, ttl=3600s)
                              read brief §3 Option A + §8 Phase 1
                              land handlers.md §reconciliation + audit-dimensions.md D4
                              emit docs/signals/agent-father-1965a-design-done.json
                              forward to dev-mcp-server for 1965b
PENDING (Cycle 2):
  - dev-mcp-server → 1965b  after 1965a design landed
PENDING (Cycle 3):
  - qa             → 1965c  after 1965b deployed (48h OBSERVE)
GATED (Sprint 1966):
  - 1966a/1966b deferred — gate = 1965c PASS + 1959-watchdog-4 soak unlock (2026-05-22T21:00Z)
```

## Gate decision after 1965c
- If janitor fires ≤2 false-positives across 48h AND rare-divergence pattern holds → Phase 2 (Option C echo cron) DEFERRED indefinitely per brief §5.
- If janitor fires daily with genuine divergences → Sprint 1966 dispatched post 1959-watchdog-4 unlock.

## Constraints / Boundary
- WIP cap unchanged. 1965a only dispatched now; 1965b waits on 1965a design landed; 1965c is OBSERVE-only.
- Sprint 1965 runs IN PARALLEL with Sprint 1959 soak — does NOT block soak boundary (different agents, different zones).
- No recurring-bug escalation. 1965 is preventive, not reactive.
- All standing OBSERVE gates preserved (1957d, 1955c, 1907a-verify, 1941b, 1922g, etc.). None touch 1965 scope.

---

# Sprint 1959 Goal — WATCHDOG HARDENING BATCH (post-1958 stack outage)

**Status:** OPEN-IN-SOAK — cycle-3 active work fully shipped 2026-05-20T21:40Z (w-9 ratified + w-10 dev-done in QA) | **Predecessor:** Sprint 1958 (incident response) CLOSED 2026-05-20T20:40Z | **Severity:** HIGH (preventive hardening — no live incident) | **Sign-off:** po-1958-close.json + po-1958-mid-checkpoint.json + po-1959-cycle-2.json + po-1959-cycle-3.json + po-1959-w9-ratified.json

**Close-out decision (cycle-3, 2026-05-20T21:27Z, reaffirmed 2026-05-20T21:40Z):** Sprint 1959 STAYS OPEN until watchdog-4 ships post-2026-05-22T21:00Z gate. The 48 h soak window is intentional pre-condition design, not idle time — closing now and reopening Sprint-1961-watchdog-finale fragments cognitive thread for no gain. Cycle-3 adds 2 XS follow-on tasks from watchdog-8 audit (standing policy w-9 ratified + Dockerfile remnant cleanup w-10 in QA). Soak-window pre-condition is the only thing left between now and 2026-05-22T21:00Z unlock.

---

## Sprint 1958 Close-Out (rolled into this file head)

| Task | Status | Commit / Signal |
|---|---|---|
| 1958-recovery | DONE 2026-05-20T20:06:31Z (ops, 11/11 UP, 4 min) | `e65849a1` · `docs/signals/ops-1958a-stack-recovered.json` |
| 1958-disk-relief | DONE 2026-05-20T20:31:26Z (ops, 26.5 GB reclaimed via `docker builder prune -a -f`, 32 GB free) | `e4a2df50` · `docs/signals/ops-1958-disk-relief.json` |
| 1958-rca (Phase 1) | DONE 2026-05-20T22:15Z (ops, recovery-hang root cause = disk 97% + RAG lifespan blocked on sentence-transformers + LanceDB 29 GB cold-load I/O) | `c8c2760c` · `docs/signals/ops-1958-rca.json` |
| 1958-rca-2 (Phase 2) | DONE 2026-05-20T22:45Z (ops, **KEY REFRAME:** 04:32Z–19:59Z was NOT an outage — staged deployment. All 5 hypotheses ruled out. No watchdog amendment needed.) | `26d8bd90` · `docs/signals/ops-1958-rca-2.json` |
| 1958-watchdog-2 | DONE 2026-05-20T20:36:19Z (dev-mcp-server, rag-service `start_period` 30s→60s, smoke PASS) | `76e5d1cd` · `docs/signals/dev-mcp-server-1958-watchdog-2.json` |

**Sprint 1958 verdict:** All in-flight tasks DONE. External validation: system-auditor T1 (commit `a50c08a3`) confirmed 11/11 UP + HEALTHY, prior CRITICAL `1958-A-01` flipped to RESOLVED, zero new anomalies. Sprint 1958 closes as INCIDENT RESPONSE COMPLETE. Remaining watchdogs (1, 3, 4, 5, 6) + new candidate watchdog-7 carry forward to Sprint 1959 below for cognitive separation.

**Why pivot 1958 → 1959 instead of accumulating watchdogs:** 1958 is "incident response" — recovery + RCA + first symmetric watchdog (RAG start_period). 1959 is "preventive hardening" — disciplined batch of remaining watchdogs without the incident pressure. Separate sprint = clean acceptance criteria + clear post-mortem boundary. User mental model: 1958 closed cleanly; 1959 = the follow-on hardening campaign.

---

## Sprint 1959 — Watchdog Hardening Batch

**Theme:** Convert the 1958 RCA + watchdog-2 audit findings into a structured backlog of disk-pressure + cold-start resilience improvements. Inherit 6 watchdogs from 1958-rca, add the watchdog-2 audit follow-up (flaresolverr), sequence to avoid re-creating the build-cache problem.

### Sprint Goal

(A) Land HIGH-priority watchdogs (pre-flight disk gate + symmetric flaresolverr fix) — they are XS/S effort and eliminate the next predictable failure mode. (B) Ship MEDIUM watchdogs (model pre-bake, disk-usage alert, LanceDB compaction) sequenced one-per-zone to respect WIP 2/2 + disk headroom. (C) Defer LOW watchdog-6 (async RAG lifespan) — heavier design work, blocked behind watchdog-3 stability.

### Tasks

| ID | Title | Priority/Size | Owner | Zone | Status | Depends |
|----|-------|---------------|-------|------|--------|---------|
| 1959-watchdog-1 | Pre-flight disk check before `docker compose up -d` (fail-fast if free < 15 GB) | HIGH / S | ops | ops/scripts | **DONE 2026-05-20** (commit `784905da`) | — |
| 1959-watchdog-3 | Pre-bake sentence-transformers model in `apps/rag-service/Dockerfile` | MEDIUM / S | dev-rag-service | apps/rag-service/ | **DONE 2026-05-20T21:01Z** (commit `66255410`; +920 MB image; cold-start 11–16 s; zero HF fetch) | 1958-disk-relief (DONE) |
| 1959-watchdog-7 | Bump `flaresolverr` healthcheck `start_period` 30s → 60s (symmetric to watchdog-2; Chromium cold-start same risk profile as RAG) | HIGH / XS | dev-mcp-server | apps/mcp-server/ (owns compose) | **DONE 2026-05-20T22:50Z** (commit `fd292896`; 3-of-3 restart smoke 11/13/11 s) | — |
| 1959-watchdog-5 | Disk-usage alert cron (BUG Telegram when `/app/data/lancedb` > 20 GB) | MEDIUM / S | dev-mcp-server | apps/mcp-server/ | **DONE+QA-PASS+OPS-DEPLOYED 2026-05-20** (commit `edafce4f`; ops `ab9c9a90`; 9/9 tests; cronJobCount 76→77; ops measured `/app/data` = 69 MB at deploy — well below 20 GB — alert runs SILENTLY at :47 UTC ticks by design + nominal disk state. Prior PO note "alert WILL fire on first tick" SUPERSEDED.) | — |
| 1959-watchdog-8 | Named-volume shadow audit (read-only) — `market_data`-mounted services scanned for Dockerfile assets baked under `/app/data/*`. | LOW / S | architect | multi (read-only) | **DONE 2026-05-21T00:30Z** (commit `a8a66bd1`; 2 CONFIRMED SHADOWs latent-risk only; brief `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md`; threshold ≥ 3 for Sprint 1960-volume-shadow-remediation NOT reached) | — |
| 1959-watchdog-9 | **NEW cycle-3** — Standing policy doc `docs/standards/dockerfile-volume-policy.md` (`/opt/<service>-assets/` convention; never bake under `/app/data/*`). Converts watchdog-8 finding into a forward guard. | LOW / XS | architect | docs/standards/ | **DONE+PO-RATIFIED 2026-05-20T21:40Z** (commit `59e043fa`; 59 L ≤ 60 AC; cross-linked from tree-map.md + docker-deployment-runbook.md Related; AC-9-1..4 all PASS; signal `docs/signals/po-1959-w9-ratified.json`) | watchdog-8 done |
| 1959-watchdog-10 | **NEW cycle-3** — Cleanup rag-service Dockerfile remnant `RUN mkdir -p /app/data/lancedb /app/data/models` → drop `/app/data/models` (no-op post-watchdog-3). One-line edit + rebuild + 60 s smoke. | LOW / XS | dev-rag-service | apps/rag-service/ | **DEV-DONE in QA** (commit `5466c84b`; QA owns row until APPROVE; PO does not touch) | watchdog-3 done |
| 1959-watchdog-4 | LanceDB compaction / archival cron (reclaim disk weekly) | MEDIUM / M | dev-rag-service | apps/rag-service/ | HOLD (unlock 2026-05-22T21:00Z — 48 h post-watchdog-3 ship) | watchdog-3 |
| 1959-watchdog-6 | Async-ify RAG lifespan handler (model load in thread pool) | LOW / M | dev-rag-service | apps/rag-service/ | DEEP HOLD (gates on watchdog-3 + watchdog-4 both stable 7 d) | watchdog-3, watchdog-4 |

### Acceptance Criteria (sprint-level)

- **AC-1 (watchdog-1):** PASS — `scripts/preflight-disk.sh` exists, executable, tested healthy + threshold-override, documented in `docs/protocols/docker-deployment-runbook.md`. Commit `784905da`.
- **AC-2 (watchdog-7):** PASS — `docker-compose.yml` `flaresolverr.healthcheck.start_period` = 60 s; 3-of-3 restart smoke PASS (11/13/11 s); API status=ok. Commit `fd292896`.
- **AC-3 (watchdog-3):** PASS — `apps/rag-service/Dockerfile` bakes model into `/opt/model-cache` (outside named-volume shadow); image +920 MB; cold-start 11–16 s; zero HF fetches (`HF_HUB_OFFLINE=1`). Commit `66255410`.
- **AC-4 (watchdog-5):** PASS — `diskUsageAlertJob.ts` registered in `cronConfig.ts` (`47 * * * *`); 9/9 unit tests GREEN; 12-tick under-threshold smoke = 0 Telegrams; over-threshold smoke fires exactly one BUG message; 6 h cooldown verified. QA APPROVED. Commit `edafce4f`. Ops DEPLOYED `ab9c9a90`. Runtime correction: `/app/data` measured 69 MB at deploy (Docker volume), well below 20 GB — alert runs SILENTLY at :47 UTC ticks BY DESIGN + nominal disk state (prior PO note "alert WILL fire" superseded).
- **AC-5 (watchdog-4):** PENDING — LanceDB compaction cron registered (weekly Mon 02:00Z); `cron_job_runs` ≥ 1 success within 7 d; LanceDB `du -sh` ≤ 25 GB after first run. Gates until 2026-05-22T21:00Z (48 h post-watchdog-3).
- **AC-6 (watchdog-6):** DEEP HOLD — RAG lifespan offloaded to `asyncio.to_thread()`; cold-start API 200 within 5 s. Gates on watchdog-3 + watchdog-4 stable for 7 d.
- **AC-8 (watchdog-8):** PASS — `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` exists; 9 services inventoried (2 CONFIRMED SHADOW, 2 SAFE, 5 OUT-OF-VOLUME); verdict + recommendation present. Commit `a8a66bd1`.
- **AC-9 (watchdog-9 NEW):** PASS — `docs/standards/dockerfile-volume-policy.md` exists (59 L ≤ 60); cross-linked from `docs/references/tree-map.md` (standards + Write Ownership) + `docs/protocols/docker-deployment-runbook.md` Related. Commit `59e043fa`. PO ratified 2026-05-20T21:40Z (`docs/signals/po-1959-w9-ratified.json`).
- **AC-10 (watchdog-10 NEW):** DEV-DONE / IN-QA — `apps/rag-service/Dockerfile` mkdir line trimmed (commit `5466c84b`); QA owns final verdict before ops rebuild + 60 s smoke.
- **AC-7 (close):** All tasks DONE OR explicitly deferred with rationale + `po-1959-close.json` emitted + DASHBOARD ops section pruned of `1958-A-01` (RESOLVED → CLOSED), lesson encoded in MEMORY.md.

### Constraints / Boundary

- **WIP cap 2/2 dev-zone respected per zone.** Cycle 1 dispatch (DISPATCH-NOW): ops watchdog-1 (separate ops lane) + dev-mcp-server watchdog-7 (1 of 2 slots) + dev-rag-service watchdog-3 (1 of 2 slots). Cycle 2 (after any cycle-1 ships): dev-mcp-server watchdog-5 backfills freed slot; dev-rag-service watchdog-4 backfills freed slot. Cycle 3 (≥ 7 d soak after watchdog-3+4): watchdog-6.
- **Disk-pressure self-prevention.** Do NOT queue all watchdogs in parallel — that's how the 26 GB build-cache problem was created (one rebuild per task in flight = exponential image bloat). One image-modifying watchdog (watchdog-3) at a time. Verify free disk ≥ 15 GB before each rebuild.
- **No recurring-bug escalation.** 1958 was the FIRST stack outage of this class. 1959 is preventive, not reactive.
- **OBSERVE gates preserved unchanged:** OBSERVE-1953g (2026-05-21T02:30Z), OBSERVE-1957d (2026-05-23T07:05Z), OBSERVE-1955c (2026-05-25T01:30Z), OBSERVE-1955d (2026-05-20T09:00Z), OBSERVE-1951d-verify (2026-05-21T08:30Z), OBSERVE-1907a-verify (2026-05-24T14:30Z), post-1945-verdict-resolution-scored-pct + post-1945-bug-storm-silence (2026-05-20T07:22Z, already past — read at next ops cycle), 1941b-signal-outcomes-seed-window (2026-05-25), 1922g-pharma-events-source-verify (2026-06-01). None touch watchdog scope.
- **Backlog "idle" reconciliation.** User-prompt note listed 1954a/1955a/1955b as idle backlog candidates — all three are already DONE per `docs/TASKS.md` Done section (1954a `2a5cc2a7`, 1955a `8b23795a`, 1955b `aaa4a06d`). No new backlog to pick up this cycle.

### Dispatch Slate — Cycle 1 (SHIPPED)

```
SHIPPED (Sprint 1959 cycle-1, all 3 ACs verified):
  - ops               → 1959-watchdog-1   DONE 2026-05-20  commit 784905da
  - dev-mcp-server    → 1959-watchdog-7   DONE 2026-05-20T22:50Z  commit fd292896
  - dev-rag-service   → 1959-watchdog-3   DONE 2026-05-20T21:01Z  commit 66255410 (+920 MB image; named-volume shadow finding flagged)
```

### Dispatch Slate — Cycle 2 (SHIPPED 2026-05-20T21:30Z–2026-05-21T00:30Z)

```
SHIPPED (cycle-2):
  - dev-mcp-server    → 1959-watchdog-5   DONE+QA-PASS 2026-05-20  commit edafce4f  (9/9 tests, cronJobCount 76→77)
  - architect         → 1959-watchdog-8   DONE 2026-05-21T00:30Z   commit a8a66bd1  (2 CONFIRMED SHADOWs latent-risk; threshold ≥3 not reached)
```

### Dispatch Slate — Cycle 3 (CLOSED 2026-05-20T21:40Z — all active dev work shipped)

```
SHIPPED (Sprint 1959 cycle-3):
  - architect         → 1959-watchdog-9   DONE+PO-RATIFIED 2026-05-20T21:40Z  commit 59e043fa  (policy 59 L; AC-9-1..4 PASS; bonus cross-link in docker-deployment-runbook)
  - dev-rag-service   → 1959-watchdog-10  DEV-DONE in QA               commit 5466c84b  (QA owns until APPROVE → ops rebuild)

HOLD (cycle-4 candidate, unlocks 2026-05-22T21:00Z):
  - dev-rag-service   → 1959-watchdog-4   (LanceDB compaction cron — 48 h soak post-watchdog-3)

DEEP HOLD (cycle-5):
  - dev-rag-service   → 1959-watchdog-6   (after watchdog-3 + watchdog-4 stable 7 d)

RATIONALE (closure):
  1. Cycle-3 close: w-9 RATIFIED, w-10 DEV-DONE in QA. Once w-10 QA-PASS lands + ops rebuilds, cycle-3 is fully shipped.
  2. Sprint STAYS OPEN until watchdog-4 ships post-2026-05-22T21:00Z. 48 h soak = intentional pre-condition design. No new dispatch until then.
  3. Disk-usage alert (w-5) runs SILENTLY at :47 UTC ticks — ops measured /app/data = 69 MB at deploy, well below 20 GB. Prior PO cycle-3 note "alert WILL fire" SUPERSEDED. Silent + correct is the actual outcome.
  4. Idle-window guidance (48 h): NO non-watchdog interleave. T1/T2 audit crons continue self-driving.
  5. OBSERVE gates intact: 1953g 2026-05-21T02:30Z + 1951d-verify 2026-05-21T08:30Z + 1957d 2026-05-23T07:05Z + 1907a-verify 2026-05-24T14:30Z + 1955c 2026-05-25T01:30Z. No new OBSERVE entries from cycle-3.
  6. Recurring-bug-escalation policy unchanged: BCTC freeze in force; 1954c is the next structural unlock.
```

### Hypothesis Bench — Watchdog Adequacy Question

The 1958-rca-2 verdict ("not an outage, normal staged deployment") removed the original hypothesis bench (5 outage scenarios). The remaining open hypotheses for 1959 are:

> **H-1959-1:** Pre-flight disk check (watchdog-1 DONE) + symmetric start_period bumps (watchdog-2 + watchdog-7 DONE) + pre-baked model (watchdog-3 DONE) together eliminate ≥ 90 % of the 1958-class cold-start hang surface area. Disk-usage alert (watchdog-5 in flight) + LanceDB compaction (watchdog-4 gated) protect the input precondition (free disk). watchdog-6 (async lifespan, deep hold) addresses the residual case where the model is in image but I/O contention still blocks the FastAPI event loop.
>
> **H-1959-2 (NEW, cycle-2):** The named-volume shadow class is bounded — most services that mount `market_data` write to `/app/data/*` only at runtime (DB writes, OCR cache, queue rows). watchdog-3 was the rare case where build-time content (model weights) needed to live at the same path. Audit (watchdog-8) will confirm: most likely outcome ≤ 1 additional service flagged; worst case = 2–3 silent shadowing assets, each fixable independently with the same /opt/<name>-cache pattern.

If H-1959-1 AND H-1959-2 hold, sprint 1959 closes cleanly. If a 2nd outage hits with the same fingerprint (cold-start hang) during the sprint, PO escalates to architect for structural rethink (potential RAG service redesign). If watchdog-8 audit returns ≥ 3 CONFIRMED SHADOWs, PO opens Sprint 1960-volume-shadow-remediation as a sequenced fix campaign (one rebuild at a time).

---

## Next

- Cycle-1 SHIPPED (3 watchdogs DONE: 1, 7, 3).
- Cycle-2 SHIPPED (2 tasks DONE: 5 + QA-PASS + OPS-DEPLOYED, 8).
- Cycle-3 SHIPPED (2 tasks): watchdog-9 DONE+PO-RATIFIED 2026-05-20T21:40Z (`59e043fa`); watchdog-10 DEV-DONE in QA (`5466c84b`) — QA owns until APPROVE → ops rebuild.
- Cycle-4 unlocks 2026-05-22T21:00Z (48 h post-watchdog-3 soak): watchdog-4 (LanceDB compaction).
- Cycle-5 deep hold: watchdog-6 (after watchdog-3 + watchdog-4 stable 7 d).
- Signals emitted this cycle: `docs/signals/po-1959-cycle-3.json` + `docs/signals/po-1959-w9-ratified.json`.
- Sprint 1959 self-closes once watchdog-4 ships + soak verifies + DASHBOARD ops section pruned + `po-1959-close.json` emitted.
