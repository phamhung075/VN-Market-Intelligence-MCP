# Fixer — Notebook

**Last updated:** 2026-05-18 | **Sprint:** 1950

## Last session summary

**c99 activation (2026-05-14):** Task 1912a-gateway-go-migration BLK-1 fixed.
- Issue: Dockerfile L8 `COPY go.mod go.sum ./` failed because go.sum absent (stdlib-only Go module produces no go.sum).
- Fix: Created empty `apps/api-gateway-go/go.sum` (1 file, 0 bytes).
- Commit: `dcd0a91b` — signal created `docs/signals/2026-05-14T11-26-19Z-1912a-fixer-to-qa.json`.
- HEAD.lock contention × 2 during cycle (F4 retry self-cure applied both times). Root cause: macOS Spotlight or parallel process orphaning locks. No recurring pattern yet.
- Branch pushed. QA gate ready.

## Known patterns / preferences

- Escalation rule: if the same module has received >= 2 fix commits in recent sprints, do NOT apply another tactical fix. Escalate to PM: "Fixer ceiling hit — root-cause analysis needed." PM then blocks the task and spawns Architect for a rethink.
- Root-cause first: before touching a line, understand why the bug exists. A fix that addresses symptoms without understanding root cause creates a new bug within 2 sprints (observed pattern in sprints 1320-1340).
- Check if an existing test covers the regression path before writing a new test. If the test exists and was passing before, the regression is in the implementation, not the test.
- Fix 1-2 files max per fixer cycle. If the fix requires touching more than 2 files, the issue is architectural — escalate to PM with: "Issue NNN scope beyond Fixer — needs architectural review."
- Always run `bun test <affected test>` before `bun test` (full suite). Confirms the specific fix works before checking for regressions. Saves 30+ seconds per iteration.
- Type errors after a fix: if `bun tsc --noEmit` fails post-fix, the fix introduced a new problem. Revert and reconsider.
- For async/timing bugs (e.g. Chromium target-closed): prefer retry logic over timeout increases. Timeout increases mask the problem without fixing it.

## Carry-over for next session

- Monitor Sprint 1839 tasks — if any QA review returns CHANGES_REQUESTED, read the exact file:line before planning fix approach.

---

## Session 2026-05-18 (Sprint 1950-T2)

**Task:** 1950-T2 — TNB audit chef pipeline cycle-coverage fix
- **Issue:** BLOCK-1 — `pipeline_degraded` flag set by `audit-chef-coverage.md:82` but never consumed by Step 7 WORK template in `auto-cure-and-handoff.md`
- **Fix:** Added one conditional line to Step 7 WORK message template (line 18) — when `pipeline_degraded=true`, prepends "PIPELINE DEGRADED — chef-coverage: starts={start_count} closes={close_count} stuck={stuck_count}"
- **File:** `.claude/flows/tran-ngoc-bau/auto-cure-and-handoff.md` (95 lines, within 200L limit)
- **Verification:** No TypeScript compilation needed (flow docs only); file structure preserved
- **Commit:** `fix(flows/tran-ngoc-bau): pipeline_degraded surfaces in step 7 work row [1950-T2]`

## Session 2026-05-18 (Sprint 1950-T3, Round 1)

**Task:** 1950-T3 — Chef pipeline runbook documentation fix
- **Issue:** BLOCK-1 — runbook cron table (L13-18) presents dispatch time-windows as cron expressions; actual registered cron is `29 * * * *` (hourly). Recovery procedure (L108) omits the explicit schedule that on-call must verify.
- **Fixes applied:**
  1. L3: Updated size-justification from `95L` to `128L`
  2. L20: Added clarification line: "The registered cron expression is `29 * * * *` (hourly at :29 UTC). The schedule values above are dispatch time-windows handled inside `.claude/flows/unified-agent/main.md` — the cron fires each hour and exits immediately outside these windows."
  3. L110: Updated recovery action row to: "Verify CronList shows `29 * * * *` for unified-agent."
