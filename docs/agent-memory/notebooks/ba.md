# BA — Notebook

**Last updated:** 2026-05-27T21:30Z | **Sprint:** SELF-IMPROVE-GATE (SIG-IMPL-GATE-BA)

> Archive: `docs/archive/notebooks/ba-2026-05-21.md`

## RECAP-CMD-BA · 2026-05-28

Sprint RECAP-CMD spec complete. REQ file: `docs/REQ_RECAP-CMD.md`. Three commands decomposed: `/recap` (7 sections from `EveningSummary` — VN-Index, movers, news, alerts, portfolio P/L, foreign flow, header), `/recapw`+`/recapm` (5 sections from `PeriodicSummary` — header, totals, key events, stock moves, alert breakdown). All Vietnamese section labels locked. `summaryText` / `recommendation` / numeric `impact` BANNED from output. `stripHtml` coordinated with NEWS-FULLDAY — reuse, do not duplicate. Handler signatures async, returning `{ texts: string[] }`, router wiring mirrors `/news` branch. Test matrix: T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4. Two architect-deferred items: B1 (section-block overflow split for blocks > 4096 chars), B2 (test injection strategy: wrapper fn vs real assembly with in-memory DB). No PO blockers. TASKS.md RECAP-BA → DONE/REVIEW. Files left UNSTAGED. NEXT: po (spec-review gate). PIPELINE: continue.

## NEWS-FULLDAY-BA · 2026-05-27

Sprint NEWS-FULLDAY spec complete. REQ file: `docs/REQ_NEWS-FULLDAY.md`. Three defects decomposed into testable ACs: FR-1 (full-day coverage — remove silent DEFAULT_LIMIT=20), FR-2 (dedup key = normalized source_title, 5-step normalization, highest-impact survivor), FR-3 (stripHtml — module-level export, dependency-free, called before dedup and before 200-char truncation). Test matrix T-NEWS-9..12 + T-STRIP-1..7 added to spec. Two architect-deferred items: B1 (LIMIT removal vs large ceiling), B2 (fallback cap value). stripHtml scoped as shared helper for RECAP-CMD convergence. No PO blockers. TASKS.md NEWS-FD-BA → DONE/REVIEW. Files left UNSTAGED. NEXT: po (spec-review gate). PIPELINE: continue.

## SIG-IMPL-GATE-BA · 2026-05-27T21:30Z

Sprint SELF-IMPROVE-GATE Phase 2 decomposition complete. REQ file: `docs/REQ_SIG-IMPL-GATE.md`. 5 dev tasks + 1 QA task, 36 minimum new unit tests. Files left UNSTAGED per commit-discipline. NEXT = architect technical blueprint (SIG-IMPL-GATE unblocked).

Key decisions encoded:
- TASK-5 (C-4 per-path kill-switch) is standalone with explicit REJECT clause for single-global-flag anti-pattern in AC-T5-4.
- TASK-4 (D-IMPROVE bridge) fail-loud-skip isolation from TASK-3 pipeline is AC-T4-6 (C-5 hard requirement).
- TASK-6 (QA gate-proof) has AC-T6-5: if gate doesn't go red → lane demotion to lane-A, must be recorded explicitly (feedback_fence_false_green).
- C-1 structured `target_agent`/`target_files[]` in AC-T4-1..3 with UNRESOLVED fallback for `_default` entries.
- SPIKE §12 AC-1..AC-8 fully mapped to TASK-2/TASK-3 ACs.
- Cron collision detail for architect: `bctcOverdueCheck='0 9 * * 1-5'` (weekdays) vs new `'0 9 * * *'` (daily) — same minute. Surfaced as detail; not a blocker.
- Two open design points for architect: (i) per-path kill-switch keying scheme with a TypeScript suggestion; (ii) proposal-doc slug derivation + fix_area→target_agent mapping. Neither requires PO input.
- Zero PO blockers.

## NEWS-CMD-BA · 2026-05-27T20:00Z

Sprint NEWS-CMD decomposition complete. REQ file: `docs/REQ_NEWS-CMD.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect NEWS-CMD-DESIGN BLOCKED until PO approves.

Key findings from codebase verification:
- `handleTelegramCommand` switch in `telegramCommands.ts` is the correct and only insertion point. `/news` grep-clean confirmed.
- `webhookHandler.ts` reply path confirmed: sends ONE `CommandResult` per command — chunking mechanism is a real design decision for architect (B1).
- `rag_analyses` table has `summary` column (NOT exposed by `newsFetchLiveHandler.ts` — that handler only exposes `source_title`, not `summary`). The BA spec explicitly includes `summary` as the one-line gist field.
- `midnightVietnamAsUtc()` pattern exists in `assembleEveningSummary.ts` — replicable inline in `telegramCommands.ts`; must NOT be imported (infrastructure file must not import from application layer).
- `newsFetchLiveHandler.ts` orders by `created_at DESC`; the correct order for `/news` is `impact_score DESC, created_at DESC` (established by `assembleEveningSummary.ts`).

Two architect-deferred design points (B1 = chunking mechanism: Option A multi-text CommandResult vs Option B single-message conservative cap; B2 = fallback window definition + header wording). No PO blockers.

## PEK-BA · 2026-05-26T21:00Z

Sprint PEK-INTEGRATE decomposition complete. REQ file: `docs/REQ_PEK-INTEGRATE.md`. Handoff appended: `docs/handoffs/TASK_PEK-INTEGRATE.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect PEK-DESIGN BLOCKED until PO approves.

