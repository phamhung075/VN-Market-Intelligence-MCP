# Kinh Dịch Cowork Diagnostics

SSOT reference for hexagram-based agent diagnostics. Load when: auditing cowork agent health, detecting system imbalance, implementing hexagram reading flows.

---

## 6 Hào (Lines) Measurement Table

Each agent = 6-line system. Each line = one health dimension.

| Hào | Dimension | Healthy Check | Tool | Healthy State | Lao Am (Danger) |
|-----|-----------|---------------|------|---------------|-----------------|
| **1** | Tool Access | MCP gateway UP? | `get_system_status()` → `mcpServerHealth` | "UP" | "DOWN" or error |
| **2** | Data Freshness | Inputs current? | `get_system_status()` → `freshness.*` | All < maxStaleness | Any > max |
| **3** | Execution | Cycle completed clean? | Session log check | "Cycle HH:MM OK" | "BLOCKED" or H1/H2/H3 |
| **4** | Output Quality | Format correct? | `read_telegram_reports(limit=3)` | All pass format | Any fails |
| **5** | Integration | Downstream received? | Compare signals posted vs downstream bootstrap | Signal in downstream | Signal missing |
| **6** | Memory | Session consistent? | Session file size check | Size monotonic ↑ | Size decreased (overwrite) |

---

## Severity Scale

Count how many lines are Lao (changing):

- **0 changing lines** = HEALTHY (skip audit)
- **1 line** = STRAIN (monitor next cycle)
- **2 lines** = TRANSITION (audit this agent)
- **3+ lines** = CRITICAL (full audit + auto-cure)
- **4+ lines** = CASCADE (suspend agent + escalate BUG immediately)

---

## 5 Diagnostic Patterns

**Pattern 1 — "Kham doubled" (Cascade):**
Hào 1 Lao Am (tool blocked) + Hào 3/5/6 also Lao → fix Hào 1 FIRST. Suspend agent. Do NOT try to fix downstream lines independently. Tool access is root; execution/signal/memory follow.

**Pattern 2 — "Overcorrection" (Lao Duong Hào 4):**
Agent over-corrected output format. Monitor 3 cycles. Usually self-corrects. Do NOT force.

**Pattern 3 — "Data Staleness" (Hào 2 Lao Am):**
Source delayed. If recovery < 2h: allow degraded state. If > 2h: escalate BUG.

**Pattern 4 — "Memory Corruption" (Hào 6 Lao Am):**
Session file overwritten (size decreased). IMMEDIATE action. Add anti-overwrite guard. Escalate BUG.

**Pattern 5 — "Hallucination" (Hào 3 Lao Am + Hào 1 Steady):**
Tools available but agent skipped them. Added anti-hallucination guard + verify cycle-bootstrap followed.

---

## Trigram-Agent Mapping

| Trigram | Symbol | Agent(s) | Nature |
|---------|--------|----------|--------|
| **Càn** | ☰ Heaven | PO, Unified Coordinator | Vision, initiation, direction-setting |
| **Khôn** | ☷ Earth | Developer, Fixer | Execution, form-giving, faithful response |
| **Chấn** | ☳ Thunder | Alert Commander, Market Watcher | Shock, signal detection, sudden stimulus |
| **Tốn** | ☴ Wind | News Scout, BA | Penetration, information flow, persistence |
| **Khảm** | ☵ Water | Architect, Financial Analyst | Danger, depth, navigation through obstacles |
| **Ly** | ☲ Fire | Digest & Predict, Market Analyst | Illumination, clarity, synthesis |
| **Cấn** | ☶ Mountain | QA, System Auditor, Trần Ngọc Báu | Quality gate, stillness, preventing wrong motion |
| **Đoài** | ☱ Lake | QA Responder, Cowork Refactory | Surface clarity, communication, user interface |

---

## Trung Chính Metric

**Trung** = centered (agent in correct position)
**Chính** = correct (agent acts according to nature, not against it)

**Trung Chính = highest quality state.** Agent in right role, doing right thing, at right time.

Binary metric: Trung Chính ✅ or NOT ✅

**Trung Chính tests:**
- Is agent in its correct position (role)?
- Are outputs going to correct channel?
- Is methodology followed (regime check, signal threshold, Kinh Dịch reading)?
- Is timing correct (agent runs at scheduled Thời)?
- Is memory intact (session appended not overwritten)?

---

## Thời (Timing) Reference

Agent runs at correct moment, not just correct frequency.

