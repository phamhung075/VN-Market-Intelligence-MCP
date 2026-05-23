---
task_id: "P2-A1"
title: ".golangci.yml Creation (Fence-A/B/C Rules)"
owner: "dev-macro-indicators"
estimate: "45 minutes"
priority: "HIGHEST — unblocks G4 verification, sequencing gate"
blocks: ["P2-A2"]
blocked_by: ["P2-B1 DONE"]
goals: ["G4 partial"]
phase: 2
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md"
plan_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md"
---

# TASK P2-A1 — .golangci.yml Creation (Fence-A/B/C Rules)

**Cycle:** c282 cycle-42 (macro-indicators pilot)  
**Dispatch timestamp:** 2026-05-23T125400Z  
**Owner:** dev-macro-indicators  
**Estimate:** 45 minutes  
**AC count:** 5  
**Priority:** HIGHEST — G4 architecture fence enforcement (offline depguard primary evidence)

---

## Summary

G4 (Architecture Fence Enforced) requires `golangci-lint` with `depguard` linter to enforce three architectural boundaries:
- **Fence-A:** `pkg/primitive/*/` must not import `module/`, `application/`, `interface/`, `infrastructure/`
- **Fence-B:** `pkg/module/*/` must not import `application/`, `interface/`, `infrastructure/`
- **Fence-C:** `pkg/infrastructure/` importable only from `cmd/server/main.go` (composition root)

This task creates the `.golangci.yml` config file with depguard rules that verify these fences. This establishes the **primary evidence** for G4 per TA pilot lesson L2 (offline deliberate-violation proof equivalent to CI-green).

**Note:** This task creates the CONFIG ONLY. CI job wiring happens in P2-A2 (tomorrow). Deliberate-violation proof also happens in P2-A2.

---

## Files to Create/Modify

**Create:**
- `apps/macro-indicators/.golangci.yml` (NEW — depguard config with Fence-A/B/C rules)

**No other files modified in P2-A1.**

---

## Acceptance Criteria

### AC-1: .golangci.yml Structure

`.golangci.yml` must contain `depguard` linter enabled with three named rules:

```yaml
linters:
  enable:
    - depguard
    # ... other linters as desired

linters-settings:
  depguard:
    rules:
      fence-a:
        list-mode: "lax"
        files:
          - "$all"
        allow:
          - $gostd
          - github.com/your-module/apps/macro-indicators/pkg/primitive
        deny:
          - p: "github.com/your-module/apps/macro-indicators/pkg/(module|application|interface|infrastructure)"
            msg: "Fence-A violation: primitives cannot import module/application/interface/infrastructure"
      fence-b:
        list-mode: "lax"
        files:
          - "$all"
        allow:
          - $gostd
          - github.com/your-module/apps/macro-indicators/pkg/primitive
          - github.com/your-module/apps/macro-indicators/pkg/module
        deny:
          - p: "github.com/your-module/apps/macro-indicators/pkg/(application|interface|infrastructure)"
            msg: "Fence-B violation: modules cannot import application/interface/infrastructure"
      fence-c:
        list-mode: "lax"
        files:
          - "github.com/your-module/apps/macro-indicators/pkg/infrastructure/..."
        deny:
          - p: "github.com/your-module/apps/macro-indicators/pkg/(primitive|module|interface)"
            msg: "Fence-C violation: infrastructure importable only from cmd/server"
```

**Smoke check:**
```bash
grep -c "depguard" apps/macro-indicators/.golangci.yml
# Expected: ≥1 match
grep -c "fence-a\|fence-b\|fence-c" apps/macro-indicators/.golangci.yml
# Expected: 3 matches (all three fences named)
```

### AC-2: Config Lints Cleanly

`cd apps/macro-indicators && golangci-lint run` must exit 0 on the current codebase (no fence violations in existing P1 code).

**Smoke check:**
```bash
cd apps/macro-indicators && golangci-lint run
# Expected: exit 0 (no violations)
```

### AC-3: Config File Size ≤ 80 Lines

`wc -l apps/macro-indicators/.golangci.yml` must return ≤ 80.

**Smoke check:**
```bash
wc -l apps/macro-indicators/.golangci.yml
# Expected: ≤80
```

### AC-4: Freeze Anchor Established

After commit:
```bash
git log --oneline apps/macro-indicators/.golangci.yml
# Expected: this commit as MOST RECENT on that file (confirms freeze anchor for P2-A2)
```

