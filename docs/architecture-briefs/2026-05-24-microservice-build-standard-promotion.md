---
brief: microservice-build-standard-promotion
date: "2026-05-24"
author: agents-architect
status: READY
slug: microservice-build-standard-promotion
signal: docs/signals/agents-architect-microservice-build-standard-promotion-20260524T072538Z.json
---

# Architecture Brief — Promote Three-Tier Methodology to Permanent Engineering Standard

## Problem Statement

The three-tier microservice refactor methodology (primitives → modules → composition root) with its
12-goal DoD gate, sandbox security clause, honest dashboard, and per-service pilot-status SSOT
currently lives only inside sprint-specific artefacts under
`docs/architecture-briefs/2026-05-22-refactor/`. It is inaccessible to dev-* agents and the
dev-team flow unless someone manually references it. Any "build X" task initiated through the normal
PO → BA → architect → PM → dev-* chain today bypasses it entirely. The methodology must become the
default build path system-wide with no per-request user prompting.

---

## Scope

### In-scope (agent-father implements)
1. New SSOT file: `docs/standards/microservice-build-standard.md`
2. Lazy-load entry added to every dev-* agent knowledge block
3. Trigger clause added to `docs/handoffs/` architect output template in `architect/main.md`
4. Default-path guard added to `dev-team/main.md` Step 2 (Planning matrix)
5. Registration of the new standard in `docs/references/tree-map.md`

### Out-of-scope (PO decision needed — signal raised separately)
- Whether already-DONE services (kinh-dich TS pilot) get a retro-audit pass under the standard.
  This is a product decision with sprint-cost implications. Architect does not decide unilaterally.
  Signal to PO raised in parallel (see § PO Signal section below).

---

## Canonical Home for the Standard

**File:** `docs/standards/microservice-build-standard.md`