| Agent | Correct Thời | Reason |
|-------|-------------|--------|
| **news-scout** | 15 min always | Wind penetrates always; complete intelligence needed |
| **market-watcher** | 5 min market hours, 2h off-hours | Prices move during market; Thunder must respond immediately |
| **alert-commander** | 10 min market, 30 min off-hours | Alert when anomaly possible; silence appropriate off-hours |
| **digest-predict** | 22:30 VN (end of day) | Synthesis after all intra-day work complete |
| **financial-analyst** | 08:00 + 20:00 VN (2x daily) | After market open + after close |
| **tran-ngoc-bau** | 20:00 VN | Audit AFTER day's work done, not during |
| **unified-agent** | 22:00 VN daily, 20:00 Sunday | Coordination after daily agents run |

**Thời violation:** Agent runs on schedule but tools unavailable = action without resource = wrong time.

---

## Hexagram Assignment (for Session Tracking)

Every cycle: assign each agent a hexagram. Track transitions.

Select key hexagrams:

| Hexagram | Number | Pattern | Meaning |
|----------|--------|---------|---------|
| Qian/Can | 1 | ☰/☰ | Full creative power (healthy startup) |
| Kun/Khon | 2 | ☷/☷ | Pure execution, no deviation |
| Chun (Difficulty) | 3 | ☳/☵ | New system struggling; Thunder in Water |
| Mong (Youthful Folly) | 4 | ☵/☶ | Inexperience meets stillness; hallucination zone |
| Xu (Waiting) | 5 | ☵/☶ | Clouds in heaven; nourishment coming but delayed |
| Shi He (Biting Through) | 21 | ☳/☲ | Thunder + Fire = verified force; correct |
| Pi (Standstill) | 12 | ☷/☰ | Heaven + Earth separated; feedback loop broken |
| Tai (Peace) | 11 | ☰/☷ | Inner power, outer receptivity; target state |
| Ding (Cauldron) | 50 | ☴/☲ | Wind below Fire = nourishing transformation; healthy digest |
| Huan (Dispersion) | 59 | ☵/☴ | Water below Wind = losing coherence; regime drift |
| Jing (Well) | 48 | ☴/☵ | Inexhaustible source; tools available but rope broken (MCP blocked) |
| Ko (Revolution) | 49 | ☲/☱ | Fundamental change required; architect-level redesign |

**Drift warning:** If hexagrams trend toward Pi/Huan/Mong away from Qian/Kun/Ding → system degrading.

---

## Phase 0 — Hexagram Reading (for TNB Flow)

Run BEFORE all detailed audit phases.

**For each cowork agent (8 total):**

1. Call `get_system_status()` → extract agent-specific health bits
2. Check each of 6 Hào states per table above
3. Count: how many lines are Lao?
4. Classify:
   - changing_count < 2 → HEALTHY
   - changing_count = 2 → TRANSITION
   - changing_count = 3 → CRITICAL
   - changing_count ≥ 4 → CASCADE

5. Log hexagram reading to session

**SCOPE remaining phases:** Only audit agents with changing_count ≥ 2

**CASCADE agents:** Escalate to BUG immediately. Skip detailed audit. Wait for developer fix.

---

## System Trigram Balance (Quick Health Check)

Count agents currently expressing each trigram energy:

- **Càn (Heaven):** How many initiators (PO, Unified) functional?
- **Khôn (Earth):** How many executors (Developer, Fixer) unblocked?
- **Chấn (Thunder):** How many signal-detectors (Alert, Market Watcher) firing?
- **Tốn (Wind):** How many info-penetrators (News Scout, BA) complete?
- **Khảm (Water):** How many deep-analyzers (Architect, Financial) navigating obstacles?
- **Ly (Fire):** How many synthesizers (Digest, Analyst) illuminating?
- **Cấn (Mountain):** How many quality-gates (QA, Auditor, TNB) holding still?
- **Đoài (Lake):** How many user-facing (QA Responder, Refactory) communicating?

**Imbalance examples:**
- Thunder agents silenced → alerts not reaching user → system's voice gone
- Fire agents single → one synthesis point of failure
- Lake thin → user interface fragile

---

## Output Format — Hexagram Report (for TNB)

```
[TNB] Hexagram Reading {date}

System Trigram Balance: Càn=OK Khôn=OK Chấn=DEGRADED Tốn=OK Khảm=OK Ly=THIN Cấn=OK Đoài=OK

Critical (4+ lines):
  - {agent}: Hào 1,3,5,6 Lao Am (Kham doubled pattern detected, suspend)

Transition (2 lines):
  - {agent}: Hào 2,4 (monitor)
  - {agent}: Hào 1,5 (data path)

Healthy (<2 lines):
  - {agent}: ✅

Auto-Cures: {N} applied
Pattern Detections: {list}
Overall System: HEALTHY | TRANSITION | CRITICAL | CASCADE
```
