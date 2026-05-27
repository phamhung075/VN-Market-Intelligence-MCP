# PO Notebook

## Cycle 2026-05-27T20:01:02Z — NEWS-CMD spec approval gate (APPROVED + 2 product calls)

**Input:** BA returned `docs/REQ_NEWS-CMD.md` (6 FR + 6 NFR, DDD map, 8 test scenarios, file table,
done-bar). BA confirmed all 4 kickoff handoff claims against live code; added the `summary` column to
the `/news` query (correct — it IS the Vision's "one-line gist"; absent from newsFetchLiveHandler.ts,
present in schema-news.ts). BA deferred B1 (chunking) + B2 (fallback window) to architect.

**VERDICT: APPROVED.** Spec faithfully covers scope + all 5 hard constraints (plain VN/FR-4+NFR-1;
no silent truncation/FR-6; empty-DB fallback/FR-5; never-throws/NFR-4; pull-only no-push/NFR-2+3).

**Two product calls made at the gate (REQ § 11 PO RULING — don't punt UX to architect):**
1. **B1 chunking — Option B REJECTED.** Single-message cap + "thêm" affordance violates the binding
   goal "get all content" AND Hard Constraint 3 "no silent truncation" (AC-FR6-4(ii) itself concedes
   it "does not guarantee all content"). MANDATED Option-A family: deliver ALL stories via sequential
   multi-message split at story boundaries. Architect's ONLY remaining decision = the exact single-zone
   implementation contract (CommandResult `texts?:string[]` + webhook loop, OR handler-driven sends, OR
   chunker helper). Default cap 20 / clamp [1,50] = query cap, NOT a delivery cap — no count-shrink to dodge chunking.
2. **B2 fallback — SETTLED (not deferred).** Fallback = most-recent N, NO date window (24h/3-day window
   can return empty on a quiet weekend → re-introduces the empty problem). Header MUST switch to
   "Tin tức gần đây" when fallback active so non-technical user knows data isn't today. AC-FR2-5 +
   AC-FR4-5 confirmed/made mandatory. Architect just restates these as confirmed inputs.

**Net:** architect NEWS-CMD-DESIGN is now effectively ONE decision (chunking contract); keep brief small.

**Docs touched (UNSTAGED — main terminal commits):** `docs/REQ_NEWS-CMD.md` (status→APPROVED + § 11
PO RULING, AC-FR6-4 amended/Option-B struck), `docs/TASKS.md` (NEWS-CMD-BA→DONE, NEWS-CMD-DESIGN→READY
with pre-settled B1/B2 in the cell + SPEC-GATE note). NO code touched.

## Carry-over
- NEWS-CMD-DESIGN READY → architect writes the chunking-contract design note → dev-mcp-server IMPL.
  B1/B2 are LOCKED at PO level — architect must NOT re-open (esp. must NOT revive Option B / a date window).
- NEWS-CMD-EXIT (PO gate) stays BLOCKED on QA; goal ARMED until USER confirms it reads usefully (G9).
- Channel audit still owed — flagged for main terminal next cron tick (gateway call_tool unavailable in PO toolset).
- CHEF-ATTN-BA still READY (separate apps/mcp-server sprint, different files — no NEWS-CMD collision).
- PEK-INTEGRATE goal ARMED until USER verbal G9; PEK-MULTIPAGE READY (apps/pdf-extractor zone).
