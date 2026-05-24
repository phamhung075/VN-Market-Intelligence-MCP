# TASK P2-L — Sealed QA-Only Injection Specification

**STATUS: SEALED — QA/PM AUDIT ONLY**
**DO NOT include in P2-M handoff to dev-alert-engine.**
**DO NOT reference file path, line number, or literal change in any fixer-facing document.**

---

## Injection Target

- **Primitive:** `dedup-key-builder`
- **File:** `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`
- **Line:** 23
- **Original code:** `const djb2Seed uint32 = 5381`
- **Injected code:** `const djb2Seed uint32 = 5382`
- **Change type:** Single-literal constant change (one digit off: 5381 → 5382)

---

## Effect / Failure Mode

The djb2 hash seed is the canonical initial value. Changing it by 1 causes every fingerprint
produced by `BuildKey` to be wrong — all 3 dedup-key-builder scenarios fail, plus the
alert-pipeline scenario that depends on fingerprint correctness.

**Failing scenarios after injection:**
- `dedup-key-builder-edge.json` — fingerprint `06435619` want `0d4096ba`
- `dedup-key-builder-failure.json` — fingerprint `309bb670` want `790ecab3`
- `dedup-key-builder-golden.json` — fingerprint `69017e1c` want `4c79b07f`
- `alert-pipeline-golden.json` — Fingerprint `3f475a7d` want `8f0ff63e`

Total: 4 FAIL out of 11, sandbox exit 1.

---

## Deterministic Fix

Revert line 23 of `builder.go`: change `5382` back to `5381`.

The fix is a single-literal change. The fixer must diagnose from sandbox output only.

---

## Rollback Anchor

- **Pre-inject tag:** `alert-engine-pre-inject` → commit `3326e7dd`
- **Injection commit:** `da6c71d3`

---

## Fixer-Blindness Enforcement

- This file is NOT referenced in the P2-M handoff.
- The P2-M handoff contains ONLY: sandbox exits non-zero, 4 scenarios FAIL, dashboard RED.
- The fixer (dev-alert-engine) must diagnose from symptoms only (≤2 dispatch cycles).

---

*Sealed by QA agent on 2026-05-24T10:15Z for G10 AI-fixability proof.*
