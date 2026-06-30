# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · dev-mcp-server

**Sprint goal:** Close SSOT integrity perimeter — Zod schema + dual-point enforcement + auto-fix errors
**Agent:** dev-mcp-server
**Started:** 2026-06-27T10:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-27T10:30:00Z
**task-id:** SSOT-W1-ZOD-VALIDATOR-CLI
**what-done:** Built scripts/orch-validate.mjs — two-stage Zod validator CLI (Stage 0 raw-byte dup-key scan + Stage 1 OrchStateSchema.safeParse + 1b coherence warn + 1c ref-integrity hard-fail); plus scripts/test-orch-validate-ac.mjs AC-1..AC-4 fixture (29/29 pass).
**what-considered:**
- Import .ts schema directly via `bun` shebang (chosen — single SSOT, no schema duplication, bun transpiles .ts natively in .mjs)
- Duplicate the StatusEnum + lane list in a pure .mjs (rejected — defeats the whole SSOT sprint goal)
- Use a library (json-parse-safe) for dup-key detection (rejected — adds dep; custom tokenizer is 60L and correct for all JSON escape cases including `\"`)
**why-decision:** Direct .ts import via bun is the idiomatic approach used by all 40+ existing scripts/ .ts files; keeps orchStateSchema.ts as THE one schema with no second copy to drift.
**why-change:** Live orch-state exits 2 (not 0) due to 7 dangling payload_refs in signal_queue.rows (docs/signals/db-integrity-history.json moved to docs/data/; 1 broken fragment ref "entry #127"). Real finding — reported honestly per task constraint; safeParse itself passes (exit would be 0 without ref failures).

---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-27T11:45:00Z
**task-id:** SSOT-W1-SERVER-ENFORCE
**what-done:** Wired `OrchStateSchema.parse(next)` into `writeOrchStateAtomic()` in `orchStateStore.ts` — imported OrchStateSchema, inserted `safeParse(parsed)` guard after structural checks but before first fs write; throws actionable error with Zod path+message on failure.
**what-considered:**
- Call `OrchStateSchema.parse()` (throws directly) vs `safeParse()` + manual throw (chosen) — safeParse gives structured issues array to format the multi-issue error contract from the directive.
- Place parse call before or after the `JSON.stringify/JSON.parse` round-trip (after chosen) — round-trip normalises the object so Zod validates exactly what will be written to disk.
- Include `checkRefIntegrity()` here (rejected per constraint-1) — 7 live dangling payload_refs would hard-block ALL server writes; tracked separately by SSOT-W1-FIX-DANGLING-PAYLOAD-REFS.
**why-decision:** `safeParse` + reformatted multi-issue throw matches the directive's auto-fix error contract (path + message per issue, one-liner fix hint format); placement after round-trip ensures the fs guard and schema guard see the same bytes; schema-only scoping avoids the known dangling-ref blocker.
**why-change:** no change from plan — task spec was precise; implementation matches directive §Step 2 + §Dual-point enforcement Point 2.

---

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-27T11:58:00Z
**task-id:** SSOT-W1-FIX-DANGLING-PAYLOAD-REFS
**what-done:** Enumerated all non-null payload_refs in signal_queue.rows; confirmed docs/signals/db-integrity-history.json ABSENT, docs/data/db-integrity-history.json PRESENT; applied jq patch to temp file, validated [-s + jq -e .], atomic mv; orch-state-validate.sh PASS (7 gates), orch-schema-live-probe.mjs PASS; committed f29e297e (index-only, no -a).
**what-considered:**
- Repoint all 6 `docs/signals/db-integrity-history.json` refs (chosen — target file EXISTS at docs/data/)
- Null row[33] `"docs/data/db-integrity-history.json entry #127"` (chosen — fragment suffix makes it an invalid path, no valid target)
- Hand-edit the JSON (rejected — constraint-1 mandates jq-slice → temp → validate → mv atomic protocol)
**why-decision:** jq atomic write is the only compliant protocol; 7 refs split cleanly into two cases (repoint 6, null 1); both validate gates pass confirming no structural regression.
**why-change:** no change from plan — all 7 identified refs matched the task spec exactly.
### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-27T17:22:36Z
**task-id:** SSOT-W1-ZOD-SCHEMA-MODEL
**what-done:** Added QA-1 (6 missing lanes: done_verified/in_progress/qa/ready/review/closed_sprints), QA-3 (explicit unknown-key gate), QA-4 (checkRefIntegrity mock isolation); enhanced .passthrough() comments with SSOT-W1-SERVER-ENFORCE cross-link and promotion trigger criteria.
**what-considered:**
- Add tests by duplicating existing M3 pattern per lane vs parameterized loop
- Explicit QA-1/3/4 describe blocks vs comments on existing tests
**why-decision:** Explicit QA-N describe blocks satisfy acceptance-criteria naming; parameterized loop harder to parse in CI output.
**why-change:** No change from plan — audit confirmed 95% shipped; delta is test coverage for 6 missing lanes + explicit QA gate labeling + schema comment cross-refs.

