# Architecture Brief: Expert Rapid-Analysis Skills Extraction
**Date:** 2026-06-04  
**Slug:** expert-rapid-analysis-skills  
**Author:** agents-architect  
**Status:** READY-FOR-IMPLEMENTATION  
**Signal:** `docs/signals/expert-rapid-analysis-skills-20260604T050342Z.json` → agent-father

---

## 1. Source & Context

**Source transcript:** `docs/raw-input/expert-discussion/Bàn tròn kinh tế 31/5`  
**Roundtable participants:**
- **Báu** — host, data-tech founder (yêu kinh tế / W-Group)
- **Trung** — founder of Phess/FinSuccess, bottom-up value/conviction investor, manages 650+ billion VND
- **Thành** — wealth manager, 10+ years market experience

**Session topic:** How to screen 1,700 listed VN companies in ~5 minutes to decide if a stock merits deep research.

---

## 2. Transcript Technique Catalog

Full enumeration of every distinct analytical technique stated by the experts, with their concrete numbers and decision rules.

### T-1: Market-Cap-First Entry (Trung)

"Bất kỳ một doanh nghiệp nào Chung cũng hay nhìn vào vốn hóa mà" — market cap is the price you are paying right now; all subsequent analysis is to compare what you get versus that price.

**Rule:** Before reading any other number, record market cap. If market cap is a few hundred billion VND and your fund size is large, skip immediately — you will move the price against yourself ("chơi với mình", "lũng loạn giá").

**Threshold:** No stated absolute floor, but the test is: can I enter/exit without distorting the price? Micro-caps fail this test for institutional funds.

### T-2: Balance-Sheet-First Read (Trung)

"Trung hay nhìn đầu tiên đó là cái quy mô tài sản nó trước" — look at total assets before looking at net income.

**Concrete steps:**
1. Compare **market cap vs. total assets**: if total assets > market cap, the company is potentially trading below asset replacement value — a margin-of-safety signal.
2. Subtract liabilities → get **equity (vốn chủ)**. Compare market cap vs. equity = P/B ratio.
3. The gap between market cap and equity is what investors pay for **intangibles**: governance quality + future growth. That gap must be justified by qualitative factors.
4. Read balance sheet line items: flag investment real estate recorded at 10-year-old book value (potentially massive hidden asset), receivables bloat, or cash parked in deposits rather than deployed.
5. Check **vốn điều lệ** (charter capital): large accumulated charter capital relative to par value = long track record of profitable accumulation → corporate durability signal.

**Example given:** Vĩnh Hoàng: market cap ~12,000 billion, total assets ~13,000 billion → assets exceed market cap. Equity ~2,000 billion gap = intangible premium.
**Counter-example:** Vinrup trading at 14× book → investor must justify 13× premium entirely from qualitative read.

### T-3: Valuation vs. Own History (Trung + Thành)

"So sánh doanh nghiệp này với cái quá khứ của doanh nghiệp đó trong vòng 10 năm"

**Rule:** Compare current P/E and P/B vs. the company's own 10-year historical range — NOT vs. sector peers (sector comparison is secondary).

**Two conclusions from this screen:**
- Current valuation **below** own historical range → potential undervaluation; worth deeper read.
- Current valuation **above** own historical range → premium; requires strong qualitative justification or growth story to offset.

**Thành's additional heuristic:** Prefer companies that have NOT already run up ("em không thích đầu tư những doanh nghiệp mà nó đã tăng rồi"). The definition of "already expensive" is when valuation is above own historical average.

### T-4: Four-Factor Synthesis and 4-Scenario Decision Matrix (Trung)

Trung's organizing framework for conviction-building. Every company is scored on four factors:

| Factor | Type | Key question |
|--------|------|-------------|
| **Tài chính** (Financials) | Quantitative | Are balance sheet and income statement healthy and consistent? |
| **Định giá** (Valuation) | Quantitative | Is current price cheap vs. assets, earnings, and own history? |
| **Quản trị** (Governance) | Qualitative | Is ownership structure safe? Is management honest and capable? |
| **Mô hình kinh doanh** (Business model/moat) | Qualitative | Does the business have durable competitive advantage and growth trajectory? |