This establishes the commit as the freeze point — P2-A2 will tag `macro-pre-ci` on the commit BEFORE P2-A2's CI mutations, which means the P2-A1 commit becomes the freeze anchor.

### AC-5: R-1 Guard Propagated

`grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/pkg/` must exit 1 (zero matches).

**Smoke check:**
```bash
grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/pkg/
# Expected: exit 1 (no matches)
```

---

## Hard Gates (Binding)

### Linter Output Clean (AC-2)

`cd apps/macro-indicators && golangci-lint run` must exit 0.

**Failure mode:** If depguard reports any violations on Phase 1 code, task BLOCKED until config adjusted. Commit rejected.

---

## Out-of-Zone Bans (Forbidden Reads/Writes)

Do NOT modify:
- `apps/technical-analysis/` (FROZEN — TA pilot CLOSED)
- `.github/workflows/ci.yml` (P2-A2 will modify; P2-A1 is config-only)
- `apps/macro-indicators/` source files (only `.golangci.yml` created in P2-A1)
- `docs/data/pilot-status-macro-indicators.json` (SSOT — PM/QA owned)

**In zone:**
- `apps/macro-indicators/.golangci.yml` (CREATE ONLY)

---

## Constraints (Binding)

| Constraint | Enforcement |
|---|---|
| **L84 staging** | `git add apps/macro-indicators/.golangci.yml` explicitly (1 file) |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` |
| **Anchor 1776df8e** | Must remain ancestor before AND after every commit |
| **G12 DoD gate** | Sandbox not required (config-only task) — but verify no breakage: `go build ./...` in apps/macro-indicators exits 0 |

---

## Commit Subject

```
feat(macro-indicators): P2-A1 — .golangci.yml Fence-A/B/C depguard rules (G4 partial)
```

Include in commit body:
- Fence-A/B/C rule names and brief enforcement description
- AC-2 verification (golangci-lint exit 0)
- AC-4 freeze anchor confirmation
- AC-5 R-1 grep result

---

## Implementation Guidance

### golangci.yml Template

Use the TA pilot's depguard config as a reference (if available), or start from the Fence-A/B/C spec above. Key points:

1. **Import path syntax:** `github.com/your-module/apps/macro-indicators/pkg/primitive` — use actual module name from `go.mod`
2. **Regex deny patterns:** `p: "..."` uses Go regex; test with examples
3. **File scoping:** `files: ["$all"]` for global rules, or `files: ["path/..."]` for specific paths
4. **Lax mode:** Use `list-mode: lax` to avoid false positives from transitive imports

### Testing Locally

Before commit:
```bash
cd apps/macro-indicators
golangci-lint run --print-issued-lines=false --print-linter-name=true
```

Should show exit 0 and no depguard violations on existing Phase 1 code.

---

## RETURN

When DONE, provide:

1. **Commit:** List the dev impl commit SHA
2. **Golangci-lint output:** Paste `cd apps/macro-indicators && golangci-lint run` output (should be exit 0, clean)
3. **File size:** Paste `wc -l apps/macro-indicators/.golangci.yml` output (must be ≤80)
4. **Freeze anchor:** Paste `git log --oneline apps/macro-indicators/.golangci.yml` output (this commit should be first)
5. **R-1 verification:** Paste `grep -rE "math/rand..." apps/macro-indicators/pkg/` exit code (must be exit 1)
6. **Anchor check:** Paste `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` output

**Example return block:**

```
COMMIT:
- a1b2c3d (dev-macro-indicators impl — .golangci.yml Fence-A/B/C)

GOLANGCI-LINT OUTPUT:
$ cd apps/macro-indicators && golangci-lint run
# Exit 0 (clean)

FILE SIZE:
$ wc -l apps/macro-indicators/.golangci.yml
75 apps/macro-indicators/.golangci.yml

FREEZE ANCHOR:
$ git log --oneline apps/macro-indicators/.golangci.yml
a1b2c3d feat(macro-indicators): P2-A1 — .golangci.yml Fence-A/B/C...

R-1 VERIFICATION:
$ grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/pkg/
# Exit 1 (no matches)

ANCHOR CHECK:
$ git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
a1b2c3d feat(macro-indicators): P2-A1 — .golangci.yml Fence-A/B/C...
```

---

## Next Task (PM Perspective)

**After P2-A1 DONE + dev signal received:**

PM will dispatch P2-A2 (CI job + deliberate-violation proof + macro-pre-ci tag). P2-A2 is blocked by P2-A1 DONE and requires the freeze anchor from this commit.

No parallel work — WIP=1 sequential per plan §WIP Decision.
