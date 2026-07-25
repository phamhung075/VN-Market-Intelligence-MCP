<!-- size-justification: ~330L — cross-cutting SPIKE blueprint spanning 3 write-surface classes (A/B/C), each requiring its own evidence trail (live-counted inventory numbers), a hard mechanism decision with rejected-alternatives proof, a canonical contract merged from 3 existing prior-art shapes, and a proposed multi-owner task decomposition; splitting into per-class files would break the single "why this ONE mechanism, not three" decision trail the sprint explicitly asks for. -->
# INPUT-VALIDATION-COVERAGE — Architect Blueprint (IVC-ARCH-BLUEPRINT)

**Task:** `IVC-ARCH-BLUEPRINT` (sprint `INPUT-VALIDATION-COVERAGE`, SPIKE, zone `multi`)
**Author:** architect · **Date:** 2026-07-25
**Goal (user demand):** every agent data-input surface is schema-validated so an agent CANNOT persist incomplete/malformed data; on violation a DESCRIPTIVE per-field error is thrown, naming exactly what is missing/invalid.

---

## 0. Prior art this blueprint extends (do not duplicate)

Two artifacts already solve this problem for **one file** (`docs/data/orch/orch-state.json`) and are the template, not a fresh design:

1. **`docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md`** — MANDATE. Already specifies **dual-point enforcement**: "A Claude Code hook ONLY sees Claude-tool calls; it is blind to writes inside the mcp-server process. So enforce at BOTH points with the ONE schema" — Point-1 = PreToolUse hook (Claude Write/Edit surface), Point-2 = server write-door (`OrchStateSchema.parse()` in `orchStateStore.ts:192`, live-verified). It also already defines an "auto-fix error contract" (`path` / `problem` / `expected` / `fix`) — the direct ancestor of item 2 below.
2. **Class B, DONE:** `scripts/orch-apply.sh` (atomic temp-write → `orch-validate.mjs` Zod validate → `orch-stamp-updated-at.mjs` → `orch-conservation-check.mjs` → CAS-mtime guard → atomic rename) + `scripts/agents-flow/orch-state-hook-prewrite.mjs` (Point-1 hook, shells out to the same `orch-validate.mjs`).

**This blueprint's job is to generalize both points from 1 file to the other ~76 `docs/data/*.json` stores + notebooks + handoffs (Class C), and from the already-strong `agentSignalTools.ts`/`signalTypes.ts` island to the rest of the ~162 MCP tool files (Class A)** — reusing the SAME dual-point pattern, not inventing a second one.

One load-bearing correction to the existing precedent: `orch-state-hook-prewrite.mjs` is **explicitly fail-open** on validator-infra failure ("Validator missing = INFRASTRUCTURE failure ... FAIL-OPEN ... a hard block there wedges every orch-state write = system wedge. Warn loudly; never block", lines 97–105). That was a deliberate, documented tradeoff for a single hot file with a strong Class-B primary gate already in front of it (the hook is defense-in-depth there, per `docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md` §4.3). PO's hard constraint for THIS sprint is the opposite — fail-closed — and is exactly `UC-CRITIC-HOOKS-ENFORCEMENT`'s complaint. §2 below designs fail-closed with a bounded blast radius so it doesn't reproduce the wedge risk the old decision was avoiding.

---

## 1. Class-C mechanism decision (THE key decision)

### Options weighed

| Option | Verdict |
|---|---|
| **(a) Fail-closed PreToolUse Write\|Edit hook + per-path schema registry** | **CHOSEN** |
| (b) Per-store apply-wrapper (77× `orch-apply.sh` clones) | Rejected as primary — see below |
| (c) Shared validate-before-write helper agents must call | Folded in as the hook's internal implementation, not a competing mechanism |

**(b) rejected as the primary mechanism:** an apply-wrapper is not itself an enforcement point — `orch-apply.sh` only works because every writer *chooses* to pipe through it; nothing stops a raw `Write`/`Edit` tool call from bypassing it. Building 77 bespoke wrapper scripts (schema + CAS + atomic rename × 77) would (i) multiply authoring/maintenance cost ~77×, (ii) still need a hook on top to block raw-Write bypass of the wrapper convention — i.e. it doesn't remove the need for (a), it only adds cost beside it, and (iii) most of the 77 stores are single-writer (unlike `orch-state.json`, which ~290 sites/tick touch) so the CAS-mtime concurrent-writer protection `orch-apply.sh` earns its complexity for mostly doesn't apply. **The wrapper's validator-separation-of-concerns idiom (dedicated CLI, reused by both the hook and any script) IS reused** — see §1.3.

