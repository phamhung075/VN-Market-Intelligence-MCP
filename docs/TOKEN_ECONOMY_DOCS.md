# Token Economy for Documentation (LITE Mode)

**Policy**: Task Reports, Technical Docs, and Requirement Specs use LITE compression (~40% reduction).

---

## Tier 3 (LITE) — Reference Documents

**Apply when**: Writing documents agents/PMs read for context
- `reports/TASK_REPORT_NNN.md` — QA writes
- `docs/TECH_NNN.md` — Architect writes
- `docs/REQ_NNN.md` — BA writes

**Compression Rules**:
- ❌ Drop: articles (a/an/the), filler (just/really/basically/simply/actually), pleasantries
- ✅ Keep: full sentences, professional structure, clarity
- ✅ Keep: technical terms, exact references, code paths
- ✅ Abbreviate: DB, auth, config, req, res, fn, impl

**Token Reduction**: 40-50% (not 75% like ULTRA)

---

## Examples by Document Type

### Task Reports (QA writes)

**Before** (100 tokens):
```
Task NNN has been successfully completed and approved for merging.
All tests have passed with no failures, and the code has been verified
to comply with all DDD architectural requirements. There are no security
issues and the codebase is ready to be merged to the main branch.
```

**After (LITE)** (50 tokens):
```
Task NNN approved. Tests: 47 pass. DDD clean. Security: OK. Ready merge.
```

✅ **Clarity**: Full—reader immediately knows status
✅ **Quality**: Maintained—all info present
✅ **Reduction**: ~50%

---

**Before** (80 tokens):
```
The task requires changes before it can be approved for merging.
Specifically, the following issues must be resolved:
- The parameter binding in src/foo.ts is not using safe SQL parameterization
- The error handling in src/bar.ts is missing a try/catch guard
```

**After (LITE)** (35 tokens):
```
CHANGES_REQUESTED:
- src/foo.ts:42 — SQL param binding (use ? not ${var})
- src/bar.ts:99 — missing error guard
```

✅ **Clarity**: Full—exact locations + issues clear
✅ **Quality**: Maintained
✅ **Reduction**: ~56%

---

### Technical Docs (Architect writes)

**Before** (120 tokens):
```
## Solution

The proposed solution involves implementing a new branded type system
for alert channels that will ensure type safety across the codebase.
This approach will prevent the recurring routing bugs that have plagued
the system for several releases by making it impossible to pass an invalid
channel name to the alert notification function.
```

**After (LITE)** (60 tokens):
```
## Solution

Implement AlertChannel branded type + validator. Ensures type safety,
prevents invalid channel values at compile-time. Eliminates routing
bugs (4 fixes in 30d).
```

✅ **Clarity**: Full—reason, approach, benefit
✅ **Quality**: Maintained
✅ **Reduction**: ~50%

---

**Before** (150 tokens):
```
## Files to Modify

- src/domain/models/alertChannel.ts — Create new branded type and validator function
- src/interface/mcp/notifyTelegramAlert.ts — Add validation at entry point
- src/domain/services/alertDispatcher.ts — Refactor routing logic
- src/__tests__/CHANNEL-routing.test.ts — Add tests for all valid/invalid channels
```

**After (LITE)** (75 tokens):
```
## Files to Modify

- **Create**: src/domain/models/alertChannel.ts (branded type + validator)
- **Modify**: src/interface/mcp/notifyTelegramAlert.ts (add validator call)
- **Modify**: src/domain/services/alertDispatcher.ts (routing refactor)
- **Test**: src/__tests__/CHANNEL-routing.test.ts (all cases)
```

✅ **Clarity**: Full—purpose + action clear
✅ **Quality**: Maintained
✅ **Reduction**: ~50%

---

### Requirement Specs (BA writes)

**Before** (90 tokens):
```
## Requirement FR-1: Alert Routing Type Safety

The system should implement a type-safe mechanism for specifying alert
channels so that it becomes impossible to accidentally send an alert
to the wrong channel. This will prevent recurring bugs and improve
system reliability.
```

**After (LITE)** (45 tokens):
```
## Requirement FR-1: Alert Routing Type Safety

System implement AlertChannel branded type. Prevents invalid channel
values. Eliminates recurring routing bugs. Layer: domain.
```

✅ **Clarity**: Full—requirement + benefit + layer clear
✅ **Quality**: Maintained
✅ **Reduction**: ~50%

---

## Checklist for Reference Documents

Before finalizing TASK_REPORT/TECH/REQ docs:

- [ ] Articles dropped (the, a, an)?
- [ ] Filler removed (just, really, basically, simply)?
- [ ] Pleasantries removed (certainly, happy to)?
- [ ] Abbreviations used (DB, auth, config)?
- [ ] Full sentences kept (no fragments)?
- [ ] Professional tone maintained?
- [ ] Technical terms exact?
- [ ] Code paths clear?
- [ ] DDD layer assignments clear?
- [ ] Acceptance criteria unambiguous?
- [ ] Token estimate 40-60% of verbose?

---

## When to Break LITE Compression

Switch temporarily to full English for:
- Security warnings
- Critical constraints
- Multi-step sequences where order matters
- User confusion (if reader asks "what does that mean?")

Then resume LITE after clarity section.

Example:
```
**WARNING**: Deleting this data cannot be reversed. Verify backup exists first.

Compression resume: Backup verified. Ready proceed.
```

---

## Impact

| Document Type | Before | After | Reduction |
|---|---|---|---|
| TASK_REPORT | 100 tokens | 50 tokens | 50% |
| TECH_NNN | 120 tokens | 60 tokens | 50% |
| REQ_NNN | 90 tokens | 45 tokens | 50% |
| **Average** | **100 tokens** | **50 tokens** | **~50%** |

Per sprint: Save ~500 tokens on documentation + agent processing.

---

## Activation

✅ **Live immediately**. All agents apply LITE compression when writing reference documents:
- QA: TASK_REPORT_NNN.md
- Architect: TECH_NNN.md
- BA: REQ_NNN.md

Use `docs/TOKEN_ECONOMY_CHECKLIST.md` (Tier 3) for self-review.

