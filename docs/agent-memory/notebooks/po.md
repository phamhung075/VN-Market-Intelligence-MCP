# PO Notebook

## Last updated: 2026-05-14T20:24Z (c110 — UNBLOCK-CRITICAL 1915 BCTC pipeline silence)

---

## Cycle 110 — 1915-bctc-pipeline-silence (UNBLOCK-CRITICAL, T-~9h from banking window)

**Spawn context:** main-terminal handed me an ops report directly (no pendingSignals[] file — verbal handoff via user message). Banking Q1-2026 BCTC filing window opens 2026-05-15 02:00-09:00 UTC (~6-13h from now). 7 watchlist banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) will land in SSC; pipeline must accept them.

### Ops signal payload (verbatim)
- `financial_reports` table: 0 rows
- `pdf_extracted_text` table: 0 rows
- `bctcReparseJob` logs frozen 2026-04-09 (35d, no activity)
- 2 watchlist PDFs on disk (VNM + VEA Q4-2025) never extracted
- Last good run 2026-04-09
- 3 ops root-cause candidates: (1) scheduler reg lost after container restarts c95-c97 / 1912c Go migration, (2) `fetchParseAndStoreBctc` swallow, (3) empty feedback queue / discovery upstream broken

### Decisions
1. **Queue `1915-bctc-pipeline-silence` as UNBLOCK-CRITICAL.** Highest priority — blocks 1909c AC-4/5, `get_bctc_ocf` tool, FA Layer 7 G-step.
2. **SPIKE-first (2h timebox)**, not direct FIX. Three ops candidates are mutually exclusive; cannot guess. SPIKE confirms ONE root cause + emits targeted FIX as separate task. Cannot afford full SPRINT-M ceremony with T-~9h.
3. **Zone `apps/mcp-server/`** — both `bctcReparseJob` (scheduler/financial-reports/) and `fetchParseAndStoreBctc` (application/usecases/) live there. Verified via grep.
4. **Owner: dev-mcp-server.** Service-scoped.
5. **Recurring-bug rule check**: 1908a/b/c + 1909a/b/c are extractor-accuracy work (same domain). This signal is **upstream pipeline silence** (no extraction happens at all) — different failure mode. NOT a recurring-bug trigger. Proceed without architect-rethink gate.
6. **1909c-reparse-validation** stays HOLD — now blocked by 1915 in addition to calendar. Cannot exercise reparse on Q1-2026 PDFs until ingestion live.
7. **Channel audit skipped this cycle** — MCP gateway 9th consecutive cycle blocked (1913 USER F1). Verbal ops handoff is the substrate signal per cowork-error-boundary notebook-evidence mode.

### Recurring-bug compliance
- 1915: 0 prior fix commits on `bctcReparseJob` registration or `fetchParseAndStoreBctc` swallow paths. Rule N/A.
- Different failure mode than 1908/1909 (upstream ingestion vs. extractor accuracy).

### BATCH return
```
[{
  type: "SPIKE",
  id: "1915-bctc-pipeline-silence",
  title: "bctc-pipeline-silence-triage",
  question: "Which of 3 ops root-cause candidates is real: (1) bctcReparseJob unregistered post-container-restart, (2) fetchParseAndStoreBctc silent failure, (3) empty feedback queue / discovery upstream broken?",
  mode: "spike",
  zone: "apps/mcp-server/",
  timebox: 120,
  deadline: "2026-05-15T02:00:00Z"
}]
```
Dev-team router: spawn architect→ba→dev-mcp-server SPIKE chain immediately. SPIKE output `reports/SPIKE_1915-bctc-pipeline-silence.md` + carry-forward FIX task.

### Signal drop
None this cycle — task created in TASKS.md is the authoritative signal. Dev-team picks up via routine triage.

### Carry-forward to c111+
- 1915 SPIKE result: confirmed root cause + FIX task ID — needs PO review before merge (CRITICAL gate).
- Post-FIX: verify 2 PDFs (VNM+VEA Q4-2025) extracted, `financial_reports`/`pdf_extracted_text` > 0, log entry within 1h.
- 1909c-reparse-validation un-HOLD once 1915 FIX merged + banking cohort PDFs extracted.
- 1913 USER F1 still pending (9th cycle gateway blocked).
- janitor-1912 + 1914b-log-agent-work-doc carried (LOW, no urgency).
- 1907a digest-predict 7d silence (CRITICAL OPS) — re-check next cycle.

### Sign-off
c110 UNBLOCK-CRITICAL: 1 new task (1915-bctc-pipeline-silence), TASKS.md +1 row, project-stats.json refreshed (currentSprintNotes + _lastRefreshedBy). BATCH = 1 SPIKE entry (CRITICAL, deadline 02:00 UTC). PO sub-flow EXIT → main terminal routes to architect/ba/dev-mcp-server for SPIKE execution.

---

## Cycle 109 — TNB c53 ACK + janitor queue + TASKS.md trim (carry-over)

c109 housekeeping shipped: TNB c53 ACK'd, janitor-1912 + 1914b-log-agent-work-doc queued, 1912 duplicate row dropped, TASKS.md 83L→77L. WIP=0/2. Full detail in git history (notebook overwritten).
