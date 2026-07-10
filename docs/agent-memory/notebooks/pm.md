# PM — Notebook

## c326 D3-BACKLOG-HYGIENE-NORMALIZE-TODO-DEFERRED · 2026-07-10T20:35Z

**MANDATE:** Normalize 62 backlog rows with TODO/DEFERRED status → status:BACKLOG. Per architect brief §8, pure relabel (low risk, no data claim), run first to achieve biggest warning-count drop (133→71). Preserve old status values in verify_note field.

**OUTPUT:** All 62 TODO/DEFERRED rows in backlog lane successfully normalized to BACKLOG status. Disposition bucket: confirm-relabel=62, confirm-move=0, exception=0. Every row's prior status (TODO or DEFERRED) preserved in verify_note field as "prior_status=<STATUS>", appending if verify_note already existed.

**COHERENCE WARNINGS:** Before 133, after 71. Exact drop of 62 warnings = 100% of TODO/DEFERRED rows targeted.

**BOARD MUTATION:** 62 backlog rows: status TODO/DEFERRED→BACKLOG (via `jq -f .../d3_normalize.jq | orch-apply.sh`). D3 task row moved backlog[]→done_verified[], status TODO→DONE_VERIFIED, added triage_result field with disposition buckets. Validator re-run confirmed coherence count: 71 warnings live.

**VERIFICATION:** Ran `bun scripts/orch-validate.mjs` post-mutation: 71 coherence warning(s) reported (down from baseline 133). Gap exactly matches the 62 rows modified (TODO/DEFERRED→BACKLOG).

**NEXT:** D2.5 (schema decision on BLOCKED lane) and D1 (terminal-row eviction) remain unblocked per original plan. D3 now DONE_VERIFIED, ready for router to acknowledge completion.

---

## c325 D0-BACKLOG-HYGIENE-TERMINAL-ROW-TRIAGE · 2026-07-10T19:45Z

**MANDATE:** Per-row triage of 88 backlog/review rows carrying terminal-looking status labels that `orch-cold-evict.sh` never evicted (root cause: script has zero code path touching `task_board.backlog[]`). Output: machine-parseable confirm-terminal/exclude/relabel buckets for D1's eventual execution.

**OUTPUT:** 88 rows triaged (67 backlog + 21 review) — 73 confirm-terminal, 4 exclude, 11 relabel. 2 exceptions carried forward from architect's spot-check (not re-triaged): FACTORY-INTERFACE-split-server-ts (CONFIRM-TERMINAL, all 4 stage commits live-verified) and FIX-BCTC-BANK-SUMMARY-MAPPING (EXCLUDE, genuinely-open P1 defect reproduced via live DB probe same-day). Full bucket detail: `.task_board.done_verified[id=D0-BACKLOG-HYGIENE-TERMINAL-ROW-TRIAGE].triage_result`.

**BOARD MUTATION:** D0 row moved backlog[]→done_verified[], status TODO→DONE_VERIFIED. Commit 26ffe7567.

**NEXT:** D1-BACKLOG-HYGIENE-SWEEP-EXECUTE unblocked (still depends on D4 landing the extended orch-cold-evict.sh). D3/D0(this)/D4 were dispatched in parallel this tick.

