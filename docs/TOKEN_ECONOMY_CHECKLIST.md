# Token Economy Self-Review Checklist

**Before sending any agent-to-agent message, use this checklist.**

Goal: Reduce tokens by ~75% while maintaining 100% information quality.

---

## Pre-Send Checklist

Use this before finalizing notifications, batch responses, memory updates, or logs.

### Tier 1: ULTRA (Agent ↔ Agent, Cron Prompts)

**Apply when**: Notifying another agent, batch lookahead responses, internal logs

**Checklist**:
- [ ] Articles removed (a, an, the)?
- [ ] Filler removed (just, really, basically, simply, actually)?
- [ ] Pleasantries removed (sure, certainly, happy to, please)?
- [ ] Abbreviations used (DB, auth, config, req, res, fn, impl, ops, msg, var)?
- [ ] Arrows for causality (→, ⇒)?
- [ ] Conjunctions removed where possible (and, but, or, because)?
- [ ] One-word when one word sufficient?
- [ ] No repetition from prior message?
- [ ] Technical terms exact (no vague substitutes)?
- [ ] Code blocks unchanged?
- [ ] No Chinese/Japanese/Korean characters?
- [ ] Fragments OK (sentence fragments acceptable for ultra)?
- [ ] Token estimate < 30% of verbose version?

**Fail-Safe**: If any answer is "I'm not sure", apply standard format instead of ultra. Quality > compression.

---

### Tier 2: FULL (Internal Logs, WORK Channel)

**Apply when**: Dev team status messages, WORK channel Telegram, session logs

**Checklist**:
- [ ] Articles removed (a, an, the)?
- [ ] Filler removed?
- [ ] Short synonyms used (big not extensive)?
- [ ] Basic sentence structure kept?
- [ ] Fragments OK?
- [ ] Professional tone?

---

### Tier 3: LITE (User-Facing, MARKET Channel)

**Apply when**: User alerts, MARKET channel, direct user replies

**Checklist**:
- [ ] No filler/hedging?
- [ ] Articles kept?
- [ ] Full sentences used?
- [ ] Professional but tight?
- [ ] Complete thoughts?

---

## Examples by Tier

### Tier 1 (ULTRA)

**Before**:
```
Task NNN has been completed successfully. The developer has implemented all requirements
and the tests are passing. The code has been reviewed for DDD compliance and there are
no violations. The system is ready for QA review.
```

**After (Ultra)**:
```
Task NNN done. Tests: 47 pass. DDD clean. Ready QA.
```

✅ **Quality Check**:
- Information preserved: done status, test count, DDD validation, next step
- Tokens: ~100 → ~15 (85% reduction)
- Accuracy: 100%

---

**Before**:
```
The PO has identified three recurring bugs in the watchdog module that have been fixed
multiple times over the past month. These bugs need to be escalated to the Architect
for architectural review rather than being fixed again by the Developer.
```

**After (Ultra)**:
```
Watchdog: 3 recurring bugs (30d). Escalate Architect→root-cause fix.
```

✅ **Quality Check**:
- Information preserved: module, count, timeframe, escalation route, reason
- Tokens: ~50 → ~10 (80% reduction)
- Accuracy: 100%

---

**Before**:
```
I have carefully reviewed the code changes and found that there are some issues that
need to be fixed before the task can be approved.
```

**After (Ultra)**:
```
CHANGES_REQUESTED. Issues: [src/foo.ts:42 — param binding, src/bar.ts:99 — guard]
```

✅ **Quality Check**:
- Information preserved: verdict, exact file:line references
- Tokens: ~30 → ~10 (67% reduction)
- Accuracy: 100%

---

### Tier 2 (FULL)

**Before**:
```
The implementation of the new feature has been completed successfully and the developer
has written comprehensive tests covering all the edge cases.
```

**After (Full)**:
```
Impl complete. Tests cover edge cases. Ready review.
```

✅ **Quality Check**:
- Articles dropped, kept structure
- Tokens: ~30 → ~12 (60% reduction)

---

### Tier 3 (LITE)

**Before**:
```
I would like to inform you that our system has detected a potential trading opportunity
on the VNM stock at the current price level.
```

**After (Lite)**:
```
System detected trading opportunity: VNM at current level.
```

✅ **Quality Check**:
- Kept articles/professional tone
- Tokens: ~30 → ~12 (60% reduction)

---

## Common Mistakes

❌ **Mistake**: Drop articles in LITE/FULL mode
```
"Task ready QA" (sounds unprofessional in LITE)
```
✅ **Fix**: Keep articles in LITE/FULL
```
"The task is ready for QA" (LITE)
"Task ready QA" (ULTRA)
```

---

❌ **Mistake**: Lose technical accuracy for compression
```
"Bug fixed" (which bug? where? how?)
```
✅ **Fix**: Keep precision, drop fluff
```
"fix(watchdog): null-flow timestamp → fresh not stale [src/scheduler/watchdog.ts:42]"
```

---

❌ **Mistake**: Use caveman in code reviews
```
"Code look good. No issues."
```
✅ **Fix**: Standard review format
```
"Code review: No DDD violations. Tests: green. Ready merge."
```

---

❌ **Mistake**: Abbreviate before context established
```
"DB migration OK. Schema clean." (without explaining which DB)
```
✅ **Fix**: Include context first
```
"SQLite migration (schema.ts): UNIQUE constraint added. Tests verify."
```

---

## Measurement

**Track your compression ratio**:

```
Verbose version: 150 tokens
Compressed version: 40 tokens
Ratio: 40/150 = 27% of original
Reduction: 73% ✅
```

**Target ratios**:
- ULTRA: < 30% (75% reduction)
- FULL: 40-60% (40-60% reduction)
- LITE: 80-90% (10-20% reduction)

---

## When to Break Compression

**Auto-clarity exceptions** (switch to LITE temporarily):

1. Security warnings
   ```
   ❌ "DROP TABLE users" (ultra is dangerous here)
   ✅ "WARNING: This will permanently delete all users table rows. Cannot be undone."
   ```

2. Irreversible operations
   ```
   ❌ "Delete prod DB?" (ultra loses gravity)
   ✅ "This will permanently delete the production database and cannot be reversed."
   ```

3. User asks for clarification
   ```
   (If user says "what do you mean?", switch to LITE, explain fully, then resume ULTRA)
   ```

4. Multi-step sequences where order matters
   ```
   ❌ "Step 1: A. Step 2: B. Step 3: C." (fragments risky)
   ✅ "Follow these steps in order: A → B → C"
   ```

After critical section, resume normal tier.

---

## Activation

**This checklist is LIVE now**. All agents:
1. Use this checklist before sending messages
2. Apply appropriate tier (ULTRA/FULL/LITE)
3. Verify all checkboxes
4. Measure token reduction
5. Monitor for quality loss (should be zero)

