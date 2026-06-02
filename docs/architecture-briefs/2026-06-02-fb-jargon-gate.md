# FB Jargon Gate — Architecture Brief

**Task:** FB-GATE-1  
**Sprint:** FB-GATE  
**Author:** agents-architect  
**Date:** 2026-06-02  
**Status:** DESIGN-DONE — awaiting FB-GATE-2 (agent-father) implementation  
**Priority:** HIGH

---

## 1. Problem Statement

`docs/agents/fb-market-poster/flow/main.md` STEP 4 check 3 (approximately lines 299–330) asks the agent to "scan the post body, fix inline" for forbidden jargon and typos. This is **model self-attestation**: no command is ever executed; the agent introspects its own output, declares it clean, and proceeds to STEP 5 write.

Three confirmed false-greens from 2026-06-01 (same session):
- `thanh khoảy` — Vietnamese typo, appeared 6× in draft, reported ZERO by agent.
- `(FII)` — English finance jargon, appeared 2×, reported ZERO.
- Full Kinh Dịch hexagram paragraph (`vị thế Sư Giữ / Sư/Khôn/Kiển / vị thế Khôn`) copied verbatim from CHEF dish, reported hexagram:ZERO.

All three were caught only by the router performing a manual raw-file grep — exactly the router-verify-raw pattern that should **not** be the last gate.

The existing false-green proof clause at line 330 is an aspirational comment; it was never made executable, so it cannot serve as a fence. Per `feedback_fence_false_green`: a lint/fence that reports zero-errors while checking nothing is not a gate.

---

## 2. Decision: Shared Skill + Script (NOT inline in flow)

**Decision: SHARED — a `.claude/skills/fb-jargon-gate/` skill that calls a script at `scripts/fb-jargon-gate.sh`.**

### Rationale

The flow currently lists ~26 forbidden tokens inline in STEP 4 check 3 prose. Adding more (FII, weekday/date check, etc.) grows that prose section further. The only enforcement path is the agent reading its own list and self-checking — which already failed 3× in one day.

A shared skill + script gives:
1. **Single SSOT for the token set.** The flow does not re-list tokens. It calls the skill; the skill calls the script. Drift between "what the flow says is forbidden" and "what the gate actually checks" becomes impossible.
2. **Executable, not prose.** `grep -nEi "..."` run by the agent produces pasted command output — satisfies `feedback_router_verify_raw_not_badges` (evidence = pasted output, not a badge/claim) and `feedback_fence_false_green` (gate proven by planted-violation smoke test).
3. **Reusability.** If a second agent ever generates FB posts, it calls the same skill. The token list does not fork.
4. **Inline alternative rejected**: inline patterns are prose the agent reads and then self-applies — the exact failure mode we are fixing. Even if placed in a code block, the agent executes no command; it just tries to remember the list while scanning. That is model self-attestation under a different label.

**Script zone:** `scripts/fb-jargon-gate.sh` (already the home for repo-wide scripts; no cross-service/ directory exists in this project).  
**Skill zone:** `.claude/skills/fb-jargon-gate/SKILL.md`

---

## 3. WHERE it runs — Hard STEP 4a (inserted between check 3 and STEP 5)

The current check 3 self-attestation prose is **replaced** (not augmented) by a call to the skill.

Flow edit required by agent-father:

- Rename the existing check 3 header from `Hard-fail jargon grep` to `**STEP 4a — JARGON GATE (executable hard-fail)**`.
- Remove ALL inline token lists from check 3. Replace the entire block with:

```
→ skill: `.claude/skills/fb-jargon-gate/SKILL.md`
  INPUT: path of the composed post body (in-memory text, write to a temp file first)
  HARD-FAIL: if gate exits non-zero, DO NOT proceed to STEP 5. Fix every flagged hit,
  re-run the gate, proceed only when gate exits 0 with pasted output confirming zero hits.
  Paste the gate output into STEP 8 cycle report under "JARGON GATE:".
```

This gate **blocks** STEP 5 write. There is no "passed anyway" path. If the gate cannot be resolved after one fix round, invoke `send_telegram(channel="bug", message="[fb-market-poster] JARGON GATE: unresolvable violations — post NOT written")` and EXIT.

---

## 4. The Script: `scripts/fb-jargon-gate.sh`

### Invocation

```bash
bash scripts/fb-jargon-gate.sh <post-body-filepath>
# Exits 0 = clean (zero hits)
# Exits 1 = violations found (grep output pasted, agent must fix and re-run)
```

