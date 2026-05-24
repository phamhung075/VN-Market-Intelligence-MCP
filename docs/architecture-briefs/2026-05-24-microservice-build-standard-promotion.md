---
brief: microservice-build-standard-promotion
date: "2026-05-24"
author: agents-architect
status: REVISED — size-gated profiles (user decision 2026-05-24)
slug: microservice-build-standard-promotion
signal: docs/signals/agents-architect-microservice-build-standard-promotion-20260524T072538Z.json
---

# Architecture Brief — Promote Three-Tier Methodology to Permanent Engineering Standard (Size-Gated)

## Problem Statement

The three-tier microservice refactor methodology (primitives → modules → composition root) with its
12-goal DoD gate, sandbox security clause, honest dashboard, and per-service pilot-status SSOT
currently lives only inside sprint-specific artefacts under
`docs/architecture-briefs/2026-05-22-refactor/`. It is inaccessible to dev-* agents and the
dev-team flow unless someone manually references it. Any "build X" task initiated through the normal
PO → BA → architect → PM → dev-* chain today bypasses it entirely.

**User decision 2026-05-24:** The standard must be SIZE-GATED — two profiles (FULL / LEAN) selected
by whether the work stands up a new service or adds capability to an existing one. This brief and its
edit list reflect that decision.

---

## Profile Selection Gate

The architect makes the call at handoff time (Step 5). Downstream agents read the emitted tag.

### FULL profile — NEW SERVICE
**Trigger:** task creates a whole new app under `apps/<svc>/` that does not yet exist in the repo.

**What it means:**
- Three-tier sequence (primitives → modules → composition root) required
- All 12 trust goals (G1–G12) as hard DoD gates
- Three-level dashboard (primitive / module / service) with honest red/green verification
- Full role relay: PO → BA → architect → PM → dev-<svc> → QA
- Per-service `docs/data/pilot-status-<svc>.json` instantiated from schema on Phase 0
- Handoff tag: `BUILD-STANDARD: full`

**Rationale:** A new service is a big, long-lived surface. Maximum rigor is justified once per
service lifetime.

### LEAN profile — NEW FEATURE on existing service
**Trigger:** task adds capability (new endpoint, new module, new primitive group) to a service
whose `apps/<svc>/` directory already exists.

**What it means:**
- Three-tier module placement still required (no spaghetti additions)
- Architecture fence enforced (depguard / ESLint-boundaries / per-SI-4 per language)
- Sandbox (zero-creds) + scenario-replay + honest red/green DoD — all mandatory
- ONE dev-<svc> agent drives end-to-end — no multi-role relay, no per-feature dashboard or charter
- No new `pilot-status-<svc>.json` — read/update existing one only if it exists
- Handoff tag: `BUILD-STANDARD: lean`

**Rationale:** Feature work on a proven service doesn't need the full SDLC org-chart. The fence +
replay DoD already guarantee correctness. The multi-role relay's handoffs cost tokens and lose
context on a bounded scope.

**Classification authority:** The architect makes the FULL/LEAN call in the brownfield step.
PM propagates the tag into the dev-* task spec verbatim. dev-* reads it at Step 0c.

---

## Scope

### In-scope (agent-father implements)
1. New SSOT file: `docs/standards/microservice-build-standard.md`
2. Lazy-load entry added to every dev-* agent knowledge block
3. Trigger clause added to `docs/handoffs/` architect output template in `architect/main.md`
4. Default-path guard added to `dev-team/main.md` Step 2 (Planning matrix)
5. Registration of the new standard in `docs/references/tree-map.md`

### Out-of-scope (PO decision needed — signal raised separately)
- Whether already-DONE services get a retro-audit pass under the standard.
  Signal to PO raised in parallel (see § PO Signal below). Do NOT block F1–F7 on PO response.

---

## Canonical Home for the Standard

**File:** `docs/standards/microservice-build-standard.md`

