# Decision Journal — Sprint 2026-08-26 · dev-mcp-server

**Sprint goal:** ambient direct-dispatch task (not tied to an active board sprint) — widen task_claim.payload to accept object OR string; reconcile dispatch-claim skill docs with the real schema.
**Agent:** dev-mcp-server
**Started:** 2026-08-26T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-08-26T10:15:00Z
**task-id:** taskclaim-payload-union (router intent-lock key; no board row — Part A is new work, Part B links existing agent-father-owned rows, not moved by me)
**what-done:** Widened `task_claim.payload` and `task_heartbeat.payload_patch` from `z.string().optional()` to `z.union([z.string(), z.record(z.unknown())]).optional()`; handler normalizes to a JSON string at the boundary so `coordinationStore.ts` storage/consumer contract is untouched.
**what-considered:**
- object-only (breaks the ~21 fleet doc/flow files already passing an object literal) — rejected.
- string-only + fix the docs instead (leaves the union's stated benefit on the table, and PO's own live probe already proved the object form is what routers actually send) — rejected.
- union (status quo + object, zero caller migration) — chosen, matches existing in-repo precedent (`orchStateSchema.ts:160`, `agentSignalTools.ts:261`).
**why-change:** widened `payload_patch` too (family consistency — same union, same boundary-serialize pattern) since `parseJsonObject`'s EC-6 silent-degrade-to-`{}` was a real footgun for an object caller; did NOT find any other coordination-tool `payload`-shaped field to widen (`task_force_release_orphan` carries none).
**test-evidence:** new suite `task-claim-payload-union.test.ts`, 12/12 pass standalone; RED-before-fix reproduced via `git stash` (4/12 fail with the old string-only schema, confirming the test proves the fix). Discovered + fixed a pre-existing, acknowledged mock-leak collision (1862c-transport-session-eviction.test.ts's documented non-restorable `mock.module` ESM replacement) that false-failed my Layer-1 schema-introspection tests under full-suite ordering only — added a preflight probe + `describe.skipIf` so it degrades to an honest skip, never a false fail; Layer-2 handler round-trip tests are unaffected either way and always run.
**doc-fix:** `.claude/skills/dispatch-claim/CARD.md` `ttl=` shorthand (3 sites) → `ttl_seconds=` (schema's real param name; Zod silently strips unknown keys, so the typo was defaulting every affected lock to TTL 3600 instead of the intended 600/3600/86400 — live-corroborated by peer session ca9c65e5's `intent:agent-father:implement` lock, ttl_seconds:3600 vs intended 600). Also added the missing required `owner_agent` to CARD.md's Phase A orphan-adoption `task_claim` call (confirmed real via schema read: `owner_agent: z.string().min(1)`, no `.optional()`) — board row `FIX-DISPATCHCLAIM-CARD-PAYLOAD-OBJECT-REJECTED-AND-PHASEA-OMITS-OWNER-AGENT` asked me to verify this while in the file; verified real, fixed since already touching that exact line block.
**doc-normalization:** normalized `SKILL.md:284`'s one string-form `payload` example to object-literal, matching every other call site in both files — the union makes both forms valid, but leaving one outlier invites the exact "reader copies the wrong-looking-consistent example" hazard the dispatch flagged; low-cost, in-scope, decided not left as-is.