### Forbidden token set — canonical SSOT

All patterns run case-insensitive (`-i` flag) on the full file content. Patterns are anchored where needed to prevent false positives (see Section 5).

**Group A — English finance jargon (word-boundary anchored)**

```bash
JARGON_PATTERNS=(
  '\bFII\b'
  '\bNIM\b'
  '\bcarry\b'
  '\bbull\b'
  '\bbear\b'
  '\bbullish\b'
  '\bbearish\b'
  '\brisk-off\b'
  '\brisk-on\b'
  '\bYoY\b'
  '\bQoQ\b'
  '\bbps\b'
  '\bmomentum\b'
  '\bsentiment\b'
  '\bvolatility\b'
  '\bbreadth\b'
  '\bneutral\b'
  '\bcatalyst\b'
  '\bupside\b'
  '\bdownside\b'
  '\bsigma\b'
  '\bconsolidат\b'
  '\boutflow\b'
  '\binflow\b'
  '\brally\b'
  '\bsell-off\b'
  '\bbreakout\b'
  '\brebound\b'
  '\bstasis\b'
  '\bdurable\b'
  '\bbroad-based\b'
  '\bconvergence\b'
)
```

**Group B — Unicode/notation violations (literal match, no word boundary needed)**

```bash
UNICODE_PATTERNS=(
  'σ'
  'bp\b'
  '±'
  'Layer [0-9]'
  'signal [0-9]'
  'z-score'
  'z score'
  '\bTNB\b'
)
```

Note: `bp` (single basis point) is word-boundary anchored to avoid matching inside Vietnamese words like `cập`. The pattern `\bbp\b` is safe.

**Group C — Kinh Dịch / hexagram terms (anchored — see Section 5 for false-positive traps)**

```bash
KD_PATTERNS=(
  'Kinh Dịch'
  'kinh dịch'
  'hexagram'
  '\bquẻ\b'
  'vị thế (Càn|Khôn|Chấn|Tốn|Khảm|Ly|Cấn|Đoài|Sư|Kiển|Di|Cổn|Mông|Nhu|Tụng|Sư|Tỷ|Tiểu Súc|Lý|Thái|Bĩ|Đồng Nhân|Đại Hữu|Khiêm|Dự|Tùy|Cổ|Lâm|Quan|Phệ Hạp|Bí|Bác|Phục|Vô Vọng|Đại Súc|Di|Đại Quá|Hàm|Hằng|Độn|Đại Tráng|Tấn|Minh Di|Gia Nhân|Khuê|Kiển|Giải|Tổn|Ích|Quải|Cấu|Tụy|Thăng|Khốn|Tỉnh|Cách|Đỉnh|Chấn|Cấn|Tiệm|Quy Muội|Phong|Lữ|Tốn|Đoài|Hoán|Tiết|Trung Phu|Tiểu Quá|Ký Tế|Vị Tế)'
)
```

**Group D — Vietnamese typos**

```bash
TYPO_PATTERNS=(
  'thanh khoảy'
  '#dankhi'
)
```

**Group E — Calendar weekday/date consistency check**

This check is different in kind: it compares the weekday mentioned in the post against the actual calendar weekday for the post date. This **cannot** be done with a simple grep pattern — it requires logic.

Implementation:

```bash
# Extract post date from filename (YYYY-MM-DD) passed as $2 to the script
# OR derive from the first line "# Thị trường chứng khoán Việt Nam — YYYY-MM-DD"
# Compute expected weekday (Monday=Thứ Hai, Tuesday=Thứ Ba, etc.)
# grep the post body for any weekday name
# If a weekday name is found that does not match the expected weekday → flag violation
```

Vietnamese weekday names to check (case-insensitive): `thứ hai`, `thứ ba`, `thứ tư`, `thứ năm`, `thứ sáu`, `thứ bảy`, `chủ nhật`.

If no weekday name appears in the post body, this check passes (weekday mention is optional).

### Full script shape

