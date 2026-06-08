# Decision Journal — Sprint DEEPFETCH-RAG-REDESIGN · agent-father

**Sprint goal:** no goal set (ambient task dispatched into active sprint)
**Agent:** agent-father
**Started:** 2026-06-08T00:00:00Z

---

### STEP agent-father-S1 · agent-father · 2026-06-08T00:00:00Z
**task-id:** FIX-PRICE-ANOMALY-JSON-PLUS
**what-done:** Added explicit "NO LEADING + SIGN" rule to § B SIGNAL FILE rules block in docs/agents/market-watcher/flow/eod.md
**what-considered:**
- Add rule inline at § B Rules (chosen): immediately adjacent to the affected fields; cannot be missed by the emitting agent
- Extract to a shared JSON-emit policy file: DRY in theory but no such policy exists yet; creating one for a single rule adds more file-surface than it saves
**why-decision:** Inline rule in the same section as the template is the hardest to skip; future cycles read § B before writing the file, so the rule lands exactly where the bug was introduced
**why-change:** no change from plan — task spec prescribes exactly this edit
