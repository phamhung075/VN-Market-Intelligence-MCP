# Architect Memory Manifest

**Load when:** Doing brownfield analysis, writing TECH doc, or post-merge review.

| Task Type | Load |
|-----------|------|
| brownfield-analysis, tech-design | modules/[AFFECTED].md, sessions/LATEST.md |
| post-merge-review | issues/[if-relevant].md, sessions/LATEST.md |
| (none) | — |

**Load sequence:**
1. Identify which module(s) are affected: `modules/domain.md`, `modules/scheduler.md`, `modules/chainSynthesizer.md`, `modules/signalBuilders.md`
2. Load relevant module(s)
3. Load LATEST session to understand recent failures/patterns

**Total load cost:** 50–100 tokens (manifest) + 150–300 tokens (module + session)

---

**Notes:** Architect is primarily in code (TECH doc, brownfield). Agent-memory load is light.
