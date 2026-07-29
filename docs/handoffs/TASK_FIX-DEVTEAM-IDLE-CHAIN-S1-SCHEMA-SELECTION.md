---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-s1-schema-selection
size: S
zone: docs/agents/dev-team/flow/
depends_on: []
blocks: [FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION, FIX-DEVTEAM-IDLE-CHAIN-P1B-STAMP, FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN]
---

## TLDR
Add `dev_team_idle_chain: z.record(z.unknown()).optional()` schema line and implement `rotation_selected()` jq function to foundation for aged round-robin dispatcher selection across five idle-chain consumers.

## [PM] Planning Context

- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §2.1 (schema), §2.2 (selection algorithm), §6 (file list)
- **PO Ruling:** `docs/agent-memory/decisions/ruling-20260725T1101Z-devteam-idle-chain-po.md` — aged round-robin + durable inbox, both required, Part 1 priority
- **Acceptance Criteria (AC-1 through AC-4):** See board row `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` `.acceptance` field (read verbatim, do not paraphrase)
- **Related Board Row:** `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (this task's parent, supervised:true, plan_only:true)

### Schema Change (infrastructure)

**File:** `apps/mcp-server/src/infrastructure/orchStateSchema.ts`
- **Lines:** Section §8, after `dashboard_section_cache`, before end of OrchStateSchema root
- **Change:** Add exactly this line to the `.strict()` schema definition:
```ts
dev_team_idle_chain: z.record(z.unknown()).optional(),
```
- **Context:** Mirrors existing `narrative`, `dashboard_section_cache`, `session_handoff_status` pattern (loosely typed dispatcher-internal bookkeeping, not user-facing contract)
- **No other schema changes:** `task_board` and `signal_queue` remain byte-unchanged; no `.head` schema changes yet (will be addressed in later tasks if needed)

### rotation_selected() Function (infrastructure/tooling)

**File:** `scripts/lib/devteam-eligibility.jq`
- **Add:** One new jq function, no existing changes to the file
- **Function signature & logic (from architect brief §2.2):**
```jq
def rotation_selected($doc):
  ($doc.dev_team_idle_chain.rotation // {}) as $r
  | ["bounded1","sls","rlc","qa_drain","step1_triage"]
  | map({id: ., stamp: ($r[.].last_served_tick // "1970-01-01T00:00:00Z")})
  | sort_by(.stamp)
  | .[0].id;
```
- **Semantics:** Takes orch-state.json, returns id of the single consumer with the oldest `last_served_tick` (null/missing = "1970-01-01T00:00:00Z" = oldest, guarantees first turn before any repeat). Tie-break by declared order (bounded1 < sls < rlc < qa_drain < step1_triage).
- **Test:** Function must be callable from jq command line with a fixture doc containing `.dev_team_idle_chain.rotation = {}` (all-null bootstrap) and return one of the five ids

### Acceptance Criteria

- [ ] Schema line added to `OrchStateSchema` root `.strict()` definition, passes Zod validation
- [ ] `rotation_selected()` function callable in jq and returns correct id from fixture docs (bootstrap all-null, partial-null, full-timestamp)
- [ ] No changes to other schema keys; `task_board` and `signal_queue` byte-unchanged
- [ ] Script Persistence: new `scripts/lib/devteam-eligibility.jq` pointer added to `docs/policies/dev-standards.md` (done by later task, not this one; just prepare)

### Files to Read First

- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (§4-8, understand root key layout)
- `scripts/lib/devteam-eligibility.jq` (understand existing def-set pattern)
- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§2.1, §2.2, full context)

### Files to Create

None (modifying existing files only)

### Files to Modify

- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` — +1 line schema
- `scripts/lib/devteam-eligibility.jq` — +1 function

### Dependencies

None (foundational tier)

### Knowledge Needed

- Zod schema validation (TypeScript, but read-only understand)
- jq language (function def, sort_by, map, //)
- orch-state.json structure (read existing brief)
- Aged round-robin concept (described in brief, not complex)

### Risk & Constraints

- **Must be byte-exact:** Timestamps in jq use ISO 8601 format "1970-01-01T00:00:00Z" for bootstrap (no UTC-marker variations)
- **No cascading changes:** Schema addition is contained; no migration script needed (self-healing defaults via //)
- **Tight dependency:** Blocks all three rotation/stamp/drain tasks (Tier 2), so errors here cascade
