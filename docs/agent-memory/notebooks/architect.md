# Architect — Notebook

**Last updated:** 2026-06-14 18:15 UTC | **Sprint:** KINHDICH-HOVER-ENRICH

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-14T18:15Z — ARCH-KINHDICH-HOVER-ENRICH RATIFY-1 (RATIFIED, CLOSED)

**Task:** ARCH-KINHDICH-HOVER-ENRICH | zone: apps/kinh-dich-service/ (single zone)
**Output:** Board transition KINHDICH-HOVER-ENRICH→ready (owner=dev-kinh-dich), ARCH task closed.

**RATIFY-1 verdict: Option C CONFIRMED — new `HoverSummary localized` field.**

**Brownfield findings (raw-read confirmed):**
- `queReference` struct (hexagram_reference.go L27-42): existing fields coreMeaning/stateInterpretation/favorable/warning all use `localized` type. `HoverSummary localized` fits identically — zero pattern deviation.
- `build()` closure signature (L105): `(id int, coreMeaning, stateInterpretation, favorable, warning localized, glosses []localized)`. Adding `hoverSummary localized` as 5th param (before glosses) is the minimal additive change.
- L2501 index.html confirmed: `loc(q.coreMeaning)` is the exact swap target. L2504 `loc(q.warning)` → `.qref-warning` unchanged.
- `coreMeaning` stays in struct, in que-reference.js, and in expanded detail section (L2508+). React frontend (gen-que-descriptions.ts → QUE-TOOLTIP-DRY) reads coreMeaning.vi — unaffected by this change.
- Zone: purely `apps/kinh-dich-service/` (Go struct + generated JS + static HTML). No cross-zone touch.

**BUILD-STANDARD:** not-applicable (new field inside existing zone, no new service/port/primitive).

**Service rebuild required:** YES. The Go binary serves the dashboard. After hexagram_reference.go change + que-reference.js regen, the container must be rebuilt for the new JS to be served. Dev-kinh-dich must flag to ops in commit message.

**QA LIVE gate confirmed well-formed:** QA must serve the running dashboard (not just file-inspect). Sample quẻ 47 + 29 + 1 for non-terse hoverSummary. Verify grep count=64 + python3 zero-short-strings check. Toggle EN↔VI. Click-expand quẻ 47 to confirm coreMeaning still visible in detail panel.

## 2026-06-14T16:00Z — FIX-REFINE-LOCK-TTL-RECLAIM Design Brief (DESIGN, REVIEW)

**Task:** FIX-REFINE-LOCK-TTL-RECLAIM | zone: apps/mcp-server/ (coordinationStore + refine_bctc_md flow)
**Output:** docs/architecture-briefs/2026-06-14-fix-refine-lock-ttl-reclaim.md
**next_agent:** dev-mcp-server

**Root cause confirmed (3 vectors):**
- V1 PRIMARY: flow/main.md calls task_heartbeat + task_release WITHOUT owner_agent → legacy-path (SERVER_SESSION_ID) → zombie after server rebuild → lock NOT released → orphaned.
- V2: claimTask Step 2 (UPDATE WHERE expires_at < now) is correct and works. TTL-steal is NOT broken. It was not reached because: (a) concurrent cowork-team log lag reported stale expires_at, or (b) an unrelated second claim within TTL window blocked the steal at 14:09Z. In either case, fixing V1 (proper release) eliminates the orphan condition.
- V3: Heartbeat guards expires_at >= now (correct). ttl_seconds=1000 (16.7 min) is tight for 7 × 120s chunk; recommended 1800s.
- Idempotency confirmed: push_bctc_refined_unit uses INSERT OR REPLACE on UNIQUE(report_id, unit_id). Sequential processing model + skip-set dedup makes TTL-steal safe.

**Fix (3 line changes in flow doc, zero schema changes):**
- Add `owner_agent: "refine-orchestrator"` to task_heartbeat (line 82) and both task_release calls (line 97 + error boundary line 101) in flow/main.md.
- Change ttl_seconds 1000 → 1800 (line 37).
- Ops: task_force_release_orphan for bdcfa5e0 immediately (heartbeat_at stale by hours).
- Regression tests T1–T5 in FIX-REFINE-LOCK-TTL-RECLAIM.test.ts (gate: tsc 0 + T1–T5 green).

**Key finding:** No changes to coordinationStore.ts or schema. Generic coverage: owner_agent path in heartbeat/release already covers all refine slot lock keys (same stable owner_agent "refine-orchestrator" regardless of slot-1 or slot-2 fire).
**BUILD-STANDARD:** not-applicable (bug-fix).

## 2026-06-14T10:45Z — SPIKE-DOCLANG-AUTHORED-DOCS (SPIKE, DONE)

**Task:** SPIKE-DOCLANG-AUTHORED-DOCS | zone: docs/ (all authored markdown)
**Output:** docs/architecture-briefs/2026-06-14-spike-doclang-authored-docs.md

**Verdict: NO-GO — authored docs stay markdown permanently.**

