# Task Context — 1296a: IMF Indicator Research & Trade Mapping

## TLDR (read this first)

change: docs/RESEARCH_IMF_INDICATORS.md (create new file with IMF data source evaluation, 8–12 cascade rules, confidence thresholds, blocker resolutions)
test: No code tests (research + analysis task)
branch: task/1296a-imf-research
depends: none
knowledge_needed: [bundle-pm, market-analysis.md, GLOSSARY_VI.md]

---

## Sprint Context

**Sprint:** 1296 (Infrastructure Recovery + IMF Sentiment Integration)
**Status:** Todo → In Progress → Review → Done
**Type:** Research + Analysis (BA task)
**Depends on:** None
**Blocked by:** None

---

## Goal

Define IMF economic indicator research findings for VN equity market integration. Output research document that grounds task 1296b (Architect service design) with:
1. IMF data source evaluation (3+ options compared)
2. IMF-to-VN sector trade mapping (8–12 cascade rules)
3. Signal integration scoping (imfSentiment field design + confidence thresholds)
4. Blocker resolutions (API selection, scope, confidence min)

**Context:** Sprint 1294 identified IMF sentiment as missing signal for chainSynthesizer enrichment. Signal chain completeness is 40%—news and market watcher agents lack contextual macro sentiment. IMF releases (growth forecasts, currency warnings, debt sustainability reports) drive VN market reactions, but system lacks this data source.

---

## Deliverable

**Primary:** `docs/RESEARCH_IMF_INDICATORS.md` (5+ sections, 2000–3000 words)

**Acceptance Criteria Format:**

- **AC-1: IMF Data Source Evaluation**
  - Given: 4 IMF data source options (Official API, REST API, web scraping, Trading Economics)
  - When: BA researches each source for availability, data freshness, reliability, cost
  - Then:
    - Document 3+ sources with comparison table (freshness lag, uptime %, free/paid status, rate limits)
    - Recommend 1 source with written justification
    - List blockers for each source (e.g., "Official API requires key registration")

- **AC-2: IMF-to-VN Sector Trade Mapping**
  - Given: market-analysis.md cascade rules + signal payload schema + watchlist stocks
  - When: BA maps IMF indicators to VN equity sectors and example watchlist stocks
  - Then:
    - Create table: IMF indicator → VN sector → example stocks (8–12 rows minimum)
    - Include cascade rule candidate names (e.g., "IMF Growth ↑ → Banking NIM Expansion")
    - Reference trade_exposures table for direct exposure linking (if exists)
    - Identify 3+ sectors most sensitive to IMF signals (banking, export, real estate likely)

- **AC-3: IMF Sentiment Integration Scoping**
  - Given: signalPayload schema (signalTypes.ts) and chainSynthesizer enrichment needs
  - When: BA scopes IMF sentiment field addition to signal payload
  - Then:
    - Document where `imfSentiment` field fits in signal schema (optional, nullable)
    - Define confidence scoring: how IMF indicator value → sentiment score (range −1 to +1, thresholds)
    - Outline 3 scenarios: bullish IMF (+0.5..+1.0), neutral (0.0), bearish (−0.5..−1.0)
    - Estimate development effort for Architect (service design + integration)

- **AC-4: Blocker Resolution**
  - Given: 3 blockers (B1, B2, B3) at task start
  - When: BA completes research phase
  - Then:
    - **B1 resolved**: 1 IMF data source recommended with justification (URL, auth method, lag time)
    - **B2 resolved**: Decision on IMF-only vs broader macro (recommend IMF-only for Phase 1, justify deferral of World Bank/ADB to sprint 1298+)
    - **B3 resolved**: Confidence threshold recommended (suggest 0.55 default, allow `IMF_CONFIDENCE_MIN` env override)
    - All findings documented in `docs/RESEARCH_IMF_INDICATORS.md`

---

## Files to Read

