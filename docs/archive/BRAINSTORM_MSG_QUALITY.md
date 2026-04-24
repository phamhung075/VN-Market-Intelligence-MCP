# Brainstorm: Fixing Agent MARKET Channel Message Quality

**Problem Statement:**
- User reads MARKET Telegram messages → not useful
- Lost Kinh Dich analysis (was providing context, now missing)
- Agents send raw signals/data without interpretation
- Messages lack conviction, narrative, actionable insight

**Root Causes Identified:**

## 1. **No Systematic Kinh Dich Integration**
- Tools available: `get_kinhdich_reading()`, `get_market_hexagram()`, `get_hexagram_history()`
- **Reality:** Agent instructions don't REQUIRE these calls
- Current agents (04 Market Watcher, 05 Alert Commander, 06 Digest) CAN pull hexagrams but don't systematically
- **Missing:** Kinh Dich is not a mandatory context layer in decision logic

## 2. **Raw Signal → Telegram (No Interpretation)**
- Alert Commander fires alerts based on config thresholds (stop-loss/price moves)
- Digest sends market summaries (news, sentiment, returns)
- **Missing:** Neither agent translates signals into "why this matters" + "what to do"
- Example: "VCB price up 2.5% + Kinh Dich = Hexagram 29 (坎 Kan/Risk)" → **Story missing**

## 3. **Conviction Score Not Embedded in Output**
- Tools track: `conviction_score`, `evidence_scores`, `calibration_report`
- **Reality:** Agent messages don't show HOW CONFIDENT the system is
- User sees alert but doesn't know if it's 60% or 95% conviction

## 4. **No Systematic Sector/Macro Context**
- Agents pull: prices, BCTC, news individually
- **Missing:** Holistic "why is THIS stock moving when sector is DOWN?"
- Example: HPG +3% while STEEL sector is -1% → signal strength not explained

## 5. **Lack of Comparative Framing**
- Current alerts: "VCB hit stop-loss at 75,000 VND"
- Missing: "...vs 52-week avg 82,500. RSI oversold. Kinh Dich 11 (泰 Thai/Peace) suggests recovery bounce likely"
- Without peer comparison, user can't contextualize

---

## Proposed Solutions

### **A. Make Kinh Dich Mandatory Context (Not Optional)**

**Modify all 3 MARKET senders:**

#### Alert Commander (05):
```
BEFORE firing any alert:
1. get_kinhdich_reading(stock)
2. Interpret hexagram in context of signal:
   - Signal = bullish price move → Hexagram 11/16/34 = VALIDATES
   - Signal = bearish price move → Hexagram 19/20/29 = VALIDATES
   - Signal contradicts Kinh Dich → SUPPRESS (false alarm)
3. Format output:
   "{stock} — {action} ({conviction}%)
    Signal: {catalyst}
    Kinh Dich: {hexagram_name} '{meaning}' → {validates/contradicts/neutral}
    Conviction: {conviction_score}x"
```

#### Digest & Predict (06):
```
For each stock in digest:
1. get_kinhdich_reading(stock)
2. get_hexagram_history(stock, days=30) → trend in readings
3. Include section:
   "Thị trường dự báo:
    - VCB (Hex 11→14→29): Hexagram trend shows volatility → low conviction this week
    - HPG (Hex 34→34→34): Stable hex → momentum building
    - FPT (Hex 63→64): Change imminent → watch for catalysts"
```

#### Market Watcher (04):
```
When posting price_anomaly signals:
1. get_kinhdich_reading(stock)
2. ONLY post if price move ALIGNS with hexagram
3. Example:
   price_anomaly(VCB, -3%, Hex 29/坎) → "Risk signal validates hex" → post
   price_anomaly(VCB, +2%, Hex 11/泰) → "Peace hex but price rising?" → CHECK before posting
```

---

### **B. Add Conviction Visibility**

**Modify all agent outputs to show confidence:**

```
Current:
"VCB: stop-loss hit at 75,000"

Proposed:
"🔴 VCB [CRITICAL — 95% conv] Stop-loss at 75,000
   - 3-day consensus: bearish (News Scout + Financial Analyst + Market Watcher)
   - Kinh Dich 29: Risk phase, recovery likely 3-5d
   - Position danger: true (stop-loss + news + hex align)"
```

**Tools to use:**
- `get_evidence_summary(stock)` → shows all contributing factors + magnitudes
- `get_calibration_report()` → agent accuracy baseline
- `get_alert_accuracy()` → signal type hit rate (not just single alert)

---

### **C. Add Sector/Macro Framing**

**Digest & Predict Step 2 (Compile) → add:**

```
1. get_sector_rotation() → which sectors have inflow/outflow
2. For each alert stock:
   - Check sector peer movement
   - If stock moves opposite sector → highlight as anomaly
   - Example: "VCB +1.5% while BANKING -0.8% → relative strength signal"
3. get_macro_snapshot() → oil/gold/USD trends
   - If tech alert firing + oil down → explain: "Tech benefiting from energy cost relief"
```

