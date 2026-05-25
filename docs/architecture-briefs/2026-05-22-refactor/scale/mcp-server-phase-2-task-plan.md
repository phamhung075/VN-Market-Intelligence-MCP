---
title: "Phase 2 Task Plan — mcp-server (TypeScript/Bun) — FULL Track"
date: "2026-05-25"
author: "architect (P2-MCP-PLAN)"
pilot: "mcp-server"
fleet_pilot_number: 11
phase: "2"
status: "READY-FOR-DISPATCH — Phase-1 close-gate APPROVED 2026-05-25T17:45Z; architect plan authored 2026-05-25T17:55Z"
sprint_kickoff: "TBD — PO sequencing signal required (RUN-SOLO still binding)"
sprint_deadline: "TBD + remaining sprint budget from 6-sprint envelope"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md"
ssot_ref: "docs/data/pilot-status-mcp-server.json"
si3_ref: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md"
phase1_gate: "CLOSE-GATE APPROVED 2026-05-25T17:45Z (po P1-EXIT); QA P1-MCP-QA PASS @3ea944b6; 7/12 YES"
anchor_tag: "mcp-server-pre-refactor @ 7d78abb1 (local-only — INTACT)"
language: "TypeScript"
runtime: "Bun 1.3.13 / Ubuntu 22.04"
owner: "dev-mcp-server"
wip_limit: 1
schedule_constraint: "RUN-SOLO — zero other scale terminals active. LAST after ALL other service pilots. Binding from Phase 1."
risk: "HIGHEST"
---

# Phase 2 Task Plan — `mcp-server` (TypeScript/Bun) — FULL Track

**Generated:** 2026-05-25 by architect (Phase 2 plan, P2-MCP-PLAN)
**Zone:** `apps/mcp-server/` ONLY (anti-scope-creep clause binding — inherited from Phase 1)
**Owner:** `dev-mcp-server` specialist
**Language:** TypeScript / Bun 1.3.13 (locked — not a rewrite candidate)
**WIP:** 1 task at a time, SOLO terminal, throughout entire Phase 2
**Status:** READY-FOR-DISPATCH — awaiting PO sequencing signal

---

## Phase 1 Close Summary

Phase 1 is CLOSED/APPROVED (2026-05-25T17:45Z, signal docs/signals/po-20260525T174842Z.json).