- `/abs/path/docs/market-analysis.md` (reason: audit existing 60+ cascade rules for IMF-relevant patterns)
- `/abs/path/docs/GLOSSARY_VI.md` (reason: Vietnamese financial term translation for IMF-to-local mapping)
- `/abs/path/docs/ARCHITECTURE.md` (reason: understand signal enrichment integration points)
- `/abs/path/docs/REQ_1296.md` (reason: full requirement context)
- `/abs/path/docs/TECH_1296.md` (reason: Architect's design expectations)

---

## Files to Create

- `/abs/path/docs/RESEARCH_IMF_INDICATORS.md` (NEW, comprehensive research report)

---

## Files to Modify

- None

---

## Research Protocol (175 minutes total)

### Step 1: Audit Existing Cascade Rules (30 min)

Read `docs/market-analysis.md` cascade framework section. Extract:
- How many cascade rules exist? (Architect says 60+)
- Which rules already reference macro/international institutions?
- What pattern do existing rules follow? (trigger → condition → targets → impact)

Document 5–10 existing rules as reference for new IMF rules in output.

### Step 2: IMF Data Source Investigation (60 min)

Research each of 4 sources. Document in comparison table:

| Source | URL/Contact | Data Freshness Lag | Uptime % | Cost | Rate Limit | Auth Method | Notes |
|--------|-------------|-------------------|----------|------|-----------|-------------|-------|
| **Option A: Official IMF Data API** | https://www.imf.org/external/datamapper/ | 1–2 weeks | 99.5%? | Free (key required) | ~5 requests/min | API key registration | Lagged, structured |
| **Option B: IMF REST API** | metadata.imf.org | 1–2 weeks | 99%? | Free | ~10 requests/min | None | Broader coverage, JSON |
| **Option C: Web Scraping** | IMF World Economic Outlook portal | <1 day | Fragile | Free | N/A | None | Fast but brittle to UI changes |
| **Option D: Third-party Wrapper** | Trading Economics IMF data | Hours | 99.9%? | Paid ($) | ? | API key | Curated, fast, cost-dependent |

Research goals:
- Find 1–2 public sources with actual data freshness numbers
- Test each source (write pseudo-code for API calls, note expected response format)
- Identify which indicators each source provides (growth, inflation, FX, trade)
- Note authentication barriers (key registration, CORS, rate limiting)

### Step 3: Create Trade Mapping Table (45 min)

Build table with rows for 8–12 IMF-driven cascade rules. Include:
- IMF indicator (e.g., "Growth forecast ↑")
- VN sector (e.g., Banking)
- Mechanism (e.g., "Higher credit demand → NIM expansion")
- Example stocks (e.g., VCB, BID, STB)
- Cascade rule name (e.g., "IMF Growth ↑ → Banking NIM Expansion")

Include reasoning for each row (why does this indicator matter to this sector?).

### Step 4: Define Confidence Thresholds (20 min)

For imfSentiment field, document scoring logic:

**Sentiment scoring (−1 to +1):**
- Growth forecast ↑ by 1%: +0.1 sentiment
- Growth forecast ↑ by 5%: +0.6 sentiment
- Growth forecast ↓ by 3%: −0.4 sentiment
- (Similar logic for inflation, USD, trade, etc.)

**Confidence scoring (0.0 to 1.0):**
- Fresh indicator (published <1 week): 0.9–1.0 confidence
- Moderate age (1–4 weeks): 0.7–0.9 confidence
- Stale (>60 days): 0.3–0.5 confidence (deprecate)
- Fallback/cached: 0.2–0.4 confidence (penalty)

**Proposed thresholds for signal enrichment:**
- Only enrich signals if IMF confidence > 0.55 (moderate, balanced)
- Allow `IMF_CONFIDENCE_MIN` env var override (users can set to 0.3–0.8 based on risk tolerance)

### Step 5: Resolve Blockers (20 min)

Document decisions:

**B1: IMF API Selection**
- Recommended: [Option B or C, with justification]
- Rationale: [freshness vs reliability vs cost tradeoffs]
- Fallback: [if primary unavailable]

**B2: Integration Scope**
- Decision: IMF-only for Phase 1 (sprint 1296)
- Rationale: Focused scope, allow learning before broader macro integration
- Deferred: World Bank, ADB, BIS signals → sprint 1298+ (Phase 2)

**B3: Confidence Thresholds**
- Default: 0.55 (moderate)
- Allow override: `IMF_CONFIDENCE_MIN` env var
- Rationale: Balance signal richness vs noise (monitor false-positive rate in sprint 1297)

---

## Output Format

Write `docs/RESEARCH_IMF_INDICATORS.md` with these sections:

```markdown
# Research: IMF Economic Indicators for VN Equity Signals

## Executive Summary
[Brief: what was researched, key findings, recommendations]

## 1. IMF Data Source Evaluation
[Comparison table + analysis of 3+ sources]

## 2. IMF-to-Sector Trade Mapping
[Table: indicator → sector → stocks → cascade rule]

## 3. Signal Integration Scoping
[How imfSentiment field fits into signal payload + confidence thresholds]

## 4. Blocker Resolutions
[B1, B2, B3 decisions with justifications]

## 5. Historical Correlation Examples (Optional)
[5+ examples: IMF announcement → VN-Index delta (timeline + % move)]

## 6. Next Steps (For Architect)
[What design decisions depend on these research findings]
```

---

## Knowledge Dependencies

Load these files (no fail-loud; research is best-effort):
- `.claude/knowledge/market-analysis.md` — cascade framework, BCTC checklist, trade exposure rules
- `.claude/knowledge/dev-standards.md` — DDD layer rules (inform scope discussion for 1296b)
- `docs/GLOSSARY_VI.md` — Vietnamese financial terms (useful for sector mapping)

---

## Success Criteria

Research task is **DONE** when:
- ✅ docs/RESEARCH_IMF_INDICATORS.md written (5+ sections, 2000–3000 words)
- ✅ AC-1: 3+ IMF sources evaluated, 1 recommended
- ✅ AC-2: 8–12 cascade rules documented (indicator → sector → stocks)
- ✅ AC-3: imfSentiment field scoped (confidence thresholds defined)
- ✅ AC-4: Blockers B1–B3 resolved with recommendations
- ✅ File committed to git (task/1296a-imf-research branch)
- ✅ PM notified: ready for Architect review (task 1296b can start)

---

## Handoff to Architect (Task 1296b)

After 1296a is merged, Architect will:
1. Read `docs/RESEARCH_IMF_INDICATORS.md` findings
2. Produce `docs/TECH_1296b.md` (service design)
3. Incorporate blocker resolutions (API selection, confidence thresholds, scope decisions)

---

**Task 1296a status:** Todo → In Progress → Review → Done (merge to main)
