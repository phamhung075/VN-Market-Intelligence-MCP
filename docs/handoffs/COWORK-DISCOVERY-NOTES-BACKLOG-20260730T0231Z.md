# Cowork Discovery-Note Backlog — 2026-07-30T02:31Z

Source: dev-team Step 0a drain tick. `scripts/agents-flow/drain-signals.js` only recognizes
top-level `{from,type}` signal shape; cowork-team writes ad-hoc discovery-note JSON to
`docs/signals/*.json` that does not match this shape, so the canonical drain SKIPs them
("state file or unknown format") and they never enter `pendingSignals[]` / PO triage. 15 files
found accumulated in the raw inbox (dated 2026-07-28 through 2026-07-30). This doc bundles the
substantive ones so they are not silently lost; routine cowork-fire tick-state litter is noted
but not detailed.

## Needs scoping/triage decision

1. **`cowork-team-2026-07-30T002605Z-step0a-po-row-unlocked-consume.json`** — cowork-team's own
   main.md Step 0a text says it should mark `to==po` NEW rows READ directly (no lock), which
   races/can-drop dev-team's own claim-guarded `drain-signals.md §0a-D` consumption (signal-loss
   class, not self-healing). Cowork-team dispatcher correctly DECLINED to execute the literal
   action this tick and is asking for a scoping decision: (a) drop `po` from cowork-team's
   to-filter entirely, or (b) add the same `task_claim` per-row lock. Route to
   agents-architect/cowork-refactory-expert.

## Data-integrity / P1 bugs

2. **`cowork-team-2026-07-29T0912Z-refine-bctc-diacritic-corruption.json`** +
   **`...T1110Z-refine-bctc-diacritic-corruption-2nd-report.json`** — `refine_bctc_md`
   systematically corrupts Vietnamese diacritics/words in refined BCTC table-page markdown
   (e.g. "ngắn hạn" → "ngăn hạn"), at confidence ABOVE the 0.50 ESC-5 auto-escalation threshold,
   with empty `flags[]` — the agent's own disagreement-detection does not catch this defect
   class. CONFIRMED SYSTEMIC across 2 independent reports (different source PDFs). Zone:
   dev-pdf-extractor / refine_bctc_md prompt.

3. **`cowork-signal-2026-07-29T0813Z-pressure-headroom-field-stale-container.json`** +
   **`...T1611Z-pressure-headroom-field-rename-not-deployed.json`** — live `emit_pressure_state`
   MCP tool still writes `host_headroom_mb`; `spawn-fanout.md` Step 5.1 headroom gate reads
   `container_vm_headroom_mb`. The documented rename (`FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY`,
   2026-07-28) landed in the flow docs only, never in the live tool — permanently forces
   DEGRADED fan-out mode. Zone: dev-mcp-server.

## Structural agent-capability gaps

4. **`cowork-team-2026-07-29T1616Z-alert-commander-no-bash-tool-grant-4th-consecutive-commit-backlog.json`**
   + **`...T001827Z-alertcmd-session-id-gap.json`** — `alert-commander`'s agent definition grants
   no Bash tool, so (a) its notebook edits can never pass `commit-mutex` (requires Bash/git) — 4
   consecutive cycles of uncommitted notebook backlog as of 2026-07-29; and (b) the
   `alert-commander-critical` spawn receives no session id and has no Bash to derive one, so the
   published-marker `task_claim` (FR-P2-7 duplicate-post guard) schema-hard-rejects every cycle
   yet the agent fires anyway. Same root cause, two distinct downstream failures. Zone:
   agent-father (tool grant) — matches `[[feedback_agent_reported_limitation_may_be_structural_check_the_tool_grant]]`.

## Near-miss (no fix required, note for pattern tracking)

5. **`cowork-team-2026-07-29T0858Z-chef-eod-router-race-nearmiss.json`** — router session
   independently dispatched chef-eod concurrently with cowork-cron's own chef-eod slot spawn;
   resolved WITHOUT a double-publish only because the router's marker claim landed first. No
   action taken, informational.

6. **`cowork-signal-2026-07-29T0722Z-chef-intraday-tokenbudget-marker-leak.json`** — chef-intraday
   hit a token-budget wall mid-flow (5 qualifying clusters, more than typical) and returned
   without publishing; marker-leak half already self-corrected by cowork-team dispatcher per
   `feedback_chef_leaks_published_marker_on_silent_exit`. Underlying gap (UC-CCA-P3, BACKLOG
   since 2026-07-13) doesn't yet account for resource-exhaustion exits, only logic-branch exits.
   Recommend: bounded/cheaper Steps 2-8 path when cluster count is high, or raised intraday
   effort budget.

## Routine litter (no action — already the expected SKIP class)

`cowork-team-2026-07-28T18:06:41Z.json`, `...T05:09:57Z`, `...T05:22:55Z`, `...T210700Z`,
`...T000700Z` — plain `FIRE`-classification cowork-cron tick-state snapshots, same non-signal
shape as the already-known 2026-07-10/11 litter batch the drain script leaves in place by
design. `price_anomaly_20260728T1616.json` / `price_anomaly_20260729T1600.json` — routine
market-watcher anomaly output (market-signal data), not a bug report.
