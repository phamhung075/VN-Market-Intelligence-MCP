> Parent: [tnb-methodology.md](./tnb-methodology.md)

# TNB 4-Pillar Valuation & Decision Framework (Layers 4-6)

---

## Layer 4 — 4-Pillar Asset Valuation

Every investment thesis (stock, sector, BĐS) must reference all four pillars. Missing any pillar = incomplete thesis.

| # | Pillar | What it means | Where TNB checks |
|---|---|---|---|
| 1 | **Lượng tiền** (Money supply) | M2, credit growth, OMO net injection | macro snapshot, SBV data |
| 2 | **Chi phí vốn** (Cost of money) | Fed rate, SBV refinancing rate, interbank rate | Fed dot plot, VIRA survey |
| 3 | **Triển vọng lợi nhuận** (Profit outlook) | EPS growth, sector margin trend | BCTC pipeline, sector cascade |
| 4 | **Rủi ro định giá** (Valuation risk) | PE, dividend yield, analyst consensus drift | daily screener, consensus revisions |

---

## Layer 5 — 6-Step Decisive Framework

TNB's audit step-sequence for grading a market recommendation:

1. Identify the **primary regime** (Monetary/ credit / earnings / valuation).
2. Check Layer 2 (US) for momentum → cross to Layer 3 (VN) via carry/FII flow thesis.
3. Map the sector / stock against all 4 pillars. **For company-level analysis, see skill:** `.claude/skills/four-factor-synthesis/SKILL.md` **(bottom-up 4-factor input: Financials / Valuation / Governance / Business Model).**
4. Cross-validate narrative: does the recommendation contradict any pillar?
5. Assign confidence: high (all 4 pillars aligned), medium (2–3 aligned, 1 headwind), low (<2 pillars support).
6. Flag carry gaps: missing VIRA, missing BCTC, missing Fed data, incomplete cascade.

---

## Layer 6 — The Gap Catalogue

Recurring methodology gaps TNB flags:

| Gap | Definition | Example | Fix |
|-----|-----------|---------|-----|
| Single-pillar thesis | Asset call supported by only 1 pillar | "Buy because P/E cheap" (ignores earnings outlook + money) | Map against all 4 pillars |
| Inverted causality | Effect mistaken for cause | "Stocks up, so sentiment bullish" (it's the other way) | Use state-transition audit (Layer 1) |
| Source risk | Unvalidated signal from one source | BCTC from single ticker's disclosure | Cross-check against VIRA + sector peers |
| Lagged indicator | Quoting yesterday's data for today's decision | "Fed raised, so VN bonds will fall" (already priced) | Lead/lag chain analysis (Layer 5) |
| Regime drift | Not flagging when a regime threshold crossed | PMI crossed 50, but still trading as contracting | State-transition audit (Layer 1) |
