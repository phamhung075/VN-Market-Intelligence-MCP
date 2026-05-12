# Architecture Brief — Zone Enforcement Upgrade + File-Split Policy
**Date:** 2026-05-12 | **Author:** agents-architect | **Status:** READY FOR WAVE 2

---

## 1. Current-State Assessment

### 1.1 Dispatch + Dev-Team Chain (Current)

```
User demand / cron tick
        │
        ▼
  main terminal  ──── dispatch/SKILL.md ────► PO (Step 1)
        │                                        │
        │◄── BATCH([{type, zone?}]) ─────────────┘
        │
        ▼
  Step 2 — Planning (by batch type)
  FIX: skip ──────────────────────────────────► Step 3 (no zone check)
  SPRINT-S: architect ──► pm
  SPRINT-M/L: ba ──► architect ──► pm
        │
        │  architect RETURN carries ZONE: (MANDATORY)
        │  pm propagates ZONE: into each handoff (MANDATORY)
        ▼
  Step 3 — execute-tier.md
        ├─ Tier 1 — EXPLICIT zone → dev-<service>
        ├─ Tier 2 — INFER zone   → dev-<service> or generic developer
        └─ Tier 3 — MISSING zone → generic developer + WORK warn (SILENT)
```

### 1.2 Per-Layer Zone Enforcement Table

| Layer | Agent | Zone source | Enforcement | Gap |
|---|---|---|---|---|
| Triage | PO | channel-audit Step 0-c zone inference table | **MUST** (updated in parallel by agent-father) | zone? field is optional in BATCH schema → FIX path can omit zone |
| FIX path | PO → Step 3 direct | no planning step | **SOFT** | FIX skips architect/pm; zone not validated before execute-tier |
| Planning | Architect | Brownfield Findings § Zone | **MUST** | none — wiring is correct |
| Planning | PM | copies from architect handoff | **MUST** | none — wiring is correct |
| Execution | execute-tier | PM RETURN per task | **STRICT** (3-tier resolution) | Tier 3 fires silently — WORK warn only, no feedback loop to PO |
| Dev-* agents | all 9 | zone_restricted constraint in YAML | **STRICT** | agents are correctly wired; but only activated when caller sets zone |

### 1.3 Confirmed Gaps

**Gap A — FIX path zone bypass:** FIX type skips architect and pm. Step 3 receives FIX tasks with `zone?` (optional). If PO omits zone, execute-tier must infer or fall to Tier 3. No rejection gate.

**Gap B — Tier 3 silent fire:** When execute-tier cannot determine zone (Tier 3), it spawns generic developer and posts a WORK warning. No signal reaches PO. No feedback loop prevents recurrence. If >20% of tasks hit Tier 3 in a cycle, a WORK escalation mentions architect — but does not block or create a task.

**Gap C — PO BATCH schema zone field:** PO flow documents `zone?` (optional). The parallel agent-father task is upgrading this to `MUST`. Until that lands, FIX entries can be emitted zone-free.

**Gap D — zone_missing not a typed signal:** The Tier 3 WORK warning is unstructured text, not a signal-bus event. PO cannot act on it autonomously next cycle.

### 1.4 Dev-* Agent Wiring Audit

All 9 dev-* agents are present and correctly wired:

| Agent | Zone | Flow | zone_restricted YAML | Orphaned? |
|---|---|---|---|---|
| dev-mcp-server | apps/mcp-server/ | microservice-main.md | yes | NO |
| dev-api-gateway | apps/api-gateway/ | microservice-main.md | yes | NO |
| dev-stock-price | apps/stock-price/ | microservice-main.md | yes | NO |
| dev-technical-analysis | apps/technical-analysis/ | microservice-main.md | yes | NO |
| dev-macro-indicators | apps/macro-indicators/ | microservice-main.md | yes | NO |
| dev-kinh-dich | apps/kinh-dich-service/ | microservice-main.md | yes | NO |
| dev-alert-engine | apps/alert-engine/ | microservice-main.md | yes | NO |
| dev-pdf-extractor | apps/pdf-extractor/ | microservice-main.md | yes | NO |
| dev-rag-service | apps/rag-service/ | microservice-main.md | yes | NO |

**Finding:** No orphans. Agents are correctly zoned. The problem is upstream (PO emission + FIX bypass), not in the dev-* agents themselves. The user's concern "dev-* not working so much" is explained by Tier 3 fallback sending work to generic developer instead of the specialist — specialists are idle because zone is missing upstream.

---

## 2. Upgraded State

### 2.1 New Chain After Zone-Fix