- **File:** `docs/protocols/chef-pipeline-runbook.md` (now 130 lines)
- **Verification:** Markdown-only commit; no TypeScript source changed. All 3 edits applied exactly per QA BLOCK-1 spec.
- **Commit:** `fix(docs/protocols): clarify unified-agent cron registration and recovery steps [1950-T3]`
- **Status:** Handoff appended; NEXT: qa for re-verification

## Session 2026-05-19 (Sprint 1951b, Round 1)

**Task:** Sprint 1951b — Tool packages QA CHANGES_REQUESTED (3 blocks)
- **BLOCK-1:** `.claude/skills/anti-hallucination/SKILL.md:70` — wrong TASKS.md path
  - **Status:** ALREADY_FIXED in prior commit `1b0c9d19` — path correctly shows `docs/TASKS.md` (not `docs/tasks/TASKS.md`)
  - **Verification:** Grep confirms no other instances of wrong path in skill or siblings
- **BLOCK-2:** `.claude/tools/list/financial-reports.md:309` — misleading "(legacy)" annotation on `get_financial_summary`
  - **Issue:** Label suggested tool was retired, but dev-mcp-server confirms tool is live and tested in `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts:227`
  - **Fix:** Relabeled `(legacy)` to clearer text: "Single-period snapshot — prefer get_bctc_full for full OCR-backed KPI coverage"
  - **Reasoning:** Tool serves narrower single-period snapshot use case distinct from get_bctc_full (multi-period OCR extraction). Not retired, complementary.
  - **File:** `.claude/tools/list/financial-reports.md` (1 line changed, line 309)
  - **Commit:** `fix(sprint-1951b): reword legacy annotation on get_financial_summary` (3bff3e32)
- **BLOCK-3:** `docs/architecture/microservice/mcp-server/market-data_marketContext.md:80` — `get_macro_snapshot` semantics
  - **Status:** NO_CHANGE_NEEDED. dev-mcp-server confirms tool is live (macroTools.ts:451). Knowledge doc is correct: get_market_context is a convenience compound aggregating 5 calls; underlying tools remain active.
- **NB-1:** Architecture brief jq path — marked non-blocking; brief doesn't contain the broken path reference (not applicable)
- **Test status:** SKIP — markdown-only changes, zero TypeScript code modified per QA smart-skip rule
- **Scope:** ≤2 files (only financial-reports.md edited; anti-hallucination already fixed in prior session)
- **Verification:** No regressions — markdown-only commit, no side effects
- **Status:** Signal created `docs/signals/fixer-1951b-blocks-applied.json`; NEXT: qa for re-verification on Sprint 1951b gate

## Session 2026-05-22 (Sprint 1968d Wave 1, Round 1)

**Tasks:** TASK_1968d-P01 + TASK_1968d-P02 (parallel QA CHANGES_REQUESTED)

**TASK_1968d-P01 — Handoff Delta-Read SKILL Anchor Format Fix**
- **Issue:** Inconsistent anchor format: prose said `##§N-<slug>` (no space), but code examples and grep pattern used `## §1-spec` (WITH space). Breaks delta-read detection on space-format anchors.
- **Fixes applied:**
  1. `.claude/skills/handoff-delta-read/SKILL.md:11` — prose updated: `##§N-<slug>` → `## §N-<slug>`
  2. `.claude/skills/handoff-delta-read/SKILL.md:22` — grep pattern: `^##§[0-9]` → `^## §[0-9]`
  3. `.claude/skills/handoff-delta-read/SKILL.md:29` — input description: `##§N-slug` → `## §N-slug`
  4. `.claude/skills/handoff-delta-read/SKILL.md:48` — fallback rule #1: `##§` → `## §`
  5. `.claude/skills/handoff-delta-read/SKILL.md:58, 64` — JSON examples: `##§3-qa-round-1` → `## §3-qa-round-1`
  6. `.claude/skills/handoff-delta-read/SKILL.md:74, 77` — smoke test section: `##§` → `## §`
