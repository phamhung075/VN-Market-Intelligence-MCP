---
name: narrative-formatter
description: Format alert/message with narrative structure — Why/Confirms/Kinh/Next/Risk
type: reusable-skill
usage: Alert Commander, Digest & Predict
---

# Narrative Formatter Skill

**Purpose:** Transform raw signal data into actionable Telegram message (not just metrics).

## Input

```
{
  stock: "VCB",
  action: "SELL",
  conviction: 0.80,
  severity: "HIGH",

  why: {
    catalyst: "BCTC Q1 ROE down 2% YoY",
    sources: ["02-financial-analyst", "01-news-scout"],
    news_detail: "Legal risk: Tax audit started"
  },

  confirmation: {
    count: 4,
    total: 6,
    agents: [
      "Price oversold (RSI 28)",
      "News negative (-0.3 sentiment)",
      "Kinh Dich 29 (Risk phase)",
      "Foreign flow -500k/3d"
    ]
  },

  kinh_dich: {
    hex: 29,
    meaning: "坎 (Kan) — Risk/Water. Repeat danger, sincerity succeeds.",
    timing: "3-5 days to recovery",
    next_hex: 53
  },

  position_context: {
    in_portfolio: true,
    cost: 82500,
    current: 75000,
    stop_loss: 76725,
    pnl_pct: -9.1
  },

  next_reassess: {
    trigger: "Price recovers +1% OR FII net-buy OR news sentiment >= -0.1",
    days: 3
  },

  risks: [
    "Further drop possible before recovery (Hex 29)",
    "Tax audit outcome unknown (binary risk)",
    "FII might continue selling if market rotates"
  ]
}
```

## Process

### Output Format Template

```
🔴 {STOCK} — {ACTION} [{CONVICTION_PCT}% xac tin]

WHY?
{CATALYST}
Tin tuc: {NEWS_DETAIL}

CONFIRMS?
{AGENT_COUNT}/{TOTAL}: {AGENT_SIGNALS}

KINH DICH:
{HEX_NAME} '{MEANING}'
Thoi gian: {TIMING}
Hex ke tiep: {NEXT_HEX}

NEXT?
Danh gia lai: {TRIGGER}
Thoi gian: {DAYS}d

RISK?
• {RISK_1}
• {RISK_2}
• {RISK_3}

{ACTION_DETAIL}
```

## Example Output

```
🔴 VCB — SELL [80% xac tin]

WHY?
Q1 BCTC: ROE -2% YoY. Loi nhuan chi tang 0.3%.
Tin tuc: Kiem toan thue bat dau. Hiem ro ve ket qua.

CONFIRMS?
4/6 agents: RSI 28 (oversold) + Sentiment -0.3 + Kinh Dich 29 (Risk) + FII -500k/3d

KINH DICH:
坎 (Kan) — Risk. Lap di lap lai. Hanh duong thanh tu.
Thoi gian: 3-5 ngay hoi phuc
Hex ke tiep: 53 (Tien tien)

NEXT?
Danh gia lai: Gia tang +1% HOAC FII quy tro HAY Tin tuc tot
Thoi gian: 3 ngay

RISK?
• Co the giam them truoc khi hoi phuc (Kinh Dich 29)
• Ket qua kiem toan thue co the xau them
• FII co the ban tiep neu thi truong xoay

POSITION: -9.1% (75,000). Stop-loss: 76,725. Kha nang: Gia het -> cam ket them -2.3%

CAVEMAN: VCB down hard. BCTC weak. Tax audit risk. 4 sources say sell. Kinh Dich = risk phase, recovery 3-5d. Reassess when +1% bounce or FII turns.
```

## Usage In Agent

### **Alert Commander** (Before send_telegram)
```python
alert_data = {
    stock: "VCB",
    action: "SELL",
    conviction: get_conviction(...),
    why: analyze_catalyst(...),
    confirmation: check_consensus(...),
    kinh_dich: interpret_hex(...),
    position: get_user_positions_for_analysis(...),
    next_reassess: calculate_triggers(...)
}

message = narrative_formatter(alert_data)
send_telegram(channel="market", message=message)
```

### **Digest & Predict** (Weekly digest alerts)
```python
for alert in week_alerts:
    narrative = narrative_formatter({
        stock: alert.stock,
        action: alert.direction,
        conviction: alert.conviction,
        why: alert.catalyst,
        confirmation: alert.agent_count,
        kinh_dich: alert.hex,
        next_reassess: alert.reassess_date
    })

    digest += narrative + "\n\n"

send_telegram(channel="market", message=digest)
```

## Rules

1. **Always include all 5 sections** — Why, Confirms, Kinh, Next, Risk
2. **Use Vietnamese for MARKET channel** — Diacritics proper (xac tin, tin tuc, etc)
3. **Show conviction clearly** — {PCT}% not hidden
4. **List agents by name** — Not "3 sources" but "Price (MW) + News (NS) + Kinh (Hex 29) + FII (MW)"
5. **Set reassess trigger** — "When X happens, re-evaluate" (not vague)
6. **Show position context** — If user owns stock, show P/L + stop-loss impact
7. **Add risk explicitly** — Not optimistic; show what could be wrong
8. **CAVEMAN at end** — Ultra-short TL;DR for speed reading

## Output Quality Checklist

- [ ] WHY section explains fundamental catalyst (not just price move)
- [ ] CONFIRMS shows 4+ independent sources (not single agent)
- [ ] KINH DICH section includes hex meaning + timing + next hex
- [ ] NEXT includes specific reassess trigger (not vague "watch this")
- [ ] RISK section lists ≥2 failure scenarios
- [ ] Vietnamese diacritics correct (xác tín, tin tức, etc)
- [ ] Message length <400 chars (fits Telegram)
- [ ] Conviction visible in headline ([XX%])
- [ ] User can decide: hold/sell based on risk tolerance
- [ ] CAVEMAN provides 30-second summary

---

**Integration:**
- Add to: 05-alert-commander.md (EVERY send_telegram call), 06-digest-predict.md (weekly digest)
- Replaces: Ad-hoc message formatting
- Saves tokens: ~200 per cycle (structured output)
