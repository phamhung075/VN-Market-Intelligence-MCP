# PO — Zone Routing Flow (Sub-flow)

**Parent flow:** `docs/agents/po/flow/channel-audit.md` (calls this before emitting any FIX/SPRINT) · also reusable by `triage-signals.md` / `sprint-kickoff.md` when zone needs resolving.

Single SSOT for zone assignment — every FIX/SPRINT-* task entry MUST resolve to exactly one zone here before leaving PO.

---

## Step A — Zone Inference (MANDATORY before emitting any FIX)

Resolve `zone:` for every FIX/SPRINT entry using this table before writing the task:

Zone→specialist data → `jq '.project.zones[]' docs/data/system-map.json`
Query patterns → `.claude/skills/system-map-query/SKILL.md`

Match hint keywords against `.keywords[]` in each zone entry to pick `path` and `specialist`. Fallback rows:

| Hint | Zone | Specialist |
|---|---|---|
| cross-service / root / scripts/ / Docker / shared infra | `cross-service/` | generic developer |
| affects 2+ apps/ subtrees | `multi` | architect must split |

**Rule:** every emitted FIX/SPRINT entry MUST resolve to exactly one row. If unclear → escalate to architect (don't guess).

---

## Step A2 — Lane Resolution (MANDATORY before minting any row)

Zone says WHO does it. Lane says WHAT WILL EVER PICK IT UP. A row can carry a perfect `zone` + `next_agent` and still match NO automated sweep — it then survives only on someone noticing. Resolve one row here before every mint.

| Intended handler | Mint into | Required fields | Consumed by |
|---|---|---|---|
| dev-* / developer, autonomous | `backlog` | `next_agent` matching `^dev(-\|$)\|^developer$`, `plan_only` unset/false, `supervised` unset/false | BOUNDED-1 |
| any agent, deliberate/planning dispatch | `backlog` | `plan_only: true` AND `supervised: true` (BOTH — either alone matches nothing) | Supervised-Lane Sweep |
| **non-dev handler** (agent-father, qa, ops, architect, ba) that must MOVE | **`ready`** | `status: READY`\|`TODO`, resolved `next_agent`, `plan_only` false, `supervised` false | **Ready-Lane Consumer (RLC)** |
| genuinely parked, no handler yet | `backlog` | — | nothing (intentional) |

**The trap:** `backlog` + non-dev `next_agent` + no `plan_only` = **NO LANE**. BOUNDED-1 gates it out (`is_non_dev_next_agent_unrouted` → true); SLS needs `effective_supervised` AND `effective_plan_only` both true. This is the tracked residual gap named at `docs/agents/dev-team/flow/main.md` — it is not a lane, it is a hole.

**The fix is the `ready` lane, not `plan_only`.** RLC (`scripts/devteam-backlog-claim-ready-lane-consumer.jq`) deliberately has NO dev/non-dev gate and spawns `next_agent` directly instead of routing through zone-detect's dev-only fallback. It requires only: status READY/TODO, `effective_supervised != true`, `effective_plan_only != true`, not an epic wrapper, `deps_satisfied`, and a resolved `next_agent`. Reaching for `plan_only: true` to escape the hole buys an SLS wait for a row that needs no planning; `ready` moves it now.

**VERIFY BY EXECUTION, NEVER BY READING THE ROW.** Prose about which lane "should" pick a row is worthless — run the predicates against live data:
```bash
jq -L scripts/lib --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  'include "devteam-eligibility";
   .task_board.ready[] | select(.id=="<ID>") |
   { supervised: effective_supervised($detail[0]),
     plan_only:  effective_plan_only($detail[0]),
     next_agent: effective_next_agent($detail[0]),
     non_dev_unrouted: is_non_dev_next_agent_unrouted($detail[0]),
     deps: deps_satisfied($detail[0]; {}) }' docs/data/orch/orch-state.json
```
A mint is not finished until this returns a shape you can point at a consumer. Precedent: FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT (2026-07-25) — `non_dev_unrouted: true` yet RLC-eligible, confirmed by running the above, not by inferring it.

**Sequencing edges: use `depends_on`/`blocked_by` on the row that must WAIT.** Never `blocks` or `co_edit` on the row that must go first — both are write-only, read by no script, and bind nothing (tracked: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE). A reverse edge looks identical to a working gate on the board and is not one.

---

## Step B — Zone Health Notebook Scan

Read the last notebook entry for each active dev-* agent and extract any "Zone health:" line:
```
docs/agent-memory/notebooks/dev-mcp-server.md
docs/agent-memory/notebooks/dev-api-gateway.md
docs/agent-memory/notebooks/dev-stock-price.md
docs/agent-memory/notebooks/dev-technical-analysis.md
docs/agent-memory/notebooks/dev-macro-indicators.md
docs/agent-memory/notebooks/dev-kinh-dich.md
docs/agent-memory/notebooks/dev-alert-engine.md
docs/agent-memory/notebooks/dev-pdf-extractor.md
docs/agent-memory/notebooks/dev-rag-service.md
```

For each notebook: scan the most recent entry for a line starting with `Zone health:`. Collect into `pendingObservations[]`. Exclude `"Zone health: no drift detected"` lines (no action needed).

For each non-trivial `Zone health:` line:
- mentions coverage drop, unused fixtures, stale tests, or doc drift → add to `pendingObservations[]` for sprint-planning consideration
- mentions a critical regression or broken test → open a FIX task immediately (treat as BUG signal); resolve `zone:` via Step A

Surface `pendingObservations[]` in notebook and optionally into sprint planning if capacity allows.

---

## Output

- Every FIX/SPRINT entry carries `zone:` (one of the rows above, `multi`, or `cross-service/`).
- Every FIX/SPRINT entry resolves to exactly ONE lane per Step A2, verified by executing the predicates — never by reading the row.
- `pendingObservations[]` available for downstream sprint planning.
- Control returns to caller (`channel-audit.md` or `triage-*.md`).