```
User demand / cron tick
        │
        ▼
  main terminal ──► PO (Step 1)
        │
        │  BATCH entries — zone: NOW MANDATORY (no zone? = reject back to PO)
        │  FIX path: PO MUST include zone from channel-audit § Step 0-c table
        │  Missing zone in FIX → PO re-infers or emits SPIKE to architect
        ▼
  Step 2 — Planning
  FIX with zone → Step 3 directly (no change, but zone guaranteed)
  SPRINT-* → architect (sets ZONE) → pm (propagates) → Step 3
        │
        ▼
  Step 3 — execute-tier (zone-strict mode)
        ├─ Tier 1 — EXPLICIT zone → dev-<service>  [UNCHANGED]
        ├─ Tier 2 — INFER zone   → dev-<service>   [UNCHANGED]
        └─ Tier 3 — MISSING zone → DROP signal `zone_missing_tier3`
                                    to PO via signal bus
                                    spawn generic developer as fallback
                                    PO drains signal next cycle → opens fix task
```

### 2.2 New Invariant

Every dev-team task (FIX, SPRINT-S/M/L) MUST carry `zone:` ∈ {`apps/<service>/`, `cross-service/`, `multi`} before entering execute-tier. Tasks without zone are rejected at Step 3 entry (before tier grouping), not after.

### 2.3 New Feedback Signal: `zone_missing_tier3`

```json
{
  "from": "dev-team",
  "to": "po",
  "type": "zone_missing_tier3",
  "payload": {
    "task_id": "NNN",
    "title": "<task title>",
    "cycle": "<ISO timestamp>",
    "fallback_agent": "developer"
  },
  "priority": "normal",
  "createdAt": "<ISO>"
}
```

**PO handling (Step 0-SIG):** On receiving `zone_missing_tier3`, PO opens a FIX task to add zone inference to the originating channel audit finding. Prevents silent specialist bypass.

### 2.4 Closed Loop

```
PO emits zone-mandatory BATCH
        │
        ▼
execute-tier routes to dev-<service> (Tier 1/2)
        │
        ├─ SUCCESS: specialist completes → QA → done
        │
        └─ TIER 3 (zone missing):
              drop zone_missing_tier3 signal → PO
              PO drains next cycle → opens zone-fix task
              next cycle: zone present → Tier 1/2 → specialist
```

---

## 3. Split Policy — 67 Oversize Files

**Counts:** agents 23, flows 16, skills 4, docs 24. Total = 67.

### 3.1 Split Class Table

| Class | Count >120L | Parent file role | Child file role | Pointer pattern | Naming |
|---|---|---|---|---|---|
| `.claude/agents/<id>.md` | 23 | YAML frontmatter + identity block (def, capabilities, responsibilities, not_my_job, identity, permissions, constraints, boundary_rules) | Lazy-loaded sections: full knowledge load policy, handler decision trees, inter_agent details, doc_maintenance | Parent ends with `## Extensions` listing children | `.claude/agents/<id>/{knowledge,handlers,inter-agent}.md` |
| `.claude/flows/<agent>/main.md` + sub-flows | 16 | Thin dispatcher: step table only (≤30 lines) | One file per logical section or step cluster | Parent step rows: `→ Run sub-flow: ./<name>.md` | `.claude/flows/<agent>/<sub-flow-name>.md` (existing pattern) |
| `docs/{policies,protocols,standards,references,guides}/*.md` | 24 | Index + intro + table of contents (≤40 lines) | One file per logical section | Parent links via `## Section X → see ./<topic>-section.md` | Same dir, kebab-case suffix (e.g. `commit-convention-trailers.md`) |
| `.claude/skills/<skill>/SKILL.md` | 4 | Frontmatter + 1-line invocation index + section list | Prose, tables, examples per section | Parent: `## Reference: ./reference.md` / `## Examples: ./examples.md` | `.claude/skills/<skill>/{reference,examples,policies}.md` |

### 3.2 Hard Rules (all classes)

1. Every child file — first line: `> Parent: [<path>](<relative-path-to-parent>)`
2. Parent never reads children mid-flow — children load on trigger only (lazy_load YAML or `→ Run sub-flow:` explicit call)
3. No child→parent reference — DAG stays acyclic
4. After split: every file <120 lines OR explicit justification in file header (e.g. "atomic zone-routing table — won't split cleanly: 45 rows × 4 cols")
5. Pointer integrity gate: `grep -rE "→ Run|→ see|Parent:" .claude docs` must resolve to existing files — run before committing each split batch

### 3.3 Split Priority (by impact / risk)

