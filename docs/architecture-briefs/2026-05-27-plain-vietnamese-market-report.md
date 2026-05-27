# Architecture Brief: Plain-Vietnamese MARKET Report

**Date:** 2026-05-27
**Author:** agents-architect
**Status:** FINAL — ready for agent-father / cowork-refactory-expert implementation
**Slug:** plain-vietnamese-market-report

---

## Problem Statement

The user (non-technical, France-based, sole reader of the MARKET Telegram channel) reports that MARKET dishes are "very complicated to understand." Root cause: chef.md Step 7 — WRITE DISH mandates ANALYST-GRADE output that is correct for TNB audit purposes but incomprehensible to a layperson:

- Inline signal citations in paragraph 2: `(#3350, price_anomaly_20260518T1637)`, `tier-1`
- Metadata block appended to every dish: "TNB layers walked: Layer 1–6", "Signal IDs consumed", "source_tier values cited"
- Step 6.5 causal-chain sentences with `[gap: ...]` markers rendered verbatim
- Heavy technical jargon in body: σ values, `bp/pp`, `K-shaped bifurcation`, Hán-Việt Kinh Dịch terms (`Lão Âm Hào 6`)

The analysis rigor is architecturally correct — tran-ngoc-bau's daily audit depends on it. The problem is that all of this detail is currently fused into the single MARKET message. The user reads the same message that TNB audits.

---

## Decision: Flow-Change vs New Agent

**Chosen approach: Flow-change only (restructure chef.md Step 7).**

### Reasoning

| Factor | Flow-change | New agent |
|---|---|---|
| Fleet size / memory | Zero new agent — no cron slot, no token load, no failure point | New cron-driven agent = additional memory load on a host already at 8GB Docker cap |
| Signal dependency | None added | New agent needs to read chef output before it can rewrite it, adding a signal hop |
| Latency to MARKET | Same publish cycle | Adds a second cron slot downstream of chef; MARKET delivery delayed by one slot |
| TNB audit integrity | Preserved by routing detail to WORK + notebook | Same outcome but more complex |
| Failure modes | One fewer agent to fail/hang | New agent can hang without blocking MARKET or can over-fire |
| Maintenance surface | One file change (chef.md Step 7) | New agent .md + new flow + new tool package + new cron entry |

The user's two options map cleanly: option (a) (change the cowork analysis flow) = the lean choice. Option (b) (add a report-writer agent) adds cron load, latency, and a new failure class with no analytical gain. **Option (a) is the correct engineering choice on this host.**

---

## Architecture: Dual-Output Step 7

### Invariant to preserve

The TNB-auditable analysis (citations, layer numbers, signal IDs, causal chains with gap markers) MUST still exist so tran-ngoc-bau can verify layer-walk completeness. Currently TNB reads the MARKET dish directly (`read_telegram_reports(channel="market", limit=50)`). Under this new design, TNB will read the same WORK-channel detail block instead — no audit capability is lost.

### New Step 7 structure (two sends, one step)

**Block A — MARKET send (plain Vietnamese, user-facing)**

Content rules for Block A:
1. Lead: one to two sentences of plain Vietnamese stating what happened today in the market — direction, magnitude (delta %, not σ), plain sector name. No citations, no layer numbers, no signal IDs.
2. Body: what this means for the user's watchlist in plain language. Use everyday Vietnamese financial vocabulary: "tăng mạnh", "áp lực bán", "dòng tiền ngoại rút ra", "cổ phiếu ngân hàng chịu áp lực". Kinh Dịch hexagram may be mentioned by its Vietnamese plain-name only (e.g. "quẻ Thuần Kiền — thời điểm đỉnh cao") without Hán-Việt code, hào numbers, or σ values.
3. Tail: one sentence on what to watch next (a concrete price level, an event, or a timeframe) — no jargon.
4. Length: 3–6 sentences total. Readable in 30 seconds.
5. Format: flowing prose, full diacritics, NO inline citations, NO metadata block, NO `[gap:]` markers, NO sigma/bp/pp notation.

Send:
```
send_telegram(channel="market", message=<Block_A_text>)
```

**Block B — WORK send (analyst detail, TNB-auditable)**