**Tree-map placement:** child of `docs/ARCHITECTURE.md` (the architecture SSOT), sibling of the
existing microservice/* docs. Registered in `docs/references/tree-map.md` under the `docs/ARCHITECTURE.md`
subtree as a new `Write Ownership` row (maintainer: Architect).

**Design rationale:** `docs/standards/` is the correct bucket for "how we build things" logic (per
tree-map Rule 4). DRY — the standard does NOT duplicate G1–G12 verbatim. It points to the canonical
charter. The standard is the routing mechanism; the charter is the deep contract.

**Size target:** ≤120 lines (complies with split policy). The standard is a thin index + the five
invariants + lazy-load trigger pattern + per-service SSOT convention pointer. Deep content stays in
the pilot-charter and 07-phases.md.

---

## Content Design for `docs/standards/microservice-build-standard.md`

The file must contain exactly these six sections (≤120 L total):

### 1. Trigger Clause
Defines when this standard applies:
> Any task with type NEW-SERVICE, NEW-FEATURE (cross-service scope), or REBUILD must follow this
> standard. The architect detects this in the brownfield step and appends `BUILD-STANDARD: required`
> to the handoff. PM propagates into dev-* task spec. dev-* agent reads this flag at Step 0c.

### 2. Three-Tier Sequence (pointer, not content)
One paragraph + pointer:
> Build sequence: primitives → modules → composition root. Full phase plan:
> `docs/architecture-briefs/2026-05-22-refactor/07-phases.md`.

### 3. 12-Goal DoD Gate (pointer, not content)
> G1–G12 DoD: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md § 12 Completion Goals`.
> Language-agnostic. Ownership (per goal): `dev-<svc>` + `qa`. PO-only for decisionMatrix.
> Fence tool by language: Go = depguard via golangci-lint; TS = ESLint boundaries; Python = per SI-4.

### 4. Sandbox Security Clause (inline — critical, must be on first load)
> The sandbox process MUST have zero DB credentials and zero external API keys.
> Verification: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` must return empty in sandbox env.
> If any credential is present, G7 is blocked and does not pass.

### 5. Dashboard and Honest Red/Green Requirement (inline)
> Three-level dashboard (primitive / module / service) renders from JSON traces alone (file:// URL,
> no server required). Red/green is proven honest by 1 deliberate broken primitive before G8 is YES.
> No false greens pass. User trust confirmation (G9): Path A = verbal, Path B = PO Playwright.

### 6. Per-Service Pilot-Status SSOT Convention
> Every service pilot instantiates `docs/data/pilot-status-<svc>.json` from:
> `docs/data/pilot-status-schema.json`. Schema fields: pilot, charterRef, phase0/1/2, goals[],
> decisionMatrix, constraints_binding_day_0, lessons_baked_in. Schema version = macro v2.0 (latest
> closed pilot). Write ownership: sole writer is the dev-<svc> agent during active phase;
> never written by multiple agents concurrently.

---

## How dev-* Agents Reference the Standard

**Pattern:** lazy-load entry (trigger: `new_service_or_feature_build`), NOT always-load.

**Rationale for lazy vs always:** The standard is irrelevant for most bug-fix and maintenance tasks
(the majority of dev-* cycles). Loading it on every cycle wastes ~3-4k tokens per agent per cycle
with zero benefit. The trigger is well-defined: architect sets the `BUILD-STANDARD: required` flag
in the handoff, and the dev-* agent reads this at Step 0c.

**Entry to add to every dev-* agent knowledge.lazy_load block:**
```yaml
- path: docs/standards/microservice-build-standard.md
  trigger: new_service_or_feature_build
  note: "Three-tier build standard (primitives→modules→composition root, G1–G12 DoD, sandbox
         security, dashboard). Load when handoff contains BUILD-STANDARD: required."
  fail_loud: true
```

**Agents that receive this entry (all 12 dev-* agents):**
- dev-technical-analysis
- dev-kinh-dich
- dev-macro-indicators
- dev-stock-price
- dev-alert-engine
- dev-pdf-extractor
- dev-rag-service
- dev-api-gateway
- dev-mcp-server
- dev-frontend
- dev-mainserver-crawls
- dev-vps-crawls

**Note on agents with existing knowledge.md child files:**
`dev-mcp-server`, `dev-alert-engine`, `dev-pdf-extractor`, `dev-kinh-dich` already have
`docs/agents/<agent>/knowledge.md` children. Agent-father must add the lazy-load entry to the
knowledge.md child, not to the parent .md frontmatter, to stay within the split policy.

---

## Where the Trigger Lives — Default Build Path

The trigger must fire at THREE points in the chain so no path bypasses it:

### Trigger Point 1 — Architect handoff output (`architect/main.md` Step 5)

Add a BUILD-STANDARD detection rule immediately before the `## [Architect] Brownfield Findings`
template in `architect/main.md` Step 5:

```
## Standard Detection (architect mandatory)
If task type is NEW-SERVICE, NEW-FEATURE (cross-service / new endpoint + new primitives), or REBUILD:
  → Append to handoff:
    BUILD-STANDARD: required
    BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
    PILOT-STATUS-SSOT: docs/data/pilot-status-<svc>.json (create from schema if absent)
If task type is BUG-FIX, REFACTOR (in-zone, no new primitives), MAINTENANCE:
  → BUILD-STANDARD: not-applicable (skip)
```

This makes the flag explicit and PM-propagatable.

### Trigger Point 2 — dev-team Step 2 Planning Matrix (`dev-team/main.md`)

Add a row to the Planning matrix table in Step 2 for `NEW-SERVICE` and `NEW-FEATURE`:

| Type | Sequence | Notes |
|---|---|---|
| NEW-SERVICE | ba → architect → pm | Architect MUST set BUILD-STANDARD: required in handoff. dev-* loads `docs/standards/microservice-build-standard.md` at Step 0c before any code. |
| NEW-FEATURE | ba → architect → pm | Same as NEW-SERVICE if cross-service scope or new primitives needed. Architect judges. |

This makes the routing table explicit so PM never needs to ask "does this need the standard?"

### Trigger Point 3 — dev-* agent Step 0c (`developer/microservice-main.md`)

Add a standard-check clause to Step 0c of the shared microservice main flow:

```
Step 0c — Load service documentation
  Read docs/architecture/microservice/<service>.md for service context.
  **Standard check:** if handoff contains `BUILD-STANDARD: required`:
    → Load docs/standards/microservice-build-standard.md (fail_loud: true)
    → Verify docs/data/pilot-status-<svc>.json exists (create from schema if absent — Phase 0 deliverable)
    → Apply three-tier sequence and G1–G12 DoD as mandatory task gates.
  If BUILD-STANDARD: not-applicable or absent: skip standard load (default maintenance mode).
```

---

## Parallel-Safe Git Guardrails

Multiple refactor terminals are live on main. All edits by agent-father must follow:

1. **Explicit file staging only:** `git add <path>` per file. Never `git add -A` or `.`.
2. **Scoped reads before edit:** agent-father reads each target file before editing (no blind Write).
3. **No concurrent writes to pilot-status JSON:** only dev-<svc> writes its own pilot-status file.
   Agent-father must NOT write to any active pilot-status-*.json.
4. **Lock-retry on index.lock:** use the F4 git_commit_retry idiom per `docs/protocols/head-lock-self-cure.md § F4`.
5. **No history rewrite:** no --amend, no --force-push. New commit for each change.

---

## PO Signal — Retro-Audit Question

Architect does not decide whether already-DONE services get a retro-audit. This is a sprint-cost
product decision. A separate signal is dropped to PO (see signal file).

**Question for PO:** Should services with status=DONE or verdict=scale (e.g., kinh-dich TS pilot,
technical-analysis Phase 1+2) have a formal retro-audit pass under the new standard, producing a
`lessons_baked_in` entry and verifying the pilot-status SSOT conforms to schema v2.0? Or are they
grandfathered and only NEW pilots apply the standard from Day 0?

---

## Exact Edit List for Agent-Father

Agent-father executes these in sequence. Each step is a separate atomic commit.

### F1 — Create `docs/standards/microservice-build-standard.md`
- Create new file at that path.
- Content: six sections described in § Content Design above.
- Size: ≤120 lines.
- Commit: `docs(standards): add microservice-build-standard — three-tier methodology SSOT`

### F2 — Register in `docs/references/tree-map.md`
- Add entry under `docs/ARCHITECTURE.md` subtree in the tree:
  ```
  ├── docs/standards/microservice-build-standard.md (three-tier build standard: primitives→modules→composition root,
  │       G1–G12 DoD gate, sandbox security, dashboard, pilot-status SSOT convention —
  │       ref: pilot-charter.md + 07-phases.md + pilot-status-schema.json)
  ```
- Add Write Ownership row:
  | `docs/standards/microservice-build-standard.md` | Architect | After methodology rule change or new closed pilot yields baked-in lesson |
- Commit: `docs(tree-map): register microservice-build-standard under ARCHITECTURE subtree`

### F3 — Add lazy-load entry to all 12 dev-* agent files
For agents WITHOUT a knowledge.md child (dev-technical-analysis, dev-macro-indicators,
dev-stock-price, dev-api-gateway, dev-frontend, dev-mainserver-crawls, dev-vps-crawls,
dev-rag-service): add to the `knowledge.lazy_load:` block in the .md frontmatter.

For agents WITH a knowledge.md child (dev-mcp-server, dev-alert-engine, dev-pdf-extractor,
dev-kinh-dich): add to the lazy_load table in the respective `docs/agents/<agent>/knowledge.md`.

Entry in both cases:
```yaml
- path: docs/standards/microservice-build-standard.md
  trigger: new_service_or_feature_build
  note: "Three-tier build standard. Load when handoff contains BUILD-STANDARD: required."
  fail_loud: true
```

Commit per batch (group into 2 commits — frontmatter batch + knowledge.md child batch):
- `chore(agents/dev-*): add microservice-build-standard lazy-load to 8 frontmatter agents`
- `chore(agents/dev-*): add microservice-build-standard lazy-load to 4 knowledge.md children`

### F4 — Add BUILD-STANDARD detection to `architect/main.md` Step 5
- Insert the Standard Detection block (see Trigger Point 1 above) immediately before the
  `## [Architect] Brownfield Findings` template in Step 5.
- Commit: `feat(flows/architect): BUILD-STANDARD detection clause in brownfield handoff output`

### F5 — Add NEW-SERVICE / NEW-FEATURE rows to dev-team Step 2
- Edit `dev-team/main.md` Step 2 Planning Matrix table.
- Add two rows as specified in Trigger Point 2.
- Commit: `feat(flows/dev-team): NEW-SERVICE/NEW-FEATURE build-standard routing in Step 2 matrix`

### F6 — Add standard-check clause to `developer/microservice-main.md` Step 0c
- Insert standard-check block (see Trigger Point 3) immediately after the existing Step 0c
  `Read docs/architecture/microservice/<service>.md...` line.
- Commit: `feat(flows/developer): standard-check clause in microservice-main Step 0c`

### F7 — Update `docs/references/tree-map.md` Write Ownership for `developer/microservice-main.md`
- Confirm or add row for `docs/standards/microservice-build-standard.md` maintenance.
  (May already be covered by F2 above — agent-father to confirm no duplication.)

---

## Dependencies and Sequencing

F1 must land before F2 (tree-map registers real file).
F1 must land before F3 (agents reference real file path).
F4, F5, F6 are independent — can land in any order after F1.
F7 is a no-op if F2 already covers it; agent-father verifies before creating a duplicate row.

---

## Retro-Audit Question for PO

Raised as a separate signal (see § PO Signal section and signal file). Do NOT block F1–F7 on PO
response. F1–F7 apply to future pilots only until PO decides.
