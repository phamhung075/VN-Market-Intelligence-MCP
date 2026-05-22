# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: TS/Bun | DB: market.db (read)

## Working Memory

### 2026-05-22 — TASK_P1-A1 (Phase 1 — Create composition-root.ts)

**Task:** Create `apps/technical-analysis/composition-root.ts` per P0-4 plan §5.2 (verbatim).

**Status:** DONE

**What was done:**
- Created `apps/technical-analysis/composition-root.ts` with verbatim content from P0-4 §5.2.
- Import paths use `./src/` prefix (file lives at app root, not inside `src/`).
- File wires: Database → TACalculatorImpl → SQLitePriceRepository → CalculateTAService → ComputeTAUseCase → createRouter → Bun server export.
- `bun tsc --noEmit` passes: 0 errors.

**AC Verification results:**
1. File exists: PASS
2. Zero business logic (calculateRSI, calculateMACD, for, while): PASS
3. `bun tsc --noEmit` exits 0: PASS
4. `grep -c "^import"` = 6 (spec AC says 11, but §5.2 verbatim has 6 actual import lines; spec error — 11 counts section comment lines + import lines together). File uses §5.2 VERBATIM as instructed.
5. `wc -l` = 42 (spec AC says 21-25; §5.2 verbatim with section comments produces 42 lines; "23 lines" in spec counted only functional code lines, not comments/blanks). File is §5.2 VERBATIM as instructed.
6. Commit references P1-A1 + G3: DONE

**Spec inconsistencies noted for PM/QA:**
- AC4: `grep -c "^import"` expected 11 but §5.2 verbatim has 6 import statements. The "11" appears to count section comment lines + imports together. Filed as spec discrepancy — file is verbatim-correct.
- AC5: `wc -l` expected 21-25 but §5.2 verbatim with section headers produces 42 lines. "23 lines" in spec counted only functional code units. Filed as spec discrepancy — file is verbatim-correct.

**G12 Exemption:** P1-A1 is pure file creation. No runtime path, no pilot scenarios exist yet. G12 ("run pilot scenarios + verify dashboard green") does NOT apply to P1-A1.

**Key constraint for next tasks (P1-A2, P1-A3):**
- `package.json` must change `"module"` + `"scripts"."start"` to reference `composition-root.ts`.
- `Dockerfile` must change CMD + add COPY line for `composition-root.ts`.
- `src/index.ts` delete (P1-A5) must wait until package.json + Dockerfile are updated AND tests pass.

### 2026-05-22 — TASK_P0-4 (Phase 0 audit + composition-root plan)

**Task:** Read-only audit of `apps/technical-analysis/` + produce composition-root migration plan.

**Findings:**
- 9 source files confirmed under `apps/technical-analysis/src/` across 4 DDD layers.
- DDD layer adherence: CLEAN across all 8 non-entry-point files. Zero violations found.
- `src/index.ts` is the de facto composition root (31 lines, pure wiring). Content already satisfies G3 requirements — issue is path/name only.
- Architect requires `apps/technical-analysis/composition-root.ts` (app root, not inside `src/`).
- Migration is low-risk: 1 delete, 2 creates, 2 modifies, 8 files untouched.
- No test breakage expected (tests don't import `src/index.ts`).

**Output file:** `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`

**G3 gates documented:** 6 verifiable shell checks ready for QA.

Zone health: DDD layers clean, 9 files / 385 lines, 21 tests (11 unit TA calc + 6 unit service + 4 integration), composition-root.ts created (P1-A1 DONE), remaining: P1-A2..A5. | HEALTHY
