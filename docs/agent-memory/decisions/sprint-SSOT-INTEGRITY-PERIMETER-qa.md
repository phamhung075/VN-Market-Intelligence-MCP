# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · qa

**Sprint goal:** Harden orch-state integrity perimeter — Zod schema + bash validator + mcp-server enforcement
**Agent:** qa
**Started:** 2026-06-27T15:35:00Z

---

### STEP qa-S1 · qa · 2026-06-27T15:35:00Z
**task-id:** SSOT-W1-OPS-REBUILD-ENFORCE
**what-done:** Ran live Point-2 enforcement gate against image 8aa222ab inside running container vn-market-intelligence-mcp-mcp-server-1.
**what-considered:**
- Local bun/tsc/source-read — rejected (false-green per integrity-helper-readonly-wal-blinded + fb-poster-gate-false-green memories)
- docker exec bun -e with import of compiled JS — no compiled dist exists; app runs TS directly
- docker exec bun -e importing TypeScript source directly — CORRECT path (Bun supports TS natively)
**why-decision:** Bun runs TypeScript directly (`start: bun run src/index.ts`, no build/dist dir); importing `/app/src/infrastructure/orchStateSchema.ts` in the running container is the live image code path.
**why-change:** No change from plan; docker exec TS-direct is equivalent to the `node -e compiled` recommendation once it was confirmed no build artifact exists.

---

### STEP qa-S2 · qa · 2026-06-27T19:30:00Z
**task-id:** SSOT-W1-ZOD-SCHEMA-MODEL
**what-done:** Gate-keeper QA review of commit e55208ad (already on main). Read diff, test file, production schema, handoff, arch-brief §1.3. Issued APPROVED verdict.
**what-considered:**
- Dim-1 (test quality): QA-1 6 rejection tests non-trivial (exercise Lane type per lane). QA-3 has 2 redundant tests + 1 new nested-doc corruption test. QA-4 has 3 substantive mock-resolver tests. C3-a trivially asserts Array.isArray — accepted (WARN-only per ADD-2 SHG migration policy). No tautological tests.
- Dim-2 (regression): production diff is COMMENTS-ONLY (+22 lines). passthrough() was pre-existing on TaskSchema + SprintSchema. No strict() relaxed, no enum changed.
- Dim-3 (AC): All 9 lanes covered for QA-1 (M3 covers 3, QA-1 adds 6). QA-3 unrecognized_keys proven at root + task_board levels. QA-4 FileResolver injection proven with pass/fail/sprint paths. z.infer compiles (T1). passthrough promotion documented in diff.
- Dim-4 (coherence warnings): 73 ≈ 72 per arch-brief §1.4. Pre-existing SHG-migration data drift. Not new failures. C3-a deliberately does not assert a non-zero count.
**why-decision:** All 4 gate-keeper dimensions clear. No blocking issues. DoD met.
**why-change:** No change from plan.

---