```bash
#!/usr/bin/env bash
# fb-jargon-gate.sh — deterministic pre-publish gate for fb-market-poster
# Usage: bash scripts/fb-jargon-gate.sh <post-body-file> [YYYY-MM-DD]
# Exit 0 = clean; Exit 1 = violations found

set -euo pipefail

FILE="${1:-}"
POST_DATE="${2:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "ERROR: file argument required and must exist" >&2
  exit 2
fi

VIOLATIONS=0

run_grep() {
  local label="$1"
  local pattern="$2"
  local hits
  hits=$(grep -nEi "$pattern" "$FILE" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "[FAIL] $label"
    echo "$hits"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

# Group A — English finance jargon
run_grep "English-jargon:FII"         '\bFII\b'
run_grep "English-jargon:NIM"         '\bNIM\b'
run_grep "English-jargon:carry"       '\bcarry\b'
run_grep "English-jargon:bull"        '\bbull\b'
run_grep "English-jargon:bear"        '\bbear\b'
run_grep "English-jargon:bullish"     '\bbullish\b'
run_grep "English-jargon:bearish"     '\bbearish\b'
run_grep "English-jargon:risk-off"    '\brisk-off\b'
run_grep "English-jargon:risk-on"     '\brisk-on\b'
run_grep "English-jargon:YoY"         '\bYoY\b'
run_grep "English-jargon:QoQ"         '\bQoQ\b'
run_grep "English-jargon:bps"         '\bbps\b'
run_grep "English-jargon:momentum"    '\bmomentum\b'
run_grep "English-jargon:sentiment"   '\bsentiment\b'
run_grep "English-jargon:volatility"  '\bvolatility\b'
run_grep "English-jargon:breadth"     '\bbreadth\b'
run_grep "English-jargon:neutral"     '\bneutral\b'
run_grep "English-jargon:catalyst"    '\bcatalyst\b'
run_grep "English-jargon:upside"      '\bupside\b'
run_grep "English-jargon:downside"    '\bdownside\b'
run_grep "English-jargon:sigma"       '\bsigma\b'
run_grep "English-jargon:consolidat"  '\bconsolidat'
run_grep "English-jargon:outflow"     '\boutflow\b'
run_grep "English-jargon:inflow"      '\binflow\b'
run_grep "English-jargon:rally"       '\brally\b'
run_grep "English-jargon:sell-off"    '\bsell-off\b'
run_grep "English-jargon:breakout"    '\bbreakout\b'
run_grep "English-jargon:rebound"     '\brebound\b'
run_grep "English-jargon:stasis"      '\bstasis\b'
run_grep "English-jargon:durable"     '\bdurable\b'
run_grep "English-jargon:broad-based" '\bbroad-based\b'
run_grep "English-jargon:convergence" '\bconvergence\b'

# Group B — Unicode/notation violations
run_grep "notation:sigma-char"   'σ'
run_grep "notation:bp"           '\bbp\b'
run_grep "notation:plusminus"    '±'
run_grep "notation:Layer-N"      'Layer [0-9]'
run_grep "notation:signal-N"     'signal [0-9]'
run_grep "notation:z-score"      'z-score'
run_grep "notation:z score"      'z score'
run_grep "notation:TNB"          '\bTNB\b'

# Group C — Kinh Dich / hexagram (anchored — see brief §5 for false-positive traps)
run_grep "hexagram:Kinh-Dich"    'Kinh Dịch'
run_grep "hexagram:kinh-dich-lc" 'kinh dịch'
run_grep "hexagram:hexagram"     'hexagram'
run_grep "hexagram:que"          '\bquẻ\b'
run_grep "hexagram:vi-the-name"  'vị thế (Càn|Khôn|Chấn|Tốn|Khảm|Ly|Cấn|Đoài|Sư|Kiển|Di|Mông|Nhu|Tụng|Tỷ|Thái|Bĩ|Khiêm|Dự|Tùy|Cổ|Lâm|Quan|Bí|Bác|Phục|Hàm|Hằng|Độn|Tấn|Giải|Tổn|Ích|Tụy|Thăng|Khốn|Cách|Đỉnh|Tiệm|Phong|Lữ|Hoán|Tiết|Ký Tế|Vị Tế)'

# Group D — Vietnamese typos
run_grep "typo:thanh-khoay"      'thanh khoảy'
run_grep "hashtag-typo:dankhi"   '#dankhi'

# Group E — Calendar weekday/date consistency
if [[ -n "$POST_DATE" ]]; then
  VN_WEEKDAYS=("Chủ nhật" "Thứ Hai" "Thứ Ba" "Thứ Tư" "Thứ Năm" "Thứ Sáu" "Thứ Bảy")
  # day_of_week: 0=Sun, 1=Mon, ..., 6=Sat
  DOW=$(date -d "$POST_DATE" +%w 2>/dev/null || python3 -c "import datetime; print(datetime.datetime.strptime('$POST_DATE','%Y-%m-%d').weekday()+1 if datetime.datetime.strptime('$POST_DATE','%Y-%m-%d').weekday()<6 else 0)")
  EXPECTED_VN="${VN_WEEKDAYS[$DOW]}"
  WRONG_DAYS=()
  for WD in "Chủ nhật" "Thứ Hai" "Thứ Ba" "Thứ Tư" "Thứ Năm" "Thứ Sáu" "Thứ Bảy"; do
    if [[ "$WD" != "$EXPECTED_VN" ]]; then
      WRONG_DAYS+=("$WD")
    fi
  done
  for WD in "${WRONG_DAYS[@]}"; do
    hits=$(grep -ni "$WD" "$FILE" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
      echo "[FAIL] calendar:wrong-weekday — post date $POST_DATE = $EXPECTED_VN, found '$WD'"
      echo "$hits"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done
fi

# Result
if [[ $VIOLATIONS -eq 0 ]]; then
  echo "[PASS] fb-jargon-gate: 0 violations"
  exit 0
else
  echo "[BLOCK] fb-jargon-gate: $VIOLATIONS violation group(s) — fix ALL before STEP 5 write"
  exit 1
fi
```

