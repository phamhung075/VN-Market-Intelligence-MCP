# agents-architect — Notebook

## 2026-08-14T19:09:30Z

**Brief:** `docs/architecture-briefs/2026-08-14-wire-notebook-compose-actuator-system-auditor-pilot.md`

FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED (P0, PILOT system-auditor only). Wires the already-built/tested `scripts/notebook-compose.sh` (zero callers 8 days after landing — 2 prior signal-only handoffs both filed to `processed/` with no board row, neither landed) into system-auditor's notebook write: AC-1 one scripted-actuator call replacing the freehand compose ladder; AC-2 Bash-allowlist grant (the specific prior-attempt failure mode PO flagged); AC-3 `c<NNN>` derived in `main.md`'s own bash per PO ruling (script itself untouched); AC-4 concurrent-tier race closed via already-valid `task_kind="commit-mutex"` under a dedicated `task_id` — zero dependency on the BLOCKED `FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION` chain, matching PO's stated preference; AC-5 separate data-repair commit (fresh evidence this cycle: `c31626·18:20Z` still sits below `c99`/`c98`, defect live and ongoing, not historical); AC-6 hardens the dead marker reaper (14 stale `.tmp` now, up from 13) with a fail-loud empty-`FIRE_TICK` guard + a real per-cycle trace. Success Signal 3 replaced with a runtime-execution proof (script's `OK` marker embedded in a committed git message) per PO ruling, not a doc-grep. Routes through the existing tracked board row, not a fresh handoff — that exact "processed/ signal, no board row" shape is the second-order defect this task exists to close.

**Signal dropped:** `docs/signals/2026-08-14-wire-notebook-compose-actuator-system-auditor-pilot.json` → agent-father

---

## 2026-08-15T11:21:35Z

**Brief:** `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md`

Router-dispatched: user's hand-authored defer note sat inert in the wrong file (`cron-detect-loop/register.md`, governs a different skill's 4 jobs). Root-caused the real bug: `cron-cowork-team/SKILL.md` Step 1a's fast path keys only on `owner_client_session`; two OS processes sharing one `$CLAUDE_CODE_SESSION_ID` (4 distinct `claude` processes confirmed live on this host via `ps` this session) both pass it and each independently local-`CronCreate`s, invisible to each other. Corrected the router's own evidence: `owner_session` is the MCP **server's** own process/boot diagnostic (`taskClaimTool.ts:25-30`), not a client-terminal discriminator — cannot resolve this; session-presence's "1 live row" is equally uninformative (per-session singleton by construction). New finding, flagged not fixed here: the same shared-UUID gap also defeats the P3 fire-election's RE-ENTRANT branch (leader-lock.md + dev-team + auditor tiers + router's own dispatch-claim hot path) — a double-dispatch correctness bug, recommended to PO as a separate follow-up given blast radius. Fix designed (agent-father's own `.md` zone, no MCP schema change): client-side `$PPID`+`lstart` fingerprint (empirically verified stable this session) stored in the existing marker's free-form payload, compared on Step 1a; mismatch → defer + WORK telegram, with a `heartbeat_at`-based self-heal so a genuinely-dead sibling doesn't permanently block re-arm. Rejected reintroducing the retired human "defer" convention as primary (would silently reverse P3's rationale) — kept as an explicit, narrowly-scoped fallback subsection instead.

**Signal dropped:** `docs/signals/2026-08-15-cowork-cron-registration-sibling-process-defer.json` → agent-father

---

## 2026-08-22T16:20:35Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md`

User-requested observe-and-report review (not a fix cycle): mermaid diagram + per-agent mechanics for the cowork-team dispatch loop and the anomaly-detection→dev-team-planning loop, plus a live correctness check. Confirmed the `signal_queue` junction hypothesis but scoped it (only `to==po` rows cross loops; `to∈{tnb,unified-agent,alert-commander}` stay inside cowork). Live-verified a real multi-day host-suspension backlog (3 undrained signal_queue rows, 7d-stale `.head`, no cowork-schedule fire since 08-15 — corroborated by system-auditor's own c104 notebook entry) and freshly-reclaimed cron-registration markers (~9min old at read time) whose underlying `CronList` entries I could not independently verify (no tool route). Found the guaranteed-slot launchd backstop is real and bridged the outage but never stamps `cowork-schedule.json.last_fired`, desyncing that field from reality; found a stale `TODO`-vs-`BACKLOG` doc contradiction in `anomaly-task-bridge/SKILL.md`; found an 8-day-unread signal addressed to this agent's own id re: Step 2.4 TTL. No wiring defects — nothing fixed, 2 small doc/script follow-ups recommended to agent-father, 2 more flagged to PO for awareness.

**Signal dropped:** `docs/signals/2026-08-22-cowork-detect-loop-flow-review.json` → agent-father

---

## 2026-08-22T19:08:49Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md` (update)

Restructured §A per coordinator feedback: the original single combined mermaid diagram placed Loop 1/Loop 2 as sibling subgraphs (renderer free to lay them side-by-side) and fanned one node into 10 parallel edges — rendered far wider than a normal screen despite `flowchart TD`. Split into two independent stacked diagrams; collapsed the 9-agent spawn fan-out and LAUNCHD's 4 dashed backstop targets into single grouped nodes (per-agent mechanics already live in §B prose); kept the `SQ`/`SQ2` signal_queue junction node in both, with a prose note that they're the same physical array. Verified narrow programmatically (wrote a dagre-style longest-path rank simulation over the parsed edge lists, not eyeballed): max width = 2 nodes at any rank in both diagrams (11 nodes/10 edges and 14 nodes/14 edges respectively). §B and §C untouched.

**Signal dropped:** none new — prior entry's signal (`docs/signals/2026-08-22-cowork-detect-loop-flow-review.json`) still stands, payload unchanged.
