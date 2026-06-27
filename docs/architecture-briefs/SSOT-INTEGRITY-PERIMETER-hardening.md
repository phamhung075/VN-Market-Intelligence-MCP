<!-- size-justification: 280L — design brief covering 5 required sections (schema, validator, dual-point enforcement, apply-wrapper, wave-1 decomp) + 7 QA test mapping; no section is individually extractable without losing cross-reference fidelity. -->
# Architecture Brief — SSOT Integrity Perimeter Hardening

**Sprint:** SSOT-INTEGRITY-PERIMETER
**Task:** ARCH-SSOT-INTEGRITY-PERIMETER
**Date:** 2026-06-27
**Author:** architect
**Status:** DESIGN COMPLETE — PM hand-off for Wave-1 decomposition

**Directive (authoritative inputs):**
- `docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md` (user mandate, 7 QA acceptance tests)
- `docs/handoffs/orch-state-deep-audit-2026-06-27.json` (216KB structural findings — 48 confirmed issues)

**PO pre-endorsed decisions (not re-litigated here):**
- ADD-1: READY is the 12th StatusEnum value (option-a, already shipped in orchStateSchema.ts 2026-06-27)
- ADD-2: lane↔status coherence starts WARN-only; promotes to hard-fail post-SHG-2+SHG-4 data migration

---

## Context — Why Bash-JQ Gates Are Not Sufficient

The prior gate (`scripts/orch-state-validate.sh`, pre-shim) checked only 3 of 9 task-bearing lanes (G-5 scanned `active_sprints`, `backlog`, `done` only). A bad status in any of the remaining 6 lanes passed silently. The dominant ~290/tick jq-patch writer bypassed the gate entirely. Extending the bash check lane-by-lane re-creates the same fragility with each new lane addition.

A **nested Zod schema** validates every lane by construction: adding a lane to the hot file without adding it to the schema produces a compile-time omission in `TaskBoardSchema`. `zod` is already a production dependency in `apps/mcp-server`. `z.infer<typeof OrchStateSchema>` regenerates the TypeScript types that were previously hand-maintained.

---

## Section 1 — orchStateSchema.ts: Single SSOT Schema

**File:** `apps/mcp-server/src/infrastructure/orchStateSchema.ts`
**DDD layer:** infrastructure
**BUILD-STANDARD:** lean (apps/mcp-server exists; this is a new file within the existing service)

### 1.1 StatusEnum — Frozen 12-Value Set (Canonical SSOT)

The following 12-value enum is already shipped and is THE single authority for status vocabulary. Bash scripts and orchStateStore.ts MUST import or delegate to this enum; hardcoding their own copies is forbidden.

```
"BACKLOG" | "TODO" | "IN_PROGRESS" | "REVIEW" | "QA" |
"DONE" | "DONE_VERIFIED" | "BLOCKED" | "DEFERRED" | "CANCELLED" | "SKIPPED" | "READY"
```

ADD-1 rationale: a `ready[]` lane exists in `task_board`; a READY-status task in the ready lane is lane-coherent. PO ratified option-a 2026-06-27T08:35:40Z. The ARCH-SSOT-INTEGRITY-PERIMETER task itself (status=READY in the ready lane) proves the 12th value is required at sprint-kickoff.

**TERMINAL_SET** (sprint eviction predicate — 5 values, immutable):
```
DONE | DONE_VERIFIED | CANCELLED | DEFERRED | SKIPPED
```

`TERMINAL_SET` is exported as `ReadonlySet<Status>` from orchStateSchema.ts. Sprint eviction fires only when ALL tasks in the sprint are in TERMINAL_SET. No other code may define its own terminal predicate.

**QA-1 mapping:** inject a non-enum status (e.g., `"PARKED"`, `"done_verified"`, `"FOLDED"`) into EACH of the 9 task-bearing lanes on a scratch copy → validator MUST fail for every lane. This test closes the 3-of-9 false-green gap.

### 1.2 All-9-Lane Nested Schema

`TaskBoardSchema` enumerates all 9 task-bearing lanes using the shared `Lane = z.array(TaskSchema)` type:

| Kind | Lane |
|------|------|
| Flat | `backlog`, `done`, `done_verified`, `in_progress`, `qa`, `ready`, `review` |
| Nested | `active_sprints[].tasks[]`, `closed_sprints[].tasks[]` |

