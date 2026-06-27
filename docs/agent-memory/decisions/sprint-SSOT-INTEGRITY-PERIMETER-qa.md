# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · qa

**Sprint goal:** Harden orch-state integrity perimeter — Zod schema + bash validator + mcp-server enforcement
**Agent:** qa
**Started:** 2026-06-27T15:35:00Z

---

### STEP qa-S1 · qa · 2026-06-27T15:35:00Z
**task-id:** SSOT-W1-OPS-REBUILD-ENFORCE
**what-done:** Ran live Point-2 enforcement gate against image 8aa222ab inside running container vn-market-intelligence-mcp-mcp-server-1.
**what-considered:**
- Local bun/tsc/source-read — rejected (false-green per integrity-helper-readonly-wal-blinded + fb-poster-gate-false-green memories)
- docker exec bun -e with import of compiled JS — no compiled dist exists; app runs TS directly
- docker exec bun -e importing TypeScript source directly — CORRECT path (Bun supports TS natively)
**why-decision:** Bun runs TypeScript directly (`start: bun run src/index.ts`, no build/dist dir); importing `/app/src/infrastructure/orchStateSchema.ts` in the running container is the live image code path.
**why-change:** No change from plan; docker exec TS-direct is equivalent to the `node -e compiled` recommendation once it was confirmed no build artifact exists.