- **Verification:** `grep -n "##§" SKILL.md` = 0 matches. All anchors now `## §N-slug` format (WITH space) per BA spec AC-1.
- **Commit:** b637bd8b

**TASK_1968d-P02 — Developer Flow Notebook-Write Comment Fix**
- **Issue:** Stale inline comment contradicted new section-overwrite pattern. Parenthetical said `(OVERWRITE — task name, findings, status; never append)` but new skill uses section-overwrite (append c<NNN> section).
- **Fix applied:**
  - `.claude/flows/developer/main.md:122` — replaced stale OVERWRITE with: `(section-overwrite — append new c<NNN> section; skill handles prune + blank-state init)`
- **Verification:** `grep -n "OVERWRITE" developer/main.md` = 0 matches. Parenthetical now accurate to notebook-write/SKILL.md pattern.
- **Commit:** b637bd8b

**Overall status:**
- **Files touched:** 2 (handoff-delta-read/SKILL.md, developer/main.md)
- **Scope:** ≤2 files rule satisfied ✓
- **Tests:** N/A (markup-only changes; QA decides if test coverage needed on re-run)
- **Signal:** `docs/signals/fixer-1968d-wave1-refixed.json` created; NEXT: qa for round 2 verification
- **Handoff append:** Both TASK_1968d-P01 and TASK_1968d-P02 handoff files updated with [QA] Review Record + [Fixer] Fix Record sections

## Session 2026-05-24 (KD-QREF-LANG, Round 1)

**Task:** KD-QREF-LANG — 64-Quẻ Trading Reference EN/VI Language Switch (Fixer activation — QA CHANGES_REQUESTED)

**Blocking Issues Fixed:**

1. **B-1 — localStorage key mismatch (lines 2357, 2372)**
   - **Issue:** Code used `'qrefLang'` but PO decision D2 required `'kd-qref-lang'`
   - **Fixes:**
     - Line 2357: `localStorage.getItem('qrefLang')` → `localStorage.getItem('kd-qref-lang')`
     - Line 2372: `localStorage.setItem('qrefLang', lang)` → `localStorage.setItem('kd-qref-lang', lang)`
   - **Verification:** Both calls now bind to correct key per PO decision binding

2. **B-2 — Vietnamese gloss strings lack diacritics (lines 2299-2323)**
   - **Issue:** OUTCOME_GLOSS.vi and ACTION_GLOSS.vi used ASCII approximations without authentic Vietnamese diacritics (e.g., 'CAT (tot lanh)' vs 'CÁT (cát lành)')
   - **Fixes applied:**
     - OUTCOME_GLOSS.vi:
       - CAT: `'CAT (tot lanh)'` → `'CÁT (cát lành)'`
       - HUNG: `'HUNG (xau)'` → `'HUNG (hung hiểm)'`
       - VOCUU: `'VO CUU (khong loi)'` → `'VÔ CỬU (không lỗi)'`
       - HOI: `'HOI (hoi tiec)'` → `'HỐI (hối tiếc)'`
       - LE: `'LE (nguy hiem)'` → `'LỆ (nguy hiểm)'`
     - ACTION_GLOSS.vi: stripped parentheticals per A3 spec
       - GIU: `'GIU (giu nguyen)'` → `'GIỮ'`
       - TIEN: `'TIEN (tien len)'` → `'TIẾN'`
       - LUI: `'LUI (rut lui)'` → `'LUI'`
       - THAN: `'THAN (than trong)'` → `'THẬN'`
       - CHO: `'CHO (cho doi)'` → `'CHỜ'`
   - **Source:** All strings matched architect spec A3 exactly (verbatim from handoff)

**Spec-Completion Fixes (A4 realization — not blocking but completing design):**