**4 scenarios from the 2×2:**
1. All four strong → "cổ phiếu để đời" (generational hold) — very rare; 3-5 year conviction.
2. Financials + valuation strong, business model weak → margin-of-safety investment but limited upside; watch for value trap.
3. Business model strong, valuation expensive → must pay a growth premium; only justified if qualitative read is iron-clad.
4. All four weak → certain loss; avoid.

**Value-trap warning (explicit):** Investors who only use factors 1+2 (quantitative only) will fall into value traps — buying cheap stocks that stay cheap or decline because factors 3+4 are broken. The DGC/PC/GVC examples: beautiful financials, growing strongly, reasonable P/B — but severe governance defects that any investor who was active 10-15 years ago already knew about.

### T-5: Price-Earnings Sync Test (Thành)

"Mình phải biết được cái yếu tố nào nó chi phối cái diễn biến giá cổ phiếu"

**Two company types:**
- **Type A:** Stock price and earnings move together (high coherence). These are fundamentals-drivable companies. Screen normally.
- **Type B:** Stock price moves independently of earnings. These require understanding the game/catalyst — insider information, refinancing maneuver, share issuance play, collateral inflation. If you cannot identify why price diverges from earnings, do NOT invest ("khó quá thì bỏ qua").

**Concrete check:** Look at whether price rallied while earnings were flat or declining, or vice versa. If divergent for >6 months, classify as Type B. Type B requires ultra-high-level information advantage; ordinary investors should skip.

**VN-specific mechanics named:** (a) Price pumped to enable pledged-share refinancing at higher LTV; (b) Price raised to 10,000 VND to enable new share issuance (legal floor); (c) Convertible bond issuance requiring price support. All are Type B signals.

### T-6: Ownership Structure Governance Screen (Trung)

**Three-part ownership checklist:**

1. **Founder stake 20-30%** ("skin the game"): the founder must have enough personal wealth tied to the company that misalignment is costly. Below 20% → weak incentive alignment. If all founders have exited below 5% while nominees hold the rest → danger signal.