Content rules for Block B:
Identical to what Step 7 currently sends to MARKET — the full analyst dish with:
- Causal-chain sentences from Step 6.5 verbatim (including `[gap:]` markers)
- Inline paragraph-2 citations (`#ID`, `price_anomaly_*`, `tier-1`)
- Metadata block: "TNB layers walked: Layer 1–6 | Signal IDs consumed: [...] | source_tier values cited: [...]"
- Full hexagram names in Hán-Việt (`Lão Âm Hào 6`)

Send:
```
send_telegram(channel="work", message="[CHEF-DETAIL] " + <Block_B_text>)
```

Block B replaces the existing coordination_and_status WORK send — it is still one send per dish cycle, just analytically rich.

### TNB audit path update

tran-ngoc-bau currently reads MARKET (`read_telegram_reports(channel="market", limit=50)`) to audit layer completeness. Under the new design, the full dish lives in WORK. The TNB audit flow must be updated to read WORK messages prefixed `[CHEF-DETAIL]` for its layer-walk audit, not MARKET.

The existing MARKET `read_audit_only` rule on tran-ngoc-bau is unchanged — TNB still reads MARKET (to check that it is plain and correct), but the layer-walk audit (Steps 1–4 in audit-market.md) targets `[CHEF-DETAIL]` WORK messages.

---

## Exact Files to Change

### F1 — `.claude/flows/unified-agent/chef.md` — Step 7 WRITE DISH