### STEP qa-S3 · qa · 2026-06-27T20:30:00Z
**task-id:** SSOT-W1-ZOD-VALIDATOR-CLI
**what-done:** RAW-verified commit 54b8f142 (+25 CLI integration tests, no production-source delta). Ran orchStateSchema.test.ts → 103/103, AC fixture 29/29, tsc 0 errors. Audited tokenizer source and all 5 issue.code mappers in orch-validate.mjs. Issued APPROVED.
**what-considered:**
- Zone: tests landed in apps/mcp-server/src/infrastructure/__tests__/ not scripts/ — reviewed whether to request move. Acceptable: orch-validate.mjs imports the .ts schema from mcp-server; mcp-server bun test IS the DoD gate; spawnSync subprocess tests exercise the CLI end-to-end from within the suite.
- Deprecated failure count: worker claimed 47 pre-existing; actual _deprecated run = 2 fail (data-dependent live-DB tests, last-touch a80f01e5 predates 54b8f142, zero overlap with this commit).
- Full suite: Bun 1.3.13 C++ crash after 13633 tests (known env issue — not a code failure); target suite 103/103 clean.
**why-decision:** tokenizer source-verified correct (readString() \" handling, per-object seen=new Set()); all 5 mappers present and exercised; all exit-code paths covered; AC 29/29 prove QA-1..QA-4; zone co-location justified by shared schema dependency and DoD gate alignment.
**why-change:** No change from plan.

---

### STEP qa-S4 · qa · 2026-06-30T00:00:00Z
**task-id:** SSOT-W1-HOOK-ENFORCE
**session:** e71c7736-a95a-4040-b741-1d48454354f6
**commit-gated:** e605aa05
**verdict:** APPROVED

**what-done:**
Re-ran `bun test scripts/agents-flow/orch-state-hook.test.mjs` independently. Read prewrite.mjs source, all 18 test assertions, and `git show e605aa05` diff. Manually invoked the hook in all 4 critical paths (PARKED block, BACKLOG pass, validator-missing fail-open, bun-spawn-fail fail-open). Reviewed the bash backstop script.

**test-run-stdout:**
```
bun test v1.3.13 (bf2e2cec)

 18 pass
 0 fail
 37 expect() calls
Ran 18 tests across 2 files. [1497.00ms]
```

**AC-1 QA-5 (PARKED write blocked):**
- Tests at lines 90-124 assert: exit code 2, stdout is `{"decision":"block","reason":"..."}`, reason contains "PARKED" + "BLOCKED", reason contains `BACKLOG|TODO|IN_PROGRESS` enum list. CONFIRMED.
- Manually verified: `echo '...PARKED...' | bun orch-state-hook-prewrite.mjs` → `{"decision":"block","reason":"[orch-state-hook] BLOCKED: schema validation failed (exit 2): ..."}` + exit 2. CONFIRMED.
- DISK-CONTENT GAP (non-blocking observation): The test does not read `orch-state.json` post-hook to assert "PARKED" is absent. This is architecturally impractical in a hook unit test — the hook never writes the proposed content to the target file; it only validates. The target file would be unchanged regardless of block/allow decision in this test context. The meaningful protection proof IS the exit-2 + block-JSON assertion, which Claude Code's hook protocol interprets as a hard block before any Write reaches disk. Disk-content check is vacuous at unit level; the criterion is met by the hook's contract.

**AC-2 WEDGE-GUARD fail-open (the critical safety fix):**
- Git diff confirms: validator-missing path changed from `block(...)` hard-block to `process.stderr.write(WARN) + process.exit(0)`. Single-line diff, unambiguous.
- `ORCH_HOOK_VALIDATOR` and `ORCH_HOOK_BUN_BIN` env overrides added to prewrite.mjs for deterministic test coverage — both default to production values when absent.
- WEDGE-GUARD tests (lines 287-360) pass env overrides via `spawnSync({ env: {...process.env, ...extraEnv} })` — these genuinely simulate infra failure (the nonexistent paths don't exist on disk; `existsSync` returns false / spawn throws ENOENT).
- Test 1 (validator-missing × valid): exit 0, empty stdout, stderr contains 'WARN'. CONFIRMED.
- Test 2 (validator-missing × PARKED): exit 0, empty stdout — invalid content still allowed through when validator absent. CONFIRMED.
- Test 3 (bun-spawn-fail × PARKED): exit 0, empty stdout. CONFIRMED. (Minor: stderr warning is not explicitly asserted in this test — acceptable, stderr is optional surfacing not a blocking criterion.)
- Test 4 (production regression gate): valid write with real validator → exit 0. CONFIRMED.
- Manually verified: `ORCH_HOOK_VALIDATOR=/nonexistent ... | bun hook` → WARN to stderr, exit 0; `ORCH_HOOK_BUN_BIN=/nonexistent/bun ... | bun hook` → spawn error to stderr, exit 0. CONFIRMED.

**AC-3 Block still works with real validator:**
- QA-5 tests run WITHOUT any env overrides — they use the production validator path (`scripts/orch-validate.mjs`, confirmed to exist). Both PARKED and FOLDED writes are blocked (exit 2). Fail-open did NOT neuter blocking. CONFIRMED.

**AC-4 Valid write + non-orch passthrough:**
- AC-2 valid BACKLOG write → exit 0, empty stdout. CONFIRMED.
- AC-4 (stdin parse error / empty stdin / null tool_name) → all exit 0. CONFIRMED.
- AC-6 (non-orch Write/Edit: TypeScript file, markdown file) → exit 0, empty stdout. CONFIRMED.
- AC-3 Bash backstop tests → always exits 0. CONFIRMED.

**what-considered:**
- Whether the env var overrides are a test-only seam that could be gamed in production: the overrides default to production values (`?? resolve(...)`) and require explicit env injection; they cannot be triggered by an agent's normal tool call. Acceptable.
- Whether the `ORCH_HOOK_BUN_BIN` spawn-fail path correctly reaches `result.error` (not `result.status !== 0`): spawnSync with a nonexistent binary populates `result.error` with ENOENT — confirmed by manual test output.
- Whether test file exercises real validator output format (BACKLOG|TODO|IN_PROGRESS in reason): confirmed by reading `orch-validate.mjs` line 59 and test line 123.
- Bash backstop: read source — always exits 0 (non-blocking per design), PostToolUse. Correctly outside the PreToolUse blocking chain.

**why-decision:** All 4 acceptance criteria verified. The wedge-guard critical safety property is correctly implemented and the tests genuinely exercise infra failure via env overrides. The one absent assertion (disk content check) is architecturally non-testable at hook unit level and the protection contract is met by the hook's exit-code/stdout protocol. 18/18 pass, 37 expect() calls, 0 regressions.
**why-change:** No change from plan.

---

### STEP qa-S5 · qa · 2026-06-30T12:14:00Z
**task-id:** SSOT-W1-SERVER-ENFORCE
**session:** e71c7736-a95a-4040-b741-1d48454354f6
**commit-gated:** 45c67766
**verdict:** APPROVED

**what-done:**
Independent disk-read verification of all three deltas in commit 45c67766. Ran all four mandated gate commands from apps/mcp-server/.

**delta-verification:**

Delta-1 (status escape hatch closed):
- `orchStateStore.ts:98`: `status: Status;` confirmed — `Status` is `z.infer<typeof StatusEnum>` imported from orchStateSchema.ts. The old hand-authored union with `| string` escape hatch is gone; tsc proof: `bun tsc --noEmit` exits 0 with no errors.
- `orchStateSchema.ts:85`: `status: StatusEnum` in TaskSchema — confirmed.
- Other `status: z.string()` lines at 146 (SprintSchema), 182 (SignalRowSchema), 199 (SignalArchiveEntrySchema), 222 (HeadSchema), 267 (DeprecatedHeadStubSchema) — all correctly left as freeform `z.string()` because they track sprint state, signal queue status, and head pipeline state, which are not constrained by the 12-value task StatusEnum.

Delta-2 (safeParse before rename):
- `orchStateStore.ts:192-208`: `OrchStateSchema.safeParse(parsed)` invoked and throws at line 199 BEFORE `renameSync(tmp, path)` at line 208. All guard checks complete before any fs write/rename. Fail-loud: throws with structured error listing all Zod issues by path. No silent-swallow.

Delta-3 (QA-6 test):
- `orchStateStore-atomic-write.test.ts:183-217`: QA-6 test present and substantive.
- mtime-before captured at line 189 via `statSync(target).mtimeMs` before the throw attempt.
- mtime-after captured at line 215 and asserted `toBe(mtimeBefore)` at line 216 — proves no rename occurred (POSIX rename changes mtime).
- Content assertion at line 213: `expect(afterContent).toBe(SENTINEL_CONTENT)` — original file unchanged.
- Throw assertion at line 200: `"[atomic-write] ORCH-STATE SCHEMA VALIDATION FAILED"` — confirms safeParse path, not the shallow section-presence guard.
- Over-rejection guard (lines 223-268): all 12 StatusEnum values exercised (BACKLOG, TODO, IN_PROGRESS, REVIEW, QA, DONE, DONE_VERIFIED, BLOCKED, DEFERRED, CANCELLED, SKIPPED, READY) across sprint.tasks[], backlog[], and ready[] lanes — confirms no false rejection of canonical data.

**gate-results:**
- `bun tsc --noEmit` → exit 0 (no errors)
- `bun test src/__tests__/orchStateStore-atomic-write.test.ts` → 8 pass / 0 fail (26 expect() calls)
- `bun test src/infrastructure/__tests__/orchStateSchema.test.ts` → 103 pass / 0 fail (672 expect() calls)
- `bun test src/__tests__/1837a-pipeline-state.test.ts src/__tests__/1980-f2-canon-schema.test.ts src/__tests__/1977-orchestration-endpoint.test.ts src/__tests__/1979-orchestration-decisions.test.ts` → 82 pass / 0 fail (308 expect() calls)

**ddd-security-scan:**
- DDD: orchStateStore.ts is in infrastructure/, imports only from ./orchStateSchema (also infrastructure/). No domain-layer inversions.
- Security: no new process.env references, no hardcoded secrets, no SQL/shell injection surface. safeParse is a pure Zod call.
- Fail-loud: throws with explicit structured error message including all Zod issue paths before any fs operation. No silent swallow.

**what-considered:**
- Whether the over-rejection guard covers all 12 StatusEnum values: confirmed — BACKLOG and READY are in flat lanes, the other 10 are in active_sprints[].tasks[]. All 12 accepted.
- Whether the existing `status: "NEW" | "READ" | "RESOLVED" | "PARTIAL" | "OPEN" | string` on `OrchStateSignalRow` (orchStateStore.ts:47) is a gap: no — signal rows are not TaskBoardTask rows and are not validated by StatusEnum; their status is tracked by SignalRowSchema which uses `z.string()`. Intentional and correct.
- Whether `OrchStateTaskBoardSprint.status: string` (line 116) needs fixing: no — sprint status (e.g. "ACTIVE", "CLOSED") is not the task StatusEnum; SprintSchema also uses `z.string().optional()`. Both correctly left freeform.

**why-decision:** All 3 deltas verified from disk. All 4 gate commands pass clean. DDD and security surfaces are clean. QA-6 mtime assertion is genuine (POSIX rename changes mtime; assertion fails if rename occurred). Over-rejection guard covers all 12 StatusEnum values end-to-end.
**why-change:** No change from plan.
