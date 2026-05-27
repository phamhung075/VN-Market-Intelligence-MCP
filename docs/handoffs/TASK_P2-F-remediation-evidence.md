# P2-F Remediation Evidence

**Date:** 2026-05-24  
**Agent:** dev-stock-price  
**Type:** Forward commit hygiene fix — no history rewrite

---

## Root Cause

During P2-F (commit `6225f926`), a concurrent agent ran `git reset HEAD` which unstaged the deletion of `services.go` and `services_test.go` from the index mid-flight. The re-commit captured the `_deprecated/services_v1.*` additions but not the corresponding deletions. HEAD therefore tracked both the old `services.go`/`services_test.go` (dead code, annotated with `//go:build ignore`) and the new `_deprecated/` copies simultaneously. The working tree already held the correct end-state (files absent from disk) — only the git index was behind.

---

## Files Deleted (staged and committed)

| File | Action |
|---|---|
| `apps/stock-price/pkg/domain/services.go` | Deleted from index (was dead code, `//go:build ignore` tagged in _deprecated copy) |
| `apps/stock-price/pkg/domain/services_test.go` | Deleted from index (companion test, also superseded) |

---

## Build / Lint / Sandbox Verdicts (all pre-commit)

| Check | Result |
|---|---|
| `go build ./...` | EXIT 0 |
| `golangci-lint run` | 0 issues (`.golangci.yml` frozen at `d5ce886e`, NOT modified) |
| Sandbox primitive tier (`CGO_ENABLED=0`) | total=9 pass=9 fail=0 status=OK |
| Sandbox module tier (`CGO_ENABLED=0`) | total=2 pass=2 fail=0 status=OK |
| Pre-commit index check (`git diff --cached --name-only`) | Exactly 2 files — NO foreign paths |

---

## Commit

- **SHA:** `399afe54`  
- **Subject:** `fix(stock-price): P2-F remediation — commit dangling git mv deletion (services.go/services_test.go) stranded by index race`
- **Method:** Forward commit on `main` — no `--amend`, no `--force`, no branch, no rebase

---

## Anchor Integrity

Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` verified ancestor of HEAD:  
`git merge-base --is-ancestor debba8ea... HEAD` → EXIT 0. INTACT.

---

## HEAD State Post-Commit

`apps/stock-price/pkg/domain/` now tracks:
- `_deprecated/services_v1.go`
- `_deprecated/services_v1_test.go`
- `models.go`
- `ports.go`

Orphaned `services.go` and `services_test.go` are gone from the index.

---

## Next Actor

**pm** — Please correct P2-F record AC-1 to reflect committed truth (deletion now committed as `399afe54`), then proceed to sequence P2-H (G3 composition root + OpenAPI).