`Lane` is the single array sub-schema reused for ALL flat lanes. Adding a flat lane without using `Lane` is a compile-time omission visible in the schema definition. Sprint-nested tasks are validated inside `SprintSchema.tasks`.

`TaskBoardSchema` uses `.strict()` — any unexpected key (including a whole orch-state document accidentally nested into `task_board`) is rejected immediately.

**QA-3 mapping:** inject an unknown/legacy key under any `.strict()` object → rejected with `unrecognized_keys` issue and a cold-storage migration hint.

### 1.3 `.strict()` Progression

| Schema | `.strict()` today | Promote when |
|--------|-------------------|--------------|
| `OrchStateSchema` | YES | Permanent |
| `TaskBoardSchema` | YES | Permanent |
| `SignalQueueSchema` | YES | Permanent |
| `MetaSchema` | YES | Permanent |
| `TaskSchema` | `.passthrough()` | Post-SHG-5 (SSOT-W1-SERVER-ENFORCE) — when active-sprint tasks are fully migrated to hot-field stubs |
| `SprintSchema` | `.passthrough()` | Post-SHG-5 — active vs closed sprint key-sets converge |

**QA-3 partial mapping:** `.strict()` on OrchStateSchema and TaskBoardSchema already rejects unknown root-level and task_board-level keys.

### 1.4 superRefine — Lane Coherence and Referential Integrity

Two cross-field invariants are enforced via the schema:

**`head.active_task_id` referential integrity** (hard gate, inside `OrchStateSchema.superRefine`):
If `head.active_task_id` is non-null, the ID must resolve to at least one task across all 9 lanes. A non-resolving ID indicates a stranded head pointer — rejected before any fs write.

**Lane↔status coherence (ADD-2)** (`checkLaneCoherence()`, warn-only during SHG migration):
Exported as a standalone function rather than a second `superRefine`. Rationale: live data has ~72 coherence violations (backlog[] contains REVIEW/IN_PROGRESS/DONE stragglers, pre-SHG-2 migration). Blocking writes before migration clears these violations would deadlock the system. After SHG-2 (status relabeling) and SHG-4 (sprint eviction) are confirmed complete, `checkLaneCoherence()` MUST be promoted to a `superRefine` on `OrchStateSchema`.

Allowed status per lane (ADD-2 mapping):
- `backlog` → `{BACKLOG}`
- `review` → `{REVIEW}`
- `qa` → `{QA}`
- `done` → `{DONE, DONE_VERIFIED}`
- `done_verified` → `{DONE_VERIFIED}`
- `ready` → `{READY, TODO}`
- `in_progress` → `{IN_PROGRESS}`

**`detail_ref` / `payload_ref` referential integrity** (`checkRefIntegrity()`, hard gate):
File references in `task_board.*[].detail_ref` and `signal_queue.rows[].payload_ref` must resolve to existing files on disk. Uses an injected `FileResolver` so the pure schema remains unit-testable without filesystem access. This closes the 6 dangling `docs/signals/...` payload_refs identified in the deep audit.

**QA-4 mapping:** inject a dangling `detail_ref` or `payload_ref` → Stage-1c fails with a path-specific issue and a corrected-path hint.

---

## Section 2 — orch-validate.mjs: Two-Stage Validator CLI

**File:** `scripts/orch-validate.mjs`
**Runtime:** bun (imports `.ts` schema directly — no transpile step)
**DDD layer:** tooling / infrastructure (no domain logic)

### 2.1 Stage-0 — Duplicate Key Detection (Pre-Parse)

Stage-0 MUST run on raw text BEFORE `JSON.parse`. `JSON.parse` silently collapses duplicate keys to the last value (last-key-wins), erasing the earlier value without error. This closes the `feedback_ssot_duplicate_key` clobber class documented in memory.

Implementation: a recursive-descent tokenizer on the raw JSON string. Correctly handles:
- String escape sequences (`\"` does NOT terminate a key string)
- Nested objects — separate `Set<string>` per object context
- All JSON primitive types

On detection: exit code 1 with structured output per duplicate found.

**QA-2 mapping:** write a raw JSON string with a duplicate key → Stage-0 rejects before parse. Stage-1 never runs.

### 2.2 Stage-1 — Schema Parse + Coherence + Ref Integrity

Sequence (all on the post-`JSON.parse` object):