**High impact (split first):**
- `docs/protocols/ops-incident-response.md` (501L) — split by severity tier
- `docs/guides/guide-agent-definition.md` (358L) — split by YAML section
- `docs/references/vps-setup.md` (353L) — split by service
- `docs/guides/guide-quality.md` (278L) — split by layer
- `.claude/flows/tran-ngoc-bau/main.md` (239L) — split by audit phase
- `.claude/flows/news-scout/cycle.md` (218L) — split by pipeline stage
- `.claude/skills/doc-heal-system/SKILL.md` (265L) — split by phase

**Medium (split second — agents):**
- `agents-architect.md` (181L), `ops.md` (162L), `agent-father.md` (162L), `dev-mcp-server.md` (160L) — knowledge section out

**Lower (split last — small overages near 120):**
- All other agents 121–145L — strip knowledge/inter-agent sections only

---

## 4. Waterfall Context Discovery

### 4.1 Discovery Chain

```
CLAUDE.md (always loaded — router, dispatch pointer)
    │
    ├─► dispatch/SKILL.md (on routing decision)
    │
    ├─► docs/references/tree-map.md (on file creation / lazy-load audit)
    │       │
    │       └─► SSOT children (by trigger: lazy_load YAML)
    │
    └─► .claude/agents/<id>/{knowledge,handlers}.md (trigger-only)
```

### 4.2 Registration Rule

Every new child file created by a split MUST be registered in `docs/references/tree-map.md` under its parent entry before the split commit is closed. Format:

```
├── docs/protocols/ops-incident-response.md (index)
│   ├── docs/protocols/ops-incident-response-p1-severity.md (P1 playbook)
│   ├── docs/protocols/ops-incident-response-p2-recovery.md (P2 recovery)
│   └── docs/protocols/ops-incident-response-p3-runbooks.md (service runbooks)
```

### 4.3 Agent Lazy-Load Declaration

When an agent section is moved to a child file, the trigger MUST move with it to the agent's lazy_load block. Example — `dev-mcp-server.md` knowledge section moved to `docs/agents/dev-mcp-server/knowledge.md`:

```yaml
lazy_load:
  - path: docs/agents/dev-mcp-server/knowledge.md
    trigger: agent_startup  # replaces inline section
```

Flows declare loading via `→ Run sub-flow: ./step-name.md` — no YAML change needed for flow splits.

---

## 5. Validation

### 5.1 Re-simulation After Zone-Fix

1. User types "fix N/A values in market alert" → dispatch routes to PO
2. PO channel-audit Step 0-c: identifies `apps/alert-engine/` from dedup/cooldown hint → emits `zone: apps/alert-engine/`
3. FIX batch reaches execute-tier: `zone: apps/alert-engine/` present → Tier 1 → spawns `dev-alert-engine`
4. `dev-alert-engine` reads handoff → TDD cycle within `apps/alert-engine/` only → notifies QA
5. QA merges, WORK notified. No generic developer spawned. Specialist loop closed.

Verify each spawn point:
- PO `→` execute-tier: zone field populated (now MUST)
- execute-tier `→` dev-<service>: zone matches zone_routing_map in execute-tier.md
- dev-<service> `→` QA: no zone validation needed (QA is zone-agnostic)
- QA `→` PM: TASKS.md Done update, no zone dependency

### 5.2 Pointer Integrity Audit Steps

```bash
# 1. Find all → Run sub-flow references and verify targets exist
grep -rE "→ Run sub-flow:" .claude/flows | awk -F': ' '{print $2}' | while read f; do
  [ -f "$f" ] || echo "BROKEN: $f"
done

# 2. Find all → see references in docs
grep -rE "→ see \." docs/policies docs/protocols docs/standards docs/references docs/guides | \
  awk -F'→ see ' '{print $2}' | while read f; do
  [ -f "$f" ] || echo "BROKEN: $f"
done

# 3. Verify all Parent: declarations resolve
grep -rE "^> Parent:" .claude docs | awk -F'[()]' '{print $2}' | while read f; do
  [ -f "$f" ] || echo "BROKEN Parent ref: $f"
done
```

### 5.3 Line-Count Gate

```bash
find .claude/agents .claude/flows .claude/skills docs/policies docs/protocols \
     docs/standards docs/references docs/guides -name "*.md" \
  | grep -vE "handoffs/|notebooks/|sessions/|archive/|historical/|specs/|tools/" \
  | xargs wc -l \
  | awk '$1 > 120 {print $1, $2}' \
  | grep -v "total"
# Must return zero lines after Wave 2 completes (or each exception has a header justification)
```

