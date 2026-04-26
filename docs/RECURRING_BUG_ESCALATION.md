# Recurring Bug Escalation System

**Problem**: Developer team was fixing bugs repeatedly in the same modules, creating patch loops that masked architectural flaws.

**Solution**: New 3-tier escalation system routes recurring bugs to Architect for permanent root-cause fixes instead of symptom patches.

---

## How It Works

### Tier 1: Detection (PO in Cron, hourly)

**Location**: `.claude/commands/crons/cron-dev-team.md` Step 1

**Logic**:
```
For each FIX item in batch:
  1. Run: git log --oneline --since="30 days ago" -- <file> | grep -cE "fix\(|revert\(" | count
  2. If count ≥ 2:
     → Convert FIX → UNBLOCK (type change)
     → Set blocker: "Recurring fix on [module] — needs architectural review"
     → Set route_to: "architect"
  3. Else:
     → Process as normal FIX task
```

**Current Recurring Bugs Detected** (from git log analysis):
- `fix(1328e)` — 4 fixes: notifyTelegramAlert routing (MARKET vs BUG channel)
- `fix(1275)` — 3 fixes: UNIQUE constraint handling on vnstock_trading_stats
- `fix(watchdog)` — 3 fixes: null foreign-flow timestamp logic
- `fix(1269)` — 2 fixes: macro direction label formatting
- 9 more in backlog...

**Result**: These are now UNBLOCK items, routed to Architect (not Dev).

---

### Tier 2: Root-Cause Analysis (Architect)

**Location**: `.claude/agents/architect.md` — "Recurring Bug Root-Cause Analysis" section

**Steps**:
1. **Examine all prior fixes**: `git show <hash> --stat` for each fix commit
2. **Identify pattern**: Are fixes moving logic? Adding guards? Fixing off-by-one?
3. **Find architectural flaw**:
   - Insufficient type safety?
   - Logic in wrong layer?
   - Missing interface?
   - Race condition?
   - Event routing broken?
   - State mutation without immutability?
4. **Write TECH doc**: Propose permanent solution (not patch)
   - Problem: [Architectural flaw]
   - Root Cause: [Design mistake]
   - Solution: [Refactor, new types, new interface, etc.]
   - Implementation: [Specific files/modules to change]
   - Test Strategy: [Integration tests that catch reintroduction]

**Example**: `notifyTelegramAlert` bug
- **Symptom**: Routed to MARKET instead of BUG (4 times)
- **Root Cause**: Channel name is plain string, no type validation
- **Permanent Fix**: Create branded type `type AlertChannel = 'MARKET' | 'BUG' | 'WORK'` + validation at boundary
  - Compiler enforces correct channel at every call site
  - Type system prevents wrong channel value
  - No more patches needed

---

### Tier 3: Implementation (PM → Developer)

**Location**: `.claude/agents/pm.md` — "Recurring Bug Escalation" section

**Process**:
1. PM marks task as `RECURRING-BUG` in TASKS.md notes
2. PM moves to Backlog (blocks further dev fixes)
3. Architect writes TECH doc
4. PM breaks TECH doc into atomic dev tasks
5. Developer implements architectural fix **once** (not repeatedly)

**Result**: Permanent solution instead of patch loop.

---

## Metrics

### Before (Patch Loop)
- Same bug fixed ≥2 times in 30 days
- Each fix risks introducing new bugs
- Underlying design flaw never addressed
- Example: `fix(1328e)` — 4 commits, same routing error repeatedly

### After (Architectural Fix)
- Bug detected once
- Escalated to Architect for root-cause analysis
- Permanent solution designed (type safety, refactoring, etc.)
- Implemented once by Developer
- Test strategy prevents reintroduction
- No more patches on same module

---

## Affected Agent Files

### 1. `.claude/agents/pm.md` — UPDATED
**Added**: "Recurring Bug Escalation" section
- Rule: ≥2 fixes → escalate to Architect
- PM responsibilities for recurring bugs
- TASKS.md label: `RECURRING-BUG`
- Backlog strategy while waiting for TECH doc

### 2. `.claude/commands/crons/cron-dev-team.md` — UPDATED
**Modified**: Step 1 (PO Triage) Priority Rules
- Moved recurring bugs FROM "FIX first" TO "Escalate to Architect"
- Added "Recurring Bug Detection" section
- Git log scanning logic (≥2 commits in 30 days)
- Conversion from FIX → UNBLOCK item type

### 3. `.claude/agents/architect.md` — UPDATED
**Added**: "Recurring Bug Root-Cause Analysis (URGENT ESCALATION PROTOCOL)" section
- How to analyze prior fix commits
- Pattern recognition (what caused repeated bugs)
- Root-cause identification checklist
- TECH doc template for architectural fix
- Example: channel routing bug permanent solution

---

## Implementation Timeline

✅ **Step 1: Detection** — PO scans git log hourly, detects recurring bugs
✅ **Step 2: Escalation** — Converts FIX → UNBLOCK, routes to Architect
✅ **Step 3: Analysis** — Architect writes TECH doc for permanent fix
⏳ **Step 4: Implementation** — PM breaks TECH doc into dev tasks, Developer implements

---

## Testing the System

To manually test recurring bug escalation:

```bash
# 1. Check current recurring bugs
git log --oneline --since="30 days ago" -- apps/mcp-server/src | \
  grep -E "fix\(1328|fix\(1269|fix\(1275|fix\(watchdog" | \
  cut -d' ' -f1 | \
  xargs -I {} git show {} --stat | head -50

# 2. Verify agent configuration
grep -n "Recurring Bug" .claude/agents/pm.md
grep -n "Recurring Bug" .claude/agents/architect.md
grep -n "Recurring Bug Detection" .claude/commands/crons/cron-dev-team.md

# 3. Run PO triage manually (when cron ready)
# Agent(subagent_type=po) will now detect and escalate recurring bugs
```

---

## Benefits

1. **No more patch loops** — Architectural flaws addressed at root
2. **Type safety** — Compiler prevents recurring bugs (via branded types, interfaces)
3. **Reduced fix overhead** — Architect designs once, Dev implements once
4. **Better code quality** — Refactoring improves overall architecture
5. **Faster feedback** — Each recurring bug gets Architect's high-level review
6. **Team accountability** — Architect tracks architectural improvements over time

---

## Notes

- **Threshold**: ≥2 fixes in 30 days triggers escalation
- **Architect decision**: If bug has no architectural root cause, can route back to Dev as normal FIX
- **User satisfaction**: "I don't want a problem fixed day after day" — this system ensures it
- **Memory**: Rule documented in `feedback_recurring_bug_escalation.md` for future sessions

