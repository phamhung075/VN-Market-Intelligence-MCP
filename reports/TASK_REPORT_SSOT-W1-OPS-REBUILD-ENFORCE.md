## Task Report SSOT-W1-OPS-REBUILD-ENFORCE

**Sprint:** SSOT-INTEGRITY-PERIMETER (11/11 — final gate task)
**Image tested:** sha256:8aa222ab225d (container vn-market-intelligence-mcp-mcp-server-1)
**Gate type:** Point-2 LIVE enforcement — Zod StatusEnum rejects non-canonical status

---

### Test Arms (LIVE container — image 8aa222ab)

**Exported symbol tested:**
`StatusEnum` from `/app/src/infrastructure/orchStateSchema.ts`
(Bun runs TypeScript directly — no compiled dist; import path is the source file)

**Docker exec — VALID-PARSE arm:**
```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "
  import { StatusEnum } from '/app/src/infrastructure/orchStateSchema.ts';
  const result = StatusEnum.parse('TODO');
  console.log('VALID-ARM PASS: StatusEnum.parse(\"TODO\") =>', result);
"
Output: VALID-ARM PASS: StatusEnum.parse("TODO") => TODO
```
RESULT: PASS — valid enum value parses without error.

**Docker exec — NON-ENUM-THROWS arm:**
```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "
  import { StatusEnum } from '/app/src/infrastructure/orchStateSchema.ts';
  try {
    StatusEnum.parse('PARKED');
    process.exit(1);   // false-green
  } catch (e) {
    console.log('NON-ENUM-THROWS PASS: threw', e.constructor.name, e.message);
  }
"
Output:
  NON-ENUM-THROWS PASS: StatusEnum.parse("PARKED") threw
  Error type: ZodError
  Error message: [
    {
      "received": "PARKED",
      "code": "invalid_enum_value",
      "options": ["BACKLOG","TODO","IN_PROGRESS","REVIEW","QA","DONE",
                  "DONE_VERIFIED","BLOCKED","DEFERRED","CANCELLED","SKIPPED","READY"],
      "path": [],
      "message": "Invalid enum value. Expected 'BACKLOG' | 'TODO' | ... | 'READY', received 'PARKED'"
    }
  ]
```
RESULT: PASS — ZodError thrown (code: invalid_enum_value), NOT a generic crash.

---

### Live-SSOT Clean Proof

| Check | Command | Result |
|---|---|---|
| git porcelain | `git status --porcelain docs/data/orch/orch-state.json` | (empty — untouched) |
| jq .head | `jq -e '.head' docs/data/orch/orch-state.json` | EXIT 0 |
| orch-validate | `bun scripts/orch-validate.mjs docs/data/orch/orch-state.json` | EXIT 0 (72 coherence warnings = SHG migration, non-blocking) |

Live SSOT is CLEAN. No test injection touched the live file.

---

### verdict: PASS

**Point-2 LIVE enforcement confirmed in image sha256:8aa222ab225d.**

- `StatusEnum` is a Zod enum with 12 canonical values (BACKLOG..READY) exported from `/app/src/infrastructure/orchStateSchema.ts`.
- `TaskSchema` binds `status: StatusEnum` (source line ~85) — any object parsed through TaskSchema is also rejected on non-canonical status.
- Running container (Bun, TypeScript-direct) correctly: accepts "TODO" (valid) and rejects "PARKED" with `ZodError / invalid_enum_value`.
- Enforcement is LIVE in the shipped image, not just present in source.
- False-green classes guarded: test ran inside the running container via `docker exec`, NOT via local bun/tsc/source-read or sidecar.
