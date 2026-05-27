**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 6. Flow File Templates

Flow files = step-by-step instructions for agents. Two classes: cowork (analysis) and dev (code).

### 6.1 Cowork Flow Template

`docs/agents/<agent-id>/flow/cycle.md` — real-time market analysis loop.

**Structure:**
1. Bootstrap (market context, signals, status)
2. Notebook load (L1 recovery)
3. Main work steps (grounding check + try-continue per item)
4. Pre-send validation (schema, ranges, duplicates)
5. Lesson extraction + decision trace
6. Cycle self-review (5 quality checks)
7. Session log + WORK channel
8. Notebook write

**Error boundary:** Any tool fails after 1 retry → `send_telegram(bug)` + append session + EXIT.

### 6.2 Dev Flow Template

`docs/agents/developer/flow/microservice-main.md` (shared) + dev-<service> pointers.

**Structure:**
1. Handoff read (task scope, requirements, zone)
2. Pre-code: read affected tests, schema, existing code (grounding)
3. TDD loop: RED → GREEN → REFACTOR + self-review
4. Code review + doc-update (doc-review flow)
5. QA handoff (caveman format, confidence: high|medium|low)

**Constraint:** All code changes scoped to `apps/<zone>/` only. Cross-zone changes → architect approval.

---

## Key Patterns

**Anti-hallucination:** Always load `.claude/skills/anti-hallucination/SKILL.md` or inlined grounding rules.

**Graceful degradation:** Wrap items in try-continue; skip non-critical failures (Level 2), exit on bootstrap fail (Level 4).

**Pre-send validation:** Schema + sanity + duplicate check before any signal/report.

**Confidence rating:** Dev flows add `confidence: high|medium|low` + basis to QA handoff.
