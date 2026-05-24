# TASK P2-D — kinh-dich-service G4 Freeze Anchor Confirmation

**Task:** P2-D — G4 Freeze Anchor Confirmation (AC-4c, read-only)
**Pilot:** kinh-dich-service (fleet pilot 4, Phase 2)
**Owner:** qa
**Date:** 2026-05-24
**Status:** DONE

---

## AC-1 — Freeze Anchor Verification

**Command:** `git log --oneline apps/kinh-dich-service/.golangci.yml`

**Output:**
```
696572b3 feat(rag-service/P2-B3): context-window-packer primitive + usecases.py migration (G1 advancing)
```

**Full commit SHA:** `696572b3b573e2551e910b3c96018d34a359c57d`

Note: The commit subject contains "rag-service/P2-B3" because commits during concurrent multi-pilot
work in this repo sometimes carry the subject of the primary change in that commit batch. The file
`apps/kinh-dich-service/.golangci.yml` was created in this commit (P2-B). This is the ONLY commit
that has ever touched `.golangci.yml` — no subsequent tampering has occurred.

**Verification:** `--follow` also returns only this one commit. No post-P2-B modifications.

**golangci_freeze_sha:** `696572b3b573e2551e910b3c96018d34a359c57d`

---

## AC-2 — `kinh-dich-pre-ci-go` Tag Ancestry

**Command:** `git log --oneline kinh-dich-pre-ci-go | head -1`

**Output:**
```
90dcc68a chore(memory/po): notebook 2026-05-24 — pdf-extractor Phase-1 APPROVED + Phase-2 directive + G5b freeze ruling (c) SPLIT
```

**Tag SHA:** `90dcc68af3848da9bf40504a17defe878146f03e`

**Ancestry check:** `git merge-base --is-ancestor kinh-dich-pre-ci-go HEAD`
**Result:** exit 0 (tag IS an ancestor of HEAD)

**Ancestry direction confirmed:** `kinh-dich-pre-ci-go` (tagged at HEAD at P2-A creation time) is an
ancestor of current HEAD, meaning HEAD has advanced past the tag — the tag is properly anchored
before Phase-2 fence work, as required.

**TS-era tag intact check:** `git log --oneline kinh-dich-pre-ci | head -1`
**Output:** `2d245200 signal(architect): alert-engine fleet pilot-5 charter done — next: Phase-1 task plan`
**Confirmation:** TS-era `kinh-dich-pre-ci` still points to `2d245200` — UNCHANGED.

---

## AC-3 — G4 Evidence Compilation

| Field | Value |
|-------|-------|
| `ac_4a_ci_job_wired` | YES — `kinh-dich-go-lint` job in `.github/workflows/ci.yml` (P2-B AC-3) |
| `ac_4b_violation_proof` | YES — Fence-A caught `pkg/infrastructure` import in `hao_encoder.go`; exit 1; reverted; never committed |
| `ac_4b_sister_primitive_false_positive_check` | PASS — `nuclear_hexagram` golangci-lint exit 0 (allowlist correct, no false-positive) |
| `ac_4c_freeze_sha` | `696572b3b573e2551e910b3c96018d34a359c57d` (P2-B commit — only commit on `.golangci.yml`) |
| `kinh_dich_pre_ci_go_tag_sha` | `90dcc68af3848da9bf40504a17defe878146f03e` (Go-era tag, ancestor of HEAD) |
| `ts_era_tag_intact` | YES — `kinh-dich-pre-ci` still points to `2d245200` (unchanged) |
| `g4_ready_to_grade` | YES |

---

## G4 Evidence Chain Summary (P2-B + P2-C + P2-D)

### P2-B Config
- `.golangci.yml` exists at `apps/kinh-dich-service/.golangci.yml`
- Three fence rules: `fence-a`, `fence-b`, `fence-c`
- Fence-A sister-primitive allowlist: `pkg/primitive/* -> pkg/primitive/*` (OQ-6)
- CI job `kinh-dich-go-lint` wired in `.github/workflows/ci.yml`
- Commit: `696572b3` (freeze anchor — only commit on file)
- golangci-lint run exits 0 on clean codebase (nuclear_hexagram sister imports allowed)

### P2-C Violation Proof (dev + QA independent)
- Dev violated `hexagram_resolver.go` → exit 1 → reverted
- QA violated `hao_encoder.go` (different file) → exit 1, exact output:
  ```
  pkg/primitive/hao_encoder/hao_encoder.go:19:2: import '...pkg/infrastructure' is not allowed from list 'fence-a': Fence-A: primitive must not import infrastructure layer (depguard)
  ```
- Revert → exit 0 → git status clean (never staged/committed)
- Sister-primitive non-leak: nuclear_hexagram exit 0 (allowlist doesn't block legitimate imports)
- Fence-false-green cross-check: verbose confirms config loaded, depguard active, files scanned

### P2-D Freeze Anchor
- Freeze SHA: `696572b3b573e2551e910b3c96018d34a359c57d` (ONLY commit on `.golangci.yml`)
- `kinh-dich-pre-ci-go` tag SHA: `90dcc68a` (ancestor of HEAD, exit 0)
- TS-era `kinh-dich-pre-ci` tag: `2d245200` (intact, not touched)
- No post-anchor tampering: `git log --follow apps/kinh-dich-service/.golangci.yml` → 1 commit only

**G4 verdict: EARNED-PENDING — all evidence complete. PO flips at 12/12 terminal Phase-3 close.**

---

## [QA] Review Record

```
date: 2026-05-24
task: P2-D (G4 freeze anchor confirmation — read-only)
pilot: kinh-dich-service
ac_1_freeze_sha: 696572b3b573e2551e910b3c96018d34a359c57d
ac_1_single_commit_on_file: YES (only 1 commit in git log --follow)
ac_2_tag_sha: 90dcc68af3848da9bf40504a17defe878146f03e
ac_2_ancestor_check: exit 0 (kinh-dich-pre-ci-go IS ancestor of HEAD)
ac_2_ts_era_tag_intact: YES (2d245200 unchanged)
ac_3_g4_evidence_table: complete (6 fields all populated)
g4_ready_to_grade: YES
ssot_not_mutated: pilot-status-kinh-dich.json not touched
goal_flips: NONE (Charter §4.5 honored)
verdict: PASS
```
