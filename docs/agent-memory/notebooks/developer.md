# Developer — Notebook

**Last updated:** 2026-05-18T03:15Z | **Sprint:** 1941a — DONE, REVIEW

## Last session summary (1941a — L7 OCF guard deploy-verify)

**Task:** 1941a — FA cycle 2026-05-17 23:04 UTC reports VCB OCF=1.23e15 and FPT raw=503.

**Root cause found:**
- `financial_reports` table has two OCF columns: `operating_cf` (OCR, corrupted) and `operating_cash_flow` (API bridge Task 1878a, correct)
- `cashFlowTool.ts` was only selecting `operating_cf` — the corrupted column
- VCB: OCR=1.23e15 (raw VND not ÷1M), API bridge=9,947,260 triệu → ratio 1.15 (plausible)
- FPT: OCR=10,189,002 (unit mismatch), API bridge=4,108,450 triệu → ratio still suppressed (NI=20,225 is a separate extraction bug — revenue stored as profit; vnstock shows NI=2,509.52 tỷ)

**Fix applied:**
- `cashFlowTool.ts`: `effectiveOcf = operating_cash_flow ?? operating_cf`
- Added `ocf_source: "api_bridge" | "ocr"` to envelope
- 5 new tests in `1941a-ocf-api-bridge-preference.test.ts`
- Updated `makeTestDb()` DDL in 1890a + 1930b to include `operating_cash_flow` column

**Results:**
- 17 cashflow tests pass (5 new + 12 existing)
- tsc clean
- Docker rebuilt + redeployed, verified live in container
- Branch: `task/1941a-ocf-api-bridge-cashflow-tool`
- Commit: `b0791eaf`

**Open issue (out of scope):**
- FPT `net_profit=20,225` in `financial_reports` is wrong (OCR parsed revenue as profit). Correct NI ≈ 2,509,520 triệu from vnstock. Even with correct OCF (4,108,450), ratio ≈ 1.64 would pass — but DB data isn't there yet. File as separate extraction bug.

**Pipeline state:** REVIEW. TASKS.md updated. QA to review.

---

## Last session summary (c175 — dev-team orchestration)

**Context from main terminal:** MCP URL `https://zenmidi.com/vn-market/mcp`. Cycle c175.

**Preflight:** HEAD.lock present (age=2677s, size=0B, no live pid). Removed. Worktree prune: clean.

**Notebook sweep:** Committed cowork agent notebooks that sandbox blocked during c167-c174 (alert-commander, report-analyzer, financial-analyst, news-scout + tool-usage-stats + tnb signal cleanup).

**Drain signals (0a):** No JSON signal files. DASHBOARD.md po-section row already READ (c169).

**Telegram reports resolved:**
- #2929 pollNews 0-items: wontfix-transient (gateway outage window 14-18 UTC c167, self-healed)
- #2930/#2931/#2932: wontfix-sandbox (HEAD.lock EPERM in Cowork — expected, documented at #2894)

**Pipeline state (0b):** idle.

**PO Triage (Step 1):**
- No new TNB audit signal.
- No new JSON signals.
- Only actionable TODO: `calendar-source-replacement` (LOW/OBSERVE, zone: dev-macro-indicators)
- BATCH: [{type: OBSERVE/FIX, id: calendar-source-replacement, zone: apps/macro-indicators/}]

**Execute (Step 3):**
- Dispatched `calendar-source-replacement` to dev-macro-indicators
- Handoff created: `docs/handoffs/calendar-source-replacement.md`
- TASKS.md updated: moved to In Progress
- WORK telegram sent.

**Pipeline state:** c175 DISPATCHED. Waiting for dev-macro-indicators return.

---

## Previous sessions (archived context)

c173: idle EXIT, 1939a/b QA in progress.
c172: 1939a/b QA in progress, IDLE EXIT.
c170: 1938a (MCP URL fix) shipped.
c174: 1940a (PC1 legal_risk dual-source) shipped. QA APPROVED.
1941a: cashFlowTool OCF API-bridge preference fix. VCB Layer-7 now plausible. QA pending.
