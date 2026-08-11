---
sprint: CHORE-COMMIT-OVERHEAD
branch: task/chore-commit-1-drain-payload-size-gate
size: S
priority: P1
depends_on: []
blocks: []
---

## TLDR

Add a ~50KB inline-size cap to `drain-signals.md` §0a-D's payload inlining logic. Payloads above the cap use a pointer (`payload_ref`) instead of inlining. **Critical:** the dedup hash MUST be computed over the pointer, not the original full payload, to prevent the re-drain infinite loop documented in PO decision.

## [PM] Planning Context

**Root Cause:** `drain-signals.md` §0a-D inlines ALL payload_ref targets unconditionally. When the target is `docs/data/db-integrity-history.json` (745KB accumulator), one signal re-drains the entire cumulative history into the durable inbox — commit `328f1c85d` added +33,063 lines = ~49% of a 438-commit sample's insertions.

**Acceptance Criteria:**
- [ ] AC-1: Size gate implemented in drain-signals.md §0a-D: if `loaded_payload` JSON stringified exceeds ~50KB, set `payload_ref` pointer instead, omit inline payload from envelope
- [ ] AC-2: Dedup hash computation updated: `envelope_id = sha256(row.from + row.type + JSON.stringify(pointer_or_payload) + row.ts)` — hash must reflect what gets stored (pointer if size-gated, inline if small). Pointer format: `{type: "ref", path: "...", fragment?: "..."}` or similar per architecture brief §3
- [ ] AC-3: Size gate is **target-class aware** — files under `docs/signals/processed/{filename}` MUST use inline, never pointer, because they move/get-deleted after drain and could dangle. Only stable, never-moved targets (like `db-integrity-history.json`) can use pointers
- [ ] AC-4: Updated prose in drain-signals.md clearly documents the size gate decision, target-class rule, and dedup hash recomputation requirement
- [ ] AC-5: No change to `docs/agents/dev-team/flow/drain-signals.js` behavior — script already performs dedup check via fingerprint; PM ensures flow doc and script remain synchronized in intent

**Files to read first:**
- `docs/agents/dev-team/flow/drain-signals.md` — §0a-D envelope building (line ~67-75)
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` — §3 (finding), §6 R3 (recommendation)
- `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md` — PO's detailed notes on dedup-hash-over-pointer requirement

**Files to modify:**
- `docs/agents/dev-team/flow/drain-signals.md` — §0a-D: update prose describing `loaded_payload` acquisition and envelope_id computation; add size gate logic in narrative

**Key Design Decision (DO NOT SKIP):**
The dedup hash recomputation is the load-bearing hazard. If you compute the hash over `loaded_payload` when size-gated to a pointer, the same signal will re-drain forever because the pointer (e.g., `{type: "ref", path: "db-integrity-history.json"}`) is always the same across ticks, but the old code would hash the full 745KB each time. **The hash must be computed over whatever actually gets stored in the envelope** — so if payload is inlined, hash inlined; if pointer, hash pointer. This is NOT optional and requires careful code review.

**Knowledge needed:**
- `docs/agents/dev-team/flow/drain-signals.md` § Full context on 0a-D flow
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § Recommendations and hazards
- `docs/policies/commit-convention.md` § Chore categories (this is a flow-doc-only change, no new code)

---

## Architecture Reference

From `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § R3 (Recommended Fixes):

> Cap inline size (e.g. ≤50KB); above the cap, keep the `payload_ref` pointer. The dangling-ref rationale that motivated "always inline" doesn't apply to `db-integrity-history.json` (never moved, never pruned — unlike the `processed/{filename}` move targets FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE was written for).

### Key Safety Invariant (PO-Flagged)

From `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md`:

> The drain-signals.md envelope_id dedup key is computed from the payload content — if FIX-DRAIN-PAYLOADREF-UNBOUNDED-INLINE-SIZE-GATE switches large payloads to a pointer, the dedup hash MUST be computed over the pointer, not left pointed at the old payload-hash logic, or gated signals re-drain forever (silent infinite loop).

### Target-Class Awareness (PO-Flagged)

> The size gate must be size AND target-class aware — files under `processed/{filename}` move after drain, so pointerizing them dangles the ref (this already fired once, `FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE`, commit `395e224ad`).

---

## Scope Boundary

**IN SCOPE:**
- Flow-doc prose changes only (no script changes)
- Documenting the size gate decision and target-class rule
- Specifying the dedup hash recomputation requirement (which the drain-signals.js script will honor)

**OUT OF SCOPE (don't touch):**
- Modifying `scripts/agents-flow/drain-signals.js` itself (script ALREADY implements dedup correctly; PM's job is to ensure the flow doc narratively describes what the script does)
- Changing the write/readback crash-safety mechanism
- Altering drain cadence or the orch-apply.sh contract
- Untracking processed/ files (that is TASK_CHORE-COMMIT-3)

---

## Success Criteria

1. Flow doc updated with clear size gate documentation
2. Dedup hash requirement explicitly documented (not implied)
3. Target-class rule clearly explained (inline for processed/, pointer for stable targets)
4. No functional code changes — this is prose clarification
5. Code review confirms dedup logic (inspector verifies script implementation matches prose intent)

Post-merge: once `scripts/agents-flow/drain-signals.js` is verified to implement this correctly, the re-drain infinite loop should be eliminated (commit-volume metric should show fewer duplicate-payload-bloat commits).
