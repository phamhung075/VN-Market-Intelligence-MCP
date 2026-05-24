# TASK_P2-KD-A-go — Create `kinh-dich-pre-ci-go` Tag (Go Phase-2 pre-revert anchor)

| Field | Value |
|---|---|
| Task ID | **P2-A** (Go Phase-2, first task) |
| Owner | **dev-kinh-dich** |
| Zone | `apps/kinh-dich-service/` ONLY (tag-only — no files touched) |
| Goals | **G4** (setup — NO flip) |
| Language | **Go** (USER-DIRECTIVE, FINAL — do not re-litigate the pivot) |
| Est | 5m |
| Blocked by | — (first Phase-2 task) |
| Blocks | P2-B (.golangci.yml Fence-A/B/C + sister-primitive allowlist + CI) |
| Plan | `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-go.md` §P2-A |
| SSOT | `docs/data/pilot-status-kinh-dich.json` → `phase2.tasks["P2-A"]` |
| WIP | 1 (this is the only In-Progress task) |

---

## Context

This is the **first task of the kinh-dich-service Go Phase-2** (charter fleet pilot 4). Phase-1 Go reboot is APPROVED (CONDITIONAL-GO close gate — conditional = scope boundary only, NOT a quality defect; sandbox 17/17 GREEN, 7 goals carry Phase-1 evidence). Phase 2 closes the 5 still-unmet goals (G4, G5, G9, G10, G11) + dashboard stale-comment cleanup.

**L5 lesson (binding):** the pre-revert tag MUST exist BEFORE any `.golangci.yml` or CI work lands. This task creates the Go-era rollback anchor.

**CRITICAL — tag disambiguation:** The TS pilot already created and committed `kinh-dich-pre-ci` pointing to a TS-era commit (`2d245200`). This TS-era tag CANNOT be reused or force-moved (charter §Constraints: no `--force` on tags, no destructive git). Go Phase-2 uses a **`-go` suffix**: `kinh-dich-pre-ci-go`, tagging the current HEAD.

---

## Files touched

- **NONE** — this is a tag-only task. No source, CI, or doc files are modified.

---

## Step 0 (only action)

```bash
git tag kinh-dich-pre-ci-go HEAD
```

Confirm:
```bash
git log --oneline kinh-dich-pre-ci-go
```
Must return the current HEAD commit SHA + subject.

**Disambiguation verification (mandatory):**
```bash
git tag | grep "kinh-dich-pre-ci"
```
Must show BOTH `kinh-dich-pre-ci` (TS-era, untouched) AND `kinh-dich-pre-ci-go` (Go-era, just created).

---

## Acceptance Criteria (3)

**AC-1** — `git log --oneline kinh-dich-pre-ci-go` returns one line referencing a Go Phase-1 or later commit (ancestor of HEAD at Phase-2 kickoff). No `--force`, no push.

**AC-2** — `git tag | grep "kinh-dich-pre-ci-go"` returns `kinh-dich-pre-ci-go`. `git tag | grep "kinh-dich-pre-ci$"` still returns the TS-era tag unchanged (not overwritten).

**AC-3** — The TS-era `kinh-dich-pre-ci` tag is INTACT:
```bash
git log --oneline kinh-dich-pre-ci | head -1
```
Must return `2d245200` as the beginning of the commit SHA (TS-era anchor untouched).

---

## Definition of Done (DoD)

- All 3 ACs PASS.
- Tag created on current HEAD; no `--force`; no push.
- TS-era `kinh-dich-pre-ci@2d245200` verified unmoved.
- Paste tag SHA + the two `git tag | grep` outputs into the RETURN block of this handoff.

> NOTE: the G12 sandbox DoD gate does NOT apply to P2-A — this is a tag-only task with no code change. (G12 sandbox-green gate engages at P2-B/P2-F/P2-H/P2-K which produce sandbox-runnable artefacts.)

---

## Constraints (binding — every Phase-2 task inherits these)

- **Zone:** `apps/kinh-dich-service/` ONLY (this task touches no files — tag only). Do NOT touch other services, the mcp-server, or other pilots' status files.
- **TS tag disambiguation:** NEVER `--force` the existing TS-era tags. Use `-go` suffix throughout Go Phase-2.
- **No destructive git:** No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push`.
- **L84 staging:** explicit-file `git add <path>` per file (N/A here — no files staged). NEVER `git add -A` / `git add .`.
- **SSOT freeze:** Do NOT modify `docs/data/pilot-status-kinh-dich.json` — PM-owned (po performs PM mechanics this cycle). Do NOT flip any G-goal field.
- **Charter §4.5:** `decisionMatrix.{speed,trust,scale}` stays `TBD`. PO-only authorship at 12/12 terminal in Phase 3.

---

## G-goal posture

**NO goal flips.** The tag is infrastructure only. G4 does NOT flip to YES here (G4 advances across P2-B/P2-C/P2-D and is graded by PO only at the 12/12 Phase-3 terminal close). §4.5 SSOT untouched.

---

## Signal expectation (dev-kinh-dich emits on DONE)

`docs/signals/dev-kd-P2-A-done-<UTC>.json` with fields:
`task=P2-A`, `tag=kinh-dich-pre-ci-go`, `tagged_sha=<sha>`, `ts_era_tag_intact=true`, `next=pm`.

---

## Next in sequence

P2-A → **P2-B** (`.golangci.yml` Fence-A/B/C + sister-primitive allowlist `pkg/primitive/* → pkg/primitive/*` for `nuclear_hexagram` OQ-6 + CI `kinh-dich-go-lint` job). PM-substitute (po) sequences P2-B after P2-A DONE + AC verification.

---

## RETURN expectation

On completion, dev-kinh-dich returns: tagged HEAD SHA, AC-1..AC-3 verdicts, both `git tag | grep` outputs, confirmation TS-era `kinh-dich-pre-ci@2d245200` unmoved, signal path. PM-substitute (po) verifies, flips `phase2.tasks["P2-A"].status` to DONE, and sequences P2-B.
