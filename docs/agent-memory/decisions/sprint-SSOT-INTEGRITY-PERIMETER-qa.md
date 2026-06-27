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