**Earned in Phase 1 (7 goals, stays YES):**
G1 (2 primitive scaffolds + sparkline, 9 scenarios), G2 (3 barrel seams decomposed 5+2+3 sub-barrels),
G5 (G5-inverse routing rewire: kinhDichWrapper bypass removed, QUE_META re-exported, pdf.ts KEEP callers annotated),
G6 (three-tier dashboard stub, file:// mode), G7 (edit-JSON-rerun + zero-creds), G8 (honest red/green proof),
G12 (dev-flow DoD streak 3/3: P1-B/C/D).

**Phase 2 scope (5 deferred goals + G5a cleanup):**
G3 (clean composition root), G4 (architecture fence), G5a (domain-file deletion),
G9 (trust contract sign-off), G10 (AI fixes injected bug ≤2 cycles), G11 (regression alarm).

**§4.5 binding rule:** dev-mcp-server does NOT flip any goal status. All goal flips
(DEFER → YES) are PO-only, in ONE atomic terminal-close commit, after ALL 12 reach terminal state.
`decisionMatrix.{speed,trust,scale}` stays TBD throughout Phase 2. `goalsEarned` stays 7 until PO flip.

---

## CRITICAL SCHEDULING CONSTRAINT (inherited from Phase 1 — unchanged)

RUN-SOLO. No other dev/scale terminal may touch the mcp-server zone while any Phase-2 task is in flight.
Rationale is unchanged from Phase-1 plan §Critical Scheduling Constraint.

---

## GIT DISCIPLINE RULES (inherited — binding every commit)

1. Explicit-file staging ONLY. `git add <exact-path>` per file. NEVER `-A`, `.`, `-am`, or wildcard flags.
2. Pre-commit diff review: `git diff --cached --name-only` must show ONLY intended files.
3. Acquire commit-mutex before staging → skill `.claude/skills/commit-mutex/SKILL.md`
   (kind='sprint-task', key='commit-mutex:main', TTL=60s per BUG-1 enum-drift workaround).
4. No --force, --no-verify, --no-gpg-sign.
5. All work on main. No branches.
6. No other scale terminal active during commit waves.
7. Verify no `.git/index.lock` and no live git process before staging.

---

## SI-3 ESLint Fence (G4 prerequisite — RESOLVED, no re-design needed)

**SI-3 STATUS: LANDED.** Design is FINAL and locked (commit 388703b7).
Spec: `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` §5.

**mcp-server layer mapping for eslint.config.mjs:**
mcp-server does NOT use the `src/primitive/`, `src/module/` layout of news-fetch/kinh-dich.
It uses: `src/domain/`, `src/application/`, `src/infrastructure/`, `src/interface/`, `src/scheduler/`, `src/sandbox/`.

The fence config MUST be adapted to the existing mcp-server source structure:
- **Fence-A (domain purity):** `src/domain/**` must not import `src/infrastructure/`, `src/application/`,
  `src/interface/`, `src/scheduler/`.
- **Fence-B (application purity):** `src/application/**` must not import `src/interface/`, `src/scheduler/`.
- **Fence-C (infrastructure wiring):** `src/infrastructure/**` may only be imported from `src/index.ts`
  (composition root) and `src/application/**` (use cases). Direct imports from `src/interface/**` or
  `src/scheduler/**` to `src/infrastructure/**` are DDD violations.

**IMPORTANT — fence must cover existing code, not ideal future code.** The brownfield has
scheduler jobs that import from `src/infrastructure/` directly (legitimate: scheduler is the
application-layer orchestrator in this service). The fence element definitions must reflect this.
The deliberate-violation proof (AC-4b) is the non-negotiable guard: a real violation must exit
non-zero. A fence that exits 0 with no real code change is NOT a pass (fence false-green trap).

**Owner:** dev-mcp-server (fence config + violation proof) + qa (independent reproduction).

**R-2 fallback (pre-documented):** If `.js`-suffix ESM imports evade `eslint-plugin-boundaries`,
add `@typescript-eslint/parser` + `languageOptions:{parser:tsParser}`. Stays Option A.

---

## Brownfield Findings for Phase-2 Scope

### G3 — Composition Root (src/index.ts = 199L)

Current `apps/mcp-server/src/index.ts` (199 lines) mixes:
1. LanceDB/Rust env var suppression (lines 26-27) — bootstrap config, stays in index.ts
2. Import declarations (lines 29-35)
3. `loadConfig()` + `createLogger()` calls (lines 37-38)
4. 5 startup sections: env-check, SQLite init + WAL + vnstock migrations, trade profile seed,
   server start, Telegram env check, webhook registration, pdf-extractor health check (lines 43-138)
5. Scheduler start (line 141)
6. Background OCR setTimeout (lines 145-176) — HIGHEST candidates for extraction
7. Graceful shutdown handler (lines 179-189)
8. Signal handlers + unhandledRejection (lines 191-199)

**Design decision:** Extract a `composition-root.ts` that contains the bootstrap orchestration
(sections 4-8 above, calling into typed helper functions). `src/index.ts` becomes the thin entry point
(env suppression + imports + `await bootstrapMcpServer()` call). Target: index.ts ≤ 80L.

**Composition root file:** `apps/mcp-server/src/composition-root.ts`
- Exports: `bootstrapMcpServer(): Promise<void>` — single exported function.
- Contains: DB init block, server start, Telegram env check, webhook, pdf-extractor health, scheduler,
  background OCR setTimeout, graceful shutdown, signal/rejection handlers.
- No business logic — only orchestration (import + call + log). Zero domain operations.
- Zero domain→infra imports (domain golden rule not applicable here — composition root wires infra).
- Max length: ≤ 120L (larger than standard 80L cap; size-justification: single-function bootstrap file;
  this is explicitly noted in the plan).

**New index.ts** ≤ 80L:
```
// env suppression (2L) + import declarations + loadConfig/createLogger + await bootstrapMcpServer()
```

**Risk:** The `setTimeout` background OCR block (lines 145-176 of current index.ts) imports
`pdfOcrWorker.ts` and `pdfDir` — these are the 4 KEEP callers from P1-G with `// G5-DEBT` annotations.
Moving them to composition-root.ts is safe; no path change needed (relative imports still resolve).

### G4 — Architecture Fence

No `.eslintrc` or `eslint.config.mjs` on disk in `apps/mcp-server/`.
`package.json` has no `eslint` devDependency.
Pre-revert tag `mcp-server-pre-ci` must be created before any fence work (per Phase-1 §Pre-Revert Tags).

**Known gotcha (fence false-green trap):** Prior pilots showed that a fence can report 0 errors while
checking NOTHING (deprecated rule name, bad globs, element patterns that don't match the actual
file layout). The plan mandates a deliberate-violation proof: introduce ONE real import violation,
confirm `bunx eslint src/ --max-warnings 0` exits non-zero with "Fence-A" (or equivalent) in output,
then revert (never commit the violation). A fence that exits 0 without the violation test is NOT a pass.

### G5a — Domain-File Deletion

**P1-G5 reminder:** Phase-1 G5 covered the routing REWIRE (kinhDichWrapper bypass removed from
interface tool files). Phase-2 G5a covers moving the now-unused wrapper to `_deprecated/`.

**Callers audit (brownfield 2026-05-25):**

`kinhDichWrapper.ts` callers:
- `apps/mcp-server/src/domain/services/index.ts` line 139: `export * from "./kinhDich/kinhDichWrapper.js"`
  — this is a re-export barrel. After removing this line, the wrapper has zero live callers.
- `__tests__/1077-kinh-dich-wrapper.test.ts` line 11: direct import — test will break when file moves.
  Test must be updated to import from `_deprecated/` path or be retired.
- `__tests__/1081-sprint-054-smoke.test.ts` line 37: direct import — same.

`hexagramLibrary.ts` callers (KEEP — do NOT move):
- `hexagramResolver.ts` (domain internal) — KEEP: domain-internal dependency.
- `hexagramNames.ts` (interface tool barrel) — KEEP: sanctioned re-export established in P1-F.
- `intelligenceCycleJob.ts` dynamic import lines 418-420 — KEEP: scheduler uses QUE_META for
  hexagram labeling. This is legitimate in-process computation, not a G5 violation.
- Tests — KEEP: legitimate test surface for the library.

`kinhDichReading.ts`, `haoEncoder.ts`, `hexagramBacktester.ts`, `hexagramResolver.ts`,
`kinhDichFormatter.ts`, `nguHanhClassifier.ts`, `nuclearComputer.ts`, `transformedComputer.ts`:
- All have test callers and `intelligenceCycleJob.ts` imports `kinhDichReading.ts` + `hexagramLibrary.ts`
  dynamically (lines 412-420). These are LEGITIMATELY KEPT in `domain/services/kinhDich/` —
  they are the in-process computation path for the intelligence cycle.
- The G5-inverse violation was the tool HANDLERS bypassing kinh-dich-service:5005 for their
  MCP-tool-layer logic. That was fixed in P1-F. The scheduler's in-process use of these domain
  services for the intelligence cycle is DIFFERENT and not a G5 violation.
- **DO NOT move these files. They are legitimately domain-owned.**

**G5a scope (NARROW — only the deprecated wrapper):**
1. `git mv` `kinhDichWrapper.ts` to `infrastructure/_deprecated/kinhDichWrapper.ts`
2. Remove the re-export from `domain/services/index.ts` line 139.
3. Update 2 test files (`1077-kinh-dich-wrapper.test.ts`, `1081-sprint-054-smoke.test.ts`) to import
   from `_deprecated/` or add a `// DEPRECATED-IMPORT: test of deprecated wrapper — do not follow` note.
4. Run regression tripwires. No tool count regression. No domain→infra violation introduced.

**R-MEDIUM risk note:** If moving the wrapper causes tsc errors (the wrapper itself imports other
kinhDich domain files), those imports stay valid because the kinhDich domain files remain in place.

### G9 — Dashboard Trust Contract

**Dashboard is a Phase-1 stub** per pilot-status G9 calibration. Module and microservice panels
are placeholders. Phase-2 must fill live content before a trust-contract sign-off is meaningful.

**What "live" means for each panel:**
- **Module panel** (currently "Phase 2 — not yet extracted"): Replace placeholder with real barrel
  module names from the 3 sub-barrel decompositions (system/coordination/ops-debug/etc.). Each entry
  shows sub-barrel name + file count. No JavaScript required — static JSON-loaded list is sufficient.
  This is a dashboard-data file (`dashboard/data/modules.json`) + template rendering.
- **Microservice panel** (currently "~146 static"): Replace `~146 static` with a fetch from
  `GET /health` (the server's live health endpoint which returns `{ok:true, toolCount:146, ...}`).
  The dashboard can do an inline `fetch('http://localhost:3000/health')` with a graceful fallback
  ("server offline — last known: 146 tools") so file:// mode still works without a running server.

**G9 trust contract artifact:** A Playwright headless test (Path B PO default per pilot-status
G9 calibration) that opens `file://apps/mcp-server/dashboard/index.html` and asserts:
1. Three panels present (no placeholder text in module panel).
2. Primitives panel shows ≥ 9 scenario cards (9 scenario JSONs on disk post-P1-H).
3. At least 1 GREEN card + at least 1 RED card (honest red/green coupling proven).
4. Zero JavaScript console errors.
5. Zero network calls (file:// mode — Playwright network listener captures 0 HTTP requests).

**G9 USER verbal sign-off** is the ONLY USER-gated step in Phase 2. After the Playwright test
passes (PO runs it), PO may present the dashboard to the user and ask: "Can you confirm the
dashboard shows the mcp-server tools are working?" The user's YES is the verbal sign-off.
PO records it in the pilot-status G9 evidence field. NEVER ask the user to run a command.
This is the standard Path A → Path B fork used by all prior pilots.

**Pre-revert tag:** none needed for G9 (dashboard changes are additive; no existing code deleted).

### G10 — Bug-Injection Cycle

**Target primitive:** `signal-bus-helper` (`domain/signals/signalBuilders.ts`).
- Pure function, zero I/O, scenario-JSON-tested (P1-H established 3 scenarios).
- Bug type: single-literal mutation (e.g., change `"signal"` key to `"sig"` in the output envelope,
  or invert an urgency level comparison). The mutation must produce deterministic RED on the
  golden scenario and be fixable with a 1-line revert.

**Pre-revert tag:** `mcp-server-pre-inject` must be created by QA BEFORE injecting the bug.
This tag is listed in Phase-1 §Pre-Revert Tags as a Phase-2 QA tag. Create it at QA task start.

**Cycle counting:** One cycle = one dev-mcp-server fix attempt ending in a commit.
The cycle starts when QA commits the injected bug and the dashboard shows RED.
The cycle ends when dev-mcp-server's fix commit restores GREEN. ≤ 2 cycles = G10 PASS.

**G10 gate:** dev-mcp-server must diagnose from the RED dashboard state ONLY — no bug file pointer
given by QA. Dev reads the trace JSON, identifies the mismatch, fixes the source, reruns sandbox,
confirms GREEN. Evidence: git log showing ≤ 2 fix commits; final dashboard card GREEN.

### G11 — Regression Alarm (2-Trial Coupling Proof)

**Rubric:** 2 trials, each with a different primitive mutation. Each trial must show ≥ 1 COUPLED
scenario flips RED (proving that a primitive mutation propagates to another scenario that covers it).
Each trial ends with a single-edit fix restoring all GREEN. Outcome-(a) × 2 = PASS.

**Trial-1:** May reuse G10 evidence (P2-B/C below). If the G10 injection caused a second scenario
(sector-classifier or sparkline) to also flip RED, Trial-1 is proven. QA verifies by running
`bun run src/sandbox/runner.ts` on ALL scenarios during the G10 injection window.

**Trial-2:** QA designs a dedicated mutation in `sector-classifier` (`domain/services/sectorPeers.ts`):
mutate 1 ticker→sector mapping (e.g., change `"FPT"` sector from `"technology"` to `"utilities"`).
The sector-classifier golden scenario and any sparkline/signal-bus scenario that uses FPT as input
should flip RED. Dev fixes with 1-line revert.

**Pre-revert for Trial-2:** `rag-pre-inject` pattern does not apply here. QA uses `git stash`
or a separate `mcp-server-pre-inject-2` tag if Trial-2 is a separate inject commit.

---

## Task Ledger (WIP=1 sequential)

| ID | Title | Owner | Goals | Blocked by | Blocks | Est | Pre-revert tag |
|----|-------|-------|-------|-----------|--------|-----|----------------|
| **P2-A** | Create `mcp-server-pre-ci` tag (G4 fence anchor) | dev-mcp-server | G4-setup | — | P2-B | 5m | — |
| **P2-B** | `eslint.config.mjs` Fence-A/B/C adapted to mcp-server layers + `eslint`+`eslint-plugin-boundaries` devDep + `lint:ci` script | dev-mcp-server | G4-partial | P2-A | P2-C | 1h | mcp-server-pre-ci |
| **P2-C** | G4 deliberate-violation proof (AC-4b) — Fence-A breach → exit non-zero + fence name in output → revert → exit 0. NEVER committed | dev-mcp-server + qa | G4-full | P2-B | P2-D | 30m | — |
| **P2-D** | G4 freeze anchor confirm (AC-4c) — `git log eslint.config.mjs` most-recent = P2-B SHA; QA compiles G4 evidence | qa | G4-finalized | P2-C | P2-E | 15m | — |
| **P2-E** | G3 composition-root extraction — src/index.ts split into index.ts (≤80L) + composition-root.ts (≤120L) | dev-mcp-server | G3 | P2-D | P2-F | 1.5h | — |
| **P2-F** | G5a domain-file deletion — git mv kinhDichWrapper.ts → _deprecated/, remove re-export from index, update 2 test files | dev-mcp-server | G5a | P2-E | P2-G | 1h | mcp-server-pre-delete |
| **P2-G** | G9 dashboard live panels — module panel filled (sub-barrel JSON data), microservice panel live-fetch /health with offline fallback | dev-mcp-server | G9-partial | P2-F | P2-H | 1h | — |
| **P2-H** | G9 Playwright trust contract — CORRECTED (P2-H-FIX): inline data blocks in index.html (no fetch/no addInitScript); updated spec; delete sparkline-regression-tripwire.json; assertion-5 pure unit. Verdict JSON re-committed | dev-mcp-server | G9 | P2-G | P2-I | 1h | — |
| **P2-I** | G9 USER verbal sign-off (USER-gated) — PO verifies file:// opens real panels (P2-H-FIX AC-3), then presents dashboard to user, user confirms. Recorded in pilot-status G9 evidence | po (present) + USER | G9-terminal | P2-H | P2-J | — | — |
| **P2-J** | Create `mcp-server-pre-inject` tag + G10 bug injection (single-literal in signal-bus-helper). Dashboard card RED before dev dispatch. | qa | G10-setup | P2-I | P2-K | 20m | mcp-server-pre-inject |
| **P2-K** | G10 AI-fixability — dev-mcp-server fixes signal-bus-helper bug in ≤2 cycles from RED dashboard signal ONLY. Dashboard GREEN | dev-mcp-server + qa | G10 | P2-J | P2-L | 1h | — |
| **P2-L** | G11 regression alarm — 2-trial coupling proof. Trial-1 = G10 alias (or dedicated). Trial-2 = sector-classifier ticker mutation. Outcome-(a)×2 | qa + dev-mcp-server | G11 | P2-K | P2-Z | 1.5h | — |
| **P2-Z** | Phase-2 close-gate (QA) — confirm G3+G4+G5a+G9+G10+G11; re-confirm 7 EARNED-PENDING + G12 streak; emit close-gate signal. NO goal flips | qa | close-gate | P2-L | PO terminal | 30m | — |

**Total tasks:** 13 (A through L + Z)
**Total estimated dev+qa effort:** ~9h (dev: A+B+C+E+F+G+H+K ≈ 7h; qa: C+D+H+J+K+L+Z ≈ 3h)
**Note:** P2-I (USER verbal) has no time estimate — it is the only step the user owns.

---

## Sequencing

```
P2-A (mcp-server-pre-ci tag)
  ↓
P2-B (eslint.config.mjs Fence-A/B/C + devDeps)
  ↓
P2-C (G4 deliberate-violation proof — reverted, never committed)
  ↓
P2-D (G4 freeze anchor AC-4c)
  ↓
P2-E (G3 composition-root extraction — index.ts ≤80L + composition-root.ts)
  ↓
P2-F (G5a — git mv kinhDichWrapper to _deprecated/, re-export cleanup, test update)
  ↓
P2-G (G9 dashboard live panels)
  ↓
P2-H (G9 Playwright trust contract — P2-H-FIX: inline data blocks, no addInitScript,
       delete sparkline-regression-tripwire.json, assertion-5 pure unit, re-run verdict JSON)
  ↓
P2-I (G9 USER verbal sign-off ← ONLY USER-GATED STEP; PO verifies file:// real panels
       then presents to user, user confirms)
  ↓
P2-J (mcp-server-pre-inject tag + G10 bug injection committed by QA)
  ↓
P2-K (G10 AI-fix in ≤2 cycles from RED dashboard signal)
  ↓
P2-L (G11 2-trial regression alarm coupling proof)
  ↓
P2-Z (Phase-2 close-gate — QA signal; NO goal flips)
  ↓
[PO: terminal atomic flip — 12/12 YES + decisionMatrix + DONE + rollout 11/11]
```

**Critical path:** P2-A → B → C → D → E → F → G → H → I → J → K → L → Z
All tasks strictly sequential (WIP=1). P2-I is the only USER-gated step.

**G9 USER path rule (binding):** NEVER ask the user to run a command, restart anything,
or open a terminal. PO shows the dashboard (opens it in a browser and shares screen / screenshot).
User responds YES or NO verbally. PO records the response. This is the only user interaction.

---

## Pre-Revert Tags (created IN the gating task BEFORE mutation — no retag/--force/push)

| Tag | Created in | Protects |
|-----|-----------|---------|
| `mcp-server-pre-ci` | P2-A Step 0 | rollback before ESLint fence installation |
| `mcp-server-pre-delete` | P2-F Step 0 | rollback before kinhDichWrapper git mv |
| `mcp-server-pre-inject` | P2-J Step 0 | rollback before G10 bug-injection commit |

Tags `mcp-server-pre-barrel-wave1/2/3` and `mcp-server-pre-g5-remediation` from Phase 1 remain
intact as historical anchors. No retag/delete/push.

---

## Per-Task Acceptance Criteria

---

### P2-A — Create `mcp-server-pre-ci` Tag

**Owner:** dev-mcp-server
**Blocks:** P2-B
**Estimated:** 5 minutes

**AC-1:** `git tag -a mcp-server-pre-ci -m "mcp-server-pre-ci: anchor before G4 ESLint fence work"` runs without error. Tag SHA recorded in handoff.

**AC-2:** `git tag -l "mcp-server-pre-ci"` returns the tag. Tag is local-only (no push).

**AC-3:** `git log --oneline -3` confirms HEAD is the correct Phase-1 close-gate state (commit 3ea944b6 or later ops commit in the mcp-server zone).

---

### P2-B — eslint.config.mjs Fence-A/B/C + devDeps

**Owner:** dev-mcp-server
**Blocks:** P2-C
**Blocked by:** P2-A
**Estimated:** 1h
**Files to create/modify:**
- `apps/mcp-server/eslint.config.mjs` (CREATE)
- `apps/mcp-server/package.json` (MODIFY — add eslint + eslint-plugin-boundaries devDeps + lint:ci script)

**Context:** SI-3 §3.1 devDeps: `"eslint": "^10.4.0"`, `"eslint-plugin-boundaries": "^6.0.2"`.
mcp-server layer structure (brownfield): `src/domain/**`, `src/application/**`,
`src/infrastructure/**`, `src/interface/**`, `src/scheduler/**`, `src/sandbox/**`.
The fence must cover the existing structure (not an ideal future layout).

**Fence element mapping for mcp-server:**
```javascript
"boundaries/elements": [
  { type: "domain",          pattern: "src/domain/**/*" },
  { type: "application",    pattern: "src/application/**/*" },
  { type: "infrastructure",  pattern: "src/infrastructure/**/*" },
  { type: "interface",       pattern: "src/interface/**/*" },
  { type: "scheduler",       pattern: "src/scheduler/**/*" },
  { type: "sandbox",         pattern: "src/sandbox/**/*" },
  { type: "composition-root", pattern: "src/index.ts" },
]
```

**Fence rules (Fence-A/B/C adapted to mcp-server):**
- **Fence-A:** `domain` must not import `infrastructure`, `interface`, `scheduler`.
  Message: `"Fence-A: domain must not import ${dependency.type} layer"`.
- **Fence-B:** `application` must not import `interface`, `scheduler`.
  Message: `"Fence-B: application must not import ${dependency.type} layer"`.
- **Fence-C:** `infrastructure` may only be imported by `composition-root` and `application`.
  From `domain`, `interface`, `scheduler`, `sandbox` → disallow `infrastructure`.
  Message: `"Fence-C: infrastructure wiring only allowed from composition-root or application layer"`.

**Ignore patterns (mandatory):** `**/__tests__/**`, `**/sandbox/**`, `**/node_modules/**`.

**AC-1:** `apps/mcp-server/eslint.config.mjs` created with Fence-A/B/C rules as specified above.

**AC-2:** `apps/mcp-server/package.json` devDependencies includes `eslint` and `eslint-plugin-boundaries`. `scripts.lint:ci` added as `"eslint src/ --max-warnings 0"`.

**AC-3 (initial clean run):** `cd apps/mcp-server && bunx eslint src/ --max-warnings 0` exits 0 with 0 errors/warnings on the existing (unmodified) codebase. If existing violations appear, document them as `// FENCE-LEGACY: pre-existing before G4 fence — reviewed <reason>` and re-run until 0. Evidence pasted.

**AC-4 (regression tripwires):** `bun run check` exits 0. `bun test` pass ≥9408, fail ≤348. Tool count ≥146. Scheduler 68.

**AC-5:** `git diff --cached --name-only` shows ONLY `eslint.config.mjs` + `package.json`. No source files.

---

### P2-C — G4 Deliberate-Violation Proof (AC-4b)

**Owner:** dev-mcp-server + qa (qa verifies independently)
**Blocks:** P2-D
**Blocked by:** P2-B
**Estimated:** 30 minutes
**NEVER committed — violation is reverted before any git add**

**Procedure:**
1. Add ONE deliberate Fence-A violation in a domain file (e.g., add
   `import { getDb } from '../infrastructure/db/schema.js'; // DELIBERATE-VIOLATION-TEST`
   to `apps/mcp-server/src/domain/services/sparkline.ts`).
2. Run: `cd apps/mcp-server && bunx eslint src/ --max-warnings 0`.
3. Verify: exits non-zero AND output contains "Fence-A" string.
4. Revert the violation (restore the domain file to its original state).
5. Run: `cd apps/mcp-server && bunx eslint src/ --max-warnings 0`.
6. Verify: exits 0.
7. Record before/after output in handoff.

**AC-1 (non-zero exit with violation):** `bunx eslint src/ --max-warnings 0` exits non-zero
when the deliberate Fence-A import is present. Exit code and output pasted in handoff.

**AC-2 (fence name in output):** ESLint error output contains the string `"Fence-A"` (or the
rule message text from P2-B Fence-A message field). Paste output excerpt showing the error line.

**AC-3 (zero exit after revert):** After reverting the violation, `bunx eslint src/ --max-warnings 0`
exits 0. Paste output confirming 0 problems.

**AC-4 (file not staged):** `git status --short` shows 0 modified files after the test cycle.
The deliberate violation was never committed.

---

### P2-D — G4 Freeze Anchor Confirm (AC-4c)

**Owner:** qa
**Blocks:** P2-E
**Blocked by:** P2-C
**Estimated:** 15 minutes
**Files touched:** none (read-only verification + QA evidence signal)

**AC-1 (freeze anchor confirmed):** `git log --oneline -- apps/mcp-server/eslint.config.mjs | head -1`
returns the P2-B commit SHA. No subsequent commit has modified the fence config.

**AC-2 (G4 evidence compiled):** QA emits a signal doc (`docs/signals/qa-mcp-server-g4-p2d-<ISO>Z.json`)
containing: eslint.config.mjs P2-B commit SHA, Fence-A violation proof (AC-4b non-zero exit excerpt),
post-revert clean exit, freeze anchor confirmation. This is the G4 locked evidence package.

**AC-3 (regression tripwires):** `bun run check` exits 0. `bun test` pass ≥9408, fail ≤348.

---

### P2-E — G3 Composition-Root Extraction

**Owner:** dev-mcp-server
**Blocks:** P2-F
**Blocked by:** P2-D
**Estimated:** 1.5h
**Files to create/modify:**
- `apps/mcp-server/src/index.ts` (MODIFY — slim to ≤80L thin entry point)
- `apps/mcp-server/src/composition-root.ts` (CREATE — bootstrap orchestration, ≤120L)

**Split design (derived from brownfield §G3):**

`src/index.ts` after extraction (target ≤80L):
- Lines 1-22: comment block
- Lines 24-27: LanceDB/Rust env suppression (STAYS — must precede any LanceDB import)
- Lines 29-36: import declarations for config, logger, and `bootstrapMcpServer`
- Line 38: `const cfg = loadConfig(); const log = createLogger(cfg.logLevel);`
- Line 40: `log.info("[bootstrap] Starting VN Market Intelligence MCP...");`
- Line 42: `await bootstrapMcpServer(cfg, log);`

`src/composition-root.ts` (target ≤120L):
- Exports `bootstrapMcpServer(cfg: Config, log: Logger): Promise<void>`
- Contains all startup sections: env-check, DB init, trade profile seed, server start,
  Telegram env check, webhook, pdf-extractor health, scheduler, background OCR setTimeout,
  graceful shutdown handlers, signal handlers, unhandledRejection handler.
- Zero domain logic. Only: import + call + log (composition + orchestration).
- The `Config` and `Logger` types are imported from `./infrastructure/config.js` and
  `./infrastructure/logger.js` — this is correct for a composition root.

**AC-1 (files exist):** `apps/mcp-server/src/composition-root.ts` exists.
`grep -c "^" apps/mcp-server/src/index.ts` ≤ 80.
`grep -c "^" apps/mcp-server/src/composition-root.ts` ≤ 120.

**AC-2 (composition root has zero domain ops):**
`grep -E "calculate|compute|classify|resolve|encode|format|detect" apps/mcp-server/src/composition-root.ts`
returns 0 (no domain operation names in the composition root).

**AC-3 (G3 verification — QA reads the file):** QA reads `composition-root.ts` and confirms it
contains ONLY: imports, wiring/DI calls, log statements, and signal handler registrations.
No `if` conditions on data values. No domain calculations. No bare SQL queries.

**AC-4:** `bun run src/index.ts &` starts without error. `curl -s http://localhost:3000/health`
returns `{"ok":true}` (or equivalent). Server kills cleanly on SIGTERM.

**AC-5:** `bun run check` exits 0. `bun test` pass ≥9408, fail ≤348. Tool count ≥146. Scheduler 68.

**AC-6:** `git diff --cached --name-only` shows ONLY `src/index.ts` + `src/composition-root.ts`.

---

### P2-F — G5a Domain-File Deletion (kinhDichWrapper → _deprecated/)

**Owner:** dev-mcp-server
**Blocks:** P2-G
**Blocked by:** P2-E
**Estimated:** 1h
**Pre-revert tag:** `mcp-server-pre-delete` (created BEFORE any file move)

**Context (brownfield §G5a):** Only `kinhDichWrapper.ts` is targeted. All other kinhDich domain files
remain in place (they are legitimately KEEP: in-process computation path for intelligenceCycleJob).

**Steps:**
1. Create `mcp-server-pre-delete` tag.
2. `git mv apps/mcp-server/src/domain/services/kinhDich/kinhDichWrapper.ts apps/mcp-server/src/infrastructure/_deprecated/kinhDichWrapper.ts`
   (infrastructure/_deprecated/ matches existing _deprecated directory pattern seen in P1-G).
3. Add `// DEPRECATED: 1954c G5a — direct callers moved to HTTP clients (P1-F). No live callers. Moved from domain/services/kinhDich/.` to the top of the moved file.
4. Remove line 139 from `apps/mcp-server/src/domain/services/index.ts`:
   `export * from "./kinhDich/kinhDichWrapper.js";`
5. Update `apps/mcp-server/src/__tests__/1077-kinh-dich-wrapper.test.ts`:
   Change import from `"../domain/services/kinhDich/kinhDichWrapper.js"` to
   `"../infrastructure/_deprecated/kinhDichWrapper.js"`. Add comment:
   `// DEPRECATED-TEST: testing the deprecated wrapper — import path updated post-G5a move`.
6. Update `apps/mcp-server/src/__tests__/1081-sprint-054-smoke.test.ts`:
   Same import path update.
7. Run all regression tripwires.

**AC-1:** `mcp-server-pre-delete` tag created before any file move.

**AC-2:** `apps/mcp-server/src/infrastructure/_deprecated/kinhDichWrapper.ts` exists with
DEPRECATED comment at top.

**AC-3:** `apps/mcp-server/src/domain/services/kinhDich/kinhDichWrapper.ts` NO LONGER EXISTS.
`find apps/mcp-server/src/domain -name "kinhDichWrapper.ts"` returns empty.

**AC-4 (no live callers in interface or scheduler):**
`grep -r "from.*kinhDichWrapper" apps/mcp-server/src/interface/ apps/mcp-server/src/scheduler/ --include="*.ts"` returns 0 results. Paste output.

**AC-5 (domain purity maintained):**
`grep -r "from.*infrastructure" apps/mcp-server/src/domain/ --include="*.ts"` returns 0.
Moving kinhDichWrapper to infrastructure/_deprecated/ must NOT create any new domain→infra import.
The domain/services/index.ts re-export line was removed (Step 4 above), so no domain file imports from infra.

**AC-6:** `bun run check` exits 0. `bun test` pass ≥9408, fail ≤348. Tool count ≥146. Scheduler 68.
Note: test pass count may temporarily drop slightly if the 2 test files fail to compile during the edit;
both must be updated before running tests. Final bun test output must show ≥9408.

**AC-7:** `git diff --cached --name-only` shows ONLY the 4 modified/moved files:
`_deprecated/kinhDichWrapper.ts`, `domain/services/index.ts`, `1077-*.test.ts`, `1081-*.test.ts`.
No scheduler files. No tool handler files.

---

### P2-G — G9 Dashboard Live Panels

**Owner:** dev-mcp-server
**Blocks:** P2-H
**Blocked by:** P2-F
**Estimated:** 1h
**Files to create/modify:**
- `apps/mcp-server/dashboard/data/modules.json` (CREATE — sub-barrel module data)
- `apps/mcp-server/dashboard/index.html` (MODIFY — replace placeholders with live content)

**Module panel data file** (`dashboard/data/modules.json`):
```json
{
  "generated": "2026-05-25",
  "source": "P1-C/D/E barrel decomposition",
  "modules": [
    { "barrel": "system", "subBarrels": ["memory","coordination","ops-debug","observability","vps"], "fileCount": 21 },
    { "barrel": "macro", "subBarrels": ["http-proxy","local-computation"], "fileCount": 14 },
    { "barrel": "sector", "subBarrels": ["domestic","market","cross-cutting"], "fileCount": 15 },
    { "barrel": "market-data", "subBarrels": [], "fileCount": 9 },
    { "barrel": "news-analysis", "subBarrels": [], "fileCount": 9 },
    { "barrel": "alerts", "subBarrels": [], "fileCount": 9 },
    { "barrel": "financial-reports", "subBarrels": [], "fileCount": 8 },
    { "barrel": "portfolio", "subBarrels": [], "fileCount": 7 },
    { "barrel": "briefings", "subBarrels": [], "fileCount": 5 },
    { "barrel": "backtesting", "subBarrels": [], "fileCount": 2 },
    { "barrel": "analysis", "subBarrels": [], "fileCount": 1 },
    { "barrel": "kinhdich", "subBarrels": [], "fileCount": 1 }
  ]
}
```

**Module panel rendering:** Replace "Phase 2 — not yet extracted" placeholder with a
`fetch('data/modules.json')` call. Render each module as a row: barrel name + sub-barrel chips.
Use `.mcp-*` CSS namespace (no new class prefixes; extend existing styles).

**Microservice panel:** Replace static `~146` text with a `fetch('http://localhost:3000/health')`
call. On success: show live toolCount. On failure (offline): show
"146 tools (server offline — last known)" with a yellow indicator. Use `try/catch + fallback`.

**AC-1:** Module panel shows the 12 barrel modules with sub-barrel names for system/macro/sector.
No "Phase 2 — not yet extracted" text visible. No JavaScript console errors.

**AC-2:** Microservice panel shows a live tool count when server is running OR a graceful
offline fallback message when server is not running. No broken layout or JS exceptions either way.

**AC-3:** `dashboard/data/modules.json` exists and is valid JSON.
`bun run check` exits 0 (json is not checked by tsc but verify no TS errors introduced in html edits).

**AC-4:** `git diff --cached --name-only` shows ONLY `dashboard/data/modules.json` + `dashboard/index.html`.

---

### P2-H — G9 Playwright Trust Contract Artifact

> **CORRECTED 2026-05-25 (P2-MCP-G9-CONTRACT-FIX).**
> The original P2-H shipped 7/7 Playwright assertions via `addInitScript` injection
> (window.__MCP_TRACES__ / window.__MCP_MODULES__). That approach is a **Potemkin gate**:
> test-path ≠ user-path. When the user opens index.html via file:// double-click,
> those globals do not exist, Chromium blocks file:// fetch(), and two of three panels
> render empty. This P2-H-FIX corrective re-implementation seals the gap.
> See "## Correction Log" section at end of this plan for the full diagnosis.

**Owner:** dev-mcp-server (P2-H-FIX corrective re-implementation)
**Blocks:** P2-I
**Blocked by:** P2-G
**Estimated:** 1h (re-implementation)
**Files to modify/delete/recreate (P2-H-FIX):**
- `apps/mcp-server/dashboard/index.html` (MODIFY — inline trace + module data; remove fetch + window.__ globals)
- `apps/mcp-server/dashboard/tests/trust-contract.spec.js` (MODIFY — remove addInitScript injection; test real DOM)
- `apps/mcp-server/dashboard/playwright-verdict.json` (REGENERATE — re-run after fix; committed from output)
- `apps/mcp-server/dashboard/traces/sparkline-regression-tripwire.json` (DELETE — synthetic fixture forbidden in P2-I context, see assertion-5 below)

**CANONICAL G9 PRESENTATION CONTRACT (binding for P2-H-FIX):**

The dashboard MUST render real populated panels for both the Playwright headless run AND
the user's raw file:// double-click — using the SAME path, with zero server and zero
window-global injection.

**Chosen approach: inline data blocks in index.html.**

Dev-mcp-server MUST inline trace and module data as `<script type="application/json">` blocks
inside `index.html`. The dashboard JS reads from the DOM (`document.getElementById(...).textContent`)
instead of `fetch()` or `window.__MCP_*` globals. This achieves:
- Zero fetch calls (no `file://` restriction to hit).
- Zero `window.__MCP_*` globals (no `addInitScript` crutch needed).
- test-path == user-path (true G9 fidelity: Playwright opens the same HTML the user double-clicks).
- Honoring line 4's promise: "Opens via file:// URL — zero network dependency."

**Implementation spec:**

1. In `index.html`, just before `</body>`, add two `<script type="application/json">` blocks:
   ```html
   <script type="application/json" id="mcp-traces-data">
   { "traces": { ... } }
   </script>
   <script type="application/json" id="mcp-modules-data">
   { "generated": "...", "modules": [ ... ] }
   </script>
   ```
   The `traces` object is keyed by scenario name (same shape as the old `window.__MCP_TRACES__`).
   The `modules` object is the same shape as `dashboard/data/modules.json`.

2. In the dashboard JS, replace both data-loading paths:
   - `fetchTrace(name)`: remove the `window.__MCP_TRACES__` branch AND the `fetch('traces/*.json')` branch.
     Instead, read from `document.getElementById('mcp-traces-data')`:
     ```js
     function getInlineTraces() {
       const el = document.getElementById('mcp-traces-data');
       if (!el) return {};
       try { return JSON.parse(el.textContent).traces ?? {}; } catch { return {}; }
     }
     ```
     `loadTraces()` calls `getInlineTraces()` once; no async fetch loop.
   - `loadModules()`: remove the `window.__MCP_MODULES__` branch AND the `fetch('data/modules.json')` branch.
     Instead, read from `document.getElementById('mcp-modules-data')`:
     ```js
     function getInlineModules() {
       const el = document.getElementById('mcp-modules-data');
       if (!el) return null;
       try { return JSON.parse(el.textContent); } catch { return null; }
     }
     ```

3. Remove `dashboard/traces/sparkline-regression-tripwire.json` from disk (it must not appear
   in the inlined traces, see assertion-5 ruling below).

4. The inline trace data MUST contain the 9 real scenario traces (sparkline x3, signal-bus x3,
   sector-classifier x3). All 9 have `status: "pass"`. This is correct and honest for a
   pre-G10 "all working correctly" sign-off.

5. Remove the `KNOWN_TRACES` array from index.html (no longer needed; inline block replaces it).

6. Keep the microservice panel's `window.location.protocol === 'file:'` guard intact — it still
   correctly skips the HTTP probe and shows the offline fallback. Assertion-7 (zero HTTP) stays
   trivially satisfied because there are no fetch() calls at all in the new design.

**Sync strategy (inline data staying current with src/sandbox):**
The inline trace block is regenerated by running the sandbox runner with `--emit-traces` and
copying the output to the `<script>` block. This is a MANUAL regen step whenever new scenarios
are added. Dev-mcp-server MUST add a comment above the `<script id="mcp-traces-data">` block:
`<!-- AUTO-GENERATED: run 'bun run src/sandbox/runner.ts --emit-traces' to refresh -->`
This is sufficient for the scale pilot. A build-step auto-regen is out of scope here; the
manual comment establishes the obligation.

**Assertion-5 ruling — RED-card story (corrected):**

The original assertion 5 ("≥1 RED status indicator from existing failure scenarios") was
falsified by the ground truth: ALL 9 real scenarios have `status: "pass"` (including the
named "failure" scenarios — they correctly handle bad input, so they pass). The P2-H agent
added `sparkline-regression-tripwire.json` (a synthetic always-fail fixture) solely to
satisfy the assertion. That fixture poisons P2-I: the user would see a permanent red card
matching no real failure and be asked "do you confirm all tools are working correctly?"

**Resolution chosen: OPTION (i) — pure unit assertion in trust-contract.spec.js.**

Assertion 5 is re-specified as:
> "renderCard() produces a `.mcp-dot-fail` element when given a trace with `status: 'fail'`."

This is a pure DOM-unit test: construct a synthetic trace object IN-MEMORY inside the spec,
call `renderCard()` directly, assert the returned HTML string contains `mcp-dot-fail`. No
on-disk fixture required. Proves the RED render path works without polluting the live dashboard.

The `sparkline-regression-tripwire.json` fixture MUST be deleted from `dashboard/traces/`
and MUST NOT appear in the inlined trace block.

The real RED→GREEN visual proof belongs at G10/P2-J-K, where a genuine bug injection
produces a genuine red card, and the dev fix turns it green. That is the honest
demonstration of the RED render path under real-world conditions.

**Updated assertions (7 total, assertion-5 re-specified):**
1. Three panels present (`#mcp-panel-primitives`, module panel, microservice panel).
2. Module panel contains no "Phase 2" placeholder text.
3. Primitives panel contains ≥9 scenario cards (9 real scenarios, all GREEN).
4. At least 1 card with GREEN (`mcp-dot-pass`) status indicator (all 9 are GREEN = trivially satisfied).
5. `renderCard({status:"fail",...})` returns HTML containing `.mcp-dot-fail` (pure unit call in spec, no fixture).
6. Zero console errors during load + 2-second settle period.
7. Zero network requests (no fetch() calls at all in the new inline-data design — trivially satisfied).

**`addInitScript` removal:** The corrected spec MUST NOT use `page.addInitScript()` to inject
window globals. Data comes from the inline `<script>` blocks already present in index.html.
The spec opens `DASHBOARD_FILE` (same file:// URL), waits for panels to render, asserts on
real DOM state. `playwright.config.js` stays unchanged (`headless: true`, no server spawn,
`bunfig.toml root="./src"` keeps Playwright specs excluded from `bun test`).

**Playwright run command (unchanged):**
```bash
npx playwright test apps/mcp-server/dashboard/tests/trust-contract.spec.js --reporter=json
```

**AC-1 (inline data blocks present):** `grep -c "mcp-traces-data" apps/mcp-server/dashboard/index.html` ≥ 1.
`grep -c "mcp-modules-data" apps/mcp-server/dashboard/index.html` ≥ 1.
No `window.__MCP_TRACES__` or `window.__MCP_MODULES__` references remain in index.html.
No `fetch(` calls remain in index.html (for the traces/modules paths).

**AC-2 (tripwire deleted):**
`ls apps/mcp-server/dashboard/traces/sparkline-regression-tripwire.json` returns "No such file".
9 real traces remain (sparkline x3 + signal-bus x3 + sector-classifier x3).

**AC-3 (real data renders without injection):**
Open `apps/mcp-server/dashboard/index.html` in a browser (or `python3 -m http.server` for Firefox).
All 9 scenario cards render GREEN. Module panel shows 12 barrels. No "No traces found" message.
Screenshot pasted in handoff. This is the test-path == user-path confirmation.

**AC-4 (Playwright assertions 1-7 pass without addInitScript):**
`trust-contract.spec.js` does NOT contain `addInitScript`. `npx playwright test` exits 0.
Paste the 7/7 pass output.

**AC-5 (assertion-5 pure unit):** The spec contains a test that calls `renderCard()` with
`{status:"fail", scenario:"test", primitive:"test", durationMs:0, actual:null, error:null}`
and asserts the returned HTML string includes `mcp-dot-fail`. No on-disk `sparkline-regression-tripwire.json`
fixture is referenced.

**AC-6 (zero network — trivially stronger):** Playwright network listener captures 0 HTTP requests.
With no fetch() calls in index.html, this is structurally guaranteed (not just behaviorally).
Paste listener output.

**AC-7 (zero console errors):** Playwright console listener captures 0 errors.

**AC-8 (verdict JSON regenerated):** `apps/mcp-server/dashboard/playwright-verdict.json`
re-generated from the corrected run and committed via explicit `git add`.
JSON contains: `{passingTests:7, failingTests:0, consoleErrors:0, networkRequests:0, timestamp}`.

**AC-9 (regression tripwires):** `bun test` pass ≥9408, fail ≤348. `bun run check` exits 0.
Tool count ≥146. Scheduler 68.

---

### P2-I — G9 USER Verbal Sign-Off (USER-GATED)

**Owner:** po (present) + USER (verbal response)
**Blocks:** P2-J
**Blocked by:** P2-H (corrected — P2-H-FIX must pass AC-3 before P2-I begins)
**Estimated:** N/A — user's decision, no code work

**This is the ONLY USER-gated step in Phase 2.**

**CORRECTED presentation path (2026-05-25, P2-MCP-G9-CONTRACT-FIX):**
The original P2-I instructed PO to open `index.html` via `file://` and asserted "no server needed."
This was internally contradicted: index.html line 332-333 itself notes that Firefox blocks file://
fetch, and the original dashboard used fetch() for data loading. The corrected dashboard (post-P2-H-FIX)
uses inline data blocks — no fetch() at all — so the file:// double-click promise is now genuinely
honored. The presentation path below uses file:// and is now honest.

**PO MUST verify P2-H-FIX AC-3 was met before proceeding:**
Confirm that `apps/mcp-server/dashboard/index.html` shows all 9 scenario cards GREEN and
the module panel populated when opened via file:// (double-click or `open` command).
If the panels are empty or show "No traces found", P2-H-FIX is incomplete — block P2-I and
return to dev-mcp-server.

**PO action:** Open `apps/mcp-server/dashboard/index.html` in a browser (file:// — double-click
the file, or use `open apps/mcp-server/dashboard/index.html` on macOS).
Show the user the dashboard (screenshot or screen-share). Ask:
"Can you confirm the MCP server dashboard shows all tools are working correctly?"

**What the user will see (post-P2-H-FIX):**
- Panel 1 (Primitives): 9 scenario cards, ALL GREEN. No red cards. No "No traces found" message.
- Panel 2 (Modules): 12 barrel rows with sub-barrel chips. No "Phase 2" placeholder.
- Panel 3 (Microservice): "146 tools (server offline — last known)" with OFFLINE badge.
  This is correct and honest for file:// mode — the server is not needed for the sign-off.

**The user must answer YES or indicate approval.** If the user says NO or asks for changes,
that feedback gates G9 and is captured in pilot-status.

**FORBIDDEN:** Asking the user to run any command, restart Docker, or interact with a terminal.
The dashboard operates in file:// mode — no server needed (all data is inline in the HTML).

**PO records in pilot-status G9 evidence field:**
`"User verbal sign-off: [USER name/handle] confirmed YES [ISO timestamp]. Dashboard shown: apps/mcp-server/dashboard/index.html (file:// mode, 9 GREEN cards, 12 barrel modules, microservice OFFLINE fallback). Post-P2-H-FIX inline-data build: no fetch(), no window.__MCP_* injection."`

**AC-1:** PO updates `docs/data/pilot-status-mcp-server.json` goals G9 calibration.evidence field
with the verbal sign-off record. (§4.5 binding: status field stays DEFER until PO 12/12 terminal flip).

**AC-2:** PO emits a signal `docs/signals/po-mcp-server-g9-verbal-<ISO>Z.json` with the sign-off record.

---

### P2-J — Create `mcp-server-pre-inject` Tag + G10 Bug Injection

**Owner:** qa
**Blocks:** P2-K
**Blocked by:** P2-I
**Estimated:** 20 minutes
**Pre-revert tag:** `mcp-server-pre-inject` (created HERE before injection)

**Target primitive:** `apps/mcp-server/src/domain/signals/signalBuilders.ts`
Bug type: single-literal mutation. Example: change `"signal"` output key to `"sig"`, or invert one
boolean comparison in the envelope construction. The mutation must:
- Cause the `signal-bus-golden-valid.json` scenario to fail (wrong output key ≠ expected output key).
- Be fixable with a 1-line revert.
- Produce deterministic RED (not intermittent) — static input → wrong output every run.

**QA redacts the bug location from dev-mcp-server.** Dev diagnoses from the RED trace JSON only.

**Steps:**
1. `git tag -a mcp-server-pre-inject -m "mcp-server-pre-inject: anchor before G10 bug injection"`
2. Introduce the single-literal mutation in `signalBuilders.ts`.
3. Run `bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/signal-bus-golden-valid.json`.
4. Verify exit non-zero + trace JSON shows mismatch. Dashboard card flips RED.
5. Commit the injected bug:
   `git commit -m "test(mcp-server): G10 deliberate primitive bug injection [QA ONLY — redacted from dev]"`
6. Explicit-file stage ONLY: `git add apps/mcp-server/src/domain/signals/signalBuilders.ts`

**AC-1:** `mcp-server-pre-inject` tag created before any source change.

**AC-2 (bug injected + card RED):** `bun run src/sandbox/runner.ts --scenario=.../signal-bus-golden-valid.json`
exits non-zero. Trace JSON shows actual ≠ expected. Dashboard `signal-bus-golden-valid` card is RED.
Screenshot or trace diff pasted in handoff.

**AC-3 (injection committed on main):** Commit message contains "[QA ONLY — redacted from dev]".
The specific primitive + mutated line is NOT disclosed to dev-mcp-server before P2-K.

**AC-4 (regression tripwires — before dispatching to dev):**
`bun test` pass ≥9408, fail ≤348. `bun run check` exits 0. Tool count ≥146. Scheduler 68.
(The test count may drop by 1 if `signal-bus-golden-valid` scenario test fails — expected.)

---

### P2-K — G10 AI-Fixability (dev-mcp-server fixes bug in ≤2 cycles)

**Owner:** dev-mcp-server (fix) + qa (cycle counting + gate)
**Blocks:** P2-L
**Blocked by:** P2-J
**Estimated:** 1h

**Dispatch signal to dev-mcp-server:** "G10 scenario RED. Dashboard `signal-bus-golden-valid` card
is RED. Diagnose from dashboard trace JSON only. Fix the primitive. Return GREEN ≤2 cycles."
No file pointer. No hint about which line was changed.

**Cycle rule:** 1 cycle = 1 fix commit that dev-mcp-server submits. Cycle ends when all sandbox
scenarios are GREEN. ≤2 cycles = G10 PASS. If dev reaches 3 commits without GREEN, QA calls FAIL.

**AC-1 (dev diagnoses from dashboard):** dev-mcp-server reads the trace JSON from `dashboard/traces/`
(not from git diff or test output). Confirms the mismatch field before editing source.

**AC-2 (sandbox GREEN after fix):**
`bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/signal-bus-golden-valid.json`
exits 0 after dev's fix commit. Dashboard card shows GREEN. Screenshot pasted.

**AC-3 (cycle count ≤2):** `git log --oneline` since P2-J commit shows ≤2 fix commits from
dev-mcp-server before GREEN. If 2 cycles, note in handoff. If >2 cycles, G10 FAIL.

**AC-4 (regression tripwires):** `bun test` pass ≥9408, fail ≤348. `bun run check` exits 0.
Tool count ≥146. Scheduler 68. All 9 sandbox scenarios GREEN after fix.

**AC-5 (revert-tag intact):** `git tag -l "mcp-server-pre-inject"` returns the tag SHA. Anchor intact.

---

### P2-L — G11 Regression Alarm: 2-Trial Coupling Proof

**Owner:** qa (scenario design + injection) + dev-mcp-server (fix)
**Blocks:** P2-Z
**Blocked by:** P2-K
**Estimated:** 1.5h

**Rubric (from pilot-status G11 calibration):** 2 trials, each = different primitive mutation +
≥1 COUPLED scenario RED + single-edit fix restores GREEN. Outcome-(a) × 2 = PASS.

**Trial-1 (G10 alias, may be already proven):**
QA checks: did the P2-J/P2-K G10 injection cause ANY other scenario (not just `signal-bus-golden-valid`)
to also flip RED? Run `bun run src/sandbox/runner.ts` on ALL 9 scenarios during the G10 injection window
(or re-inject from `mcp-server-pre-inject` tag). If ≥1 coupled scenario went RED, Trial-1 is proven.
If no coupling occurred during G10, QA designs a dedicated Trial-1 mutation.

**Trial-2 (sector-classifier mutation):**
Mutate 1 entry in `apps/mcp-server/src/domain/services/sectorPeers.ts`:
change 1 ticker's sector (e.g., `"FPT"` → `"utilities"` instead of `"technology"`).
This must cause the `sector-classifier-golden-known-ticker.json` scenario to fail (wrong sector returned).
Ideally also causes `signal-bus-golden-valid.json` to fail IF it uses the sector classification
(if not, the Trial-2 coupled scenario is just the sector-classifier scenario itself — still valid
as a 1-primitive-1-scenario coupling proof).
Commit trial-2 injection. Dev fixes with 1-line revert. Dashboard returns all GREEN.

**AC-1 (Trial-1 coupling evidence):**
Evidence that during Trial-1, ≥1 scenario (either same primitive different scenario, or different primitive)
flipped RED. Either paste sandbox output from G10 injection window, OR run a dedicated Trial-1 injection
and paste its output. Document the coupled scenario name.

**AC-2 (Trial-1 single-edit fix):**
Trial-1 was fixed with a single edit (1 file, 1 line). git log shows 1 fix commit (G10 commit satisfies).

**AC-3 (Trial-2 injection + RED):**
Sector-classifier mutation committed. `bun run src/sandbox/runner.ts` on sector-classifier golden
scenario exits non-zero. Dashboard card RED. Paste trace diff.

**AC-4 (Trial-2 coupled RED — ≥1 scenario):**
At least 1 scenario (sector-classifier golden OR another scenario that exercises sector classification)
is RED during Trial-2. Paste sandbox output showing the coupled RED.

**AC-5 (Trial-2 single-edit fix):**
dev-mcp-server reverts the sector mutation. 1 fix commit. Dashboard returns all GREEN (9/9 GREEN).

**AC-6 (Outcome-(a)×2 PASS declared by QA):**
QA declares G11 outcome-(a)×2 PASS: both trials showed (a) coupled scenario RED + single-edit
primitive fix restores GREEN. Paste QA verdict in handoff.

**AC-7 (regression tripwires):** `bun test` pass ≥9408, fail ≤348. `bun run check` exits 0.
Tool count ≥146. Scheduler 68.

---

### P2-Z — Phase-2 Close-Gate Verification

**Owner:** qa
**Blocked by:** P2-L
**Files touched:** None (read-only verification + close-gate signal emission)

**AC-1 (G3 verified):** `grep -c "^" apps/mcp-server/src/index.ts` ≤ 80.
`apps/mcp-server/src/composition-root.ts` exists. QA reads it — zero domain logic present.

**AC-2 (G4 verified):** `git log --oneline -- apps/mcp-server/eslint.config.mjs | head -1` = P2-B SHA.
`bunx eslint src/ --max-warnings 0` exits 0 on current code. G4 freeze-anchor signal from P2-D confirmed.

**AC-3 (G5a verified):** `find apps/mcp-server/src/domain -name "kinhDichWrapper.ts"` returns empty.
`apps/mcp-server/src/infrastructure/_deprecated/kinhDichWrapper.ts` exists.
`grep -r "from.*kinhDichWrapper" apps/mcp-server/src/interface/ apps/mcp-server/src/scheduler/ --include="*.ts"` returns 0.
`grep -r "from.*infrastructure" apps/mcp-server/src/domain/ --include="*.ts"` returns 0.

**AC-4 (G9 verified — post-P2-H-FIX):**
`apps/mcp-server/dashboard/playwright-verdict.json` committed (re-generated by P2-H-FIX).
`trust-contract.spec.js` does NOT contain `addInitScript`. QA re-runs spec (exits 0, 7/7 pass).
`index.html` contains `<script type="application/json" id="mcp-traces-data">` and
`<script type="application/json" id="mcp-modules-data">` blocks — no `fetch(` calls for data.
`dashboard/traces/sparkline-regression-tripwire.json` does NOT exist on disk.
File:// double-click of `index.html` shows 9 GREEN cards + 12 barrel modules (QA screenshot).
USER verbal sign-off signal `docs/signals/po-mcp-server-g9-verbal-<ISO>Z.json` exists.

**AC-5 (G10 verified):** `git log --oneline` between `mcp-server-pre-inject` and GREEN state shows
≤2 dev-mcp-server fix commits. Final dashboard shows `signal-bus-golden-valid` card GREEN.

**AC-6 (G11 verified):** Trial-1 and Trial-2 coupling evidence in P2-L handoff. Outcome-(a)×2
PASS declared by QA in AC-6 of P2-L. `mcp-server-pre-inject` tag intact.

**AC-7 (7 EARNED-PENDING re-confirmed):**
QA re-runs Phase-1 regression tripwires to confirm no Phase-2 regression:
`bun test` pass ≥9408, fail ≤348. `bun run check` exits 0. Tool count ≥146. Scheduler 68.
Dashboard `dashboard/index.html` opens file:// with 3 panels + 9/9 scenario cards (all GREEN).
G5-inverse: `grep -r "from.*domain/services/kinhDich" apps/mcp-server/src/interface/mcp/tools/` returns 0.
G12 streak: QA confirms P1-B/C/D streak handoffs still intact.

**AC-8 (close-gate signal emitted):**
`docs/signals/qa-mcp-server-p2-close-<ISO>Z.json` emitted with:
`{pilot, phase, verdict:"APPROVED", goals_verified:["G3","G4","G5a","G9","G10","G11"], earned_pending_reconfirmed:["G1","G2","G5","G6","G7","G8","G12"], commit_sha, timestamp}`.

**AC-9 (NO goal flips — binding):** QA does NOT modify `docs/data/pilot-status-mcp-server.json`.
Goal status fields stay DEFER throughout Phase 2. PO performs all flips at 12/12 terminal.

---

## Phase-3 Close (PO-only, after P2-Z)

When ALL 12 goals are terminal (7 EARNED-PENDING + 5 Phase-2 verified at P2-Z), PO performs ONE
atomic Phase-3 commit:

1. Flip all 12 `goals[].status` DEFER/EARNED-PENDING → YES (with Phase-2 evidence locked in evidence fields).
2. Populate `decisionMatrix` mechanically:
   - speed: YES if G10=YES AND G11=YES (both earned here)
   - trust: YES if G9=YES (PASS grade) AND G8=YES (earned Phase 1)
   - scale: YES if all 12 goals YES AND sprintCount ≤ 6
3. Set `verdict` (scale | rescope | stop-MVR) per mechanical derivation.
4. Set top-level `status` = DONE (if 12/12 YES + matrix terminal).
5. Set `closedAt` + `closedBy` + `closureSignal`.
6. Record commit SHA in closure block.

**Three-tier rollout reaches 11/11 ONLY after this PO terminal commit.**

---

## Hard Constraints (every task inherits)

| Constraint | Rule |
|---|---|
| WIP=1 sequential | RUN-SOLO policy (inherited Phase 1) |
| Anti-scope-creep | `apps/mcp-server/` ONLY |
| Explicit-file staging | `git add <exact-path>` per file. NEVER `-A`/`.`/`-am` |
| Commit-mutex | kind='sprint-task', key='commit-mutex:main', TTL=60s (BUG-1 workaround) |
| No destructive git | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` |
| All on main | No branch creation |
| §4.5 binding | dev-mcp-server: ZERO pilot-status-mcp-server.json edits. Goal status stays DEFER. |
| G12 DoD gate | Sandbox `bun run src/sandbox/runner.ts --scenario=<file>` exits 0 before DONE |
| Fence false-green trap | G4 ONLY passes if deliberate-violation causes non-zero exit + "Fence-A" in output |
| G9 USER step | NEVER ask user to run a command. PO presents dashboard. User responds verbally. |
| G10 dev diagnostic | dev-mcp-server diagnoses from trace JSON / RED dashboard ONLY. No bug file pointer from QA. |
| Regression tripwires | After every task: bun test ≥9408/≤348 + tsc EXIT:0 + toolCount ≥146 + scheduler 68 |
| Anchor INTACT | `mcp-server-pre-refactor @ 7d78abb1` and all Phase-1 tags remain ancestors of HEAD |

---

## Goals Roadmap — Phase 2 Contributions

| Goal | Status after Phase 2 | Verification source |
|---|---|---|
| G3 (clean composition root) | EARNED-PENDING | composition-root.ts created (P2-E): ≤120L, zero domain ops, index.ts ≤80L |
| G4 (architecture fence) | EARNED-PENDING | eslint.config.mjs Fence-A/B/C (P2-B/C/D): deliberate-violation non-zero + "Fence-A" + freeze anchor |
| G5 (full: G5a cleanup) | EARNED-PENDING | kinhDichWrapper.ts git mv to _deprecated/ (P2-F): domain/services/ clean, no live callers |
| G9 (trust contract) | EARNED-PENDING | Playwright verdict JSON (P2-H) + USER verbal sign-off (P2-I) |
| G10 (AI fixes bug ≤2 cycles) | EARNED-PENDING | signal-bus-helper inject → fix ≤2 cycles (P2-J/K): dashboard GREEN, git log ≤2 commits |
| G11 (regression alarm) | EARNED-PENDING | 2-trial coupling proof (P2-L): outcome-(a)×2 PASS |
| G1-G2-G5(P1)-G6-G7-G8-G12 | EARNED-PENDING (re-confirmed at P2-Z) | Phase-1 tripwires re-run at P2-Z AC-7 |

**goalsEarned:** stays 7. PO-only flip at 12/12 terminal (§4.5 binding).

---

## Carried-Debt Notes

| Item | Source | Status |
|---|---|---|
| `docs/data/project-stats.json` SSOT stale (cronJobCount=77, testBaselinePass=9277) | P0-MCP-2 | PO action at 12/12 terminal close |
| `docs/data/system-map.json` MCP tool count = 125 (stale, live=146) | P0-MCP-1 | PO action at 12/12 terminal close |
| kinhDich domain computation path in intelligenceCycleJob (KEEP — not G5) | P1-F brownfield | Not a debt — legitimate in-process path |
| pdf.ts / pdfOcrWorker.ts KEEP callers (4 callers, G5-DEBT commented) | P1-G | Not Phase-2 scope; tracked in G5 phase2Bucket |

---

## Correction Log

### 2026-05-25 — P2-MCP-G9-CONTRACT-FIX (architect)

**Task that triggered this correction:** P2-MCP-G9-CONTRACT-FIX (router finding, ground-truth verified)
**Sections corrected:** P2-H (full rewrite), P2-I (presentation path + PO pre-check added)
**Signal:** `docs/signals/architect-mcp-g9-contract-fix-2026-05-25T220000Z.json`

**Falsified assumption 1 — test-path ≠ user-path (P2-H):**
The shipped P2-H used Playwright `addInitScript` to inject `window.__MCP_TRACES__` and
`window.__MCP_MODULES__` globals before the page loaded. The dashboard JS checked for these
globals FIRST, bypassing all `fetch()` calls. The 7/7 assertions passed in headless Chromium.

However, when the user opens `index.html` via file:// double-click (as P2-I instructed),
no globals are injected. Chromium blocks `file://` fetch() calls ("URL scheme 'file' is not
supported" — confirmed empirically by P2-H agent). Result: primitives panel shows "No traces
found", modules panel shows "Failed to load modules.json". Two of three panels render empty
for the user. The Playwright test was a Potemkin gate: it passed a code-path the user never
exercises.

The internal contradiction in index.html itself: line 4 claims "zero network dependency" but
lines 332-333 acknowledge Firefox blocks file:// fetch and suggest running a local HTTP server.
The design was never truly zero-network; the addInitScript workaround hid this from the test.

**Falsified assumption 2 — synthetic RED fixture taints sign-off (P2-H assertion 5):**
The original assertion 5 required "≥1 RED card from existing failure scenarios." Ground truth
(jq scan of all 9 dashboard/traces/*.json): ALL 9 real scenarios have `status: "pass"` —
including the three named "failure" scenarios (they correctly handle bad input, which is a pass).
The P2-H agent added `sparkline-regression-tripwire.json` (a synthetic `status: "fail"` fixture)
solely to satisfy assertion 5. This fixture is permanently on disk, rendering a persistent red
card. In P2-I, the user would see a red card while being asked "do all tools work correctly?"
— a direct contradiction.

**Corrections applied:**
1. P2-H-FIX: inline trace + module data as `<script type="application/json">` blocks in
   index.html. No fetch(), no window.__MCP_* injection. test-path == user-path.
2. Assertion 5 re-specified as a pure in-spec DOM unit call to `renderCard({status:"fail",...})`
   — proves RED render path without an on-disk fixture.
3. `sparkline-regression-tripwire.json` must be deleted from `dashboard/traces/`.
4. P2-I updated: PO must verify file:// opens real populated panels (P2-H-FIX AC-3) before
   presenting to user.
5. P2-I "no server needed" claim is now genuinely honored (inline data = zero fetch).

**Legitimate P2-H parts retained unchanged:**
- `playwright.config.js` `headless: true`, no `webServer` block.
- `bunfig.toml` `root="./src"` excludes dashboard Playwright specs from `bun test`.
- Assertions 1 (3 panels), 2 (no "Phase 2" text), 3 (≥9 cards), 4 (≥1 GREEN), 6 (0 console errors).
- Assertion 7 (0 HTTP network) — now STRONGER (no fetch() calls at all, not just behavior-based).
- The overall 7-assertion structure is preserved; only assertion 5 is re-specified.