| Stage | Function | Failure mode |
|-------|----------|--------------|
| Stage-1 | `OrchStateSchema.safeParse(parsed)` | exit 2, structured issues |
| Stage-1b | `checkLaneCoherence(result.data)` | WARN to stderr, exit 0 (SHG migration) |
| Stage-1c | `checkRefIntegrity(result.data, existsSync, PROJECT_ROOT)` | exit 2, structured issues |

### 2.3 Auto-Fix Error Contract

Every failure emits per-issue: `path`, `problem`, `expected`, `fix:` hint. Hint mapper keyed by Zod `issue.code`:

| `issue.code` | `fix:` template |
|---|---|
| `invalid_enum_value` (status field) | `use an enum value; put the "<received>" qualifier in verify_note` |
| `invalid_enum_value` (other) | `use one of: <options>` |
| `unrecognized_keys` | `remove or migrate to cold storage (docs/data/orch/archive/backlog-detail.json)` |
| `invalid_type` | `provide a <expected> value` |
| `too_small` | `ensure the field is non-empty (minimum length <min>)` |
| `custom` (superRefine) | extracted from `issue.message` after `fix:` marker |

The structured output is fed back to the writing agent by the PreToolUse hook's `reason` field. The agent self-corrects and retries. This is the AI-autofix loop.

**QA-5 mapping (partial):** the `reason` text that the PreToolUse hook returns on block is the validator's structured stderr output truncated at 600 chars.

### 2.4 Exit Code Contract

| Code | Meaning |
|------|---------|
| 0 | Stage-0 + Stage-1 pass (coherence warnings do not elevate) |
| 1 | Stage-0 failure (duplicate keys in raw text) |
| 2 | Stage-1 schema violation OR Stage-1c dangling refs |
| 3 | File not found / unreadable |

---

## Section 3 — Dual-Point Enforcement

One schema, two enforcement points. The hook covers Claude tool-call writes; the server covers internal mcp-server writes. Both import the same `OrchStateSchema`.

Memory note `project_orchstate_zod_dual_point_validation`: "hook is blind to server-internal writes" — this is the architectural reason BOTH points are mandatory. Removing either point leaves a writer class unguarded.

### 3.1 Point 1 — Claude Code Hook

**Files:**
- `scripts/agents-flow/orch-state-hook-prewrite.mjs` (PreToolUse)
- `scripts/agents-flow/orch-state-hook-bash-backstop.sh` (PostToolUse)
- `.claude/settings.local.json` (registration — already wired)

**PreToolUse (Write|Edit):**
Intercepts any Write or Edit call whose `file_path` ends with `orch-state.json`. For `Write`: extracts `tool_input.content`, writes to a temp file, runs `bun scripts/orch-validate.mjs <temp>`. For `Edit`: reconstructs the post-edit content (applying old_string→new_string), writes to a temp file, runs validator. On validator non-zero exit: outputs `{"decision":"block","reason":"..."}` to stdout, exits 2. The `reason` field contains the structured auto-fix error output (truncated at 600 chars to keep it agent-readable).

Hook error policy: if bun spawn fails or validator path is missing — block hard (validator missing = misconfigured installation). On stdin parse error — allow through silently (hook must never break non-orch-state work).

**PostToolUse Bash backstop:**
The PreToolUse hook is blind to Bash-command writes (e.g., `jq ... > orch-state.json`, `mv tmp orch-state.json`). The PostToolUse matcher fires after every Bash call. Filter: grep the command for `orch-state|docs/data/orch` before running the full validator — avoids adding latency to unrelated Bash calls. On validator failure: emit structured warning to stdout (Claude Code surfaces as feedback prompting corrective action). Non-blocking: always exits 0 (the write already happened; fix-forward is the recovery).

**Registration in `.claude/settings.local.json` (already active):**
```json
"PreToolUse": [{"matcher":"Write|Edit","hooks":[{"type":"command","command":"bun \"$(git rev-parse --show-toplevel ...)/scripts/agents-flow/orch-state-hook-prewrite.mjs\""}]}],
"PostToolUse": [{"matcher":"Bash","hooks":[{"type":"command","command":"bash \"$(git rev-parse --show-toplevel ...)/scripts/agents-flow/orch-state-hook-bash-backstop.sh\""}]}]
```

