# BA Spec — IVC-ARCH-BLUEPRINT (INPUT-VALIDATION-COVERAGE)

**Agent:** ba · **Date:** 2026-08-08 · **Task:** IVC-ARCH-BLUEPRINT (SPIKE, zone `multi`, dispatched via dev-team Review-Lane SECONDARY-Drain)
**Blockers for PO:** NONE. Architect's mechanism decision (§1 of the brief) is final and well-reasoned (rejected alternatives shown, not asserted); nothing here needs a PO-only priority/business call before minting.
**Disposition:** Brief is COMPLETE and SOUND — sign off DONE_VERIFIED. This doc formalizes it into atomic, AC-bearing task specs for PM to mint (BA's own role stops at spec; task-breakdown/board-placement is PM's job per `docs/agents/ba/init.md` `not_my_job`).

---

## 0. SSOT reconciliation — recheck of the 4 FOLD-in-scope rows (live, not trusted from the brief's 07-25 text)

| Row | Brief's assumption (07-25) | Live status (checked 2026-08-08) | Disposition |
|---|---|---|---|
| `UC-CRITIC-HOOKS-ENFORCEMENT` | "closed-by-reference once IVC-C1 ships — not a separate implementation" (§5 table) | **STALE — already `DONE_VERIFIED`** (archived `docs/data/orch/archive/2026-08.json`, QA-verified commit `f4d35b5df`, 2026-08-08T10:29Z) via a **narrower, separate mechanism**: `hook-guard.sh` crash-discriminator applied to the 4 named hook scripts (`orch-state-hook-bash-backstop.sh`, `context-bloat-backstop.sh`, `notebook-auto-prune.sh`, `branch-hygiene-stop.sh`), NOT the generalized registry-driven hook this blueprint designs. | **No dependency needed.** IVC-C1 does not have to ship for this row to close — it already did, independently. IVC-C1 remains valuable as the *generalized* mechanism (covers `docs/data/*.json` writes, which `hook-guard.sh` does not touch — that fix is scoped to hook-script crash-detection, not store-content validation). Do not re-cite "closes UC-CRITIC-HOOKS-ENFORCEMENT" as an IVC-C1 deliverable — it is moot. |
| `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` | "in-flight, pre-aligned, proceeds unchanged" | **`DONE_VERIFIED`** (archived, QA-verified commit `6feec3ab1`, 2026-08-06T17:19Z) — shipped a `.strict()` Zod write-door on `predictionClaimStore.ts` using exactly §2's contract shape (confirmed: reviewer's own note cites this blueprint by path). | Consistent, no conflict. Already-shipped proof-of-concept that §2's contract is implementable as designed — cite as a **second working precedent** for IVC-A2/A3+, alongside `agentSignalTools.ts`. |
| `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` | "in-flight, pre-aligned, proceeds unchanged" | Still `BACKLOG`, owner `po`, next_agent `architect`. Unstarted. | Consistent, no conflict. Distinct scope (soft-label `validation_status` truthfulness on bank-form ingestion, not a write-door schema gate) — correctly NOT folded into IVC-C/A task list. |
| `SYSREMAKE-P2-T2-SCHEMA-ADDITIONS` | "in-flight, pre-aligned, proceeds unchanged" | Still `READY`, next_agent `developer`, depends on `SYSREMAKE-P2-T1-GRANDFATHER-JQ-QUERY` (also `READY`, unstarted). | Consistent, no conflict. Unrelated schema (system-auditor `RawProbeSchema`/`VerificationSchema`) — correctly not folded in; leave untouched. |

**Net effect on the decomposition below:** none of the 4 folded rows create new work for IVC-C1..C6/IVC-A1..A2 — 2 are already done (1 stale reference corrected above), 2 are independent and untouched. No duplicate-row risk found.

**Class-A inventory freshness (spot-checked, not re-derived by hand):** brief's `162` total tool files (§4) is now **167** (live `find` count, 2026-08-08) — a 5-file drift in 14 days. This is not a defect in the brief; it is live proof of exactly why `IVC-A1` (§2 below) must be a re-runnable script, not a one-time manual count — the brief's own numbers are already stale 2 weeks in. Not re-deriving the full 120/115/14/12/8/2 breakdown by hand here — that duplicates `IVC-A1`'s whole purpose (brief §4: "full precise inventory needs a script, not a 162-file manual read").

