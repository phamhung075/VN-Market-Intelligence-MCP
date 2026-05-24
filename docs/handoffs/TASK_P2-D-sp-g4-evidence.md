---
task_id: P2-D-sp-g4-evidence
phase: "2"
pilot: "stock-price"
goal_focus: "G4"
date: "2026-05-24"
stock_price_pre_ci_tag_sha: db3ca097
g4_ready_to_grade: YES
---

# G4 Architecture Fence Evidence Summary

## AC-4a: CI Job Wired (from P2-B)

**Evidence:** AC-3 in TASK_P2-B.md confirms `.github/workflows/ci.yml` includes a job named
`stock-price-go-lint` with `working-directory: apps/stock-price` that runs `golangci-lint run`.

**Verdict:** PASS

---

## AC-4b: Deliberate-Violation Proof (from P2-C)

**Evidence:** TASK_P2-C.md contains full evidence:
- AC-1: Fence-A violation introduced in `price-quote-normalizer/normalizer.go` →
  `golangci-lint run` exit 1, output named `fence-a`
- AC-2: Violation reverted → `golangci-lint run` exit 0, 0 issues
- AC-3: `git status --short` clean (violation never staged/committed)
- AC-4: QA independently reproduced with Fence-B violation on `price_resolution.go` →
  same procedure, exit 1 with `fence-b` named, reverted clean, exit 0
- AC-5: Sandbox green after all reverts (total=11 pass=11 fail=0 status=OK)

**Verdict:** PASS (Both Fence-A and Fence-B independently proven to catch violations)

---

## AC-4c: Freeze Anchor Verification (P2-D)

**Freeze SHA:** d5ce886e (P2-B commit that created `.golangci.yml`)

**Verification:**

```bash
git log --oneline apps/stock-price/.golangci.yml | head -1
```

Output: `d5ce886e feat(stock-price): P2-B golangci depguard fence (Fence-A/B/C) + CI stock-price-go-lint job`

**Status:** Most recent commit on `.golangci.yml` is P2-B. No subsequent commits have touched
the file. Freeze anchor is LOCKED.

**Tag ancestry:**

```bash
git merge-base stock-price-pre-ci HEAD
```

Output: `db3ca097f8dc72c2e6b0f82ba6cd0b63f1d6e22f` — non-empty SHA confirming
`stock-price-pre-ci` tag (created in P2-A) is an ancestor of current HEAD.

```bash
git merge-base --is-ancestor debba8eaff0724d1fb32fc9d28640201cc32d1cc HEAD
# exit: 0 (HELD — frozen anchor remains ancestor of HEAD)
```

**Stock-price-pre-ci tag SHA:** db3ca097 (created in P2-A before P2-B).

**Verdict:** PASS (Freeze anchor confirmed; .golangci.yml is protected from mutation)

---

## G4 Terminal Verdict

| AC | Evidence | Verdict |
|----|----|---------|
| AC-4a | CI job wired in `.github/workflows/ci.yml` | PASS |
| AC-4b | Fence-A/B violation proof (deliberate injections caught, reverted clean) | PASS |
| AC-4c | Freeze anchor `d5ce886e` confirmed as most recent commit on `.golangci.yml` | PASS |

**G4 READY-TO-GRADE: ALL 3 ACs SATISFIED**

---

## Constraints & Bindings

- No modification to `apps/stock-price/.golangci.yml` (freeze anchor locked)
- No modification to `docs/data/pilot-status-stock-price.json` (PM-owned SSOT)
- No goal flip authorized (PO flips G4 only at 12/12 terminal Phase 3)
- Anchor remains INTACT: `debba8eaff0724d1fb32fc9d28640201cc32d1cc` is ancestor of HEAD
- Charter §4.5 binding: NO goal state changes in Phase 2

---

## References

- **P2-B handoff:** docs/handoffs/TASK_P2-B.md (freeze anchor d5ce886e, Fence-A/B/C created)
- **P2-C handoff:** docs/handoffs/TASK_P2-C.md (AC-4b violation proof + AC-5 sandbox green)
- **Phase 2 plan:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-D
- **Charter G4:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §G4