**(c) is not a separate option** — a "shared helper agents must call" has the exact same vigilance-shaped weakness PO is closing for hooks: an agent (or a future code path) can simply not call it. It only becomes an enforcement mechanism once something makes calling it unconditional — which is what the PreToolUse hook does for the Claude-tool-call surface, and what the server write-door (Point-2, §1.4) does for the mcp-server-internal surface.

### 1.1 Mechanism (generalized dual-point, one schema per store)

**Point 1 — generic PreToolUse hook**, `scripts/agents-flow/store-validation-hook-prewrite.mjs`, wired on the existing `PreToolUse` `Write|Edit` matcher in `.claude/settings.local.json`. On every Write/Edit:
1. Resolve `tool_input.file_path` against a **glob-keyed schema registry** (not exact-path — see §1.2).
2. **Registry MISS** → pass through unvalidated. This is not a regression (nothing is validated today) and is not covered by PO's fail-closed constraint (there is no validator to crash for a path with no registered schema). It IS tracked as an open coverage gap (§1.2 dashboard) so it drives toward zero over the sprint instead of being silently accepted forever.
3. **Registry HIT, validator runs, returns pass/fail** → allow / block with the canonical descriptive error (§2).
4. **Registry HIT, validator infra fails** (missing binary, spawn error, timeout, non-parseable schema module) → **BLOCK** (fail-closed). This is the literal fix for `UC-CRITIC-HOOKS-ENFORCEMENT`'s "a crashed validator is indistinguishable from a pass."
5. Blast-radius bound: each registry entry is validated independently — a broken schema module for `pilot-status-*.json` blocks only writes to `pilot-status-*.json`, never `system-map.json`. A total infra collapse (e.g. `bun` vanishes from PATH) blocks only the subset of Write/Edit calls that target a *registered* path; everything else (code, most of the repo) is unaffected.
6. Narrow, named, logged escape hatch for genuine emergencies — `IVC_HOOK_EMERGENCY_BYPASS=<reason>` (mirrors the proven `ORCH_APPLY_ALLOW_SHRINK` precedent): honored only when set, auto-fires `send_telegram(channel="bug")` on every use so a bypass is never silent.
7. Proactive rot detection (closes the "silent gate decay" half of the completeness-critic finding): extend the existing `scripts/agents-flow/auditor-tier1-probe.sh` to assert `bun` + `store-validate.mjs` + the registry module all load and pass one canary schema — catches infra rot BEFORE an agent's legitimate write ever hits a block, turning "silently fail-open forever" into "loud, monitored, rare fail-closed events with a paper trail."

**`orch-state.json` is absorbed as registry entry #1**, not kept as a parallel hook — `orch-state-hook-prewrite.mjs`'s validator-dispatch logic becomes one registry entry pointing at the existing `orch-validate.mjs` (unchanged), so `.claude/settings.local.json` keeps exactly one `PreToolUse Write|Edit` matcher instead of accumulating one per file class. Extend, don't duplicate.

### 1.2 Schema registry — glob families, not 77 exact paths

Live-counted `docs/data/*.json` = 77 files, but they cluster into far fewer *shapes*: `unified-agent-synthesis-*.json` (23 files, one writer/producer, one shape), `cycle-snapshot-*.json` (5 files, one shape), `pilot-status-*.json` (10 files, one shape family), `auditor-tier*-last-healthy.json` (4 files, one shape). A **glob-keyed** registry (`{ pattern: "docs/data/unified-agent-synthesis-*.json", schema: unifiedAgentSynthesisSchema, ownerAgent: "unified-agent" }`) collapses 77 files into roughly **15–20 registry entries**, not 77 — the authoring cost is proportional to *shape count*, not *file count*.