---

## 1. Functional Requirements + DDD Layer Mapping (atomic, ready to mint)

Task IDs reuse the brief's own proposed IDs (§5) verbatim — no renaming, no new namespace. All checked clean against live `docs/data/orch/orch-state.json` + all `docs/data/orch/archive/*.json` for collisions (none found).

| ID | Requirement | Owner | Depends | DDD Layer | AC (testable) |
|---|---|---|---|---|---|
| **IVC-C1** | Generic registry-driven `PreToolUse Write\|Edit` hook (`scripts/agents-flow/store-validation-hook-prewrite.mjs`) + shared CLI (`scripts/store-validate.mjs`), absorbing `orch-state-hook-prewrite.mjs`'s dispatch as registry entry #1 (not a 2nd parallel hook). Fail-closed on validator-infra crash; `IVC_HOOK_EMERGENCY_BYPASS=<reason>` escape hatch. | dev-mcp-server | — | Infrastructure (hook + CLI) / Interface (Claude-tool boundary wiring) | (a) `.claude/settings.local.json` has exactly ONE `PreToolUse Write\|Edit` matcher after this change (grep-verified, not two). (b) Registry MISS → write passes through, logged as a coverage gap (not silently invisible). (c) Registry HIT + schema fail → BLOCK with §3's canonical error. (d) Registry HIT + validator-infra crash (missing binary / spawn error / timeout / unparseable schema module) → BLOCK — regression test injects a crash on ONE registered path and asserts an UNRELATED registered path is unaffected (blast-radius bound, brief §1.1.5). (e) `IVC_HOOK_EMERGENCY_BYPASS` set → write allowed AND `send_telegram(channel="bug")` fires unconditionally — both assertions in one test, not just the allow-path. (f) Existing `orch-state.json` dual-point tests (`orch-state-hook.test.mjs`) still pass unmodified — `orch-validate.mjs` itself is untouched, only its dispatch wrapper changes. |
| **IVC-C2** | Schema registry scaffold `apps/mcp-server/src/infrastructure/schemas/storeSchemaRegistry.ts` (glob-pattern → `{schema, ownerAgent, kind}`) + live classification of the 77 `docs/data/*.json` files into ~15–20 shape families + generated `docs/data/coverage/class-c-coverage.json` dashboard. | dev-mcp-server | IVC-C1 | Infrastructure (data-store schema registry) | (a) Registry is a TS module (Zod schemas are not JSON-serializable — never move this to `docs/data/`). (b) `class-c-coverage.json` is produced BY a script FROM the registry — never hand-edited (no-hardcoded-stats rule). (c) Family count is re-derivable: re-running the classification script against a live re-glob of `docs/data/*.json` reproduces the same family boundaries (no silent drift as new stores are added). |
| **IVC-C3** | Author Zod schemas, wave 1: `cowork-schedule.json`, `pressure-state.json`, `coverage-state.json`, `pilot-status-*.json`, `unified-agent-synthesis-*.json` families. Default `.strict()` per §3 of the brief (undocumented `.passthrough()` needs a `SYS-FUNC-XX`-style justification comment, same convention as `signalTypes.ts`). | dev-mcp-server | IVC-C2 | Infrastructure | (a) Each wave-1 family moves from pass-through to enforced in `class-c-coverage.json`. (b) Synthetic malformed write to each wave-1 family → BLOCKED with a per-field descriptive error (§3 contract below). (c) Synthetic valid write → unaffected (no false-positive regression). |
| **IVC-C4** | Structural validator (`kind:"structural"`) for `docs/agent-memory/notebooks/*.md` + `docs/handoffs/*.md` — header line + required `## ` section markers, per `notebook-read`/`decision-journal` conventions. Same registry, same hook, same fail-closed-on-crash contract. | dev-mcp-server | IVC-C2 | Infrastructure | (a) A notebook/handoff write missing its required header or a mandated `## ` section → BLOCKED with a field-shaped error (missing section name as `field`, §3 shape below — reused for structural, not a second error format). (b) A well-formed write is unaffected. |
| **IVC-C5** | Class-C audit sink: `docs/data/validation-rejections.jsonl` (append-only, one `ValidationRejection` record per BLOCK) + rotation via the existing `cold-archive-sweep.sh` monthly pattern (reuse, not new) + `send_telegram(channel="bug")` per block. | dev-mcp-server | IVC-C1 | Infrastructure (audit sink) | (a) Every hook BLOCK produces exactly one `.jsonl` row matching §3's `ValidationRejection` shape. (b) Telegram fires once per block (not duplicated, not silent). (c) `cold-archive-sweep.sh`'s existing rotation logic picks up this file without a bespoke second rotation mechanism. |
| **IVC-C6** | Extend `scripts/agents-flow/auditor-tier1-probe.sh` with a canary check: `bun` + `store-validate.mjs` + the registry module all load and pass one canary schema. | dev-mcp-server | IVC-C1 | Infrastructure (auditor probe) | Canary check fires a loud, named finding (mirrors the existing tier1-probe finding convention) BEFORE a legitimate agent write ever silently hits an infra-crashed validator — closes the "silent gate decay" half of the completeness-critic finding the brief cites (§1.1.7). Cross-ref note: `UC-CRITIC-HOOKS-ENFORCEMENT` itself needs no touch here — already `DONE_VERIFIED` via a separate mechanism (§0 above); this AC stands on its own merit (closing the *store-registry* silent-decay gap, distinct from the *hook-script* one that row closed). |
| **IVC-A1** | `scripts/audits/class-a-validation-coverage-scan.sh` → `docs/data/class-a-validation-coverage.json` (mirrors `coverage-state.json` convention) — scripted, re-runnable Class-A inventory replacing the brief's manual count. | dev-mcp-server | — | Infrastructure (audit tooling) | (a) Script output reproduces the brief's baseline counts (`162`†/120/115/14/12/8/2) as a regression fixture, OR explains the delta with evidence (†already known stale: live count is 167 as of 2026-08-08, see §0 — script must report the CURRENT count, not the brief's frozen one). (b) Script also classifies the 12 zero-zod files' read/write disposition (brief's spot-check found 3-of-12 confirmed read-only; 9 unconfirmed) — output must not leave PM to guess which of the 9 are real gaps. |
| **IVC-A2** | Shared `apps/mcp-server/src/domain/validation/writeRejection.ts` (canonical `FieldValidationError`/`ValidationRejection` types + top-line message formatter, §3) + generic `write_rejections` DB table (`surface`, `errors_json`, `rejected_at`, `rejected_by`), generalizing `signalRejectionStore.ts`. | dev-mcp-server | — | Domain (validation contract/types) / Infrastructure (DB table) | (a) `agentSignalTools.ts`'s existing GOLD-pattern reject path, after migrating onto the shared module, produces byte-compatible output (regression: existing GOLD-path tests still pass). (b) `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT`'s already-shipped Zod write-door (§0 above) is confirmed schema-compatible with this shared type (second working precedent, not just the one GOLD example). |
| **IVC-A3..An** | Wire write-door `safeParse` + reject (via IVC-A2's shared module) into confirmed Class-A gaps: 6 named in brief §4 (`alerts/alerts.ts`, `financial-reports/bctcSkipTool.ts`, `market-data/priceAlertTools.ts`, `news-analysis/analysis.ts`, `system/scheduledTaskTools.ts`, `system/watchlist.ts`) + whatever `IVC-A1` additionally surfaces. | dev-mcp-server | IVC-A1, IVC-A2 | Domain/Infrastructure (store-function write boundary, per brief §1.4 — never only the `interface/mcp/tools/` handler) | **NOT minted by this spec — count is scan-dependent.** PM mints these ONLY after `IVC-A1`'s actual JSON output lands; do not guess N ahead of time (brief §5's own explicit caution, reaffirmed here). Each row, once minted, gets its own AC: malformed write on that tool → BLOCKED with §3's error; valid write unaffected; any raw-SQL-in-interface-layer DDD smell flagged alongside (brief §4, not silently left as-is). |

---

## 2. Non-Functional Requirements

- **NFR-1 (blast-radius bound):** one broken registry entry's schema module must never block writes to an unrelated registered path — tested explicitly under IVC-C1 AC(d).
- **NFR-2 (escape hatch never silent):** `IVC_HOOK_EMERGENCY_BYPASS` use always fires `send_telegram(channel="bug")` — tested explicitly under IVC-C1 AC(e).
- **NFR-3 (registry is code, not data):** `storeSchemaRegistry.ts` lives under `apps/mcp-server/src/infrastructure/schemas/` — Zod schemas are TS values, never move to `docs/data/*.json` (would defeat the schema's own type-safety).
- **NFR-4 (dashboards generated, never hand-edited):** `class-c-coverage.json` and `class-a-validation-coverage.json` are both script output — no-hardcoded-stats rule applies to both, not just one.
- **NFR-5 (two sinks, one shape, never conflated):** Class-A audit → `write_rejections` DB table; Class-C audit → `validation-rejections.jsonl`. Both carry the SAME `ValidationRejection` logical shape (§3) but are physically distinct stores per necessarily-different infra (in-process DB vs standalone `bun` hook script with no DB connection) — do not attempt to unify into one physical sink.
- **NFR-6 (undocumented `.passthrough()` gap, brief §3):** `signalTypes.ts`'s `PriceAnomalyFindingDataSchema` — one live-counted undocumented `.passthrough()` instance, no `SYS-FUNC-XX`-style justification comment. Fold into IVC-A2's wave (add a comment or convert to `.strict()`) — not a separate row, but must not be silently dropped from scope either.

---

## 3. Canonical error contract (unchanged from brief §2 — cited here so PM/dev mint against ONE copy, not two)

```ts
interface FieldValidationError {
  field: string; problem: string; expected?: string; originalValue: unknown; fix?: string;
}
interface ValidationRejection {
  surface: string; class: "A" | "C"; rejectedAt: string; rejectedBy?: string; errors: FieldValidationError[];
}
```
Top-line message: `"<surface> rejected — invalid or missing required fields:\n[1] <field>: <problem> (expected: <expected>, got: <originalValue>)\n...\n\nFix and retry."` — merges `agentSignalTools.ts` GOLD msg, `foreignFlowValidator.ts`'s `{itemIndex,field,reason,originalValue}`, and the SSOT-zod-validation-directive's `path/problem/expected/fix` auto-fix contract. Do not re-derive a 4th shape.

---

## 4. Edge Cases

- **EC-1 (registry MISS ≠ regression, but must stay visible):** an unregistered store path passes through unvalidated — correct per brief §1.1.2 (nothing validated there today), but `class-c-coverage.json`'s pass-through count must trend toward zero, not sit forever as an accepted gap. PM should track this metric, not just the "shipped" boolean.
- **EC-2 (multi-writer stores):** genuinely multi-writer stores (rare outside `orch-state.json`) need the CAS-mtime atomic-rename technique from `orch-apply.sh` reused verbatim as an opt-in wrapper — IVC-C2's family classification must flag which specific families (if any) are multi-writer; do not assume none are.
- **EC-3 (headless/cron writers bypass the hook entirely):** `unified-agent`'s synthesis dump, `auditor`'s tier-healthy snapshot, and any other launchd/cron writer never go through a live Claude session — they MUST call `store-validate.mjs` directly to get the same guarantee (brief §1.3). IVC-C1's AC should include at least ONE such cron/launchd site actually wired to call the CLI (not just "designed to be callable" — a real call site, to prove the non-interactive-caller shape works end to end).
- **EC-4 (`agentSignalTools.ts`'s own fail-open branch):** `validateSignalPayload()`'s dispatch on an unrecognized `signal_type` currently passes through with a console warning instead of rejecting — a fail-open branch inside the repo's own GOLD example (brief §4). Flagged here as a known residual risk for whichever IVC-A3+ row eventually touches `agentSignalTools.ts` hardening — not a blueprint-level decision, not resolved by this spec.

---

## 5. File-by-File Plan (for PM to mint against)

**New infrastructure (dev-mcp-server):**
- `scripts/store-validate.mjs`, `scripts/agents-flow/store-validation-hook-prewrite.mjs` (IVC-C1)
- `apps/mcp-server/src/infrastructure/schemas/storeSchemaRegistry.ts`, `docs/data/coverage/class-c-coverage.json` (generated) (IVC-C2)
- Zod schemas for wave-1 families, registered in the above registry (IVC-C3)
- Structural validator for notebooks/handoffs, registered in the same registry (IVC-C4)
- `docs/data/validation-rejections.jsonl` sink + `cold-archive-sweep.sh` rotation wiring (IVC-C5)
- `scripts/agents-flow/auditor-tier1-probe.sh` canary extension (IVC-C6)
- `scripts/audits/class-a-validation-coverage-scan.sh` → `docs/data/class-a-validation-coverage.json` (IVC-A1)
- `apps/mcp-server/src/domain/validation/writeRejection.ts` + generic `write_rejections` table (IVC-A2)
- Per-tool write-door hardening, count TBD from IVC-A1 (IVC-A3+, not minted here)

**Edit, existing:**
- `.claude/settings.local.json` — repoint the single `PreToolUse Write|Edit` matcher at the new generic hook (IVC-C1); `orch-state-hook-prewrite.mjs`'s dispatch logic becomes registry entry #1, not deleted wholesale (its underlying `orch-validate.mjs` stays untouched).
- `signalTypes.ts` — `PriceAnomalyFindingDataSchema` justification comment or `.strict()` conversion (NFR-6, folded into IVC-A2).

**Read for context, no change:**
- `docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md`, `scripts/orch-apply.sh`, `scripts/orch-validate.mjs`, `agentSignalTools.ts`, `signalBuilders.ts`, `foreignFlowValidator.ts` — all cited prior art, reused not rebuilt.

---

## 6. Verification Gate Mapping

`IVC-ARCH-BLUEPRINT`'s own goal: *"every agent data-input surface is schema-validated so an agent CANNOT persist incomplete/malformed data; on violation a DESCRIPTIVE per-field error is thrown, naming exactly what is missing/invalid."*

| Requirement | Satisfied by |
|---|---|
| Class-C (store JSON writes) cannot persist malformed data | IVC-C1 (fail-closed hook) + IVC-C2/C3/C4 (schemas driving it) |
| Class-A (MCP tool writes) cannot persist malformed data | IVC-A2 (shared contract) + IVC-A3+ (per-tool wiring, scan-dependent count) |
| Descriptive per-field error on every rejection | §3 canonical contract, reused by both classes, not reinvented per row |
| No silent validator-infra failure (the `UC-CRITIC-HOOKS-ENFORCEMENT` complaint) | IVC-C1 AC(d) (fail-closed-on-crash) + IVC-C6 (canary, catches rot before an agent hits it) — note this is a DIFFERENT, complementary closure to the one `UC-CRITIC-HOOKS-ENFORCEMENT` itself already shipped (§0) |

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-ba.md`, task_id `IVC-ARCH-BLUEPRINT`.

## RETURN
```
DONE: BA spec complete — architect blueprint (docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md)
      signed off DONE_VERIFIED. SSOT-reconciled the 4 FOLD-in-scope rows live (2 already DONE_VERIFIED —
      1 blueprint cross-reference now stale/corrected in §0; 2 unrelated/untouched, no conflict). Formalized
      10 atomic task specs (IVC-C1..C6, IVC-A1, IVC-A2, IVC-A3+ deferred-count) with FR/AC/DDD-layer/owner,
      reusing the brief's own IDs verbatim (no rename, no collision).
NEXT: pm | mint IVC-C1..C6 + IVC-A1 + IVC-A2 from §1's table (IVC-A3+ deferred until IVC-A1 lands its
      actual scan output — do not guess N). New board row IVC-PM-DECOMPOSE carries this handoff.
HANDOFF: docs/handoffs/IVC-ARCH-BLUEPRINT-BA-spec.md
BLOCKER: none.
PIPELINE: continue
```
