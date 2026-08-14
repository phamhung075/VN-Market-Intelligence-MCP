---
sprint: UC-CDC-P1
branch: task/2008b-preflight-stop-calendar-recycling
size: S
zone: scripts/
depends_on: []
blocks: [TASK_2008c]
---

## TLDR

Stop `cowork-tick-preflight.sh` Step 8 (SILENT-path emit) from reading `calendar_status` out of the previous tick's `pressure-state.json` and writing it straight back in (FR-A3). Once TASK_2008a lands, the server computes fresh, so the SILENT path should omit `calendar_status` entirely (matching WORK path behavior).

## [PM] Planning Context

- **Zone:** scripts/
- **Task ID:** TASK_2008b (developer specialist)
- **Parent:** UC-CDC-P1 (3-way decomposition)
- **Acceptance Criteria:**
  - [ ] **FR-A3 Implemented:** SILENT-path emit call stops recycling stale `calendar_status`
    - `scripts/agents-flow/cowork-tick-preflight.sh` L150 read removed: `calendar_status=$(jq -r '.calendar_status // empty' "$PRESSURE_STATE_PATH")`
    - `--arg cal "$calendar_status"` removed from L162-164 jq build
    - `calendar_status:$cal` key removed from L162-164 emit_args object
    - Result: SILENT-path `emit_pressure_state` call now shape-identical to WORK path (both omit `calendar_status`, letting server compute fresh)
  - [ ] **Explicitly OUT of scope:** `last_regime` / `last_volatility_level` recycling NOT touched (same L148-149/153/160-161 lines, different mechanism)
    - Rationale: Those fields have no independent producer yet (UC-SDF-P2 WIDEN clause addresses that separately)
    - Recycling them as intentional degrade-gracefully default per script's own R3 comment
  - [ ] **Test Coverage:** `scripts/agents-flow/cowork-tick-preflight.test.sh` captures and asserts SILENT-path emit args
    - Add one assertion after FR-A3: captured SILENT-path `emit_args` must NOT contain `calendar_status` key
    - Mirrors precedent: T2d's "carries no pressure_mode key" shape assertion
    - Grep mocked `mcp_call` log for key absence: negative assertion `! grep 'calendar_status' <captured_args>`

- **Files to read first:**
  - `docs/handoffs/UC-CDC-P1-BA-spec.md` § [Architect] Brownfield Findings (FR-A3 verification, line-number drift note)
  - `scripts/agents-flow/cowork-tick-preflight.sh` (function `_step8_silent_release()` L145-181, L150 read, L162-164 emit_args build)
  - `scripts/agents-flow/cowork-tick-preflight.test.sh` (T2d precedent for assertion pattern)

- **Files to modify:**
  - `scripts/agents-flow/cowork-tick-preflight.sh` (remove L150 read, drop cal arg and key from L162-164)
  - `scripts/agents-flow/cowork-tick-preflight.test.sh` (add assertion for key absence in SILENT-path emit)

- **Dependencies:** None (TASK_2008a and TASK_2008c are independent)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (script testing, shell patterns)
  - jq manipulation patterns (already used in the script)
  - Test assertion patterns (grep negative match)

## Design Rationale

**Circular loop break:** The SILENT-path call currently reads `calendar_status` from the file it wrote in the previous tick, creating a self-recycling loop with no authoritative producer. TASK_2008a wires the actual producer (server-side computation via `vnTradingCalendar.isVnTradingDay`), so the SILENT path should stop blocking its own update. Omitting the arg lets the server compute fresh every tick, same as the WORK path.

**Preserve intentional degrade-gracefully defaults:** The same script also reads `last_regime` and `last_volatility_level` back from the file — but those have no independent producer yet (UC-SDF-P2 addresses that separately). Leaving them untouched preserves the intentional degrade-gracefully behavior documented in the script's R3 comment.

## Architect Verification (2026-08-14)

- Live function location re-verified: `_step8_silent_release()` in `cowork-tick-preflight.sh` (noted line number drift of ~2-3L from BA's read, same mechanism)
- No hidden side effects on other fields (explicit scope bounding: only `calendar_status` removal)
- Test strategy documented: live-tick notebook observation post-deploy for legacy on-disk values (TASK_2008c's FR-A5 handles fail-loud detection)

---

## RETURN (to be filled by developer)

Task complete → git commit with `Task: TASK_2008b` trailer + acceptance criteria list

---

## [Developer] Implementation Record

- **Files modified:**
  - `scripts/agents-flow/cowork-tick-preflight.sh:145-181` (`_step8_silent_release()`) — removed the L150 `calendar_status=$(jq -r '.calendar_status // empty' "$PRESSURE_STATE_PATH" ...)` read + its `[ -z "$calendar_status" ] && calendar_status="unknown"` default; dropped `--arg cal "$calendar_status"` and the `calendar_status:$cal` key from the `emit_args` `jq -n` build (was L162-164). `last_regime`/`last_volatility_level` recycling untouched — explicitly out of scope (AC).
  - `scripts/agents-flow/cowork-tick-preflight.test.sh` — new T2e: fixture `pressure-state.json` seeded with `calendar_status:"open"`, new `EMIT_ARGS_CAPTURE_FILE` stub seam captures the raw `emit_pressure_state` call args, asserts the file is non-empty (proves the call fired) AND does not contain `calendar_status`.
- **Tests written:** T2e (2 assertions) in `cowork-tick-preflight.test.sh` — RED pre-fix (`grep calendar_status` matched), GREEN post-fix.
- **Git commits:** `a860a5b9f` — `fix(scripts/cowork-tick-preflight): stop recycling stale calendar_status (FR-A3)`
- **tsc status:** N/A — pure bash/jq, no `apps/` TS touched.
- **Full suite:** `bash scripts/agents-flow/cowork-tick-preflight.test.sh` 75/75 pass (was 74/74 pre-T2e), 0 fail. `bash -n` clean.
- **Docs updated:** `docs/WORK.md` — one-liner appended. `docs/handoffs/TASK_2008b.md` — this record.
- **Graphify:** skipped (no `docs/{policies,protocols,standards,references}/` domain doc changed — pure script + test + handoff/WORK.md).
- **Simplicity gate:** PASS — Q1 scope clean (removal only, no new knob/flag), Q2 no single-use abstractions, Q3 senior-test clean, Q4 ratio <50% overhead (net change is a targeted deletion + one new test case).