**Key findings:**
- Consumer Reality: 4 consumer categories found. (A) LLM raw-text via Read tool (dominant — no benefit from XML). (B) Shell grep `^## ` in notebook-write: P0 break if notebooks become .dclg.xml. (C) Claude Code YAML parser for .claude/agents/*.md and SKILL.md frontmatter: structurally incompatible with DocLang XML. (D) Hook wc-c + find *.md globs: monitoring blind if extension changes.
- Agent-MD constraint confirmed: `.claude/agents/*.md` (42 files) MUST start `---` YAML. DocLang XML header is structurally incompatible. Same for 55 SKILL.md files, 7 CLAUDE.md files.
- Benefit: zero. No consumer reads doc geometry, bboxes, or cross-page layout from authored docs. LLM reads prose equally well from .md or .dclg.xml but .dclg.xml breaks shell tooling.
- Blast radius: 585+ files if full conversion; all high-churn for zero gain.
- Scope narrowed: DocLang = extracted content only (scope 1, Phase 1 DONE). Scope 2 (authored docs) closed.

## 2026-06-14T09:45Z — ARCH-DOCLANG-SERIALIZE Design Brief (DESIGN, REVIEW)

**Task:** ARCH-DOCLANG-SERIALIZE | zone: apps/pdf-extractor/
**Output:** docs/architecture-briefs/2026-06-14-arch-doclang-serialize.md, docs/handoffs/BA-DOCLANG-SERIALIZE.md (appended)

**All 4 blockers resolved via brownfield inspection:**
- B-1: ExtractedTableDTO has 4 fields, no geometry. bbox_provider=None hook future-proofs Phase 2.
- B-2 (LOAD-BEARING): ocr_unit() returns ONE dict per logical unit (all pages stitched). ExtractLayoutFirstUseCase does NOT emit ExtractedTableDTO — that comes from old pdfplumber path. Serializer handles both shapes: single DTO = single table; same table_index DTOs = threaded pair.
- B-3: doclang==0.6.0, pip check clean, zero numpy dependency. saxonche needs JRE — validate removed from production hot path (test-only). Current install is editable; Dockerfile must install from PyPI/wheel.
- B-4: Synthetic fixture accepted per BA handoff §4. Two DTOs, table_index=0, page 4 + page 5.

**Key design choices:**
- Infrastructure: DocLangSerializer (pure), FilesystemDocLangWriteAdapter, NullDocLangWriteAdapter in one file
- Domain port: DocLangWritePort (17th port in ports.py), Protocol pattern matches existing
- Thread grouping: by table_index value in input list — no upstream change needed
- Spike promote: _escape_xml() verbatim; to_doclang_xml() → _serialize_group() with pad/warn/thread
- Validate call: REMOVED from DocLangSerializeUseCase hot path (RISK-1 JRE); test-only via host venv
- Config: doclang_output_dir, default /app/data/doclang
- BUILD-STANDARD: lean

## 2026-06-14T11:40Z — ARCH-CRON-SCHEDULER-RELIABILITY DESIGN COMPLETE — pipeline advanced to pm

**Task:** ARCH-CRON-SCHEDULER-RELIABILITY (recurring-bug escalation, recurrence_count 3)
**Brief:** docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md (FINAL)
**next_agent:** pm (for task breakdown into 3 sequential subtasks)

**Summary:** Brownfield confirmed 55 CRON keys / 50+ `cron.schedule()` calls in startScheduler.ts. node-cron v3.0.3 silent-drop bug confirmed. Library swap (croner, v4) REJECTED — 55 call sites + Bun risk. Selected 4-lever fix within existing lib:
- Lever 1: `recoverMissedExecutions: true` universally (50+ calls currently missing it)
- Lever 2: T4 idempotency dedup guards (cron_job_runs recency check at 90% cadence window) for ~26 non-idempotent jobs
- Lever 3: Deterministic jitter for 8 high-collision jobs in cronConfig.ts
- Lever 4: New `schedulerWatchdogJob.ts` — last_run age > 1.5× cadence → WORK alert or self-heal via wrapRun

**Phase ordering (HARD sequencing):** 1a dedup guards → 1b recoverMissedExecutions → 1c jitter → 2 watchdog
**IMPL gate:** FIX-MCP-CRASH-LOOP-WRITEWAL done_verified (09e2586b) clears the zone
**G1–G5 verification gate:** lives in board entry; maps to 3 new test files + live cron_job_runs probe

## 2026-06-14T00:15Z — FIX-MCP-CRASH-LOOP-WRITEWAL (DESIGN, REVIEW) [root-cause: WAL autocheckpoint defeated by concurrent readers; fix: runForcedTruncateCheckpoint every 30min + wal_autocheckpoint 4000→1000]

## 2026-06-13T21:00Z — FIX-COWORK-GUARANTEED-BACKSTOP (DESIGN, REVIEW) [Option A: restore 5 Layer-A RemoteTriggers; dedup gate on last_fired wall-clock; deletion lock added to cowork-schedule.json]

## 2026-06-12T22:10Z — BCTC-ANALYTICS-LAYER Refine Ruling (DESIGN, REVIEW) [BUG1: BEQ-7 section guard + PARTIAL override fixed via SQL subquery; BUG2: extraction_confidence formula added; BUG3: Zod strips ticker/report_id params fixed]
