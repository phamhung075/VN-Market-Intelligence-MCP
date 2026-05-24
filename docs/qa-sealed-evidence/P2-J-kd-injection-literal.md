---
title: "P2-J — Sealed Bug Injection Evidence (QA ONLY — do NOT share with fixer)"
sealed_by: qa
sealed_at: "2026-05-24"
task: P2-J
purpose: "Post-fix verification by QA after P2-K fix completes. NOT for dispatch to dev-kinh-dich."
---

# SEALED EVIDENCE — G10 Bug Injection Literal

## WARNING
This file contains the exact injected literal. It MUST NOT be shared with dev-kinh-dich before
P2-K fix is complete. The dev fixer must remain BLIND and discover the bug from the RED dashboard.

---

## Injection Details

**File:** `apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go`

**Line:** 34 (const block, `THIEU_DUONG_THRESHOLD`)

**Original value (correct):** `0.10`

**Injected value (corrupted):** `0.25`

**Change description:** Single-literal threshold flip. `THIEU_DUONG_THRESHOLD` raised from 0.10 to 0.25.
Any score in the range [0.10, 0.25) that should classify as THIEU_DUONG (yang, stable) is now
misclassified as THIEU_AM (yin, stable). This misclassifies hao scores near the lower boundary.

**Affected constant block (corrupted state):**
```go
const (
    LAO_DUONG_THRESHOLD   = 0.75  // score > 0.75 → LAO_DUONG
    THIEU_DUONG_THRESHOLD = 0.25  // WRONG — should be 0.10
    LAO_AM_THRESHOLD      = -0.75 // score < -0.75 → LAO_AM
)
```

**Correct restore (single-literal fix):**
Change `THIEU_DUONG_THRESHOLD = 0.25` back to `THIEU_DUONG_THRESHOLD = 0.10`

---

## Injection Commit

**SHA:** `234c0bef`
**Subject:** `test(kinh-dich): P2-J — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject-go tagged)`

---

## Pre-inject Tag

**Tag:** `kinh-dich-pre-inject-go`
**Points to:** `10ef7fdd` (commit BEFORE injection)

**Restore command (if needed for rollback):**
```bash
git revert 234c0bef
# OR
git checkout kinh-dich-pre-inject-go -- apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go
```

---

## Sandbox RED Evidence (at injection state)

```
Tier: all
Passed: 13/17
Failed: [hao-encoder-edge.json hao-encoder-golden.json reading-composer-edge.json reading-composer-golden.json]
exit status 1
```

**Module coupling note:** `reading-composer-golden.json` and `reading-composer-edge.json` also RED
because `reading_composer` module calls `EncodeHaos()` internally. This is the G11 Trial-1 coupling
proof. A single-literal fix (restore 0.10) repairs ALL 4 coupled REDs simultaneously.

---

## Dashboard RED Evidence

```json
{"service":"kinh-dich","dotsGreen":13,"dotsRed":4,"dotsPending":0,"jsErrors":0,"pageErrors":0,
 "categoryChips":{"Valid Input":6,"Edge Case":6,"Bad Input -> Error":5},"badLabels":[],"verdict":"FAIL"}
```

---

## Post-Fix Verification Checklist (QA runs after P2-K)

1. `git diff kinh-dich-pre-inject-go HEAD -- apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go`
   Must be EMPTY (byte-identical restore)
2. `go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all` exits 0 (17/17 GREEN)
3. dash-check: dotsRed=0, verdict=PASS
4. `THIEU_DUONG_THRESHOLD = 0.10` in hao_encoder.go (grep to confirm)