---

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-27T19:00:00Z
**task-id:** SSOT-W1-ZOD-VALIDATOR-CLI
**what-done:** Audited orch-validate.mjs (tokenizer correct, all 5 issue.code mappers present); added 25 integration tests to orchStateSchema.test.ts covering Stage-0 escape-seq/nesting, exit codes 0/1/2/3, auto-fix hint contract, and invocation contract. 78→103 pass in single test file.
**what-considered:**
- Export findDuplicateJsonKeys from orch-validate.mjs for unit-test (rejected — it's a .mjs with no named exports; subprocess integration tests prove the same thing end-to-end)
- Add tests to test-orch-validate-ac.mjs vs orchStateSchema.test.ts (chosen mcp-server suite — DoD requires bun test in apps/mcp-server)
- Test invalid_enum_value (non-status) case (not possible via current schema — all z.enum() fields named "status"; documented as defensive future-compat code)
**why-decision:** Integration via spawnSync inside orchStateSchema.test.ts satisfies the "mcp-server test suite" DoD gate while testing the complete CLI pipeline. No orch-validate.mjs changes needed — audit confirmed tokenizer and all 5 mappers already correct.
**why-change:** No tokenizer bugs found — audit confirmed implementation correct. Only gap was integration test coverage in mcp-server suite.

---

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-06-30T00:00:00Z
**task-id:** SSOT-W1-HOOK-ENFORCE
**what-done:** Applied wedge-guard to prewrite hook (3 changes): env var overrides ORCH_HOOK_VALIDATOR + ORCH_HOOK_BUN_BIN for testability; validator-missing changed from block() to fail-open (warn + exit 0); spawnSync now uses BUN_BIN. Added 4 new wedge-guard tests: validator-missing×valid, validator-missing×invalid, bun-spawn-fail×invalid, valid-write-regression. All 18 tests pass; tsc clean.
**what-considered:**
- Keep hard-block on validator missing (brief's original intent) — rejected: wedge-guard binding overrides brief; prior worker's hard-block on spawn-fail caused system wedge + task kill
- Test spawn-fail by removing bun from PATH — rejected: bun needed to START the hook; env var override is the clean path
- Env var on validator path only, not bun binary — rejected: test must cover BOTH infra fail paths per wedge-guard "QA MUST verify error-path"
**why-decision:** Wedge-guard explicitly states "INFRASTRUCTURE failure → FAIL-OPEN; NEVER fail-closed-hard"; validator-missing is infrastructure (cannot determine validity). Env var overrides keep production hook unchanged while enabling deterministic test coverage of both fail-open paths.
**why-change:** Prior worker's change (block on spawn-fail) was reverted by router; this session completes the original task scope + adds the missing wedge-guard compliance that was never committed.

---

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-06-30T10:05:00Z
**task-id:** SSOT-W1-SERVER-ENFORCE
**what-done:** Closed status escape hatch (Delta-1): changed `OrchStateTaskBoardTask.status` from `"TODO"|...|string` to `Status` (z.infer<typeof StatusEnum> — 12-value SSOT); added `type Status` to orchStateSchema import. Added QA-6 test (PARKED throws pre-rename + mtime unchanged) + valid-write roundtrip guard (over-rejection gate). tsc clean, 160 targeted tests pass, 1837a + 1980-f2 already green from prior sprint work.
**what-considered:**
- Import `Status` type alias vs inline `z.infer<typeof StatusEnum>` in field declaration (chosen Status — cleaner, self-documenting, already exported)
- Add QA-6 as a new file vs append to existing orchStateStore-atomic-write.test.ts (chosen existing — stays cohesive with atomic-write contract, same describe block)
- Add over-rejection roundtrip guard as separate describe vs same block (chosen same block — atomic-write contract tests belong together)
**why-decision:** `Status` import keeps the type DERIVED from schema (no hand-sync duplication); existing atomic-write test file is the right home for write-path guards; over-rejection roundtrip with all 12 StatusEnum values proves no legitimate write is blocked.
**why-change:** No change from plan; 1837a+1980-f2 were already reconciled by S4 (SSOT-W1-ZOD-SCHEMA-MODEL); this session closes the remaining escape hatch + gates QA-6.

---

### STEP dev-mcp-server-S8 · dev-mcp-server · 2026-06-30T13:30:00Z
**task-id:** SSOT-W1-ORCH-APPLY-WRAPPER
**what-done:** Codebase audit (13 routed writers / 0 direct-Bash / 1 server-internal; audit JSON at docs/signals/orch-state-writer-audit.json); added ORCH_APPLY_LIVE_FILE_OVERRIDE + dirname-relative TMP to orch-apply.sh for testability; wrote scripts/test/orch-apply-wrapper-tests.sh (QA-1/QA-2/CAS/E3-empty/E3-NF/HAPPY — 19/19 PASS); added test+audit pointers to dev-standards.md CANONICAL entry.
**what-considered:**
- FIFO synchronization for CAS test (blocked BG at open — deadlocked on macOS stat second-precision)
- exec 3<> FIFO read-write mode (timed out — stdin EOF not signalled correctly)
- Process substitution `< <(sleep 0.5; printf ...)` with touch -t T_old (chosen — reliable: BG starts immediately, mtime gap is 6 years, CAS window reliable)
**why-decision:** Process substitution provides an immediately-open pipe (no blocking on open), giving BG time to capture mtime_before = T_old before the touch sets T_now; the 6-year mtime gap eliminates same-second collisions; 19/19 tests pass.
**why-change:** ORCH_APPLY_LIVE_FILE_OVERRIDE env var needed (1-line change to orch-apply.sh) — the handoff said "no edits needed if already wired" but the CAS integration test requires testability without touching the live file; minimal change, backward-compatible, zero production impact.
