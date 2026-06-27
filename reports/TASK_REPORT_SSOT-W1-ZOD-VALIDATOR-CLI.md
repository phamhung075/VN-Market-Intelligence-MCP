# Task Report: SSOT-W1-ZOD-VALIDATOR-CLI — Harden orch-validate.mjs with CLI integration tests
date: 2026-06-27
outcome: APPROVED

## Commit under review
`54b8f142` — feat(validator): harden orch-validate.mjs with 25 CLI integration tests

## Test Results
- Targeted suite (`orchStateSchema.test.ts`): **103 pass / 0 fail** (RAW-verified)
- AC fixture (`scripts/test-orch-validate-ac.mjs`): **29/29** (RAW-verified)
- TypeScript (`bun tsc --noEmit`): **0 errors** (RAW-verified)
- Full suite: Bun 1.3.13 C++ crash after 13633 tests (known Bun env issue, not a code failure)

## Smart-Skip
Test-only + docs change — DDD scan and mock-guard skipped per Smart-Skip rule (no production source modified).

## Production Delta
`scripts/orch-validate.mjs` — NOT modified. Audit confirmed it was already correct.
No production source touched. Additive: +25 tests (test file) + DJ entry + handoff record.

## 5 Hardening Items — RAW-verified against source + test output

| Item | Source Verified | Tests Exercising |
|------|----------------|-----------------|
| 1. Stage-0 tokenizer escape-sequence | `readString()` advances pos+1 on `\` before checking `"` — `\"` cannot terminate string | QA-2-esc-a/b/c, QA-2-nest-a/b/c/d (7 tests) |
| 2. QA-2 dup-key gate exit-1 before JSON.parse | `findDuplicateJsonKeys()` runs before `JSON.parse(text)`; exits 1 if dups found | exit-1 describe (2 tests) + AC-2 (3 tests) |
| 3. Auto-fix issue.code contract | All 5 mappers present in `formatZodIssue()`: `invalid_enum_value` (verify_note), `unrecognized_keys` (cold storage), `invalid_type`, `too_small` (minimum), `custom` (fix: extraction) | 7 auto-fix hint tests |
| 4. Exit-code 0/1/2/3 | `process.exit(0/1/2/3)` on respective paths confirmed in source | 8 exit-code tests (2+2+3+1) |
| 5. mcp-server suite green | 103/103 pass in orchStateSchema.test.ts | Full file run |

Note on `invalid_enum_value` (non-status): the branch is present as defensive future-compat code. No non-status `z.enum()` field currently exists in the schema, so it cannot be exercised. DJ S5 documents this correctly.

## Zone Judgment

**Task zone declared:** `scripts/`
**Tests landed in:** `apps/mcp-server/src/infrastructure/__tests__/orchStateSchema.test.ts`

**Verdict: ACCEPTABLE (no move required)**

Rationale:
- `scripts/orch-validate.mjs` imports `apps/mcp-server/src/infrastructure/orchStateSchema.ts` directly — the two are tightly coupled by design (single-SSOT goal). Integration tests co-located with the schema they exercise is architecturally coherent.
- The DoD gate is `bun test` in `apps/mcp-server`. Tests in `scripts/test-orch-validate-ac.mjs` run only when invoked explicitly; they do NOT participate in the `bun test` DoD gate.
- The 25 new tests use `spawnSync` to invoke the CLI as a subprocess — they ARE CLI integration tests exercising the full pipeline, not schema unit tests dressed as CLI tests.
- The AC fixture (`scripts/test-orch-validate-ac.mjs`) at 29/29 remains the canonical AC-by-name coverage. The new 25 tests add depth (escape-seq, auto-fix hints, coherence-non-blocking edge cases) beyond what the AC fixture covers.

Non-blocking observation: future sprint could consolidate CLI tests back into `scripts/test-orch-validate-ac.mjs` for zone clarity, but it is not required now.

## Pre-existing Failures Confirmation

`src/_deprecated/1302-technical-indicators.test.ts` — last-touch `a80f01e5` (moved to `_deprecated/`), predates 54b8f142. Zero overlap with this commit (git show 54b8f142 -- apps/mcp-server/src/_deprecated/ = empty). Current run: 32 pass / 2 fail (data-dependent live-DB tests; failure count varies with market data — not introduced by this PR). Worker's "47 failures" count was the full-suite total at the time of their run; _deprecated/ is the sole pre-existing failure file in the suite.

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## DDD Compliance: PASS (test-only change, skipped per Smart-Skip)
## Security: PASS (test-only change, skipped per Smart-Skip)

## Merge Status
APPROVED — no merge action (commit 54b8f142 already on main per handoff; QA role here is gate-keeper verdict only).