**ROUTER NOTE (2026-07-10T20:00Z):** the D0 agent's own notebook write did NOT land — its edit deleted the pre-existing c324 entry (D3A unblock + FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS mint, 2026-07-10T12:30Z) and added nothing in its place; this c325 entry was reconstructed by the router from the agent's verified board write + commit message. Root cause: `scripts/agents-flow/notebook-auto-prune.sh` (PostToolUse hook) assumes notebooks are oldest-first when pruning past 200L, but pm.md is prepend-style (newest-first) — already tracked as `FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION` (BACKLOG, created 2026-07-10T11:20Z). This is the 3RD confirmed data-loss instance this session (prior 2 documented in that row's own note + the c322 entry below). Escalated: that row promoted to `ready[]` for immediate dispatch.

---

## c324 FIX-BCTC-D3A UNBLOCK + FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS BACKLOG MINT · 2026-07-10T12:30Z

**MANDATE:** D2 (FIX-BCTC-D2-ENSURE-SHELL-ROW) landed DONE_VERIFIED — unblock D3A (FIX-BCTC-D3A-PEK-TRIGGER-HELPER, which has `depends: [D2]`), and mint a follow-up task for a data-integrity gap QA found outside D2's scope.

**OUTPUT:**
1. `FIX-BCTC-D3A-PEK-TRIGGER-HELPER` moved backlog[]→ready[] (status=READY, owner=dev-mcp-server, dependency D2 satisfied). D3B/D3C/R-HIGH-1/R-HIGH-2 correctly remain BACKLOG, their own unmet dependencies unmodified.
2. New task `FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS` minted into backlog[] (status=BACKLOG, priority=high, zone=apps/mcp-server/, owner=dev-mcp-server, dep: D2) for a serve-layer validation_status gate gap: `get_financial_summary` and `compare_financials` in apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts lack validation_status guards. D2 introduces validation_status='pending_extraction' shell rows with extraction_confidence=0 + NULL financial data; these two tools render "0.0 tỷ VND" output (less severe than pre-fix false-100% claim, but still unclean). Unlike `get_bctc_full` (which gates refine_status='PENDING' via PUB-1 check in bctcFullTools.ts), reports.ts has no validation_status gate. QA flagged as non-blocking backlog finding; mirrors recurring bctcIdentityGuard.ts precedent (gate belongs at serve layer, not per-ticker patch). Next agent: architect (may decide design pass vs direct mechanical fix pickup).

**BOARD MUTATIONS:** `.task_board.ready[] += [D3A]` (unblock), `.task_board.backlog[] += [FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS]` (mint new).

**ROUTING:** No dispatch triggered — both tasks are now queued for their respective owners' next cycle. Head.next_agent remains `pm` per flow contract (pm never dispatches; terminal router routes the ready[] tasks onward).

**NEXT:** Head yields to main terminal. Router will dispatch D3A to dev-mcp-server, route FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS to architect for design triage (or skip architect if determined mechanical enough).

---

## c322 FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION DECOMPOSITION · 2026-07-10T12:00Z

**MANDATE:** Decompose architect's D1/D2/D3 design (`docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md`) into atomic dev-mcp-server tasks, D1 sequenced first per architect's explicit ordering (data-integrity fix that D2/D3 depend on).

**OUTPUT:** 7 atomic tasks minted into `.task_board.backlog[]`, zone `apps/mcp-server/`, owner `dev-mcp-server`: FIX-BCTC-D1-STABILIZE-REPORT-ID (no deps), FIX-BCTC-D2-ENSURE-SHELL-ROW (dep: D1), FIX-BCTC-D3A-PEK-TRIGGER-HELPER (dep: D2), FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS (dep: D3A), FIX-BCTC-D3C-RECONCILE-JOB + FIX-BCTC-R-HIGH-1-STATUS-ENUM-UPDATE + FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (all dep: D3B). Parent moved ready→in_progress with decomposed_into metadata. Journal: STEP pm-S5.

**NOTE (router-appended 2026-07-10T12:05Z):** this entry was reconstructed by the router — pm's own notebook write did not land on disk (agent claimed a "c322" entry in its return summary; file had no such content). Journal entry (pm-S5) and board mutations DID land correctly. Router also caught+fixed a 3rd occurrence of the status-flip≠lane-move bug here: all 7 new rows were minted status=READY but left in backlog[] lane (coherence-validator mismatch, invisible to BOUNDED-1). Fixed: D1 moved to ready[] (genuinely unblocked); D2..R-HIGH-2 relabeled READY→BACKLOG in place (blocked on unmet depends[]). See FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE (bumped to P1).

**NEXT:** dev-mcp-server on FIX-BCTC-D1-STABILIZE-REPORT-ID only — D2 onward stay BACKLOG until D1 lands DONE_VERIFIED.

---

## c321 SPIKE-BCTC-CTG-BS-REALDATA-ROOT ARCHITECT DISPOSITION APPLICATION · 2026-07-03T07:45Z

**MANDATE:** Apply architect disposition for SPIKE-BCTC-CTG-BS-REALDATA-ROOT (architect complete, committed 2026-07-03) — mint 2 new composite tasks, mark 1 superseded, stub 1 backlog, re-parent 2 W5 blocked rows.

**ARCHITECT BRIEF:** docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md — Full root-cause recon (3 stacking bugs in apps/mcp-server: parser column-order, classifier bold-tolerance, section-vocabulary) + fix design split by layer. Verdict: FIX-BCTC-BANK-BS-SECTION-CLASSIFIER undersell—root cause is DOMINANTLY parser + section-detection, not primarily classifier.

**INPUT:**
- Architect disposition field in .task_board.review[FIX-BCTC-BANK-BS-SECTION-CLASSIFIER]
- Current orch-state.json .task_board lanes (review, backlog, active_sprints, done)
- Blocking W5 tasks (TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST in review, W5-FU-CTG-REFINE-96e36139 in active_sprints)

**OUTPUT:** 4 orch-state rows created/modified:
1. **FIX-BCTC-BANK-BS-COLUMN-ORDER** (NEW backlog, type=FIX, zone=apps/mcp-server/, priority=high, size=L) — composite FIX-A+FIX-D+FIX-C: parser column-order + section-vocabulary + real-markdown regression fixture
2. **FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP** (NEW backlog, type=FIX, zone=apps/mcp-server/, priority=high, size=S) — independent FIX-B: strip markdown emphasis from anchors
3. **FIX-BCTC-BANK-BS-SECTION-CLASSIFIER** (superseded, moved review→done, superseded_by=FIX-BCTC-BANK-BS-COLUMN-ORDER, retain 3 shipped RC fixes)
4. **FIX-BCTC-BANK-SUMMARY-MAPPING** (marked DONE/superseded, scope fully owned by #1)

**BOARD MUTATIONS:**
- .task_board.backlog += [FIX-BCTC-BANK-BS-COLUMN-ORDER, FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP] (2 new)
- .task_board.review -= [FIX-BCTC-BANK-BS-SECTION-CLASSIFIER] (remove from review)
- .task_board.done += [FIX-BCTC-BANK-BS-SECTION-CLASSIFIER with superseded_by + status_note] (add to done)
- .task_board.backlog[FIX-BCTC-BANK-SUMMARY-MAPPING].status = "DONE", superseded_by = "FIX-BCTC-BANK-BS-COLUMN-ORDER"
- .task_board.review[TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST].blocked_on = "FIX-BCTC-BANK-BS-COLUMN-ORDER — <root cause rationale>"
- .task_board.active_sprints[W5-FU-CTG-REFINE-96e36139].blocked_on = "FIX-BCTC-BANK-BS-COLUMN-ORDER — <root cause rationale>"

**NEXT AGENT:** dev-mcp-server (both tasks route to same zone; no dispatch ordering constraint between them — PO-triage determines which dev spawns first). Head.next_agent remains `pm` (no dispatch occurs in this cycle, backlog populated for later triage).

---

## Archive (pre-2026-06-28)

[21 cycles archived: 2026-06-27 — 2026-06-23. Recent cycles retained above for active context.]

**Key PM decisions:**
1. Accepted architect atomization as-written (no renegotiation; CONF-1..CONF-4 all ratified)
2. Blocked TASK-CONF-2 explicitly to enforce sequential deployment (frontend AC requires backend DB state)
3. Set done_verified gates on LIVE probe, not build-green (self-confirming test failure mode lesson applies)
4. Left legacy 3316 confidence=50 rows untouched (FR-5: no backfill, honest honesty posture)

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
