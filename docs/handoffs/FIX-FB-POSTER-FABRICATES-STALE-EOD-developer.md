# Handoff: FIX-FB-POSTER-FABRICATES-STALE-EOD

**Role:** Developer (agent-father deliverable → QA next)
**Date:** 2026-06-17
**Task ID:** FIX-FB-POSTER-FABRICATES-STALE-EOD
**Status after this handoff:** REVIEW

---

## What was fixed

### Root cause
When CHEF EOD synthesis is blocked or stale, `fb-market-poster` fell back to stale CHEF morning (05:16Z) data and filled per-ticker numeric gaps with fabricated values instead of calling live tools or writing honest gaps. Evidence (2026-06-17): two rejected FB drafts invented a real-estate selloff (VIC −6.6%, VHM −8.5%, VRE −9.4%) — VRE and VHM values exceed the HOSE ±7% daily price limit (physically impossible). Live truth: VIC −1.03%, VHM −1.10%, VRE −1.75%. The `fb-jargon-gate` passed both fabricated drafts because it checks jargon only, not data integrity.

Memory ref: `feedback_fb_poster_fabricates_when_data_thin`

---

## Files modified

### 1. `docs/agents/fb-market-poster/flow/main.md`

**STEP 1b header and opening rules (new):**
- Header renamed: "Live enrichment via vn-market tools (HARD-REQUIRED for recap spine)"
- ANTI-FABRICATION RULE block added — explicitly forbids using CHEF notebooks as numeric source for per-ticker % moves in Tóm tắt nhanh
- FAIL-LOUD honest-gap rule: when a live tool fails for a ticker, write "công cụ chưa trả số cho [TICKER] phiên này" — never invent or carry stale figures
- Plausibility sentinel: any per-ticker HOSE move > ±7% from working memory must be DISCARDED (carries fabrication flag), replaced with honest gap

**STEP 4b — DATA-INTEGRITY PLAUSIBILITY GATE (new):**
- Runs in addition to the existing jargon gate (STEP 4a)
- Executes `scripts/fb-data-integrity-gate.sh` (to be built by sibling task FIX-FB-POST-DATA-INTEGRITY-GATE)
- Non-zero exit = BLOCK (same discipline as jargon gate)
- Gate-not-found → log warning, treat as PASS, cycle continues (pending deploy path)
- RETURN block extended: `INTEGRITY GATE` field + `LIVE_DATA_SPINE` field

**STEP 8 notebook template:** added `Live data spine` and `Data-integrity gate` entries

**Size-justification comment:** updated (+64L from 718L → 782L)

### 2. `docs/agents/fb-market-poster/init.md`

- `version` bumped to `2026-06-17`
- `responsibilities` extended: two new explicit anti-fabrication rules (CHEF data is narrative-only; FAIL-LOUD honest gap)
- `forbidden_outputs` extended: two new entries (no CHEF per-ticker % as numeric spine; no fabricated moves when live tool fails)

---

## DoD checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Live `get_market_snapshot` hard-required for recap spine (not CHEF shortcut) | DONE — STEP 1b ANTI-FABRICATION RULE + HARD-REQUIRED header |
| 2 | FAIL-LOUD honest gap when number cannot be fetched live | DONE — STEP 1b FAIL-LOUD rule; forbidden_outputs in init.md |
| 3 | CHEF dishes / news-scout / analysis-briefs: narrative/context only, never numeric spine | DONE — STEP 1b "CHEF is NARRATIVE-ONLY" rule; ANTI-FABRICATION RULE |
| 4 | Data-integrity plausibility gate (STEP 4b) added; references sibling FIX-FB-POST-DATA-INTEGRITY-GATE script | DONE — STEP 4b block; fail-on-nonzero exit; graceful-pending-deploy path |
| 5 | Memory ref `feedback_fb_poster_fabricates_when_data_thin` referenced | DONE — STEP 1b ANTI-FABRICATION RULE + size-justification comment |

---

## What is NOT in this handoff

- `scripts/fb-data-integrity-gate.sh` — this is the deliverable of sibling task `FIX-FB-POST-DATA-INTEGRITY-GATE` (developer zone). The flow references it and handles the not-yet-deployed case gracefully (SKIP log).
- No changes to `scripts/fb-jargon-gate.sh` — the jargon gate is correct and out of scope for this fix.

---

## Verification gate (for QA)

RAW behavioral gate: with CHEF EOD deliberately stale (or the unified-agent notebook dated prior to today), the next `fb-market-poster` cycle must either:
- Quote live `get_market_snapshot` per-ticker numbers that match the tool output, OR
- Write an explicit honest gap ("công cụ chưa trả số…") for missing tickers

The post must NEVER emit a per-ticker move exceeding ±7% HOSE on HOSE-listed stocks.

---

## Next agent

**QA** — smoke-check the flow edits for guide compliance and size-justification accuracy. No container rebuild required (flow doc + init.md only).
