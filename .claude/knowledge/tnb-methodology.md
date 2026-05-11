# Trần Ngọc Báu — Strategic Thinking Framework

> SSOT for the Báu methodology applied by tran-ngoc-bau when auditing agents and MARKET messages.
> Source: Bàn tròn Kinh tế 2026-05-10 (Thành + Báu) + Long/Tuấn integrated macro-forensic synthesis 2026-05-11.
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
| **Headline PMI Manufacturing** | 50 line | Cross above = expansion regime; cross below = contraction. Confirmation requires ≥2 consecutive prints on same side. |
| **New Orders sub-index** | demand momentum | Rising new orders signal future revenue growth and production surges. Must be reported alongside headline. |
| **Inventory levels** | production cycle | Low inventories combined with rising orders necessitate a manufacturing ramp-up (restocking cycle = global commodity tailwind). |
| **Inventory + New Orders combo** | low inv + high orders | Strongest forward signal. Agent flagging only one side = incomplete. |
| **Delivery Times** | supply constraint | Lengthening = capacity at limit; shortening = cooling demand. |
| **Prices Paid** | input-cost pressure | Lead for PPI / CPI core-goods. |
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

### D. Interbank plumbing (liquidity truth)
| Spread | What it means | Audit rule |
|---|---|---|
| **EFFR – IORB** | Effective Fed Funds vs Interest on Reserve Balances | Tight/positive spread = ample reserves; widening = scarcity emerging. Identity: `IORB + MLVR = EFFR + marginal balance-sheet cost`. Agent claiming a "Fed liquidity stance" without referencing this spread = methodology gap (liquidity is plumbing, not headline rate). |

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
Step D → For US calls: PMI checked before consumer? Fed liquidity claims reference EFFR–IORB spread? (Layer 2)
Step E → For VN calls: VIRA cited (or VIRA-absent acknowledged), and IMF/ADB/WB not cited as primary? WiData citation = automatic fail. (Layer 3)
Step F → For investment theses: how many of {M2, COC, EPS, POL}? (Layer 4)
Step G → For BCTC opinions: NI vs OCF compared AND ≥1 forensic gate (M-Score / F-Score / accruals / BTN trick check)? (Layer 7)
Step H → For investment theses: cycle phase declared AND pyramid tier matches phase? (Layer 8)
Step I → All macro claims trace to a Tier 1–3 source (no social-media-as-primary)? (Layer 9)

Score:  ≥7 of 9 = GOOD
        4–6    = NEEDS_ATTENTION
        ≤3     = CRITICAL methodology gap → auto-cure or escalate
```

Steps G–I are skipped (`n/a`) when the agent's output type does not call for them (e.g. a pure news-scout impact chain has no BCTC opinion → G = n/a; n/a never counts against the score, max stays effective).

---

## Layer 6 — Standard analytical sequence

The flow Báu uses on every macro read — agents should follow the same pipeline, in this order:

```
1. PMI (manufacturing state, with sub-components)
   ↓
2. Consumer Sentiment (demand pull, CB ∧ UMich)
   ↓
3. Cost of Capital (Fed + SBV rate, EFFR–IORB spread)
   ↓
4. Profit Outlook (sector + ticker EPS, with BTN forensic gate — Layer 7)
   ↓
5. Cycle phase mapping (Investment Clock — Layer 8)
   ↓
6. Pyramid tier alignment (position sizing — Layer 8)
   ↓