---

## 5. False-Positive Traps — Explicit Callouts

These are the cases where a naive pattern would fire on legitimate Vietnamese text. Each trap has a safe anchored pattern specified.

### Trap 1 — `khôn` inside `không`

**Problem:** "không" is one of the most common Vietnamese words (negation). If the hexagram "Khôn" were matched as a bare substring, every "không" in the post would trigger.

**Safe pattern:** Match only `vị thế Khôn` (context-anchored). The regex `vị thế (Càn|Khôn|...)` fires only when "Khôn" appears preceded by "vị thế " — the exact hexagram-context phrase from CHEF dishes. Bare "khôn" as a Vietnamese adjective ("clever/wise") is NOT matched. Bare "không" is never matched (different base vowel + tone mark anyway, but anchoring removes all doubt).

**Do NOT use:** `\bKhôn\b` — this would match "khôn ngoan" (wise, legitimate Vietnamese).

### Trap 2 — `neutral` in Vietnamese

**Problem:** A writer might use "neutral" inside a Vietnamese sentence (code-switching is common in finance writing). The rule forbids it — it is English jargon in a Vietnamese post. The `\bneutral\b` pattern is correct. No false-positive concern here: the word has no legitimate Vietnamese meaning, so any hit is a real violation.

### Trap 3 — `carry` in Vietnamese

**Problem:** "carry" as English finance jargon (carry trade) is forbidden. Could "carry" appear as part of a Vietnamese word? No — Vietnamese words do not contain the ASCII sequence "carry" as a substring. `\bcarry\b` is safe.

### Trap 4 — `bp` as abbreviation vs. inside Vietnamese text

**Problem:** `bp` could appear as part of a longer Vietnamese word or abbreviation (e.g., a company ticker "MBP", "TBP"). The word-boundary anchor `\bbp\b` limits matches to standalone "bp". This is the correct pattern. The full `bps` is caught by `\bbps\b`.

**Additional guard:** The script checks `\bbp\b` separately from `\bbps\b` to avoid double-counting and to ensure the shorter form is caught even when "bps" is misspelled as "bp".

### Trap 5 — `quẻ` vs `quê`/`que`

**Problem:** "quê" (hometown) is a common Vietnamese word. "que" (stick/match) also exists. None of these contain the diacritic on the "e" that makes `quẻ` — the `ẻ` (e with hook + falling tone) is distinct. The pattern `\bquẻ\b` is therefore exact; it will not match "quê", "quế", "quể", "que", "quét", etc.

**No false-positive risk** for `quẻ` specifically — use it as a literal string.

### Trap 6 — `inflow`/`outflow` vs Vietnamese words

**Problem:** Vietnamese does not use these words as substrings. `\binflow\b` and `\boutflow\b` are safe.

### Trap 7 — `bull` inside "bullet", "bulletin"

**Problem:** `\bbull\b` word-boundary anchoring does NOT fire on "bullet" or "bulletin" because the `b` in "bull" is adjacent to an `e` — not a word boundary. The word-boundary regex `\bbull\b` correctly captures only the standalone word "bull". Safe.

### Trap 8 — `Layer` in Vietnamese text

