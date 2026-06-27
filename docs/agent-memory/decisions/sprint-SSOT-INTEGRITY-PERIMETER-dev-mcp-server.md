# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · dev-mcp-server

**Sprint goal:** Close SSOT integrity perimeter — Zod schema + dual-point enforcement + auto-fix errors
**Agent:** dev-mcp-server
**Started:** 2026-06-27T10:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-27T10:30:00Z
**task-id:** SSOT-W1-ZOD-VALIDATOR-CLI
**what-done:** Built scripts/orch-validate.mjs — two-stage Zod validator CLI (Stage 0 raw-byte dup-key scan + Stage 1 OrchStateSchema.safeParse + 1b coherence warn + 1c ref-integrity hard-fail); plus scripts/test-orch-validate-ac.mjs AC-1..AC-4 fixture (29/29 pass).
**what-considered:**
- Import .ts schema directly via `bun` shebang (chosen — single SSOT, no schema duplication, bun transpiles .ts natively in .mjs)
- Duplicate the StatusEnum + lane list in a pure .mjs (rejected — defeats the whole SSOT sprint goal)
- Use a library (json-parse-safe) for dup-key detection (rejected — adds dep; custom tokenizer is 60L and correct for all JSON escape cases including `\"`)
**why-decision:** Direct .ts import via bun is the idiomatic approach used by all 40+ existing scripts/ .ts files; keeps orchStateSchema.ts as THE one schema with no second copy to drift.
**why-change:** Live orch-state exits 2 (not 0) due to 7 dangling payload_refs in signal_queue.rows (docs/signals/db-integrity-history.json moved to docs/data/; 1 broken fragment ref "entry #127"). Real finding — reported honestly per task constraint; safeParse itself passes (exit would be 0 without ref failures).