**QA-5 mapping:** agent-loop test — issue a Write of invalid orch-state (bad status enum). Hook must return `{"decision":"block","reason":"..."}` and the write must NOT reach disk.

### 3.2 Point 2 — Server-Side (orchStateStore.ts)

**File:** `apps/mcp-server/src/infrastructure/orchStateStore.ts`
**Function:** `writeOrchStateAtomic(path, data)`

All internal mcp-server writes (`task_claim`, `task_release`, coordinationTools, scheduler jobs) route through `writeOrchStateAtomic()`. Before any filesystem operation the function calls:

```ts
const schemaResult = OrchStateSchema.safeParse(parsed);
if (!schemaResult.success) {
  throw new Error(`[atomic-write] ORCH-STATE SCHEMA VALIDATION FAILED ...`);
}
```

Throws BEFORE any `writeFileSync`/`renameSync` — the live file is never touched on schema failure.

**Remaining gap (SSOT-W1-SERVER-ENFORCE):** `OrchStateTaskBoardTask.status` in the hand-maintained interface is still typed as `"TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED" | "CANCELLED" | "DEFERRED" | string`. This is an 8-value subset of the 12-value StatusEnum and retains the escape hatch `| string`. It must be replaced with `z.infer<typeof StatusEnum>` so that the interface derives from the schema, not a duplicate definition.

**QA-6 mapping:** write a `task_claim` call that produces a task with an invalid status (e.g., `"PARKED"`) → `orchStateStore.safeParse()` throws before the rename, proving Point-2 coverage.

---

## Section 4 — orch-apply.sh Wrapper + Bash Shim Contract

### 4.1 orch-apply.sh — Canonical Hot-File Write Wrapper

**File:** `scripts/orch-apply.sh`
**Canonical pointer in dev-standards.md:** `CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER`

Every write to `docs/data/orch/orch-state.json` MUST route through this wrapper. The canonical call pattern:

```bash
jq '<filter>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```

Wrapper mechanics (in order — NO step may be reordered):
1. **CAS-mtime capture** — `stat` the live file mtime BEFORE reading stdin (earliest possible snapshot)
2. **Stdin → temp file** — `mktemp` under `docs/data/orch/` (same filesystem as live file for POSIX-atomic `mv(2)`)
3. **Empty-stdin guard** — abort exit 3 if temp file is empty (broken pipe / upstream filter error)
4. **Zod validation** — `bun scripts/orch-validate.mjs <temp>` (Stage-0 + Stage-1; coherence warnings non-blocking)
5. **CAS re-check** — compare mtime-before vs mtime-after; mismatch → exit 2 (concurrent write); caller retries
6. **Atomic rename** — `mv <temp> <live>` (POSIX rename(2) — readers see old XOR new, never partial)

Exit codes: 0=success, 1=validation fail, 2=CAS mismatch (retry), 3=usage error.

Live file is SACRED: on any non-zero exit, the temp file is removed by the `trap cleanup EXIT` and the live file is left untouched.

### 4.2 Bash Shim Contract

**File:** `scripts/orch-state-validate.sh`
**Role:** thin shim — `exec bun scripts/orch-validate.mjs "$@"`

All callers of the former bash-jq gate that used `orch-state-validate.sh` continue to work unchanged. The shim delegates all logic to `orch-validate.mjs`.

**Superset proof** (G-1..G-5 demoted):

| Former gate | Zod superset coverage |
|---|---|
| G-1 JSON validity | Stage-1 `JSON.parse` (exit 2 on malformed) |
| G-2 Structural sentinel | `OrchStateSchema`: `head`/`task_board`/`signal_queue` required fields |
| G-3 Lane types are arrays | `Lane = z.array(TaskSchema)`; `signal_queue.rows = z.array()` |
| G-4 No null sprint IDs | `SprintSchema.id: z.string().min(1)` rejects null/empty |
| G-5 Status enum (3 lanes) | `StatusEnum` (12 values) enforced across ALL 9 lanes — stricter; READY now valid |

G-6 (skew warn-only, no exit-code impact) is not carried forward; skew monitoring is an operations concern.

**QA-7 mapping:** `z.infer<typeof OrchStateSchema>` compiles without error; RED 1837a reconciled (AC-1 now checks `_meta.schema = "v4"` not root `._schema`); full mcp-server test suite green.

---