2. **Foreign institutional investor as counterweight (30-49%)**: presence of real foreign institutional investors (not repo-disguised "foreign" ownership) forces governance standards. Check if the "foreign" position is a genuine equity stake vs. a repo/collateral arrangement (nguồn: Trung's deal-work experience).

3. **Adequate free-float (20-30%)**: ensures you can enter and exit at scale without distorting the price.

**Anti-pattern: "công ty vô chủ"** — a company where ownership is so fragmented across many small individual shareholders that no one is accountable. Often appears in small real-estate companies pre-listing. Avoid.

**Founder-bắt distinction:** When management is hired (not founder-owners), their legal trouble has limited impact on company value (e.g., SOE chairmen rotating through). When the founder/controlling shareholder is arrested, impact is severe (DGC, BC1). The magnitude of legal-trouble impact = proportional to the founder's ownership stake.

### T-7: Management Track Record Verification (Trung + Báu)

"Lịch sử hình thành và phát triển" — read founding history and track record.

**Concrete checks:**
1. Read the **prospectus (bản cáo bạch)** from IPO date: what did they promise? Trace whether capital raised was deployed as stated.
2. Check whether money raised went into productive assets or into receivables / parked deposits / suspended real-estate projects.
3. Track **ROE trend during CEO tenure**: did ROE improve after a new CEO? (Soccer coach analogy: did the team's win rate change when the coach changed?)
4. Compare **stated business plan targets vs. actual revenue** (not profit — revenue is harder to manipulate). Trung and Thành explicitly prefer revenue-plan-accuracy over profit-plan-accuracy as a management capability signal.
5. For profit targets: SOEs typically set very low targets and beat by 200-300% (deliberate sandbagging for bonus). Cyclical businesses cannot be held to exact targets. Weight revenue accuracy more heavily than profit accuracy.

### T-8: Insider Transaction Signal (Thành)

"Giao dịch nội bộ" — monitor insider buy/sell patterns.

**Two red-flag patterns:**
1. **High-frequency insider trading**: management buys and sells their own stock frequently → they do not have long-term conviction; they are timing the market in their own company.
2. **Abnormal insider selling within 3-6 months**: a large exit by insiders or major shareholders in the recent window → they know something negative is coming. Especially dangerous if coincides with high volume (see T-9).

### T-9: Abnormal Turnover-to-Float Ratio (Thành)

"Không thích những cái cổ phiếu mà có cái thanh khoản quá cao so với số lượng cổ phiếu lưu hành"

**Rule:** If daily trading volume exceeds ~1-2% of total shares outstanding, it is a red flag. Good companies do not trade at that intensity — it signals market-making, pump activity, or insiders distributing.

**Concrete historical example:** FLC Faros had days where daily turnover equaled its entire market cap — a catastrophic manipulation signal that preceded the collapse. The ratio: (daily value traded) / (market cap) ≥ ~1% = red flag zone.

### T-10: Corporate History Pattern Scan (Trung + Báu)

"Chỉ cần nhìn cái biểu đồ tài chính khoảng chừng là tầm 10 năm thôi là mình cảm thấy mùi liền"

**Heuristic:** A 10-year financial history chart will reveal character. No bona-fide company has the erratic, lumpy patterns typical of manipulation or back-door listings.

**Back-door listing (niêm yết cửa sau) red flag:** A tiny listed company suddenly inflates assets and changes name — this is a shell used by an unlistable entity to gain market access (NRC/Danh Khôi example given). Flag: (a) dramatic asset jump with no operational explanation; (b) total leadership change; (c) company unable to get bank debt (banks refuse to lend = structural risk signal — "ngân hàng cũng khôn lắm").

**Bank-debt presence as quality signal (Báu):** If banks lend to the company, it passed a credit committee's underwriting process. Absence of bank debt on a company that should have it = banks know something you don't.

### T-11: Information Transparency Quality Assessment (Trung + Báu)

"Cách họ công bố thông tin có đủ chi tiết hay không"

**Two-part check:**
1. **IR report quality**: do they publish investor relations materials? Do those materials hide unfavorable data and highlight favorable data? PNJ example: switched from monthly to quarterly IR updates — a transparency regression signal.
2. **AGM quality**: is the annual general meeting professionally organized? Do they answer tough questions directly? How do they handle adverse information when it surfaces — transparent correction vs. suppression?

**Adverse-information handling heuristic:** When a company gets negative media coverage, observe HOW they respond. Those who manage it transparently = good governance. Those who suppress = governance risk. The suppression effort itself leaves traces in which outlets go quiet suddenly.

### T-12: Investment Method Self-Alignment (Thành + Báu)

Not a stock-screening technique, but a prerequisite: before applying any tool, identify which investment method matches your personal risk tolerance, time horizon, and information edge.

**Three investment archetypes named:**
1. **Value/net-net** (Buffet early career): find stocks trading below asset liquidation value; accept low growth but need high margin of safety.
2. **Growth-momentum** (CANSLIM-style): find stocks where price and earnings move together; pay fair-to-premium valuation for strong growth trajectory.
3. **Game-awareness** (special situations): understand the specific catalyst (M&A, re-rating, ownership change) driving price; requires superior information access.

**Rule:** Do NOT mix methods mid-position. Conviction comes from method consistency. If you buy a value stock and it becomes a growth story, you must re-evaluate from the growth framework, not hold because it was cheap.

### T-13: scuttlebutt / Lateral Information Gathering (Fisher method, cited by Trung + Báu)

"Phương pháp lời đồn đại" — Fisher's scuttlebutt: gather information from non-management sources.

**Concrete sources named:**
- Suppliers and customers of the company
- Competitors (most valuable per Fisher; they know each other's strengths and weaknesses)
- Staff below management level: security guards, janitors, accountants, operations staff
- Google / public search on the founder's name (legal history, prior business failures)
- For modern application: AI search tools can surface historical forum posts, dark-web financial disclosures, litigation records

**Guardrail:** Scuttlebutt is an information input only — maintain independent judgment. Do not follow any single source (including the CEO in a roadshow — "không có lãnh đạo doanh nghiệp nào nói xấu về cổ phiếu hết").

### T-14: Executive Compensation Ratio Check (Thành)

Mentioned as a signal within governance review.

**Red flag:** Management bonus/reward pool exceeds ~20-30% of pre-tax profit. A company earning 1,000 billion VND paying out 200-300 billion in management bonuses is extracting value from minority shareholders.

**Where to find it:** Look for the "quỹ khen thưởng" (reward fund) line item in financial statements. Compare to LNTT (pre-tax profit).

---

## 3. Proposed Skill Set

Six new skills extracted from the transcript. Each is distinct and reusable.

### SKILL-1: `rapid-market-cap-screen`

**One-liner:** Market-cap-first entry gate — checks size, price-sync type, and valuation range in one pass before any deep read.

**When to use:** First contact with any ticker; runs before all other analysis. The 5-minute scan front-end.

**Concrete steps:**
1. Fetch market cap via `get_market_snapshot` (or price × shares outstanding).
2. Size gate: if market cap < operator-configured floor (default 500 billion VND), log SKIP-MICRO and exit.
3. Fetch 10-year P/E and P/B history vs. current via `get_stock_financials` or `get_bctc_full`.
4. Classify: current P/E vs. own 10-year median → CHEAP / FAIR / EXPENSIVE band.
5. Output: `{ticker, market_cap, pe_band, pb_band, valuation_verdict}` — PASS or SKIP with reason.

**Inputs (MCP tools):**
- `call_tool(server="vn-market", tool="get_market_snapshot", arguments={...})`
- `call_tool(server="vn-market", tool="get_bctc_full", arguments={code: ..., ...})`

**Output fields:** `rapid_screen_verdict: PASS | SKIP`, `skip_reason`, `pe_band`, `pb_band`, `market_cap_billion`

---

### SKILL-2: `balance-sheet-first-read`

**One-liner:** Reads a company's balance sheet to compute asset-to-market-cap ratio, equity premium, and charter-capital durability signal.

**When to use:** Immediately after `rapid-market-cap-screen` PASS; before income-statement analysis. T-2 implementation.

**Concrete steps:**
1. Fetch latest balance sheet via `get_bctc_full`.
2. Compute: `asset_coverage = total_assets / market_cap`. If > 1.0 → margin-of-safety signal (assets exceed market price).
3. Compute: `pb_ratio = market_cap / equity`. If < 1.0 → deep value. If > 5× → intangible premium requiring qualitative justification.
4. Compute: `intangible_premium_billion = market_cap - equity`. Name this the "governance + growth premium."
5. Check `charter_capital` vs. `total_equity`: ratio > 0.5 → significant retained earnings → corporate durability.
6. Flag: receivables > 30% of total assets → cash-conversion risk. Investment property with > 5-year-old book values → possible hidden asset or write-down risk.
7. Output structured verdict: `{asset_coverage, pb_ratio, intangible_premium, charter_capital_ratio, balance_flags[]}`.

**Inputs:** `call_tool(server="vn-market", tool="get_bctc_full", ...)`

---

### SKILL-3: `four-factor-synthesis`

**One-liner:** Scores a company on the Trung 4-factor matrix (financials, valuation, governance, business model) and outputs one of 4 investment scenarios.

**When to use:** After balance-sheet read passes basic thresholds; synthesizes all factor reads into a scenario verdict. T-4 implementation.

**Concrete steps:**
1. **Factor F (Financials):** Require outputs from `balance-sheet-first-read` + `get_bctc_full` ratios: ROE ≥ 12%, debt-to-equity ≤ 1.5, positive CFO in ≥ 3 of last 4 years. Score: STRONG / WEAK.
2. **Factor V (Valuation):** Require output from `rapid-market-cap-screen`: pe_band + pb_band. CHEAP or FAIR = ATTRACTIVE. EXPENSIVE = DEMANDING.
3. **Factor G (Governance):** Require output from `ownership-governance-screen` (SKILL-4): any red flag = WEAK; no flags = ACCEPTABLE.
4. **Factor B (Business model):** Agent qualitative judgment or upstream `market-watcher` moat assessment: stable/growing industry + defensible position = STRONG; declining/commoditised = WEAK.
5. Map to scenario:
   - F=STRONG + V=ATTRACTIVE + G=ACCEPTABLE + B=STRONG → **Scenario 1: CONVICTION** (deep dive)
   - F=STRONG + V=ATTRACTIVE + G=ACCEPTABLE + B=WEAK → **Scenario 2: VALUE-TRAP-RISK** (flag, require governance/moat check before proceeding)
   - F=STRONG + V=DEMANDING + G=ACCEPTABLE + B=STRONG → **Scenario 3: GROWTH-PREMIUM** (proceed only if growth thesis is quantified)
   - Any G=WEAK → **Scenario 4: SKIP-GOVERNANCE** regardless of other factors
   - F=WEAK + V=DEMANDING → **Scenario 4: SKIP-FUNDAMENTALS**
6. Output: `{scenario: 1|2|3|4, scenario_label, factor_scores{F,V,G,B}, conviction_gate: PASS|SKIP}`.

**Inputs:** Results of SKILL-1, SKILL-2, SKILL-4; `get_bctc_full`.

---

### SKILL-4: `ownership-governance-screen`

**One-liner:** Screens ownership structure, insider transaction patterns, and turnover ratio for governance red flags.

**When to use:** In parallel with `balance-sheet-first-read` after `rapid-market-cap-screen` PASS. T-6, T-8, T-9, T-11 implementation.

**Concrete steps:**
1. **Ownership structure check (T-6):**
   - Fetch top shareholders via `get_company_info` or ownership data.
   - Flag OWNERLESS if: no single shareholder > 20% AND all top holders are fragmented individuals.
   - Flag SKIN-GAME-WEAK if: founder/controlling stake < 20%.
   - Flag FOREIGN-COUNTERWEIGHT-ABSENT if: no institutional foreign holder ≥ 5%.
   - Flag FREE-FLOAT-LOW if: free float < 15%.
2. **Insider transaction check (T-8):**
   - Fetch last 6 months of disclosed insider trades.
   - Flag HIGH-FREQUENCY if: > 3 insider buy/sell events per quarter.
   - Flag INSIDER-EXIT if: net insider sell > 5% of their holdings in any 3-month window.
3. **Turnover ratio check (T-9):**
   - Compute: `daily_turnover_ratio = avg_daily_volume_value / market_cap` over last 30 trading days.
   - Flag ABNORMAL-TURNOVER if ratio > 1%.
4. **Back-door listing pattern (T-10):**
   - Check year-over-year total assets change: if > 200% with leadership change = flag BACKDOOR-SUSPECTED.
   - Check bank debt presence: zero long-term bank debt on a capital-intensive company = flag NO-BANK-TRUST.
5. **Management compensation (T-14):**
   - From BCTC: extract reward fund / pre-tax profit. Flag COMP-EXTRACTION if > 25%.
6. Output: `{red_flags: [], governance_score: GREEN|YELLOW|RED, flag_details{}}`.

**Inputs:** `get_company_info`, `get_bctc_full`, ownership/transaction data.

---

### SKILL-5: `management-track-record`

**One-liner:** Validates management capability and integrity by comparing stated plans to actual results, ROE trend under tenure, and public record review.

**When to use:** When governance screen returns YELLOW (ambiguous) or when `four-factor-synthesis` returns Scenario 2 or 3 (value-trap risk or growth-premium). T-7, T-13, T-14 implementation.

**Concrete steps:**
1. **Revenue-plan accuracy (T-7):**
   - Fetch last 3 years of stated annual revenue targets vs. actuals from BCTC or disclosed business plans.
   - Compute accuracy: `|actual - target| / target`. Flag PLAN-DRIFT if > 30% deviation in 2+ years.
   - Weight revenue accuracy over profit accuracy (profit is noisier due to investment cycles).
2. **ROE under CEO tenure:**
   - Identify current CEO start date.
   - Compare ROE: pre-tenure 3yr avg vs. post-tenure 3yr avg. Improvement ≥ 3pp = positive signal.
3. **Capital deployment check:**
   - From prospectus or fundraising announcements: what was capital raised earmarked for?
   - From subsequent BCTC: did receivables or suspended-project assets inflate instead of productive deployment? Flag CAPITAL-MISDEPLOYMENT.
4. **Public record search (T-13 scuttlebutt digital layer):**
   - Instruct agent to search for founder name + "bị bắt", "sai phạm", "vi phạm", "xử phạt" — VN legal/regulatory red flags.
   - Flag PUBLIC-RECORD-RISK if any legal proceedings found.
5. **IR transparency:**
   - Check if company publishes quarterly IR reports. Flag IR-OPAQUE if not.
   - Check if recent negative news was followed by reduced disclosure frequency.
6. Output: `{plan_accuracy, roe_trend, capital_deployment_flag, public_record_flag, ir_transparency, management_verdict: RELIABLE|QUESTIONABLE|RED}`.

**Inputs:** `get_bctc_full`, prospectus data, public search results.

---

### SKILL-6: `value-trap-avoidance`

**One-liner:** Applies the "boring analyst" value-trap heuristic — checks for the two failure signals that indicate cheap-looking stocks that will stay cheap.

**When to use:** Any time `four-factor-synthesis` returns Scenario 2 (VALUE-TRAP-RISK) or when a stock appears cheap on P/B and P/E but the analyst is uncertain. Synthesizes T-3, T-4 scenario 2, T-5.

**Concrete steps:**
1. **2-failure-signal heuristic (Báu's "boring analyst" pattern):**
   - Signal A: valuation has been cheap (P/B < 1 or P/E < 8) for > 18 months with no price convergence.
   - Signal B: earnings grew during the same period but price did not follow (price-earnings divergence, T-5 Type B pattern).
   - If both A and B: LIKELY-TRAP. The market knows something you don't about governance or business model.
2. **Moat absence check:**
   - Ask: does this company have pricing power? Can it raise prices without losing customers?
   - If answer is no and industry is commoditised → value trap risk even at P/B < 1.
3. **DGC-pattern check:**
   - Beautiful financials (ROE > 20%, growing revenue) + governance red flags from SKILL-4 → GOVERNANCE-TRAP.
   - Flag with explicit "high financial score, low governance score" verdict.
4. **Conviction test:**
   - Can the investor articulate in 2 sentences WHY the valuation discount will close? If not, skip.
5. Output: `{trap_signals: [], trap_verdict: SAFE|TRAP-RISK|LIKELY-TRAP, conviction_test_passed: true|false}`.

**Inputs:** SKILL-1 outputs, SKILL-4 outputs, SKILL-3 Scenario 2 trigger.

---

## 4. TNB Reconciliation

### Existing TNB methodology summary

The TNB 6-layer framework (docs/standards/tnb-methodology*.md) covers:
- **Layers 1-3:** Macro data discipline (monthly > quarterly, state transitions, cause-effect chains; US + VN economic stacks; source authority tiers).
- **Layer 4:** 4-Pillar asset valuation (money supply, cost of money, profit outlook, valuation risk) — macro-to-stock link.
- **Layer 5:** 6-step decisive framework (regime → US → VN → 4 pillars → confidence → gap flags).
- **Layer 6:** Gap catalogue (single-pillar thesis, inverted causality, source risk, lagged indicator, regime drift).

### Reconciliation table

| New Skill | Relationship to TNB | Category |
|-----------|--------------------|-|
| SKILL-1 `rapid-market-cap-screen` | **NEW** — TNB does not address stock-selection entry gate; TNB assumes a stock is already selected and audits the thesis. This is a pre-TNB rapid screen. | (c) Rapid-screen front-end before TNB |
| SKILL-2 `balance-sheet-first-read` | **ENHANCEMENT** — TNB Layer 4 Pillar 3 (profit outlook) includes BCTC reference but does not specify the market-cap-vs-assets comparison sequence or charter capital durability. This enhances the BCTC consumption layer. | (b) Enhancement to TNB Layer 4 |
| SKILL-3 `four-factor-synthesis` | **NEW** — TNB Layer 4 covers macro 4-pillar (money, cost, earnings, valuation risk) at the sector/macro level. SKILL-3 is a parallel company-level 4-factor framework. The two are complementary: TNB macro-to-sector, SKILL-3 company-level. Wire SKILL-3 output as one input to TNB Layer 5 "profit outlook" pillar. | (a) New skill; integrates into TNB Layer 5 as bottom-up input |
| SKILL-4 `ownership-governance-screen` | **NEW** — TNB has no governance layer. TNB Layer 6 gap catalogue mentions "source risk" but not equity ownership structure or insider signals. SKILL-4 is a net-new governance module. | (a) New skill; fills TNB governance gap |
| SKILL-5 `management-track-record` | **NEW** — TNB does not cover management verification. The TNB foundational philosophy ("muốn hiểu một cổ phiếu, cuối cùng vẫn phải hiểu doanh nghiệp phía sau nó...ban lãnh đạo có đủ năng lực lẫn đạo đức") states this intent but provides no methodology. SKILL-5 operationalises TNB's stated but unimplemented management check. | (b) Enhancement that operationalises TNB philosophy § |
| SKILL-6 `value-trap-avoidance` | **NEW** — TNB Layer 6 gap catalogue item "single-pillar thesis" is adjacent, but the concrete 2-failure-signal heuristic and price-earnings sync test are not present. SKILL-6 complements TNB Layer 6 at the company level. | (a) New skill; complements TNB Layer 6 |

**No duplication:** TNB macro-level 4-pillar (money supply, Fed rate, SBV rate, valuation risk) operates at macro/sector level. SKILL-3 operates at company level. They should be called in sequence: macro regime (TNB) → sector filter → company screen (SKILL-1 through SKILL-6) → deep TNB Layer 5 audit.

---

## 5. Workflow Gate Design

### The 5-minute rapid screen as a mandatory gate

**Before:** The cowork agents (bctc-analyst, tran-ngoc-bau, market-analyst) go directly to deep BCTC analysis and TNB Layer 5 audit for any ticker that appears in the watchlist or news.

**After:** A rapid screen gate runs first. Only PASS tickers proceed to deep analysis. SKIP tickers get a one-line reason logged and are dropped from the cycle.

### Gate flow

```
[ticker event / watchlist tick]
        ↓
  SKILL-1: rapid-market-cap-screen
  → SKIP-MICRO / SKIP-EXPENSIVE / PASS
        ↓ (PASS only)
  SKILL-2: balance-sheet-first-read
  SKILL-4: ownership-governance-screen   ← run in parallel
        ↓
  SKILL-3: four-factor-synthesis
  → Scenario 4 → SKIP (log reason)
  → Scenario 1/2/3 → PASS to deep analysis
        ↓ (Scenario 2 or 3 only)
  SKILL-6: value-trap-avoidance
  SKILL-5: management-track-record       ← triggered by YELLOW governance or Scenario 2/3
        ↓
  → CONVICTION GATE:
      Scenario 1 + no traps → DEEP-RESEARCH (bctc-analyst full + TNB Layer 5 audit)
      Scenario 2 + TRAP-RISK → WATCHLIST-ONLY (monitor, do not publish thesis)
      Scenario 3 + growth justified → DEEP-RESEARCH with growth qualifier
```

### Cowork slot placement

| Cowork agent | Where skills plug in | Flow step |
|---|---|---|
| **market-watcher** | SKILL-1 runs as Step 0b of ticker evaluation; replaces ad-hoc price check. SKILL-4 turnover ratio check runs alongside. | market-watcher cycle.md Step 1 (scan) |
| **bctc-analyst** | SKILL-2 runs as balance-sheet pre-read before deep BCTC extraction. SKILL-5 plan-accuracy check runs after quarterly BCTC loaded. | bctc-analyst main.md Step 2 |
| **tran-ngoc-bau (TNB)** | SKILL-3 four-factor synthesis feeds TNB Layer 5 Step 3 (map stock against pillars). SKILL-6 value-trap check runs before TNB publishes a CONVICTION call. | tnb-methodology Layer 5 Step 3 + 6 |
| **unified-agent (CHEF)** | SKILL-3 scenario verdict is a required input before CHEF includes a stock in any published dish (Telegram MARKET). Scenario 4 = blocked from publication. | chef.md Step 6 conviction check |
| **market-analyst / digest-predict** | SKILL-1 + SKILL-3 scenario used to filter which tickers merit a full analytical narrative vs. a mention-only note. | market-analyst flow Step 1 screen |
| **news-scout** | SKILL-4 insider-transaction check runs when news-scout detects insider disclosure filings. Flag INSIDER-EXIT triggers WORK channel alert. | news-scout trigger |

---

## 6. Implementation Handoff

### Phase A: Skill files for agent-father to create

All skills live at `.claude/skills/<name>/SKILL.md`. Cap: 120L per skill file.

| # | File path | Content scope | Priority |
|---|-----------|--------------|---------|
| A-1 | `.claude/skills/rapid-market-cap-screen/SKILL.md` | Steps 1-5 of SKILL-1; inputs (MCP calls); output schema | HIGH |
| A-2 | `.claude/skills/balance-sheet-first-read/SKILL.md` | Steps 1-7 of SKILL-2; flag definitions; output schema | HIGH |
| A-3 | `.claude/skills/four-factor-synthesis/SKILL.md` | 4-factor scoring rubric; 4-scenario matrix; output schema | HIGH |
| A-4 | `.claude/skills/ownership-governance-screen/SKILL.md` | 5-part governance check; red flag definitions; output schema | HIGH |
| A-5 | `.claude/skills/management-track-record/SKILL.md` | 6-step track record check; revenue-plan accuracy formula; output schema | MEDIUM |
| A-6 | `.claude/skills/value-trap-avoidance/SKILL.md` | 2-failure-signal heuristic; moat check; DGC-pattern check; conviction test | MEDIUM |

**Authoring rules for agent-father:**
- Each skill MUST start with `---` on line 1 (frontmatter required, agent-definition frontmatter rule).
- Do NOT exceed 120L per file (file-size-caps.json skill-file cap).
- If content would exceed 120L, extract the step bodies to a sibling `<name>-protocol.md` and keep SKILL.md as a pointer (same pattern as signal-dashboard-cap-extract brief).
- Use the exact output schema field names specified above — downstream agents will expect them.
- All MCP tool calls must use the `call_tool(server="vn-market", tool="...", arguments={...})` wrapper pattern (NEVER direct `mcp__vn-market__*`).

### Phase B: Flow-file edits for cowork-refactory-expert

| # | File to edit | Change |
|---|---|---|
| B-1 | `docs/agents/market-watcher/flow/cycle.md` | Add Step 0b: invoke `rapid-market-cap-screen` before ticker evaluation loop. SKIP-MICRO tickers are logged and dropped. |
| B-2 | `docs/agents/bctc-analyst/flow/main.md` | Add Step 2a: invoke `balance-sheet-first-read` before deep BCTC extraction; pass asset_coverage and pb_ratio to subsequent steps. |
| B-3 | `docs/agents/bctc-analyst/flow/main.md` | Add Step 5a: invoke `management-track-record` (plan-accuracy only) when quarterly BCTC is loaded and governance flag = YELLOW. |
| B-4 | `docs/standards/tnb-methodology-valuation.md` | Add reference note under Layer 5 Step 3: "See SKILL-3 four-factor-synthesis for bottom-up company-level 4-factor input to this step." |
| B-5 | `docs/agents/unified-agent/flow/chef.md` | Add Step 6a conviction gate: `four-factor-synthesis` Scenario verdict required; Scenario 4 = hard block on publication. |
| B-6 | `docs/agents/news-scout/flow/main.md` | Add trigger: on insider disclosure filing detection, invoke `ownership-governance-screen` SKILL-4 Step 2 (insider transaction check); INSIDER-EXIT flag → `send_telegram(channel="work", ...)`. |

**Note on flow-file caps:** All flow files are capped at 120L (file-size-caps.json). The edits in B-1 through B-6 are single-step insertions (1-3 lines each). If any target file is already near the 120L cap, agent-father must extract an existing step body to a child file before adding the new step (same pattern as drain-signals ESC-DISPATCH extraction).

---

## 7. Open Questions for PO

1. **Minimum market-cap floor for SKILL-1:** The brief proposes 500 billion VND default. PO should confirm or override based on current watchlist composition (30 tickers, some mid-caps).
2. **SKILL-4 foreign-holder threshold:** The brief uses ≥ 5% as a "counterweight present" threshold. Some quality VN companies have < 5% foreign ownership. PO may want to relax to ≥ 1% institutional (non-retail) foreign presence.
3. **Governance scoring integration with TNB Layer 4:** Currently TNB Layer 4 Pillar 3 (profit outlook) reads BCTC. If `four-factor-synthesis` adds a governance pillar not in TNB, PO must decide whether to update tnb-methodology-valuation.md to add a 5th pillar or keep the two frameworks parallel.

---

## 8. Signal

Signal to agent-father: `docs/signals/expert-rapid-analysis-skills-20260604T050342Z.json`

Content: implements 6 skill files (A-1 through A-6) + 6 flow edits (B-1 through B-6) as specified in §6. Priority: HIGH for Phase A (skills); MEDIUM for Phase B (flow edits, can follow after skills are created and tested).
