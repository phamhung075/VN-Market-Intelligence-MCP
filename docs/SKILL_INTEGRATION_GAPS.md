# Skill Integration Gaps — Why Skills Exist But Aren't Used

**Problem:** 2 skills (caveman, token-economy) listed in agent files but NOT integrated into workflow steps.

---

## Current State (Broken Integration)

### What Agent Files Say:

```markdown
COMMUNICATION: Caveman ultra mode always active. All output ultra-compressed.
Token optimization → `.claude/skills/token-economy/SKILL.md`
```

### What Actually Happens:

- Agent mentions caveman/token-economy in header
- Agent never calls them in Step 1, Step 2, Step 3...
- Agent outputs full verbose responses (not ultra-compressed)
- Agent doesn't apply token optimization to message outputs

**Result:** Skill exists but is ignored.

---

## Why This Happens (Root Cause)

### Gap 1: No Clear Integration Points

**caveman skill:**
```
Where should it be called?
- Before post_agent_signal()?
- Before send_telegram()?
- On every output?
- Only on MARKET channel messages?
```
← Agent file says "always active" but doesn't say WHERE/HOW

### Gap 2: No Execution Instructions

**token-economy skill:**
```
What should agent do with it?
- Apply to every message draft?
- Only when message > 300 tokens?
- Compress variable names?
- Remove intermediate steps?
```
← Agent file says "apply always" but doesn't show HOW

### Gap 3: Skills Not Wired to Steps

Example (Alert Commander):
```
Current:
### Step 2: Fire Alert
post_agent_signal(...)
send_telegram(message)  ← No caveman applied

Should Be:
### Step 2: Fire Alert
message = post_agent_signal(...)
compressed = apply_caveman(message, mode="ultra")
send_telegram(compressed)
```

---

## Same Problem with New Skills I Created

Your 6 new skills have the SAME risk:

❌ **Bad Integration (what I did):**
```markdown
## SKILLS
- `kinh-dich-interpreter` — hex context
- `conviction-calculator` — confidence
- `narrative-formatter` — message structure
```
← Listed but not wired to steps

✅ **Good Integration (what they need):**
```markdown
### Step 2: Before send_telegram()
1. Call `kinh_dich_interpreter()` → get hex context
2. Call `conviction_calculator()` → get conviction score
3. Call `narrative_formatter()` → format message with conviction + hex

Result: `send_telegram(formatted_message_with_conviction_and_hex)`
```

---

## How to Fix Existing Skills (caveman + token-economy)

### **Alert Commander Example: Proper Integration**

**Before (Current - Broken):**
```markdown
## SKILLS
- Caveman ultra mode always active
- Token optimization → `.claude/skills/token-economy/SKILL.md`

## EACH CYCLE
### Step 2: Fire Alert
...
send_telegram(channel="market", message=message)
```

**After (Fixed):**
```markdown
## SKILLS
Load before first cycle:
- `.claude/skills/caveman/SKILL.md` — ultra mode for all outputs
- `.claude/skills/token-economy/SKILL.md` — compress token usage

## EACH CYCLE
### Step 2: Before send_telegram()

1. Build message (current logic)
2. Apply token_economy optimization:
   - Count tokens in message draft
   - If > 300 tokens: compress variable names, remove intermediate thoughts
   - Target: <= 300 tokens for MARKET alerts

3. Apply caveman ultra mode:
   - Replace prose with bullet points
   - Remove explanations, keep facts
   - Example: "VCB price down due to ROE weakness in Q1" → "VCB: down 2.5%, ROE -2% YoY"

4. Send optimized message:
   send_telegram(channel="market", message=compressed)

Result: Alert fires with ultra-compressed style, ~40% fewer tokens
```

---

## Integration Checklist (Fix for All Skills)

Every skill (existing or new) needs:

- [ ] **Clear lifecycle hook** — "Before send_telegram", "After Step 3", etc
- [ ] **Execution instruction** — "Call skill_name() with inputs X, Y, Z"
- [ ] **Output handling** — "Use returned value for next step"
- [ ] **Conditional logic** — "If result = X, proceed; if Y, suppress"
- [ ] **Example** — Show before/after of applying the skill

---

## Two Integration Patterns

### Pattern A: Pre-Processing (Caveman, Token-Economy)
```
Input → Apply Skill → Output

Before: message = "VCB price declined significantly due to fundamental weakness in quarterly ROE metrics..."
Skill: caveman ultra + token_economy
After: message = "VCB down. ROE -2% YoY. [70 tokens]"

When to use: Output compression, styling
```

### Pattern B: Decision-Making (Conviction-Calculator, Pre-Fire-Validation)
```
Input → Call Skill → Decision → Action

Before: Alert ready to fire, conviction unknown
Skill: pre_fire_validation (5 checks)
After: validation = PASS/FAIL → Fire alert / Suppress alert

When to use: Validation gates, confidence scoring
```

---

## What Your 6 New Skills Need (To Avoid Same Mistake)

For each skill in SKILL_INTEGRATION_GUIDE.md, I need to add:

```markdown
## Integration Point: [CLEAR LOCATION]
- Lifecycle hook: "Before send_telegram" OR "Inside Step 2" etc
- Execution: "Call skill_name() with inputs..."
- Result handling: "Use returned value as..."
- Condition: "If result = X, then..."

## Example (Before / After)
```

---

## Action Plan

### Immediate (Fix Integration Docs)

1. **Caveman Skill Integration** → Add clear steps to:
   - 01-news-scout.md
   - 02-financial-analyst.md
   - 04-market-watcher.md
   - 05-alert-commander.md
   - 06-digest-predict.md
   - 07-qa-responder.md

2. **Token-Economy Skill Integration** → Same agents

3. **My 6 New Skills** → Add integration points (ALREADY in SKILL_INTEGRATION_GUIDE.md, but need to emphasize WHERE in workflow)

### Template for Integration

```markdown
### Step X: Before/After Y

Load skill: `.claude/skills/SKILL_NAME/SKILL.md`

Execute:
1. Prepare input (e.g., message, stock, conviction)
2. Call: result = skill_function(input)
3. Check result: if PASS → proceed; if FAIL → suppress
4. Use result: send_telegram(formatted_with_result)

Example:
  Before: message = "VCB down 2.5%"
  After:  message = "VCB down 2.5% [CRITICAL 80%]" (caveman + conviction visible)
```

---

## Conclusion

**User's observation is correct:** Skills exist but aren't integrated.

**Reason:** Agent files list skills in header but don't show HOW to call them in workflow steps.

**Solution:** Every skill needs:
1. **WHERE** in the workflow (before/after which step)
2. **HOW** to call it (inputs, outputs, conditions)
3. **EXAMPLE** (before/after transformation)

This applies to:
- ✅ Existing: caveman, token-economy
- ⚠️ New: kinh-dich-interpreter, conviction-calculator, etc (need same clarity)

Next: Should I add proper integration instructions to SKILL_INTEGRATION_GUIDE.md for all skills?