**Tool:** `get_sector_comparison(stock)` per alert → peer context always included

---

### **D. Add Comparative Context (52W avg, peer P/E, etc)**

**Alert Commander Step 2 (Fire) → add:**

```python
# Before send_telegram():
stock_context = {
    "current_price": price,
    "52w_avg": get_price_history(stock, days=252).avg(),
    "sector_median_pe": get_sector_comparison(stock).peer_metrics.median_pe,
    "foreign_flow_3d": get_foreign_flow(stock, days=3).direction,
    "insider_activity": get_insider_transactions(stock, days=7).count()
}

# Format for telegram:
"{stock} {action}
 Price: {current} ({52w_comparison})
 Valuation: {pe_vs_sector}
 Flow: {foreign_flow} | Insiders: {activity}
 Conviction: {score}x | Kinh Dich: {hex}"
```

---

### **E. Standardize "Narrative Structure" (Not Just Metrics)**

Every MARKET message should follow:

```
1. HEADLINE: Action + Severity (🟢🟡🔴)
2. WHY: Catalyst (news/BCTC/price/insider/macro)
3. CONFIRMATION: How many agents agree (consensus strength)
4. WISDOM: Kinh Dich context (what does the pattern say?)
5. NEXT: When to reassess (24h, after earning, etc)
6. RISK: What could be wrong (false positive detector)
```

Example:
```
🟡 VCB — Consolidation phase [MEDIUM CONV 68%]
WHY: BCTC ROE down 2% YoY + foreign outflow last 2d
CONFIRMS: Kinh Dich 29 (Risk) + Price RSI oversold (27)
CONSENSUS: News Scout (negative outlook) + Market Watcher (price weakness) — 2/3 agents
KINH DICH: Hexagram 29→53 trend (risk→gradual progress) — recovery likely by Friday
NEXT: Reassess after Thursday Macroeconomic data release
RISK: Could be rotation play, not fundamental weakness
```

---

## Implementation Plan

### Phase 1: Descriptor Updates (Agent Files)
1. **04-market-watcher.md** → Require Kinh Dich check before posting price_anomaly
2. **05-alert-commander.md** → Require Kinh Dich context in every alert, show conviction
3. **06-digest-predict.md** → Add Kinh Dich trend section + sector comparison frame

### Phase 2: Tool Usage Audit
1. Check current agent code (if any fixed Python/JS) — do they call `get_kinhdich_reading()`?
2. Check MCP tool registry — ensure all agents have access to:
   - `get_kinhdich_reading()` ✓
   - `get_evidence_summary()` ✓
   - `get_sector_comparison()` ✓
   - `get_calibration_report()` ✓
3. Ensure `get_hexagram_history()` + `get_transition_probabilities()` are called weekly (for trends)

### Phase 3: Test Output Quality
1. Run one cycle of agents with new instructions
2. Sample output from MARKET channel
3. Compare with "Narrative Structure" template
4. Iterate until user sees improvement

---

## Critical Shifts Needed

| Current | Proposed |
|---------|----------|
| "Alert fired (config threshold)" | "Alert fired (multi-agent consensus + Kinh Dich validates)" |
| "Stock up 2.5%" | "Stock up 2.5% in down sector (relative strength + Hex 34 momentum)" |
| "News sentiment -0.3" | "News sentiment -0.3 (legal risk) but Kinh Dich 11 suggests recovery phase" |
| "No conviction shown" | "Conviction 78% (2/3 agents agree, calibration 0.85)" |
| "Monthly digest = data dump" | "Monthly digest = narrative with Kinh Dich trends + peer comparison" |

---

## What You're Missing (Kinh Dich)

Your previous Kinh Dich analysis WAS useful because it:
1. ✅ Provided pattern context (what does the hexagram mean for trading?)
2. ✅ Showed conviction (are we reading the pattern correctly?)
3. ✅ Gave timing hints (hexagram transitions predict reversals)
4. ✅ Balanced fundamentals (BCTC can be wrong, but pattern doesn't lie)

Current system LOST this because:
- Agents have tools to call it → but don't REQUIRE it
- No guidance on interpreting Kinh Dich + price/news together
- No narrative structure → just raw signals

---

## User Decision Point

**Questions to clarify scope:**

1. **Scope of redesign:**
   - Just agent .md file rewrites (descriptions + mandatory steps)?
   - Or also MCP tool additions (e.g., `get_convition_narrative()` helper)?

2. **Kinh Dich weight:**
   - Should hexagram override fundamental signals? (e.g., "news bearish but Hex 11 says buy")
   - Or interpret together? (e.g., "news bearish + Hex 29 = temporary dip before recovery")

3. **Output format:**
   - Keep current Telegram brevity?
   - Or longer narrative (3-5 lines per alert) for Kinh Dich context?

4. **Agent priority:**
   - Start with Alert Commander (most visible)?
   - Or all three simultaneously?