**Problem:** "Layer" is English; unlikely in Vietnamese prose. The pattern `Layer [0-9]` (with a digit) is highly specific — it matches only the form "Layer 1", "Layer 2" etc. (the jargon form from the agent's own analyst layers). A sentence like "3 layer bánh" (three cake layers) would not match because there is no digit after "layer". The pattern is safe and precise.

### Trap 9 — `TNB` as an acronym vs. ticker

**Problem:** "TNB" is the agents-architect's shorthand for Tran Ngoc Bau (system-auditor). No VN stock ticker is TNB. The `\bTNB\b` pattern is safe.

### Trap 10 — Hexagram names that are also common Vietnamese words

Several hexagram names overlap with common Vietnamese syllables:
- **Sư** (Sư tử = lion, sư phạm = pedagogy) — matched only in `vị thế Sư`, safe.
- **Lý** (common surname, lý do = reason) — matched only in `vị thế Ly` (Ly without tone mark in the hexagram context; note: the Ly hexagram is sometimes written without tone mark). The compound `vị thế Ly` is unambiguous.
- **Di** (a common Vietnamese word/name) — matched only in `vị thế Di`, safe.
- **Cổ** (cổ phần = share, cổ phiếu = stock ticket — very common in a market post) — the `Cổ` in hexagram context is `vị thế Cổ`, anchored. Standalone "cổ" is not matched.

The anchor `vị thế <name>` is the key invariant. **Agent-father must implement the hexagram check ONLY as the anchored `vị thế (...)` form — never as bare hexagram names.**

---

## 6. Smoke-Test Contract (for FB-GATE-2 to paste as evidence)

Per `feedback_fence_false_green`: the gate is proven non-false-green only by pasted command output showing a violation firing on a planted token, and a clean pass on clean text.

### Test A — Gate FIRES on violation (non-zero exit required)

Create a minimal test file:

```bash
cat > /tmp/fb-gate-smoke-violation.txt << 'EOF'
Hôm nay VN-Index tăng 1.2% nhờ sentiment tích cực từ khối ngoại.
Thanh khoản thị trường đạt 14,000 tỷ đồng.
EOF
bash scripts/fb-jargon-gate.sh /tmp/fb-gate-smoke-violation.txt
echo "Exit code: $?"
```

**Expected output (must show):**
```
[FAIL] English-jargon:sentiment
1:Hôm nay VN-Index tăng 1.2% nhờ sentiment tích cực từ khối ngoại.
[BLOCK] fb-jargon-gate: 1 violation group(s) — fix ALL before STEP 5 write
Exit code: 1
```

### Test B — Gate PASSES on clean text (zero exit required)

```bash
cat > /tmp/fb-gate-smoke-clean.txt << 'EOF'
Hôm nay VN-Index tăng 1.2% nhờ lực mua từ nhóm ngân hàng.
Thanh khoản thị trường đạt 14,000 tỷ đồng, tăng nhẹ so với phiên trước.
Khối ngoại mua ròng 120 tỷ đồng.
EOF
bash scripts/fb-jargon-gate.sh /tmp/fb-gate-smoke-clean.txt
echo "Exit code: $?"
```

**Expected output:**
```
[PASS] fb-jargon-gate: 0 violations
Exit code: 0
```

### Test C — Hexagram anchor does NOT false-positive on `không`

```bash
cat > /tmp/fb-gate-smoke-khong.txt << 'EOF'
Thị trường không có tín hiệu rõ ràng hôm nay.
Nhà đầu tư không nên quá lo lắng về biến động ngắn hạn.
EOF
bash scripts/fb-jargon-gate.sh /tmp/fb-gate-smoke-khong.txt
echo "Exit code: $?"
```

**Expected output:**
```
[PASS] fb-jargon-gate: 0 violations
Exit code: 0
```

This test proves the hexagram anchor does not fire on common "không" occurrences.

All three test outputs must be pasted in FB-GATE-2's RETURN as evidence. The gate is not proven green until Test A exits 1 AND Test B exits 0 AND Test C exits 0.

---

## 7. Skill File: `.claude/skills/fb-jargon-gate/SKILL.md`

Agent-father creates this file. Content:

```markdown
# Skill: fb-jargon-gate

## Purpose
Deterministic pre-publish gate for fb-market-poster. Runs the jargon/typo/hexagram/calendar
check script and returns pasted output to the calling flow.

## Invocation (called from STEP 4a of fb-market-poster/flow/main.md)

1. Write the composed post body to a temp file:
   ```bash
   TMPFILE=$(mktemp /tmp/fb-post-gate-XXXXXX.txt)
   printf '%s' "$POST_BODY" > "$TMPFILE"
   ```
2. Run the gate:
   ```bash
   bash scripts/fb-jargon-gate.sh "$TMPFILE" "$POST_DATE"
   ```
   Capture full stdout+stderr. Note exit code.
3. Delete temp file: `rm -f "$TMPFILE"`
4. If exit code != 0: HARD-FAIL — block STEP 5 write. Fix every [FAIL] line in the post,
   then re-invoke this skill from scratch. Proceed only when gate exits 0.
5. Paste the gate output (the full stdout) into STEP 8 cycle report under "JARGON GATE:".
   A green claim without pasted output is NOT acceptable (feedback_router_verify_raw_not_badges).

## SSOT
Forbidden token set lives exclusively in `scripts/fb-jargon-gate.sh`.
Do NOT re-list tokens inline in the flow or in this skill file — that would recreate the drift problem.
```

---

## 8. Flow Edit — What agent-father must change in `docs/agents/fb-market-poster/flow/main.md`

Per the **agent-md-factory** rule: agent-father must apply this change through the agent-md-factory discipline — read the SSOT, DRY, lazy-load, tree-DAG, and factory-template constraints before editing. The frontmatter `---` must remain on line 1.

### Specific changes (by region, not by exact line number — flow may shift):

**Region: STEP 4 check 3 (currently "Hard-fail jargon grep (MUST be zero hits before file write)")**

Replace the entire check 3 block — from `3. **Hard-fail jargon grep...` through the FALSE-GREEN PROOF paragraph — with:

```markdown
3. **STEP 4a — JARGON GATE (hard-fail, executable)**

   → skill: `.claude/skills/fb-jargon-gate/SKILL.md`

   HARD-FAIL: gate exit non-zero = block STEP 5. Fix every flagged hit. Re-run gate.
   Proceed to STEP 5 ONLY when gate exits 0 with pasted output in hand.
   If violations cannot be resolved after one fix round:
   send_telegram(channel="bug", message="[fb-market-poster] JARGON GATE: unresolvable — post NOT written") and EXIT.
```

**Region: STEP 8 cycle report / RETURN**

Add the requirement that the gate output is pasted:

```markdown
JARGON GATE: [paste full stdout of fb-jargon-gate.sh here — zero-violations line required]
```

**Region: Notebook entry format**

Update the validation line to include:

```markdown
- Jargon gate: PASS (0 violations) | BLOCKED (N violations, post not written)
```

---

## 9. Affected Files

| File | Change | Owner |
|---|---|---|
| `scripts/fb-jargon-gate.sh` | CREATE new script (executable gate) | agent-father |
| `.claude/skills/fb-jargon-gate/SKILL.md` | CREATE new skill | agent-father |
| `docs/agents/fb-market-poster/flow/main.md` | REPLACE check 3 with STEP 4a gate call | agent-father (via agent-md-factory) |

No other files are affected. The forbidden token SSOT lives exclusively in `scripts/fb-jargon-gate.sh`.

---

## 10. Acceptance Criteria for Agent-Father

- [ ] `scripts/fb-jargon-gate.sh` exists and is executable (`chmod +x`).
- [ ] Script exits 1 when post body contains `sentiment` (Test A pasted, exit code shown as 1).
- [ ] Script exits 0 on clean Vietnamese text (Test B pasted, exit code shown as 0).
- [ ] Script exits 0 on text with "không" but no hexagram anchor (Test C pasted, exit code shown as 0).
- [ ] `.claude/skills/fb-jargon-gate/SKILL.md` exists and calls the script with mktemp + pasted output requirement.
- [ ] `docs/agents/fb-market-poster/flow/main.md` check 3 inline token list is gone; replaced by `→ skill: .claude/skills/fb-jargon-gate/SKILL.md` call with hard-fail wording.
- [ ] STEP 8 cycle report format requires `JARGON GATE:` pasted output field.
- [ ] Flow frontmatter remains on line 1 (agent-md-factory constraint).
- [ ] No other agent .md files are modified.
- [ ] All three smoke tests pasted as evidence in the FB-GATE-2 RETURN.

---

## 11. Shared-vs-Inline Decision Summary

**SHARED.** Token SSOT lives in `scripts/fb-jargon-gate.sh` only. The flow calls the skill; the skill calls the script. The flow contains zero inline token lists. This is the correct architecture because the root cause of the 3 false-greens was model self-attestation against an inline list — an inline list in the flow is the same failure mode under a different label.
