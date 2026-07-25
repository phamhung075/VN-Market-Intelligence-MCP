# Decision Journal — Sprint INPUT-VALIDATION-COVERAGE · po

**Sprint goal:** Uniform strict-schema input validation across ALL agent write surfaces (A MCP-tools / B script-gated JSON / C direct-write docs/data + notebooks + handoffs); rejected writes throw a per-field descriptive error; fail-closed.
**Agent:** po
**Started:** 2026-07-25T07:28:58Z

---

### STEP po-S1 · po · 2026-07-25T07:29Z
**task-id:** IVC-ARCH-BLUEPRINT
**what-done:** Ran prior-art gate, scoped 3 write-surface classes, minted the sprint goal + a design-first architect blueprint task via orch-apply.sh; claimed sprint umbrella lock.
**what-considered:**
- Route class-C mechanism decision to BA directly (sprint-kickoff default) vs architect-first design task.
- Resolve the class-C mechanism inline as PO vs hand to architect.
- Mint many granular dev tasks now vs one architect blueprint that decomposes downstream.
**why-decision:** Class-C (~77 direct-write stores + notebooks + handoffs with NO runtime gate) is a genuine technical-design decision with real tradeoffs (fail-closed PreToolUse hook + schema registry vs per-store wrappers vs shared helper) — architect's job, not PO's; design-first matches the SYSTEMIC-REMAKE precedent. Minting one blueprint (not many rows) avoids the health-recheck stale-duplicate footgun; BA/PM decompose after.
**why-change:** sprint-kickoff.md defaults to a BA task with status TODO — deviated on both: architect-first (design needed) and status BACKLOG (live validator rejects TODO in backlog lane — the stale template is wrong; the write-gate that this sprint is about proved it).