---

## 6. Dispatch Order — Wave 2

### 6.1 Ownership by Class

| Class | Owner | Rationale |
|---|---|---|
| `.claude/agents/*.md` (23 files) | agent-father | Lifecycle owner per dispatch/SKILL.md |
| `.claude/flows/**/*.md` (16 files) | agent-father | Agent-system files per boundary rules |
| `.claude/skills/**/SKILL.md` (4 files) | agent-father | Agent-system infrastructure |
| `docs/{policies,protocols,standards,references,guides}/*.md` (24 files) | claude-manager-helper | Knowledge organization per dispatch table |

### 6.2 Parallelism Analysis

**agent-father owns 43 files across 3 classes.** Question: can it parallelize within one cycle?

**Answer: YES with file-scope isolation. MANDATORY sequential for shared-SSOT writes.**

Rules:
- Agent files are independent per agent-id. agent-father can split `dev-mcp-server.md` and `dev-alert-engine.md` in the same cycle (different files, no conflict).
- Flow files within one agent are NOT parallel if the parent `main.md` is being edited simultaneously (parent+child share a write).
- `docs/references/tree-map.md` is written by EVERY split (registers child). This is a shared SSOT → agent-father MUST serialize tree-map updates (commit each batch, then update tree-map, then next batch).

**Recommended execution pattern for agent-father:**
```
Batch A (parallel): agents split — N agent files simultaneously (worktree isolation)
  After Batch A: update tree-map.md for all A children atomically
Batch B (parallel): flows split — agent-father's own flows simultaneously
  After Batch B: update tree-map.md for all B children atomically
Batch C (parallel): skills split
  After Batch C: update tree-map.md for all C children
```

**claude-manager-helper** handles 24 docs files independently — can run fully parallel to agent-father (different file zones).

**Total parallelism potential:** agent-father (Batch A) + claude-manager-helper (docs) can run concurrently in the same cycle. Only tree-map updates serialize within each owner's batch sequence.

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Parent shrinks to <20 lines after split — over-split | MEDIUM (agent identity blocks are naturally ~25-40 lines) | LOW — parent still valid as thin dispatcher | Check: parent must retain full YAML frontmatter + identity + at least one section. If <20 lines → merge one child back. |
| Child loaded every cycle anyway (no token saving) | HIGH for `knowledge.md` in always_load agents | LOW in practice — knowledge already always_load in YAML | Audit trigger before splitting: if trigger=always or agent loads it every cycle, reconsider splitting — may increase reads without token benefit |
| Pointer drift: tree-map.md not updated atomically | HIGH (busy split wave) | HIGH — DAG validation fails, doc-heal-system fires | Invariant: agent-father MUST update tree-map.md in same commit as child creation. No split commit without tree-map line. |
| Agent lazy_load triggers not migrated to child file | MEDIUM | HIGH — agent loads empty parent section, misses knowledge | Rule: every inline section moved to child MUST have its trigger entry updated in parent YAML `lazy_load`. agent-father verifies before commit. |
| FIX path zone bypass persists if PO schema not updated | HIGH (parallel agent-father task may lag) | HIGH — specialists stay idle, Tier 3 fires | Zone enforcement brief (this doc) signals agent-father to upgrade PO BATCH schema in Wave 1 (before Wave 2 splits begin). |
| kinh-dich-service naming drift | LOW | LOW | Already documented in agent-roster.md. Track as separate future task — do not include in Wave 2 scope. |

---

## Signal to Agent-Father

**Wave 1 (zone enforcement — implement first, unblocks specialists):**
Files to change:
1. `.claude/flows/po/main.md` — upgrade `zone?` to `zone:` in BATCH schema (MUST, no optional)
2. `.claude/flows/po/channel-audit.md` — Step 0-c: add rejection rule: missing zone → escalate to SPIKE
3. `.claude/flows/dev-team/execute-tier.md` — Tier 3: drop `zone_missing_tier3` signal to `docs/signals/` instead of WORK warn only
4. `.claude/flows/dev-team/drain-signals.md` — add `zone_missing_tier3` type to signal routing table (route to PO Step 0-SIG)
5. `.claude/flows/po/triage-signals.md` — add handler for `zone_missing_tier3` → open zone-fix task

**Wave 2 (file splits — after Wave 1 merges):**
See Section 6 dispatch table. claude-manager-helper handles docs 24 files; agent-father handles agents 23 + flows 16 + skills 4 = 43 files. Parallelism per Section 6.2.

**Ready:** YES. Brief complete.
