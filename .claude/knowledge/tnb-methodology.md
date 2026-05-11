# Trần Ngọc Báu — Strategic Thinking Framework

> SSOT for the Báu methodology applied by tran-ngoc-bau when auditing agents and MARKET messages.
> Source: Bàn tròn Kinh tế 2026-05-10 (Thành + Báu).
> Sibling: `market-analysis.md` (4-level cascade — situational), `kinh-dich-layer.md` (regime overlay).
> This file = the **strategic lens** TNB uses to grade analytical quality.

---

## Layer 1 — Foundational data discipline

Three non-negotiable rules. Violations = methodology gap.

1. **Monthly > Quarterly.** Prefer high-frequency monthly indicators (PMI, CPI, sentiment) over quarterly aggregates (GDP). GDP is noisy from accounting and lags 1–2 quarters. An agent that opens with GDP when PMI is available = methodology gap.
2. **State transitions, not levels.** Score on threshold crossings (PMI ↔ 50, USD/VND ↔ 25500, US10Y ↔ 4.5%, FII carry ↔ 0). An agent reporting "PMI = 50.3" without flagging the regime cross = methodology gap.
3. **Cause-effect, not correlation.** Every observation needs a *nhân* (cause) attached. An agent that says "VHM up 5%" without naming the catalyst = methodology gap. A catalyst stated without a transmission chain (Level 1→4 in `market-analysis.md`) = methodology gap.

---

## Layer 2 — US economic health stack

Audited indicators (read order = audit order):

### A. Manufacturing
| Indicator | Threshold | Audit rule |
|---|---|---|
| **PMI Manufacturing** | 50 line | Cross above = expansion regime; cross below = contraction. Confirmation requires ≥2 consecutive prints on same side. |
| **Inventory + New Orders combo** | low inv + high orders | Strongest forward signal — production must rise to refill. Agent flagging only one side = incomplete. |
| **Manufacturing → Services lead** | 1–2 months | Manufacturing PMI **leads** Services PMI. Bullish call on services without checking manufacturing first = inverted-causality gap. |

### B. Consumer
| Indicator | Source | Audit rule |
|---|---|---|
| **Consumer Sentiment** | Conference Board (CB) **AND** University of Michigan | Both required for cross-validation. Agent quoting only one = single-source risk. |
| Trend, not level | rolling 3m direction | Falling sentiment = future demand weakness. Level alone is meaningless without slope. |

### C. Monetary (Fed)
| Variable | Watch for | Audit rule |
|---|---|---|
| Fed Funds rate | meeting outcomes + dot plot shift | Agent must distinguish *priced-in* vs *new* changes. |
| Fed leadership | Powell → successor (e.g. Watch) | Different chairs = different reaction functions on inflation/rate. Flag the transition risk. |

---

## Layer 3 — Vietnam economic health stack

### Source hierarchy (mandatory)
1. **VIRA** (Hội Nghiên cứu Thị trường Liên ngân hàng — `https://vira.org.vn/`) — interbank-economist survey on rates, FX, inflation. **Primary VN source. Free, scrapable.** Routed through the Vinahost VPS scraper (geo-blocked outside VN).
2. ~~WiData (WiGroup)~~ — paid product, NOT available to this system. Do not cite, do not require.
3. **Avoid** as primary: IMF / ADB / World Bank — too aggregated and lagged for VN moves. Valid as cross-check only.

An agent quoting IMF/ADB/WB *as primary* on a VN call = methodology gap. An agent citing WiData = also a gap (we do not have access).

> **Implementation note** — VIRA scraping must be added to the VPS proxy stack alongside the existing geo-blocked sources (prices, BCTC, news, FX, foreign-flow). Until that lands, TNB tolerates VIRA-absence on the VN side and only flags IMF/ADB/WB-as-primary or WiData citation as gaps.

### Variables (in priority order)
1. **Tỷ giá** (USD/VND) — break above 26500 = FII outflow accelerator.
2. **Lạm phát** (CPI YoY + monthly slope).
3. **Dự trữ ngoại hối** (FX reserves, in USDbn) — SBV's defensive ammunition.

---

## Layer 4 — 4-pillar asset valuation framework

Every investment thesis (stock, sector, BĐS) must reference all four pillars. Missing any pillar = incomplete thesis.

| # | Pillar | What it means | Where TNB checks |
|---|---|---|---|
| 1 | **Lượng tiền** (Money supply) | M2, credit growth, OMO net injection | macro snapshot, SBV data |
| 2 | **Chi phí vốn** (Cost of money) | Fed rate, SBV refinancing rate, interbank rate | Fed dot plot, VIRA survey |
| 3 | **Triển vọng lợi nhuận** (Profit outlook) | EPS growth, sector margin trend | BCTC pipeline, sector cascade |
| 4 | **Chính sách** (Policy) | Tax/regulatory/monetary directives | policy_signals tool, congbao feed |

Audit shorthand: **{M2, COC, EPS, POL}** — TNB scores each MARKET message and major notebook entry on how many pillars are referenced.

---

## Layer 5 — Audit decision tree

When TNB grades an agent output (MARKET message, notebook cycle, signal):

```
Step A → Did the agent open with the highest-frequency indicator? (Layer 1.1)
Step B → Did the agent flag any threshold crossing? (Layer 1.2)
Step C → Did the agent attach a cause/transmission chain? (Layer 1.3 + market-analysis.md)
Step D → For US calls: PMI checked before consumer? (Layer 2)
Step E → For VN calls: VIRA cited (or VIRA-absent acknowledged), and IMF/ADB/WB not cited as primary? WiData citation = automatic fail. (Layer 3)
Step F → For investment theses: how many of {M2, COC, EPS, POL}? (Layer 4)

Score:  ≥5 of 6 = GOOD
        3–4    = NEEDS_ATTENTION
        ≤2     = CRITICAL methodology gap → auto-cure or escalate
```

---

## Layer 6 — Standard analytical sequence

The flow Báu uses on every macro read — agents should follow the same pipeline, in this order:

```
1. PMI (manufacturing state)
   ↓
2. Consumer Sentiment (demand pull)
   ↓
3. Cost of Capital (Fed + SBV rate)
   ↓
4. Profit Outlook (sector + ticker EPS)
   ↓
5. Investment decision (4-pillar weighted)
```

An agent that jumps to step 5 (recommendation) without showing 1–4 = methodology gap. Audit log line: `[Methodology] {agent} skipped step {N}`.

---

## Common methodology gaps (catalogue)

| Gap | Where seen | Severity | Auto-cure? |
|---|---|---|---|
| GDP-first opening | report-analyzer, digest-predict | medium | flow edit: prepend PMI section |
| Level-only reporting (no Δ vs threshold) | market-watcher | medium | flow edit: require Δ field |
| Catalyst missing | news-scout impact_chain output | high | escalate to BUG |
| US analysis without PMI | unified-agent | high | flow edit: add PMI bootstrap |
| VN call citing IMF/ADB/WB primary | financial-analyst, digest-predict | medium | flow edit: source priority list |
| VN call citing WiData | any agent | medium | flow edit: strike WiData (paid, inaccessible) |
| VN call missing VIRA when VPS scraper is live | any agent | low | flow edit: add VIRA fetch step |
| Investment rec missing pillar | alert-commander outbound | high | flow edit: pillar checklist |
| Manufacturing→services causality inverted | unified-agent thesis | high | escalate to BUG |
| Single-source sentiment (CB only or UMich only) | unified-agent | low | flow edit: require both |

This table is the canonical list TNB reuses each cycle. Add new entries here when discovered, never inline in the flow.