Key decisions encoded as requirements:
- REQ-PEK-0: Pristine invariant baked in as a hard CRITICAL requirement — 3 git-diff ACs so QA can prove it at close.
- REQ-PEK-1: Trimmed task set (layout+table+ocr, no formula) + table model pick flagged as architect-deferred (a); StructEqTable = biggest RAM risk, explicitly named.
- REQ-PEK-2: 8GB hard ceiling + CPU-only + no-kernel-panic encoded as testable ACs (RSS capture by ops, fleet running simultaneously). Topology decision flagged as architect-deferred (b).
- REQ-PEK-3: Docker hygiene gap explicitly named (COPY . . + missing .dockerignore entry) — architect decision (c) must fix; weight-cache lifecycle AC included.
- REQ-PEK-4: Lazy-load + per-process RSS cap encoded as 4 ACs; architect decision (d) must specify the init pattern and cap value.
- REQ-PEK-7: Scale-pilot done-bar applied — 5 prior false-greens; direct market.db arbiter clause, NOT-RUN ≠ green, corpus pass-rate (not one doc). FPT Q4 2025 sentinel values baked in as a regression anchor.
- REQ-PEK-8: LF-OVERLAY reuse flagged as a PRESERVATION requirement — architect must reference the §3 contract from the LF-DESIGN brief and not reinvent a parallel overlay schema.
- 4 architect-deferred decisions correctly left open with RAM-number gate. No PO blockers.

## LF-BA · 2026-05-26T18:30Z

Sprint BCTC-LAYOUT-FIRST decomposition complete. REQ file: `docs/REQ_BCTC-LAYOUT-FIRST.md`. Handoff appended: `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect LF-DESIGN BLOCKED until PO approves.

Key decisions encoded as requirements:
- REQ-LF-0: AC-0 generic-by-construction — geometry is the spine, anchors are hints only; grep-proof clause baked into ACs.
- REQ-LF-1: Root-cause fix named requirement — FPT Q1 2026 page 5 scramble fixed by Tier-0 logical-unit grouping (schema inheritance path). Page 41 anchor-overload case encoded as a testable AC.
- REQ-LF-4: Tier-3 invariant gate as anti-false-green mechanism; DIRECT market.db arbiter clause (never the endpoint); quarantine path required.
- REQ-LF-7/8: Deliverable 2 split at service boundary — pdf-extractor emits JSON, mcp-server renders toggle. 3 architect-open questions flagged (schema, JSON contract, quarantine storage).
- No PO blockers. All 6 PO decisions (A-F) pre-resolved.
- Done-bar encoded as 7-point gate including user verbal G9.

## c250 · 2026-05-22T05:10Z

Sprint 1968d decomposition complete. 3 handoff files emitted (P01/P02/P03). 3 TASKS.md rows added. Signal: `docs/signals/ba-1968d-spec-ready.json`. NEXT: po spec review.

Key decisions:
- P01 (L-10 delta-read): 2-file scope (skill + qa/developer flows). Backward compat via full-read fallback on missing anchor or >24h stale. Anchor format `## §N-slug`.
- P02 (L-12 notebook diff-write): 1-file scope (skill only). 3-cycle retention, prune oldest via Edit, blank-state fallback. 200L file bound post-write.
- P03 (L-14 zone caveman): 1-file scope (caveman skill only). Additive-only, no base-tier modification. BCTC zone entry marked FROZEN-NFR3. Gated on P01+P02 QA APPROVED — anchor convention from P01 may appear in P03 examples.
- All 3 tasks: owner=agent-father, zone=`.claude/` only, no apps/* collision with active 1971/1970/1972. WIP cap honored.
- No PO blockers identified.

## c1 · 2026-05-21T20:20Z

Sprint 1967 orchestration audit decomp. REQ_1967.md written. 7 atomic REQs, NFR-1..5, 0 PO blockers.
Signal: `docs/signals/ba-1967a-spec-ready.json`.

Key decisions:
- Surface 4f + 6b flagged as cross-sprint with 1968 L-3/L-1/L-2 — evidence input only.
- Superseded architect brief treated as supplementary evidence.
- Glossary section added (race, idempotency, recursive spawn, dispatcher-wrap, CAS, dead-handoff, stale-race).

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together (tightly coupled).
- globalSourceTracker is globalThis singleton — test isolation: check _resetGlobalSourceTracker() in beforeEach.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- SBV portal DOWN; rates from VCB XML proxy — tier 2.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- TASKS.md: always check wc -l before adding rows. Current ~150L post-1968d rows.

## Carry-over (next session)

- 1968d agent-father wave 1 in flight after PO approval — watch for qa-1968d-p01-done.json + qa-1968d-p02-done.json to gate P03 dispatch
- 1967b architect brief — surfaces confirmed, awaiting PO approval signal
- 1948e-fix: `"legal_risk"` to SignalTypeSchema enum + stage-signals.md dispatch block (6h dedup guard)
- 1909b (get_bctc_ocf): sequence AFTER 1890a-B — shared agentBootstrap/SKILL_MANIFEST merge risk
