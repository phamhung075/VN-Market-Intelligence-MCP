# Task Report: FIX-1286 — Agriculture Broadcast Exclusion (coffee/rice keywords)
date: 2026-04-25
outcome: APPROVED

## Changed Files
- `apps/mcp-server/src/domain/services/cascadeEngine.ts:1231-1254` — keyword list extension only
- `apps/mcp-server/src/__tests__/FIX-1286-agriculture-exclusion.test.ts` — new, 219 lines, 10 tests

## Test Results
- Unit tests (FIX-1286): 10 pass / 0 fail
- Full suite: 6993 pass / 21 skip / 1 fail (SQLITE_CORRUPT transient — see note)
- TypeScript: 0 errors

### Note on 1-fail in full suite
`026-hose-prices.test.ts:234` crashed with `SQLITE_CORRUPT` only during the parallel full-suite run. Task 026 passes 18/0 in isolation on both main and the fix branch. This is a pre-existing Bun 1.3.11 C++ flake under peak memory load (RSS 1.71GB, post-suite panic). Unrelated to this change. Baseline on main shows the same transient under identical load.

## DDD Compliance: PASS
- `cascadeEngine.ts` lives in `domain/services/` — zero real imports from `infrastructure/` or `application/`
- Grep confirmed: only comment-level text contains the string "infrastructure", no actual import statements

## Security: PASS
- No `process.env` usage in changed files
- No hardcoded secrets or credentials

## Code Quality
- Change is purely additive: 6 Vietnamese keyword strings appended to an existing `keywords[]` array inside a `SECTOR_RULES` constant
- Comment block at line 1231 accurately documents the fix rationale and the exact failing headline (`"Xuất khẩu cà phê và gạo 'hụt hơi'"`)
- Tests cover: exact regression headline, 3 excluded domains (real_estate, tech, aviation, securities), keyword variants (giá cà phê, giá gạo, nông sản xuất khẩu), and 1 positive allowed-cascade confirmation

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Rebased onto main, commit `a77979c2`.
Branch `fix/agriculture-broadcast-exclusion` deleted (local + remote).