## Section 5 — Wave-1 Decomposition (6 Atomic Zone Tasks for PM)

PM decomposes these 6 tasks next. Each task is atomic (single zone, single dev). Tasks are partially or fully implemented; PM assesses actual completion status and assigns remaining work.

| Task ID | Zone | Covers | Key DoD gate |
|---|---|---|---|
| **SSOT-W1-ZOD-SCHEMA-MODEL** | `apps/mcp-server/` | `orchStateSchema.ts`: 12-value StatusEnum + TERMINAL_SET + all-9-lane nested schema + superRefine (active_task_id + ref integrity) + `checkLaneCoherence()` + `checkRefIntegrity()` exported; `.passthrough()`→`.strict()` progression documented | QA-1 (all-lane status injection), QA-3 (unknown key rejected), QA-4 (dangling ref rejected) |
| **SSOT-W1-ZOD-VALIDATOR-CLI** | `scripts/` | `scripts/orch-validate.mjs`: Stage-0 dup-key tokenizer (pre-parse) + Stage-1 safeParse + Stage-1b coherence (warn-only) + Stage-1c ref integrity (hard-fail) + auto-fix error contract | QA-1, QA-2 (dup-key blocked), QA-4 |
| **SSOT-W1-HOOK-ENFORCE** | `.claude/` + `scripts/agents-flow/` | `orch-state-hook-prewrite.mjs` (Write\|Edit PreToolUse blocker) + `orch-state-hook-bash-backstop.sh` (Bash PostToolUse backstop); both registered in `.claude/settings.local.json` | QA-5 (Write of bad orch-state blocked; deny reason returned to agent) |
| **SSOT-W1-SERVER-ENFORCE** | `apps/mcp-server/` | `orchStateStore.ts`: replace `OrchStateTaskBoardTask.status` hand-maintained union with `z.infer<typeof StatusEnum>`; confirm `OrchStateSchema.safeParse()` is called before EVERY atomic write (task_claim, task_release, coordinationTools, scheduler jobs); reconcile RED 1837a + 1980-f2 tests | QA-6 (task_claim with bad status throws pre-rename), QA-7 (types compile, 1837a green) |
| **SSOT-W1-ORCH-APPLY-WRAPPER** | `scripts/` | `scripts/orch-apply.sh`: stdin→Zod-Stage-0+Stage-1→CAS-mtime→atomic-rename; CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER pointer in `docs/policies/dev-standards.md`; proof that all known ~290/tick jq-patch writers route through wrapper | QA-2 (dup-key in candidate rejected before rename), QA-1 (bad status in candidate rejected) |
| **SSOT-W1-BASH-SHIM** | `scripts/` | `scripts/orch-state-validate.sh` thin shim (`exec bun orch-validate.mjs "$@"`); superset proof documented (G-1..G-5 demoted); existing callers unchanged; full mcp-server test suite green post-schema-enforcement | QA-7 (full suite green) |

---

## QA Acceptance Test Mapping

The 7 QA acceptance tests from the directive (§ Acceptance) are mapped to delivering sections:

| Test | Description | Covered by |
|---|---|---|
| QA-1 | Inject non-enum status into EACH of the 9 lanes → validator fails for every lane | SSOT-W1-ZOD-SCHEMA-MODEL (Lane type on all 9) + SSOT-W1-ZOD-VALIDATOR-CLI |
| QA-2 | Duplicate JSON key in raw text → Stage-0 rejects | SSOT-W1-ZOD-VALIDATOR-CLI (Stage-0 tokenizer) + SSOT-W1-ORCH-APPLY-WRAPPER |
| QA-3 | Unknown/legacy key under `.strict()` object → rejected | SSOT-W1-ZOD-SCHEMA-MODEL (`.strict()` on OrchStateSchema + TaskBoardSchema) |
| QA-4 | Dangling `detail_ref`/`payload_ref` → Stage-1c issue with corrected-path hint | SSOT-W1-ZOD-SCHEMA-MODEL (`checkRefIntegrity()`) + SSOT-W1-ZOD-VALIDATOR-CLI |
| QA-5 | Agent-loop test: Write of bad orch-state via hook returns structured reason + is blocked | SSOT-W1-HOOK-ENFORCE (PreToolUse blocker) |
| QA-6 | `task_claim` writing bad status server-side → `orchStateStore` throws pre-rename | SSOT-W1-SERVER-ENFORCE (`safeParse()` in `writeOrchStateAtomic`) |
| QA-7 | `z.infer` types compile; RED 1837a reconciled green; full mcp-server test suite green | SSOT-W1-SERVER-ENFORCE + SSOT-W1-BASH-SHIM |