Registry lives at `apps/mcp-server/src/infrastructure/schemas/storeSchemaRegistry.ts` (Zod schemas are TS values, not JSON-serializable — the registry itself must be TS). A generated, human-readable coverage dashboard (`docs/data/coverage/class-c-coverage.json`, produced by a script FROM the registry, never hand-edited — no-hardcoded-stats rule) tracks: total store-shape families, families with a registered schema, families still pass-through. This is the metric PM/PO drive toward 100%, replacing an open-ended "somebody validate the JSON stores" ask with a countable backlog.

**Notebooks (`docs/agent-memory/notebooks/*.md`) and handoffs (`docs/handoffs/*.md`)** are structured markdown, not JSON — "schema" for these means a lighter structural validator (header line present per `notebook-read`/`decision-journal` conventions, required `##` section markers) rather than a Zod object. Same registry, same hook, same fail-closed-on-infra-crash contract; the registry entry's `kind` field selects `zod` vs `structural` validation, and §2's error contract is shape-agnostic enough to cover both (a missing header line is just a `field` with a descriptive `reason`).

### 1.3 Shared validator CLI (reuses Class B's separation-of-concerns idiom)

`scripts/store-validate.mjs <file-path> [candidate-file]` — the SAME two-stage design as `orch-validate.mjs` (registry lookup → schema/`safeParse` → structured error output), callable by:
- the Point-1 hook (interactive Write/Edit),
- any headless/cron script that writes these files **outside** a live Claude session (the SSOT directive's own point: "a hook ONLY sees Claude-tool calls" — cron/launchd writers like `unified-agent`'s synthesis dump or `auditor`'s tier-healthy snapshot bypass the hook entirely and must call this CLI directly to get the same guarantee),
- QA/CI, as a standalone regression check.

Where a store is genuinely multi-writer (rare outside `orch-state.json` — flagged during §1.2's family classification, not assumed), the atomic-write technique from `orch-apply.sh` (temp file same filesystem → CAS-mtime → atomic rename) is reused verbatim as an opt-in wrapper around `store-validate.mjs`, not reinvented.

### 1.4 Class-A / Point-2 mirror (server write-door)

For MCP tools, the equivalent of Point-2 is `SomeSchema.strict().safeParse(candidate)` at the **domain/infrastructure store boundary** (`predictionClaimStore.ts`, `foreignFlowValidator.ts`-style modules) — never only in the `interface/mcp/tools/` handler, so any future internal caller of the same store function is covered too. `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` already independently specifies exactly this idiom, citing this same directive — it is folded in as an already-aligned in-flight row, not duplicated (§5).

---

## 2. Standardized descriptive-error contract

Three prior-art shapes already exist and are merged, not replaced:
- `agentSignalTools.ts:274` — top-line message `"Signal type 'X' has invalid or missing required fields:\n{errors}"` + `logSignalRejection()` audit row + `isError:true` MCP response.
- `foreignFlowValidator.ts` `ValidationError` — `{ itemIndex, field, reason, originalValue }`.
- `SSOT-zod-validation-directive` auto-fix contract — per-issue `path` / `problem` / `expected` / `fix`.

**Canonical shape (`apps/mcp-server/src/domain/validation/writeRejection.ts`, new shared module):**
```ts
interface FieldValidationError {
  field: string;          // dot-path, e.g. "task_board.review[0].status" or "creation_price"
  problem: string;        // Zod issue.message (what's wrong)
  expected?: string;      // type/enum/range, derived from the schema when available
  originalValue: unknown; // offending value, truncated/redacted if >200 chars
  fix?: string;           // optional actionable hint, keyed by issue.code where a mapper exists
}
interface ValidationRejection {
  surface: string;    // "post_agent_signal:chain_catalyst" | "docs/data/pilot-status.json" | "notebook:architect"
  class: "A" | "C";
  rejectedAt: string;    // ISO, date -u
  rejectedBy?: string;   // agent/session id when available
  errors: FieldValidationError[];
}
```
**Top-line message** (generalizes the GOLD pattern, unchanged tone): `"<surface> rejected — invalid or missing required fields:\n[1] <field>: <problem> (expected: <expected>, got: <originalValue>)\n...\n\nFix and retry."`

**Audit-log sink — two physical stores, one logical shape** (necessarily different infra, same `ValidationRejection` record):
- **Class A** (in-process, DB available): generalize `signalRejectionStore.ts` into a shared `write_rejections` table (`surface`, `errors_json`, `rejected_at`, `rejected_by`) — new Class-A validators call ONE shared logger instead of hand-rolling a bespoke audit table per tool.
- **Class C** (hook runs as a standalone `bun` script, no live server DB connection): append-only `docs/data/validation-rejections.jsonl`, rotated by the existing `cold-archive-sweep.sh` monthly pattern (reuse, not a new rotation mechanism) + `send_telegram(channel="bug")` on block (visibility parity with the audit table).

---

## 3. Strict-completeness rule

**Default for every NEW schema: `z.object({...}).strict()`** (rejects unknown keys — same rule `OrchStateSchema`/`TaskSchema` already enforce). `.passthrough()` / `z.record(z.unknown())` are permitted **only** as a documented, narrow, task-id-tagged exception — the existing precedent is `signalTypes.ts`'s `UrgentNewsLooseSchema` (`// SYS-FUNC-05: ... DO NOT use this for type-safety enforcement`) and `orchStateSchema.ts`'s `head` field (`// deprecated stub; passthrough-but-flagged`). A bare, uncommented `.passthrough()` is a gap, not a design choice — live-counted, `signalTypes.ts` currently has **one undocumented instance** (`PriceAnomalyFindingDataSchema`, no `SYS-FUNC-XX`-style comment) that should either gain a justification comment or convert to `.strict()` in the same wave that hardens Class-A.

---

## 4. Class-A inventory (live-counted, `apps/mcp-server/src/interface/mcp/tools/`)

| Metric | Count |
|---|---|
| Total tool files | 162 |
| Files registering ≥1 `server.tool(...)` | 120 |
| Files importing `zod` (parameter-shape typing) | 115 |
| Files using explicit `safeParse` + descriptive-reject (the true GOLD-pattern equivalent) | **14** |
| Files with zero `zod` import despite registering a tool | 12 |
| Files with raw `INSERT`/`UPDATE`/`.run(` DB writes directly in the interface layer | 8 |
| ...of which also use `safeParse` | 2 |

**GOLD-pattern anchors (already aligned, template for everything else):** `news-analysis/agentSignalTools.ts` (reject message + audit log), `domain/signals/signalTypes.ts` (strict Zod schemas), `domain/signals/signalBuilders.ts` (fluent builders enforcing required fields at compile+runtime), `domain/services/market-data/foreignFlowValidator.ts` (batch per-item `{field, reason, originalValue}`).

**Spot-check finding (important, avoid over-scoping):** of the 12 zero-zod files, the 3 sampled (`alerts/customAlertTools.ts`, `portfolio/portfolioTools.ts`, `portfolio/targetAllocationTools.ts`) are all read-only (`{}` params) — their mutation counterparts (`add_alert_rule`, `set_target_allocation`) were **deliberately removed** ("task 241 — User-only mutation tool. Manage rules through analyst workflow instead."). "Zero zod import" is therefore not automatically a write-validation gap; the remaining 9 need the same one-line spot-check before being treated as gaps.

**Concrete first-wave gap candidates** (raw SQL write in the interface layer, no `safeParse`): `alerts/alerts.ts`, `financial-reports/bctcSkipTool.ts`, `market-data/priceAlertTools.ts`, `news-analysis/analysis.ts`, `system/scheduledTaskTools.ts`, `system/watchlist.ts`. Note: most legitimate writes already route through domain/infrastructure store functions (DDD-correct); a tool file doing raw SQL directly is itself a secondary DDD smell worth flagging alongside the validation gap, not just a validation-coverage note.

**Residual gap flagged, not resolved here** (implementation-level, for whichever row picks up `agentSignalTools.ts` hardening): `validateSignalPayload()`'s dispatch on an unrecognized `signal_type` currently **passes through with a console warning** rather than rejecting — a fail-open branch inside the repo's own GOLD example. Left as a flagged risk for the Class-A hardening wave, not a blueprint-level architecture decision.

**Full precise inventory needs a script, not a 162-file manual read** — proportionate effort for a SPIKE is the numbers above (live grep-verified) plus a proposed scripted classifier (§5, `IVC-A1`) that produces `docs/data/class-a-validation-coverage.json` (mirrors the `coverage-state.json` convention) as the tracked completion metric, the same pattern used for Class C in §1.2.

---

## 5. Proposed task decomposition (for BA → PM to formalize/mint — NOT minted here)

Per PO's routing note ("Dev-* specialists own their service's validators; the shared/script-level gate is dev-mcp-server territory") and the user's caution against fan-out-minting stale duplicates, this is a **proposal**, sized honestly — the Class-A gap-fix row count (`IVC-A3+`) is scan-dependent and must not be guessed/fabricated by PM ahead of `IVC-A1`'s actual output.

| # | Row (proposed id) | Owner | Depends on |
|---|---|---|---|
| 1 | `BA-IVC-SPEC` — formalize this blueprint into FR/AC | ba | — |
| 2 | `IVC-C1` — generic registry-driven hook + `store-validate.mjs`, absorb `orch-state-hook-prewrite.mjs` as entry #1, fail-closed-on-infra-crash, `IVC_HOOK_EMERGENCY_BYPASS` | dev-mcp-server | BA spec |
| 3 | `IVC-C2` — schema-registry scaffold + glob-family classification of 77 stores into ~15–20 families + `class-c-coverage.json` dashboard | dev-mcp-server | IVC-C1 |
| 4 | `IVC-C3` — author Zod schemas, wave 1 (highest write-frequency families: `cowork-schedule.json`, `pressure-state.json`, `coverage-state.json`, `pilot-status-*`, `unified-agent-synthesis-*`) | dev-mcp-server | IVC-C2 |
| 5 | `IVC-C4` — structural validator for notebooks + handoffs (header/section presence) | dev-mcp-server | IVC-C2 |
| 6 | `IVC-C5` — `write_rejections`-parity Class-C sink (`validation-rejections.jsonl` + rotation + telegram) | dev-mcp-server | IVC-C1 |
| 7 | `IVC-C6` — extend `auditor-tier1-probe.sh` with validator-chain canary (closes the silent-rot half of `UC-CRITIC-HOOKS-ENFORCEMENT`) | dev-mcp-server | IVC-C1 |
| 8 | `IVC-A1` — scripted Class-A inventory (`scripts/audits/class-a-validation-coverage-scan.sh` → `class-a-validation-coverage.json`) | dev-mcp-server | — |
| 9 | `IVC-A2` — shared `writeRejection.ts` contract module + generic `write_rejections` table | dev-mcp-server | — |
| 10+ | `IVC-A3..An` — wire write-door `safeParse`+reject into confirmed gaps (6 named in §4 + whatever `IVC-A1` surfaces) | dev-mcp-server | IVC-A1, IVC-A2 |
| — | `UC-CRITIC-HOOKS-ENFORCEMENT` | closed-by-reference once IVC-C1 ships — not a separate implementation | IVC-C1 |

**Already in-flight, fold under this umbrella, do not duplicate:** `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT`, `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE`, `SYSREMAKE-P2-T2-SCHEMA-ADDITIONS` — all three already independently target Class-A gaps using this exact write-door idiom; they proceed unchanged, tagged as pre-aligned with §2's contract.

Rough shape: **~1 BA row + 6 Class-C rows + 2 Class-A scaffolding rows + N gap-fix rows (N from IVC-A1, not guessed)** — the large majority under `dev-mcp-server` since both the shared script/hook mechanism and the MCP tool surface live under `apps/mcp-server/`.

---

## RETURN
DONE: Blueprint complete — `docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md`. Class-C mechanism decided (fail-closed PreToolUse hook + glob-keyed schema registry, absorbing `orch-state.json`'s existing hook as entry #1, generalizing the SSOT-zod-validation-directive dual-point pattern). Canonical error contract merged from 3 existing shapes. Class-A inventory live-counted (162 files / 14 GOLD-aligned / 6 confirmed first-wave gaps). Decomposition proposed, NOT minted.
ZONE: multi
NEXT: ba — formalize FR/AC spec from this blueprint; ba hands to pm for task minting per `docs/references/agent-roster.md` (BA→PM→dev-mcp-server chain).
BUILD-STANDARD: not-applicable (cross-cutting hardening design, no new service/feature primitive)
PIPELINE: continue
