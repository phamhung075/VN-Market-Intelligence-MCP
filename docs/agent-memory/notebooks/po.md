# PO Notebook

## c · 2026-06-07T04:17Z — DEV-TEAM TRIAGE (5 dashboard signals + 4 carry-forwards; retry of 502-died run, executed fresh)

**Inputs:** pendingSignals=5 (sau-* dashboard rows, all READ this drain); telegram 0 new / 0 unresolved; board WIP=0, backlog=31; TNB c88 file already double-ACKed (c89 ACK 2026-06-06T22:24Z, no new cycle) — no re-ACK; branch=main only.

**Verified before deciding (raw, not badges):**
- push-sbv-rates: `interface/mcp/server.ts` ~L692 `typeof usdVndOfficial !== "number"` rejects string-typed numerics — ops suspicion CONFIRMED in code. LIVE-UNHEALTHY now.
- CTG carry-over WATCH **TRIPPED**: live `get_bctc_full(CTG)` → "Chưa có dữ liệu BCTC"; bctc-analyst notebook = 19th cycle blocked; fleet refine cron did NOT pick up 49c11ce2 → cut UNBLOCK per carry-forward rule + prior-cycle escalation condition.
- BCTC SLA: calendar-exemption infra exists (`freshnessSlaChecker.ts`, d71e3f2e covers news+sbv_fx) — bctc NOT covered; fix mirrors proven pattern.
- agent-md-factory skill: confirmed MISSING from disk (.claude/skills/) while memory references it.
- VNM/VEA red: deduped to merged 62ef64fe serve-guard (board DONE this morning); HPG/PPC cause unverified → SPIKE not FIX.

**BATCH returned (6 entries, dispatcher sequences under WIP ≤2):**
1. FIX-SBV-PUSH-TYPE-COERCE (HIGH, apps/mcp-server) — coerce+guard numeric body fields.
2. UNBLOCK-CTG-REFINE-DRAIN (HIGH, apps/mcp-server) — refine pipeline never drains PENDING 49c11ce2; architect escalation if design flaw.
3. SPIKE-BCTC-EVAL-HPG-PPC (timebox 120) — same OCR fingerprint as VNM/VEA or new failure mode?
4. FIX-BCTC-SLA-WEEKEND (S, apps/mcp-server) — extend calendar exemption to bctc signalType.
5. FIX-AUDITOR-FLOW-RESIDUALS (M, docs/agents/system-auditor/, route agent-father) — weekend-aware C-01/C-02/C-14 + Tier-2 docker-exec sqlite3 residuals (C-06/C-07/B-09/B-13, L292 WAL) + L438 skip×3 root-cause (recurring-bug policy) + agent-md-factory restore-or-deref.
6. CLEAN-ESC-LOCK-FPT (XS) — verify+release orphaned lock esc-datacov:FPT:Q1-2026:ESC-3 or add board row if escalation live.

**Signal dispositions:** sau-sbv-push→TASKED(1); sau-bctc-eval-red→VNM/VEA DEDUPED-to-62ef64fe + HPG/PPC TASKED(3); sau-bctc-sla-breach→TASKED(4); sau-d4→TASKED(6); sau-auditor-c01-weekend→FOLDED(5). Dispatcher flips rows; PO wrote NO orch-state edits (read-only triage honored).

**Deferred (stay backlog, unchanged):** TECH-DEBT-LINTING (med), FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS (low), FIX-FETCH-VERYSTALE-LABEL (parked), HEADROOM-COMPRESS-P1 (P3).

**Carry-over (next PO cycle):**
- Verify FIX-SBV-PUSH-TYPE-COERCE live: vn-sbv-fetch back HEALTHY via real VPS push, not test-only.
- Verify CTG serves real figures post-UNBLOCK: get_bctc_full(CTG) raw values, not refine_status badge.
- 10 yellow BCTC eval rows: re-check after HPG/PPC spike verdict — may share root cause.
- Sunday SLA proof window: FIX-BCTC-SLA-WEEKEND must show bctc exempt next weekend tick.
- Still open: FIX-ORCH-DONE-GRID-COLS live-verify post-rebuild; SPIKE-C44-PARALLEL-PROOF gate on WF-3 sub-task D Phase-4; rtr-bctc-playwright queue-drain proof.