**Target section:** Lines 167–191 (## Step 7 — WRITE DISH through the `send_telegram` block)

**Before (current):**
```markdown
## Step 7 — WRITE DISH

**Format:** 2–4 narrative paragraphs in Vietnamese with full diacritics.

**Structure:**
1. **Regime context** — market hexagram state + macro regime (TIGHTENING/EASING/NEUTRAL) + US/VN stack summary
2. **Sector/ticker thesis** — qualifying clusters, pillar alignment, convergence evidence cited. Open this paragraph with the causal-chain sentence(s) from Step 6.5 verbatim. Then expand with supporting detail.
3. **Kinh Dịch overlay** — hexagram states for key tickers; reversal signals if any
4. **Action signal or watch** — high-conviction: clear action signal; medium: watch trigger; low: no recommendation

**Citation Discipline (paragraph 2 — TNB-auditable):**
Every claim in paragraph 2 MUST cite at least one of: signal ID (e.g. `#3350`), source file (e.g. `price_anomaly_20260518T1637`), or source_tier (`tier-1`). Citation format: inline parenthetical immediately after the claim — e.g. "VCB volume 10x average (#3350, price_anomaly_20260518T1637)". Claims without citations are a FLOW VIOLATION — self-correct by adding the citation or downgrading the claim to "unverified observation" and reducing conviction.

**Metadata to include in dish:**
- TNB layers walked: cite by number (Layer 1–6)
- Signal IDs consumed: list file names or IDs
- `source_tier` values cited

**Send:**
```
send_telegram(channel="market", message=<dish_text>)
```

No atom lists. No bullet-point ticker dumps. Every MARKET message is a narrative dish.
```

**After (replacement):**
```markdown
## Step 7 — WRITE DISH (Dual-Output)

Produce **two outputs** from the synthesized analysis: Block A for the user (MARKET channel — plain Vietnamese), Block B for TNB audit (WORK channel — analyst detail).

---

### Block A — MARKET message (plain Vietnamese, user-facing)

**Audience:** Non-technical user reading on a phone. Goal: comprehensible in 30 seconds.

**Structure (3–6 sentences total):**
1. What happened today — plain direction + delta % (e.g. "Thị trường hôm nay giảm nhẹ, VN-Index mất khoảng 0.8%").
2. What is driving it — plain Vietnamese (e.g. "Dòng tiền ngoại rút ra khỏi nhóm ngân hàng do áp lực tỷ giá USD/VND tăng").
3. What it means for the watchlist — name tickers in plain context (e.g. "VCB và TCB chịu áp lực bán, trong khi HPG hưởng lợi từ đơn hàng xuất khẩu").
4. Kinh Dịch context (optional, only if meaningful reversal signal): plain Vietnamese name only, no Hán-Việt code or hào numbers (e.g. "Quẻ thị trường đang ở trạng thái đỉnh Yang — tín hiệu cần thận trọng với đà tăng").
5. What to watch next — one concrete trigger (e.g. "Theo dõi mức kháng cự 26,500 VND/USD trong phiên ngày mai").

**Format rules:**
- Full diacritics, flowing prose.
- NO inline citations (`#ID`, `price_anomaly_*`, `tier-1`).
- NO metadata block (no "TNB layers walked", no "Signal IDs consumed").
- NO `[gap: ...]` markers.
- NO σ / bp / pp notation.
- NO Hán-Việt hexagram codes (`Lão Âm Hào 6`) — use plain Vietnamese name only.
- NO bullet-point ticker dumps. Every MARKET message is narrative prose.

**Send:**
```
send_telegram(channel="market", message=<Block_A_text>)
```

---

### Block B — WORK analyst detail (TNB-auditable)

**Audience:** tran-ngoc-bau audit. Contains the full 6-layer analysis.

**Content:** Full analyst narrative — identical in depth to the former single MARKET dish:
- Causal-chain sentences from Step 6.5 verbatim (including `[gap: ...]` markers)
- Paragraph 2 with inline citations: signal ID (`#3350`), source file (`price_anomaly_*`), source_tier
- Citation Discipline: every paragraph-2 claim MUST cite ≥1 of: signal ID, source file, source_tier. Claims without citations are a FLOW VIOLATION — self-correct or downgrade to "unverified observation".
- Metadata footer: "TNB layers walked: Layer 1–6 | Signal IDs consumed: [...] | source_tier values cited: [...]"
- Full hexagram names in Hán-Việt (`Lão Âm Hào 6`) — TNB expects canonical terminology.

**Send:**
```
send_telegram(channel="work", message="[CHEF-DETAIL] <DISH_TYPE> <HH:MM UTC>\n" + <Block_B_text>)
```

The `[CHEF-DETAIL]` prefix is mandatory — it allows tran-ngoc-bau's audit flow to filter WORK messages precisely.
```

---

### F2 — `.claude/flows/tran-ngoc-bau/audit-market.md` — Phase 1 Step 1 audit target

**Target section:** Phase 1, Step 1 — currently reads `channel="market"` for layer-walk audit.

**Before (current Phase 1 step 1 text):**
```markdown
**Step 1 — Read MARKET channel**
`read_telegram_reports(channel="market", limit=50)` → last 50 messages

For each message, check:
- [ ] Vietnamese diacritics present (no mojibake, no missing marks)
- [ ] Message structure follows `docs/standards/alert-message-format.md`
...
- [ ] **Pillar coverage** — investment-thesis messages reference ≥3 of {M2, COC, EPS, POL} per `tnb-methodology.md` Layer 4. Score logged for Phase 2.5.
```

**After (replacement):**
```markdown
**Step 1a — Read MARKET channel (plain-language check)**
`read_telegram_reports(channel="market", limit=10)` → last 10 MARKET messages

For each MARKET message check:
- [ ] Vietnamese diacritics present (no mojibake, no missing marks)
- [ ] Message is plain Vietnamese prose — no inline citations (`#ID`, `price_anomaly_*`), no `[gap:]` markers, no metadata block
- [ ] Message is 3–6 sentences and comprehensible to a non-technical reader
- [ ] Ticker direction + delta % visible (not σ notation)
- [ ] No bullet-point ticker dumps (narrative only)

**Step 1b — Read WORK channel for analyst detail (layer-walk audit)**
`read_telegram_reports(channel="work", limit=20)` → filter messages starting with `[CHEF-DETAIL]`

For each `[CHEF-DETAIL]` message (one per dish — Morning / EOD / Evening), check:
- [ ] Message structure follows `docs/standards/alert-message-format.md`
- [ ] Confidence displayed as 0–1 decimal (not percentage, not raw integer)
- [ ] Regime caveat appended when required (TIGHTENING + bullish must have caveat)
- [ ] Ticker symbol valid (in watchlist or known VN stock)
- [ ] No duplicate messages (same ticker + same signal type within 2h)
- [ ] **Pillar coverage** — investment-thesis references ≥3 of {M2, COC, EPS, POL} per `tnb-methodology.md` Layer 4. Score logged for Phase 2.5.
- [ ] Causal-chain sentence from Step 6.5 present in paragraph 2
- [ ] Inline citations present in paragraph 2 (signal ID / source file / source_tier)
- [ ] TNB metadata footer present: "TNB layers walked", "Signal IDs consumed", "source_tier values cited"
```

---

### F3 — `.claude/agents/unified-agent.md` — MARKET channel rule

**Target section:** `permissions.channels.market.rule`

**Before:**
```yaml
      market:
        write: true
        rule: chef_dishes_only  # 2-4 paragraph narrative dishes ONLY; no atom lists; no cycle headers
```

**After:**
```yaml
      market:
        write: true
        rule: chef_dishes_only  # 2-4 sentence plain-Vietnamese narrative ONLY; no citations, no metadata block, no [gap:] markers, no sigma/bp/pp, no Hán-Việt hexagram codes; no atom lists; no cycle headers
```

No other constraint fields need changing. `no_atom_list_to_market` remains. The WORK `coordination_and_status` rule accommodates `[CHEF-DETAIL]` messages — no rule text change required there (CHEF-DETAIL is a coordination artefact, consistent with the existing rule intent).

---

### F4 — `.claude/agents/tran-ngoc-bau.md` — audit capability description (minor)

**Target section:** `capabilities` list item 1

**Before:**
```yaml
    - Read unified-agent MARKET dishes (last 3 daily posts) from Telegram MARKET channel
```

**After:**
```yaml
    - Read unified-agent plain-Vietnamese MARKET dishes (readability check) + [CHEF-DETAIL] WORK messages (6-layer audit) — last 3 daily dish cycles
```

This keeps the agent definition accurate after the flow change.

---

## BEFORE / AFTER: MARKET Message Example

### BEFORE (current — analyst-grade, sent to MARKET)

```
Thị trường hôm nay phản ánh áp lực tỷ giá mạnh từ cú hawkish hold của Fed tháng 5.
Fed hawkish hold → VND carry pressure +0.4σ → banking sector net-sell by foreigners → VCB price +4.12% on SOE inflow contradicts the macro signal (#3350, price_anomaly_20260518T1637, tier-1).
Quẻ thị trường: Thuần Kiền — Lão Dương (老陽), hexagram peak, caution warranted.
VCB: M2 (cung tiền giảm), COC (chi phí vốn tăng), EPS (BCTC Q1 beat), POL (room ngoại 12%) → conviction MEDIUM. [gap: no FX reserve data for cycle] — conviction adjusted LOW on carry chain.
TNB layers walked: Layer 1 (USD/VND +0.3% crossing 25,800 — state transition), Layer 2 (Fed EFFR-IORB spread +12bp tightening signal), Layer 3 (USD/VND above 25,500 carry trigger), Layer 4 (4-pillar: 3/4 aligned MEDIUM), Layer 5 (Thuần Kiền Lão Dương reversal signal), Layer 6 (carry gap flagged).
Signal IDs consumed: price_anomaly_20260518T1637, news_impact_20260518T0910 | source_tier values cited: tier-1, tier-2
```

### AFTER (new Block A — sent to MARKET)

```
Hôm nay VN-Index giảm nhẹ khoảng 0.8%, chịu áp lực từ tỷ giá USD/VND tăng sau quyết định giữ lãi suất cao của Fed.

Dòng tiền ngoại rút khỏi nhóm ngân hàng — VCB và TCB giảm trong khi khối nội mua đỡ. Nhóm thép (HPG) đứng vững nhờ đơn hàng xuất khẩu.

Tín hiệu Kinh Dịch thị trường đang ở trạng thái đỉnh — cần thận trọng với đà tăng tiếp theo.

Điểm cần theo dõi: mức tỷ giá 25,800 VND/USD trong phiên ngày mai và số liệu PMI tháng 5 công bố cuối tuần.
```

(4 sentences, plain Vietnamese, no citations, comprehensible to a non-technical reader)

### AFTER (new Block B — sent to WORK with [CHEF-DETAIL] prefix, for TNB audit)

```
[CHEF-DETAIL] morning 05:23 UTC
Fed hawkish hold → VND carry pressure +0.4σ → banking sector net-sell by foreigners → VCB price +4.12% on SOE inflow contradicts the macro signal (#3350, price_anomaly_20260518T1637, tier-1). [gap: no FX reserve data for cycle] — conviction LOW on carry chain.
VCB: M2 (cung tiền giảm), COC (chi phí vốn tăng từ EFFR-IORB +12bp), EPS (BCTC Q1 beat, #fundamental_20260518T0822), POL (room ngoại 12%) → conviction MEDIUM → downgraded LOW per carry gap.
Quẻ thị trường: Thuần Kiền — Lão Dương (老陽), hexagram peak; VCB: Sơn Hỏa Bí — caution.
TNB layers walked: Layer 1 (USD/VND +0.3% crossing 25,800 state transition), Layer 2 (Fed EFFR-IORB +12bp tightening), Layer 3 (USD/VND above 25,500 carry trigger), Layer 4 (4-pillar: 3/4 aligned, MEDIUM → LOW), Layer 5 (Thuần Kiền Lão Dương reversal), Layer 6 (carry gap flagged, regime-drift applied).
Signal IDs consumed: price_anomaly_20260518T1637, news_impact_20260518T0910 | source_tier: tier-1, tier-2
```

---

## TNB Audit Integrity: How it is Preserved

| Audit concern | How preserved |
|---|---|
| All 6 layers present | Block B contains identical layer-walk + citation depth as current MARKET dish |
| Causal-chain sentences (Step 6.5) | Carried verbatim into Block B |
| Inline citation discipline | Enforced in Block B (paragraph-2 rule unchanged) |
| Metadata footer | Carried into Block B |
| tran-ngoc-bau can find the dish | TNB audit-market.md Step 1b filters `[CHEF-DETAIL]` WORK messages — one message per dish, consistent with current 3 dishes/day |
| MARKET plainness check | TNB Step 1a now also verifies that MARKET messages are plain (new positive audit gate) |

No audit capability is lost. TNB now audits a slightly richer WORK pipeline (one more filter step), which takes negligible tokens given that tran-ngoc-bau already reads WORK.

---

## Sequencing and Dependencies

1. **F1 (chef.md Step 7)** — implement first. This is the source of both outputs. Atomic change.
2. **F3 (unified-agent.md market rule)** — implement in same pass as F1. Updates the constraint text to match the new output spec.
3. **F2 (audit-market.md Step 1)** — implement second, after F1+F3. TNB reads what chef sends; if chef changes first, TNB's next audit cycle catches the new format.
4. **F4 (tran-ngoc-bau.md capabilities)** — implement in same pass as F2. Minor text accuracy update.

No new cron slots. No new agents. No new tool packages. No new signals. No DB schema changes.

---

## agent-md-factory compliance

- SSOT: the `[CHEF-DETAIL]` prefix is defined once in chef.md Step 7 Block B and referenced once in tran-ngoc-bau audit-market.md Step 1b. No duplication.
- DRY: citation discipline rules (signal ID / source file / source_tier) are stated once in Block B — not re-stated in unified-agent.md frontmatter.
- Lazy-load: no new knowledge files triggered. All four changed files stay within existing load patterns.
- Tree-DAG: chef.md → [MARKET (Block A), WORK Block B] → [user, tran-ngoc-bau audit-market.md]. No cycles.
- No hardcoded stats: no tool/agent counts in any of the four files.
- Line caps: chef.md is currently 229L (size-justified). Adding dual-output Step 7 expands by ~35L. Updated justification comment required: "dual-output Step 7 splits MARKET (plain-VI) from WORK (TNB-auditable) — atomic responsibility, cannot split without breaking recipe coherence; expected ~264L."

---

## Implementation Hand-off (agent-father + cowork-refactory-expert)

### For cowork-refactory-expert (flow .md changes)

**Task 1:** Edit `.claude/flows/unified-agent/chef.md` — replace Step 7 (## Step 7 — WRITE DISH through the `send_telegram` line) with the Dual-Output Step 7 spec above (F1). Update the size-justification comment to ~264L.

**Task 2:** Edit `.claude/flows/tran-ngoc-bau/audit-market.md` — replace Phase 1 Step 1 with Step 1a + Step 1b as specified in F2.

### For agent-father (agent .md changes)

**Task 3:** Edit `.claude/agents/unified-agent.md` — update `permissions.channels.market.rule` text as specified in F3.

**Task 4:** Edit `.claude/agents/tran-ngoc-bau.md` — update `capabilities` list item 1 as specified in F4.

### Verification gate (after implementation)

QA check: on the next morning-dish run, confirm:
1. MARKET channel contains a 3–6 sentence plain-Vietnamese message with no `#ID`, no `[gap:]`, no metadata block.
2. WORK channel contains a `[CHEF-DETAIL] morning` message with citations, layer metadata, and causal-chain sentence.
3. tran-ngoc-bau audit (next 20:13 UTC cycle) reports PASS on layer completeness using the WORK `[CHEF-DETAIL]` source.
