# Task Report: 1877c — C4 Scope-Vocab Remediation
date: 2026-05-11
outcome: APPROVED

## Test Results
- Unit tests: N/A (script-only task, no TypeScript changes)
- TypeScript: N/A (no .ts files changed)
- Audit script syntax: bash -n → exit 0

## DDD Compliance: N/A
No domain/infrastructure code changed. Shell script + knowledge doc only.

## Security: PASS
No credentials, no process.env, no SQL, no hardcoded secrets.

## AC Results

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | `bash -n` syntax check → exit 0 | PASS |
| AC-2 | C4 rate ≥ 0.95 — actual 0.9826 (169/172) | PASS |
| AC-3 | No sprint-ID commits in violations (5 spot-checked) | PASS |
| AC-4 | True violations *, c26, cycle-28 still present | PASS |
| AC-5 | Two runs identical (modulo dynamic window.until timestamp) | PASS |
| AC-6 | No bash 3.2 forbidden patterns (grep → 0 hits) | PASS |

## Files Changed (dev commit 142b59ab)
- `scripts/audits/commit-convention-audit.sh` — VOCAB 20→52 + sprint-ID exemption block
- `.claude/knowledge/commit-convention.md` — Scope Rules 8-line table + exemption note

## VOCAB Token Count: 52 (exact match to brief §4.1, alphabetically sorted)

## C4 Metrics
- Denominator: 172 (non-notebook well-formed commits in window, sprint-ID exempt excluded)
- Pass: 169
- Violations: 3 (*, c26, cycle-28 — history-locked, true off-convention)
- Rate: 0.9826 (threshold 0.95 — PASS)

## Overall Audit Verdict
FAIL — C2 (task trailer 0.5694 < 0.85) and C3 (AC trailer 0.7722 < 0.80) still fail.
C4 now PASS. C1 PASS. 1877c scope was C4 only — C2/C3 are separate concerns.

## Issues Found
### Blocking
None.

### Non-Blocking
- Dev commit message (142b59ab) claims "168/171" but actual run on 2026-05-11T18:33 yields 169/172 (0.9826 not 0.9825). Consistent with architect note that commits landed since sampling pushed numbers up. No issue — result is better than claimed.
- AC-5 idempotence: `window.until` timestamp differs between runs (expected — it is the live "now" cutoff). All numeric fields (pass count, denominator, rate, violations) are identical. Verdict: PASS with note.

## Merge Status
Merged no-ff to main. SHA: 9e19cd4b
Branch task/1877c-c4-vocab-remediation deleted.