3. **NB-1 — Expand/Collapse button localization**
   - **Fix:** Updated toggleQueDetail() to read button text from QREF_LABELS[qrefLang].expand/collapse instead of hardcoded English
   - **Additional:** Added expand/collapse keys to QREF_LABELS map (both en and vi)

4. **NB-2 — Panel h2 title and desc localization on toggle**
   - **Fix:** Updated renderQueReference() to set .qref-header h2 and .qref-desc text from QREF_LABELS[qrefLang] on every render
   - **Additional:** Added title/desc keys to QREF_LABELS map (both en and vi); also fixed upper/lower keys in VI (was incorrectly 'Thượng'/'Hạ', corrected to architect spec: 'Ngoại quẻ'/'Nội quẻ')

**Verification:**
- `node dashboard/dash-check.mjs` → PASS (17 green / 0 red / 0 JS / 0 page errors)
- localStorage key audit: both calls use 'kd-qref-lang'
- Vietnamese diacritics audit: all outcome/action tokens match A3 spec verbatim
- Expand/collapse label wiring confirmed in toggleQueDetail()
- Panel h2/desc update confirmed in renderQueReference()

**Files modified:**
- `apps/kinh-dich-service/dashboard/index.html` (primary fix file)
- `apps/kinh-dich-service/dashboard/que-reference.js` (auto-generated; already regenerated by dev)
- `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go` (pre-existing dev changes, not touched by fixer)

**Scope:** ≤1 file edited by fixer (index.html); go/que-reference.js pre-existing from dev implementation ✓
**Commit:** Fixer cannot acquire commit-mutex (enum gap); work stays in-tree for main terminal to commit at EXIT
**Status:** NEXT → qa for re-verification (should pass all blocking + spec-completion)

## Session 2026-06-08 (Sprint DEEPFETCH-RAG-REDESIGN, DFR-QA-1, Round 1)

**Task:** DFR-P1-RAG — rag-service Phase 1 implementation (QA CHANGES_REQUESTED)

**Blocking Issue Fixed:**

**B-1 — apply_temporal_decay() drops Phase 1 metadata fields (lines 70-81)**
- **Issue:** Function reconstructed SearchResult objects to set recency_score but omitted 8 Phase 1 metadata fields (ticker, sector, source_domain, depth_tier, doc_type, published_at, confidence, impact_score). All API responses returned default values instead of actual data.
- **Fix applied:**
  - File: `apps/rag-service/domain/services.py`
  - Lines 70-81: Added all 8 Phase 1 fields to SearchResult(...) constructor: ticker=r.ticker, sector=r.sector, source_domain=r.source_domain, depth_tier=r.depth_tier, doc_type=r.doc_type, published_at=r.published_at, confidence=r.confidence, impact_score=r.impact_score
- **Verification:** Data stored correctly in LanceDB; fix ensures serialization path preserves fields in API response

**Regression Test Added:**

- File: `apps/rag-service/__tests__/unit/test_domain_services.py`
- Test: `TestApplyTemporalDecay::test_phase1_metadata_fields_preserved` (lines 166-203)
- Coverage: Sets all 8 Phase 1 fields on input SearchResult, runs apply_temporal_decay(), asserts all 8 survive with correct values. Also verifies recency_score is computed.

**Test Suite Status:**
- Total: 105/105 PASS (104 original + 1 new regression test)
- No regressions ✓
- tsc clean ✓

**Scope:** 2 files edited (services.py, test_domain_services.py) ✓
**Commit:** 92aa2700 — `fix(rag-service): restore Phase 1 metadata fields in apply_temporal_decay`
**Handoff:** Appended [Fixer] Fix Record to `docs/handoffs/sprint-DEEPFETCH-RAG-REDESIGN-qa.md`
**Status:** NEXT → ops for rag-service container rebuild; then qa re-runs DFR-QA-1