---

## Brownfield Findings

**Zone:** `apps/mcp-server/` (primary — schema + store) + `scripts/` (secondary — validator, wrapper, shim) + `.claude/` (tertiary — hooks)

**Verified paths (key files):**
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` — StatusEnum, TERMINAL_SET, OrchStateSchema, checkLaneCoherence, checkRefIntegrity (shipped)
- `apps/mcp-server/src/infrastructure/orchStateStore.ts` — writeOrchStateAtomic + safeParse gate (shipped; status interface gap identified)
- `scripts/orch-validate.mjs` — Stage-0 + Stage-1 validator CLI (shipped)
- `scripts/orch-apply.sh` — stdin→validate→CAS→atomic-rename (shipped)
- `scripts/orch-state-validate.sh` — thin shim → orch-validate.mjs (shipped)
- `scripts/agents-flow/orch-state-hook-prewrite.mjs` — PreToolUse Write|Edit blocker (shipped)
- `scripts/agents-flow/orch-state-hook-bash-backstop.sh` — PostToolUse Bash backstop (shipped)
- `.claude/settings.local.json` — hook registration (Write|Edit + Bash PostToolUse wired)
- `docs/policies/dev-standards.md` lines 58+74+88+101 — CANONICAL pointers for all 4 scripts

**Reuse patterns:**
- `Lane = z.array(TaskSchema)` is the shared reusable sub-schema — extend by assigning `Lane` to new flat lanes; never inline `z.array(TaskSchema)` directly in TaskBoardSchema
- `checkLaneCoherence()` and `checkRefIntegrity()` are injected-resolver functions — test with mock resolvers, never mock existsSync at module level
- `orch-validate.mjs` is the canonical validation entry point — orch-apply.sh, the hook, and the shim all shell out to it; never duplicate validation logic

**Risk flags:**
- RISK-1 (HIGH): `OrchStateTaskBoardTask.status` is still `"TODO"|...|string` (escape hatch). Server-side `safeParse()` catches violations at runtime but the TS type does not statically prevent bad-status construction. SSOT-W1-SERVER-ENFORCE must close this.
- RISK-2 (MED): Lane-coherence is WARN-only until SHG-2+SHG-4 complete. The ~72 violations in live data will re-appear on every validator run as warnings. PM should time SSOT-W1-ZOD-SCHEMA-MODEL promotion (`.strict()` + coherence hard-fail) to land AFTER data migration confirms zero violations.
- RISK-3 (MED): `closed_sprints[].tasks` are validated but many hot-file closed_sprint entries are lightweight stubs (`{id, title, closed_at, task_count, detail_ref}`) without `tasks[]`. SprintSchema `tasks` defaults to `[]` to handle this gracefully — if stubs gain a `tasks` field in future the schema catches it immediately.
- RISK-4 (LOW): PostToolUse Bash backstop is non-blocking (always exits 0). A bad write via Bash that slips past the filter heuristic produces a warning, not a block. Fix-forward is the recovery (git checkout or repair + re-validate). This is acceptable because the PreToolUse hook + orch-apply.sh provide blocking gates for the two primary write paths.

**Scan clean:** true — no DDD violations detected. Schema lives in infrastructure layer. Domain layer is not touched.

**BUILD-STANDARD:** lean (apps/mcp-server/ exists; all files extend the existing service)

---

## RETURN

```
DONE: Architecture brief authored — SSOT-INTEGRITY-PERIMETER hardening design complete
ZONE: apps/mcp-server/ (primary) + scripts/ (secondary) + .claude/ (tertiary)
NEXT: pm | decompose Wave-1 into 6 atomic tasks (SSOT-W1-ZOD-SCHEMA-MODEL, SSOT-W1-ZOD-VALIDATOR-CLI, SSOT-W1-HOOK-ENFORCE, SSOT-W1-SERVER-ENFORCE, SSOT-W1-ORCH-APPLY-WRAPPER, SSOT-W1-BASH-SHIM) and assign dev-mcp-server + scripts zones
HANDOFF: docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md
PIPELINE: continue
```