**Tree-map placement:** child of `docs/ARCHITECTURE.md`, sibling of existing microservice/* docs.
Registered in `docs/references/tree-map.md` under the `docs/ARCHITECTURE.md` subtree.

**Design rationale:** `docs/standards/` is the "how we build things" bucket (tree-map Rule 4).
DRY — the standard does NOT duplicate G1–G12 verbatim. It is a thin routing index; the charter
holds the deep contract.

**Size target:** ≤120 lines.

---

## Content Design for `docs/standards/microservice-build-standard.md`

Seven sections, ≤120 L total.

### 1. Profile Selection (NEW at top — gate logic)
Short decision rule as described in § Profile Selection Gate above. Two subsections (FULL / LEAN)
with the exact gate checklist for each. Architect emits `BUILD-STANDARD: full` or
`BUILD-STANDARD: lean`. PM propagates. dev-* reads.

### 2. Three-Tier Sequence (pointer)
> Build sequence: primitives → modules → composition root.
> Full phase plan: `docs/architecture-briefs/2026-05-22-refactor/07-phases.md`.
> FULL profile: all three tiers required. LEAN profile: correct-tier placement required; no new
> composition-root unless the feature genuinely spans multiple modules.

### 3. 12-Goal DoD Gate (pointer)
> G1–G12 DoD: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md § 12 Completion Goals`.
> FULL profile: all 12 goals as hard gates. LEAN profile: G1–G6 (fence, sandbox, replay, red/green)
> mandatory; G7–G12 scoped to what the feature touches — architect annotates which goals apply in
> the handoff.

### 4. Sandbox Security Clause (inline — applies to BOTH profiles)
> The sandbox process MUST have zero DB credentials and zero external API keys.
> Verification: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` must return empty.
> Failure here is a hard block on G7 (FULL) and on the lean DoD (LEAN). No bypass.

### 5. Dashboard and Honest Red/Green Requirement
> FULL profile: three-level dashboard (primitive / module / service), file:// URL render,
> 1 deliberate broken primitive before G8=YES. User trust confirmation (Path A verbal / Path B PO
> Playwright).
> LEAN profile: no standalone dashboard required. Honest red/green still required — dev-<svc> shows
> one failing test before marking DoD green. No false greens.

### 6. Role Relay
> FULL profile: PO → BA → architect → PM → dev-<svc> → QA (full relay).
> LEAN profile: dev-<svc> drives end-to-end. PM task spec is the handoff. No separate BA / charter
> / QA relay — QA validates inside dev-<svc> cycle via fence + replay.

### 7. Per-Service Pilot-Status SSOT Convention
> FULL profile: instantiate `docs/data/pilot-status-<svc>.json` from `docs/data/pilot-status-schema.json`
> on Phase 0. Sole writer: dev-<svc> during active phase. Never written concurrently.
> LEAN profile: if `pilot-status-<svc>.json` exists, dev-<svc> may update the relevant phase entry.
> Do NOT create a new pilot-status file for a feature — no per-feature pilot-status.

---

## How dev-* Agents Reference the Standard

**Pattern:** lazy-load, NOT always-load. Trigger fires only when architect emits the flag.

**FULL profile load list** (when `BUILD-STANDARD: full` in handoff):
```yaml
- path: docs/standards/microservice-build-standard.md
  trigger: new_service_or_feature_build
  fail_loud: true
- path: docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md
  trigger: new_service_or_feature_build
  fail_loud: true
- path: docs/architecture-briefs/2026-05-22-refactor/07-phases.md
  trigger: new_service_or_feature_build
  fail_loud: false
```

**LEAN profile load list** (when `BUILD-STANDARD: lean` in handoff):
```yaml
- path: docs/standards/microservice-build-standard.md
  trigger: new_service_or_feature_build
  fail_loud: true
```
The standard's § Profile Selection + §§ 4–5 carry all LEAN-mandatory content inline.
No heavy charter/dashboard refs needed.

**Entry to add to every dev-* agent (covers both profiles — single lazy-load entry):**
```yaml
- path: docs/standards/microservice-build-standard.md
  trigger: new_service_or_feature_build
  note: "Size-gated build standard. Load when handoff contains BUILD-STANDARD: full or lean.
         FULL profile also lazy-loads pilot-charter.md + 07-phases.md (see standard § 1)."
  fail_loud: true
```

The standard's § Profile Selection instructs the dev-* agent to load the additional FULL refs
conditionally. The agent does not need a separate lazy-load entry for them — the standard drives it.

**Agents receiving this entry (all 12 dev-* agents):**
dev-technical-analysis, dev-kinh-dich, dev-macro-indicators, dev-stock-price, dev-alert-engine,
dev-pdf-extractor, dev-rag-service, dev-api-gateway, dev-mcp-server, dev-frontend,
dev-mainserver-crawls, dev-vps-crawls

**Note on knowledge.md children:** dev-mcp-server, dev-alert-engine, dev-pdf-extractor,
dev-kinh-dich have `docs/agents/<agent>/knowledge.md` children. Agent-father adds the entry there,
not to the frontmatter, to respect the split policy.

---

## Where the Trigger Lives — Default Build Path

### Trigger Point 1 — Architect handoff output (`architect/main.md` Step 5)

Replace the previous single `BUILD-STANDARD: required` with a two-branch emit:

```
## Standard Detection (architect mandatory — emits FULL or LEAN)
Classify task against apps/ directory:
  NEW SERVICE (apps/<svc>/ does not exist in repo):
    → BUILD-STANDARD: full
    → BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
    → PILOT-STATUS-SSOT: docs/data/pilot-status-<svc>.json (create from schema on Phase 0)
    → ROLE-RELAY: PO → BA → architect → PM → dev-<svc> → QA
  NEW FEATURE (apps/<svc>/ already exists):
    → BUILD-STANDARD: lean
    → BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
    → NOTE: dev-<svc> drives end-to-end; no relay required
  BUG-FIX / REFACTOR (in-zone, no new primitives) / MAINTENANCE:
    → BUILD-STANDARD: not-applicable (skip)
```

Classification is the architect's decision. If scope is ambiguous, default to `lean` and note
the ambiguity in the handoff for PM visibility.

### Trigger Point 2 — dev-team Step 2 Planning Matrix (`dev-team/main.md`)

Replace the previous generic NEW-SERVICE/NEW-FEATURE rows with size-gated rows:

| Type | Tag emitted | Sequence | Notes |
|---|---|---|---|
| NEW-SERVICE | `BUILD-STANDARD: full` | ba → architect → pm → dev-<svc> → qa | Full relay + G1–G12 + dashboard. dev-<svc> loads standard at Step 0c. |
| NEW-FEATURE | `BUILD-STANDARD: lean` | pm → dev-<svc> | One dev-<svc> agent, no relay. Fence + sandbox/replay DoD mandatory. dev-<svc> loads standard at Step 0c. |

### Trigger Point 3 — dev-* agent Step 0c (`developer/microservice-main.md`)

Replace the previous single-branch check with a two-branch dispatch:

```
Step 0c — Load service documentation
  Read docs/architecture/microservice/<service>.md for service context.
  **Standard check:**
  if handoff contains `BUILD-STANDARD: full`:
    → Load docs/standards/microservice-build-standard.md (fail_loud: true)
    → Load docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (fail_loud: true)
    → Load docs/architecture-briefs/2026-05-22-refactor/07-phases.md (fail_loud: false)
    → Verify docs/data/pilot-status-<svc>.json exists (create from schema if absent — Phase 0)
    → Apply full three-tier + G1–G12 as mandatory task gates
    → Engage QA at Phase 2 gate (relay required)
  if handoff contains `BUILD-STANDARD: lean`:
    → Load docs/standards/microservice-build-standard.md (fail_loud: true)
    → Apply three-tier placement + fence + sandbox/replay + honest red/green DoD
    → Drive end-to-end; no relay required
  if BUILD-STANDARD: not-applicable or absent:
    → Skip standard load (default maintenance mode)
```

---

## Parallel-Safe Git Guardrails

Multiple refactor terminals are live on main. Agent-father must follow:

1. Explicit file staging only: `git add <path>` per file. Never `git add -A` or `.`.
2. Scoped reads before edit — no blind Write.
3. Do NOT write to any active `pilot-status-*.json` (dev-<svc> terminals own those).
4. Lock-retry on index.lock: use F4 idiom per `docs/protocols/head-lock-self-cure.md § F4`.
5. No history rewrite: no --amend, no --force-push. New commit per change.

---

## PO Signal — Retro-Audit Question

Architect does not decide whether already-DONE services get a retro-audit. A separate signal is
raised to PO. Do NOT block F1–F7 on PO response. F1–F7 apply to future pilots from Day 0.

**Question for PO:** Should services with status=DONE or verdict=scale (e.g., kinh-dich TS pilot,
technical-analysis Phase 1+2) have a formal retro-audit pass producing a `lessons_baked_in` entry
and verifying pilot-status SSOT conforms to schema v2.0? Or are they grandfathered?

---

## Exact Edit List for Agent-Father

Agent-father executes in sequence. Each step is a separate atomic commit.

| ID | Action | File(s) | Size-gated behavior | Commit message |
|---|---|---|---|---|
| F1 | create | `docs/standards/microservice-build-standard.md` | Seven sections: § Profile Selection (gate at top), three-tier pointer, G1–G12 pointer (with FULL/LEAN scope note), sandbox clause (both profiles), dashboard req (FULL=three-level, LEAN=honest red/green only), role relay (FULL=full relay, LEAN=dev-<svc> solo), pilot-status SSOT convention. ≤120 L. | `docs(standards): add microservice-build-standard — size-gated FULL/LEAN profiles` |
| F2 | edit | `docs/references/tree-map.md` | Add entry under `docs/ARCHITECTURE.md` subtree. Add Write Ownership row: maintainer=Architect, trigger=methodology rule change or new closed pilot lesson. | `docs(tree-map): register microservice-build-standard under ARCHITECTURE subtree` |
| F3a | edit | 8 dev-* agent frontmatter files (no knowledge.md child) | Add single lazy-load entry (path=microservice-build-standard.md, trigger=new_service_or_feature_build, fail_loud=true). Note in entry: FULL profile also loads charter+phases (see standard § 1). | `chore(agents/dev-*): add microservice-build-standard lazy-load to 8 frontmatter agents` |
| F3b | edit | 4 knowledge.md children (dev-mcp-server, dev-alert-engine, dev-pdf-extractor, dev-kinh-dich) | Same entry as F3a, added to lazy_load table in each knowledge.md child. | `chore(agents/dev-*): add microservice-build-standard lazy-load to 4 knowledge.md children` |
| F4 | edit | `.claude/flows/architect/main.md` Step 5 | Replace any previous `BUILD-STANDARD: required` block with two-branch emit: NEW SERVICE → `BUILD-STANDARD: full` + full relay annotation; NEW FEATURE → `BUILD-STANDARD: lean` + solo dev note; BUG-FIX/MAINTENANCE → `not-applicable`. Architect classifies at handoff time. | `feat(flows/architect): size-gated BUILD-STANDARD: full/lean emit in brownfield handoff` |
| F5 | edit | `.claude/flows/dev-team/main.md` Step 2 | Replace/add planning matrix rows: NEW-SERVICE row (full tag, full relay), NEW-FEATURE row (lean tag, pm → dev-<svc> only). Table column: "Tag emitted" shows full vs lean. | `feat(flows/dev-team): size-gated full/lean routing rows in Step 2 matrix` |
| F6 | edit | `.claude/flows/developer/microservice-main.md` Step 0c | Replace single-branch check with three-branch dispatch: `full` → load standard+charter+phases+pilot-status+G1–G12+QA relay; `lean` → load standard only+fence+replay DoD, solo dev; absent → maintenance mode. | `feat(flows/developer): size-gated full/lean dispatch in microservice-main Step 0c` |
| F7 | verify | `docs/references/tree-map.md` | Confirm F2 Write Ownership row covers microservice-build-standard.md. Add only if missing. No duplicates. | No separate commit if F2 covered it. |

**F3a targets:** `.claude/agents/dev-technical-analysis.md`, `.claude/agents/dev-macro-indicators.md`,
`.claude/agents/dev-stock-price.md`, `.claude/agents/dev-api-gateway.md`,
`.claude/agents/dev-frontend.md`, `.claude/agents/dev-mainserver-crawls.md`,
`.claude/agents/dev-vps-crawls.md`, `.claude/agents/dev-rag-service.md`

**F3b targets:** `docs/agents/dev-mcp-server/knowledge.md`, `docs/agents/dev-alert-engine/knowledge.md`,
`docs/agents/dev-pdf-extractor/knowledge.md`, `docs/agents/dev-kinh-dich/knowledge.md`

---

## Dependencies and Sequencing

F1 must land before F2 (tree-map registers real file).
F1 must land before F3a/F3b (agents reference real file path).
F4, F5, F6 are independent — can land in any order after F1.
F7 is a no-op if F2 covers it; agent-father verifies before creating a duplicate row.