7. Investment decision (4-pillar weighted, sources verified per Layer 9)
```

An agent that jumps to step 7 (recommendation) without showing 1–6 = methodology gap. Audit log line: `[Methodology] {agent} skipped step {N}`.

---

## Layer 7 — Forensic accounting (Behind The Numbers)

Applies to any agent producing a BCTC-derived opinion (financial-analyst, report-analyzer, digest-predict, alert-commander when citing fundamentals).

> Core principle: *"Accounting profit is an opinion; cash flow is a fact."* Net Income without Operating Cash Flow corroboration = unreliable.

### Earnings-management "tricks" — flag when seen
| Trick | Signature | Severity |
|---|---|---|
| **Cookie Jar Reserves** | over-stated provisions in fat quarters, released in lean quarters to smooth EPS | high |
| **The Big Bath** | massive write-offs at leadership change → artificially low base for "improvement" | high |
| **Big Bet on the Future** | aggressive capitalization of expenses justified by speculative future gains | medium |
| **Virtual Capital (Vốn ảo)** | circular related-party flows that simulate capital injection without real cash | critical (escalate to BUG) |

### Quantitative forensic gates
| Gate | What it measures | Threshold |
|---|---|---|
| **Beneish M-Score** | manipulation probability (8 ratios incl. DSRI, GMI, AQI, SGI) | M-Score > −1.78 = elevated manipulation risk |
| **Piotroski F-Score** | financial-strength score across 9 binary criteria | F-Score ≤ 3 with rising reported profit = red flag |
| **Accruals = NI − OCF** | reliance on non-cash earnings | persistent positive accruals (3+ quarters) ⇒ probable future earnings reversal |

### Audit rule
A BCTC-driven opinion that does NOT include (a) NI vs OCF comparison **and** (b) at least one quantitative gate (M-Score, F-Score, or accruals trend) **and** (c) an explicit "no BTN trick detected" or "trick X detected" line = methodology gap (Step G fail).

---

## Layer 8 — Cycle alignment (Investment Clock + Asset Pyramid)

### Investment Clock — 4 phases
| Phase | Growth | Inflation | Tilt |
|---|---|---|---|
| **Reflation** | low | low | bonds, rate-sensitive equities |
| **Recovery** | high | low | aggressive equities, manufacturing, exports |
| **Overheat** | high | high | commodities, defensives |
| **Stagflation** | low | high | cash, gold |

Phase signal: triangulate PMI direction (Layer 2.A) + CPI slope (Layer 3 / global) + Fed posture (Layer 2.C).

### Asset Pyramid — position-sizing context
| Tier | Asset class | Risk weight | When to allocate |
|---|---|---|---|
| **Apex** | crypto, derivatives | ultra-high | surplus only; never base-case |
| **Upper** | growth stocks | high | Pillar 1 (M2) + Pillar 3 (Profit) both positive |
| **Middle** | ETFs, funds | moderate | broad PMI > 50 recovery signal |
| **Base** | gold, cash, CDs | low | Overheat or Stagflation phase |

### Audit rule
Any investment recommendation must declare (a) the implied cycle phase **and** (b) the pyramid tier the recommendation occupies. A recommendation whose tier mismatches the phase (e.g. "buy crypto/apex" called during stagflation) = methodology gap (Step H fail).

---

## Layer 9 — Sources of truth (information filtering)

The Báu/Long approach treats source selection as the first risk-management gate.

### Source hierarchy (ordered)
| Tier | Source | Use for |
|---|---|---|
| 1 | **VIRA** (`vira.org.vn`) | VN interbank truth — rates, FX, inflation expectations |
| 1 | **FOMC member statements** (Powell + voting members + dot plot) | US monetary-policy truth |
| 2 | **Reuters / Bloomberg** (institutional newswires) | global macro, earnings, policy events |
| 2 | **MCP macro snapshot + price tools** (in-system primary) | live VN price/regime/macro |
| 3 | **Conference Board, U-Mich, BLS, ISM** | US official data |
| ✗ | ~~WiData~~ | paid, off-limits — see Layer 3 |
| ✗ | Social media (X, Discord, retail forums) as primary | speculative noise — never primary |

### Audit rule
Every macro claim must trace to a Tier 1–3 source. A claim sourced from social media as primary = methodology gap (Step I fail). Social media is acceptable only as a *secondary* sentiment signal, never as the basis of a thesis.

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
| Fed liquidity claim missing EFFR–IORB spread | unified-agent, alert-commander | medium | flow edit: add spread fetch to monetary block |
| BCTC opinion missing NI vs OCF comparison | financial-analyst, report-analyzer | high | flow edit: add NI/OCF compare step |
| BCTC opinion missing M-Score / F-Score / accruals gate | financial-analyst | high | flow edit: add forensic gate |
| BTN trick (Cookie Jar / Big Bath / Big Bet) not flagged | financial-analyst, report-analyzer | high | flow edit: add BTN checklist |
| Virtual Capital / circular related-party flow not flagged | financial-analyst | critical | escalate to BUG |
| Investment thesis missing cycle phase declaration | unified-agent, alert-commander | medium | flow edit: add Investment Clock step |
| Recommendation tier vs cycle phase mismatch (e.g. crypto in stagflation) | alert-commander outbound | high | escalate to BUG |
| Macro claim sourced from social media as primary | news-scout, qa-responder | high | flow edit: source-tier guard |

This table is the canonical list TNB reuses each cycle. Add new entries here when discovered, never inline in the flow.
