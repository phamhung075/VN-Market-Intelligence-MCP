---
sprint: 1909
branch: task/1909c-reparse-validation
size: S
zone: ops (trigger) + docs (agent memory)
depends_on: [1909a-extractor, 1909b-tool]
blocks: []
---

## TLDR

Trigger `bctcReparseJob` on 37-stock watchlist for Q1-2026 period. Observe financial-analyst Layer 7 G-step cycle: must show PASS (not SKIP) with `get_bctc_ocf` consumed on at least 1 watchlist ticker. Capture result in financial-analyst notebook. This is the sprint completion gate per `feedback_ship_completion.md`.

---

## [PM] Planning Context

**Zone:** ops (trigger reparse job) + docs (financial-analyst notebook entry)

**Acceptance Criteria:**
- [ ] `bctcReparseJob` triggered on 37-stock watchlist for Q1-2026 period (tool already exists, live since 1908c c92)
- [ ] At least 30 of 37 watchlist Q1-2026 tickers return non-zero `ocf_operating` via `get_bctc_ocf` (else BUG-channel report per-ticker root cause)
- [ ] Tickers with `confidence < 0.2` emit WORK-channel alert per existing policy
- [ ] At least 1 financial-analyst cycle shows Layer 7 G-step PASS (not SKIP) with `get_bctc_ocf` consumed (e.g. VNM or VCB Q1-2026)
- [ ] Result captured in financial-analyst notebook entry with explicit pass log: `"Layer 7: [PASS] OCF vs NI — ocf_operating=<value>, ocf_ni_ratio=<value>, gate=PASS"`

**Files to read first:**
- `docs/handoffs/REQ_1909.md` § 1909c (FR-11 through FR-13, edge cases)
- `docs/standards/tnb-methodology-layers.md` § Layer 7 G-step (OCF validation gate)
- `reference_low_confidence_handling.md` (confidence threshold policy)
- `docs/agent-memory/notebooks/financial-analyst.md` (format for completion log)

**Files to create:**
- None (reparse job exists; notebook entry is manual observation log)

**Files to modify:**
- `docs/agent-memory/notebooks/financial-analyst.md` — +1 entry with Layer 7 G-step PASS log (AC-5)

**Dependencies:**
- 1909a-extractor: must be merged + container rebuilt + deployed
- 1909b-tool: must be merged + container rebuilt + deployed
- Both 1909a + 1909b must be in production before reparse can validate OCF end-to-end

**Knowledge needed:**
- `feedback_ship_completion.md` — sprint completion gate = end-to-end cycle pass, not code merge
- `docs/standards/tnb-methodology-layers.md` — Layer 7 G-step definition (NI vs OCF ratio analysis)
- Watchlist composition: `docs/data/project-stats.json` or user memory

**Watchlist tickets:**
37 tickers across 10 sectors (from user watchlist per user memory). Suggest starting with banking cohort (VNM, VCB, BID, TCB, CTG, SHB, ACB, EIB, TPB, HDB, MBB, STB, MSB, BAB, PGB, VPB, SGB) for quick validation post-banking-deadline (2026-05-15).

---

## Completion gate (per `feedback_ship_completion.md`)

Sprint 1909 is DONE when ALL of:
1. `cashFlowExtractor.ts` refactored + drift guard present (1909a)
2. 38 baseline BCTC tests + ≥3 new OCF fixture tests PASS, `tsc 0` (1909a)
3. `get_bctc_ocf` live in container, tool-registry updated, SKILL_MANIFEST updated, package docs updated (1909b)
4. `bctcReparseJob` run on watchlist; ≥30/37 tickers Q1-2026 non-zero OCF or BUG-channel record (1909c)
5. **1 financial-analyst cycle log shows Layer 7 G-step PASS (not SKIP) (1909c AC-5)**
6. `/graphify docs --update --no-viz` run post-merge (AC-6)

**This task gates AC-5 + AC-6.**

---

## Observational notes

- Non-zero `ocf_operating` confirms extraction succeeded + data quality acceptable
- `confidence < 0.2` rows still count toward 30/37 threshold but must emit WORK alert (existing policy)
- If <30 tickers return non-zero OCF: per AC-4, report per-ticker root cause to BUG channel (extraction failure, low confidence, null data, etc.)
- Layer 7 G-step PASS means financial-analyst consumed `get_bctc_ocf` + computed `ocf_ni_ratio` + passed gate logic (NI ≈ OCF within tolerance)
- Layer 7 G-step SKIP means financial-analyst skipped the gate (missing data, earlier gate blocked, etc.) — this is NOT acceptable for sprint completion

---

## Implementation pattern

1. Wait for 1909a + 1909b to ship (both merged + container rebuilt)
2. Trigger `bctcReparseJob` via CLI or scheduled cron (tool exists)
3. Observe watchlist: query `financial_reports` table for Q1-2026 rows with non-null `ocf_operating`
4. Count passing tickers; log any <0.2 confidence to WORK channel
5. Monitor financial-analyst next cycle: capture Layer 7 G-step log to notebook
6. If Layer 7 shows PASS: update notebook with exact values + gate=PASS
7. If Layer 7 shows SKIP or FAIL: diagnose root cause (missing tool, broken ratio calc, gate threshold) before declaring sprint complete
