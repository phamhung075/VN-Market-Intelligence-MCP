<!-- size-justification: ~95L — single self-contained convention doc: format spec, write pattern (Bash vs Bash-less), the 4-mechanism boundary table, log_agent_work reconciliation, and rollout pointer. Split would fragment one SSOT into siblings nobody would find. -->

# Per-Agent Debug Logger Protocol

Origin: `docs/architecture-briefs/2026-08-22-agent-fabric-ddd-debug-logger-tool-optimization.md` § Part 2 (agents-architect design), implemented by agent-father same cycle.

**Why this exists, not an MCP tool:** dev-\* agents lack direct MCP gateway binding in the
sub-agent context (`docs/protocols/fail-loud-protocol.md` F-8/INV-GATEWAY-1). Any tool-based
design (existing or new) is unreachable by the exact agent class this logger targets. File-based
is the only universally-reachable write path.

## Convention

- **Path:** `docs/agent-memory/debug/<agent-id>.log` — one file per agent, mirrors the existing
  `docs/agent-memory/notebooks/<agent-id>.md` per-agent convention.
- **Line format** (plain text, one line per entry, human-grep-first, no JSON):
  ```
  2026-08-22T16:47:41Z agent=<agent-id> cycle=<caller's own cycle/task/tick id — freeform> level=info|warn|error msg=<raw message, no escaping>
  ```
- **Write path:**
  - Bash-grant agents (the overwhelming majority): one-line append —
    `printf '%s agent=%s cycle=%s level=%s msg=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "<agent-id>" "<cycle>" "<level>" "<msg>" >> docs/agent-memory/debug/<agent-id>.log`
  - Scoped-Bash agents (`bctc-analyst` — scoped to the notebook compose path ONLY per
    `docs/agents/tools/package/bctc-analyst.md` § Bash Scope, FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR
    2026-08-28; and `refine_bctc_md` — no Bash grant): Read-then-Write append, same pattern those
    agents already use for their other outputs.
- **NOT git-committed per line.** Per-write commits would recreate the commit-overhead pattern
  already flagged (`2026-08-11-chore-commit-overhead-audit.md`) at debug-log volume. Batch-swept
  on the same cadence as the existing memory-hygiene sweep family (`scripts/agents-flow/notebook-linecap-sweep.sh`,
  `scripts/agents-flow/memory-prune-sweep.sh` — CANONICAL pointers: `docs/policies/dev-standards.md` § Script Persistence) —
  simple age/line-count truncation, not the notebook's semantic drop-oldest-`##`-section logic.
  **Owner of the new sibling sweep script: claude-manager-helper** (memory-hygiene is its mandate,
  not agent-father's — `docs/agents/claude-manager-helper/init.md` responsibilities). Not built by
  this doc/cycle; flagged as a routed follow-up.

## Boundary vs. the other 3 log-shaped things

| Mechanism | Grain | Why it's not this |
|---|---|---|
| Notebook (`docs/agent-memory/notebooks/<agent>.md`) | Prose, ≤200L cap, git-committed/cycle | Coarse (one section/cycle), cap evicts debug volume in hours |
| Decision journal (`docs/agent-memory/decisions/*.md`) | Sprint/task-scoped reasoning | Wrong grain + audience (deliberation, not a per-cycle grep target) |
| `.signal_queue` (`docs/data/orch/orch-state.json`) | Terse routing envelope, 120-char cap, CAS-guarded | Not free-text; trips prose-ceiling/conservation guards under debug volume |

This new log is the 4th tier: raw, disposable-by-design mechanical trace. Not a replacement for
any of the three above.

## Boundary vs. `log_agent_work` / `agent_work_log` (the near-dead 4th candidate)

`log_agent_work` (MCP tool, `agent_work_log` SQLite table) has near-zero fleet adoption (7 calls
lifetime, per `docs/agent-memory/modules/tool-usage-stats.json`) and is structurally unreachable
by dev-\* agents (same F-8 gap above) — disqualifying it as *this* logger's implementation, but it
is not being retired. **Explicit boundary (documented, not folded):**

- This file-log's `level` field is a **severity** axis (info/warn/error) for a raw per-line trace.
- `log_agent_work`'s `status` field (`running`/`completed`/`error`) is a **lifecycle-phase** axis
  for a two-phase start/end session record, queryable via SQL, for gateway-bound agents that want
  durable structured history.
- Forcing one into the other would be a lossy conflation (severity ≠ lifecycle phase) — kept
  separate on purpose. `log_agent_work`'s low adoption is a distinct, already-tracked concern for
  the specific chef/unified-agent gap — see backlog `FIX-CHEF-LOG-AGENT-WORK-MISSING`. Do not
  re-open that as a "5th log-shaped thing" question; this section is the answer.

## Rollout

Fleet-wide wiring is auto-fix-driven, not a one-shot mass edit (DRY/lazy-load — see
`docs/agents/agent-father/flow/sweep-fixes.md` Check #6). agent-father is the first adopter
(dogfood — `docs/agents/agent-father/init.md` `knowledge.lazy_load`, log at
`docs/agent-memory/debug/agent-father.log`); other agents pick up the pointer via the same
keep-cycle auto-fix mechanism already used for `fail-loud-protocol.md` (Check #1).
