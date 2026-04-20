---
id: TECH-211
req: REQ-211
title: "refactor(kinhdich): move tool + wrapper into module subfolders"
status: APPROVED
sprint: 211
author: Architect
date: 2026-04-20
---

# TECH-211 — kinhdich module file moves

## Approach

Pure rename/move. Zero logic changes. Phase 2 barrels already redirect callers — only the barrel re-export paths and intra-file relative imports change.

## File moves

| From | To |
|------|----|
| `src/interface/mcp/tools/kinhDichTools.ts` | `src/interface/mcp/tools/kinhdich/kinhDichTools.ts` |
| `src/domain/services/kinhDichWrapper.ts` | `src/domain/services/kinhDich/kinhDichWrapper.ts` |

## Import path corrections

### kinhDichTools.ts (moves one level deeper: `tools/` → `tools/kinhdich/`)

All `../../../` prefixes become `../../../../`:

```typescript
// BEFORE (at tools root)
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { getSectorPeers } from "../../../domain/services/sectorPeers.js";
import { logger } from "../../../infrastructure/logger.js";
import { ... } from "../../../domain/services/kinhDich/kinhDichWrapper.js";
import { formatReading } from "../../../domain/services/kinhDich/kinhDichFormatter.js";
import { QUE_META, QUE_DATA } from "../../../domain/services/kinhDich/hexagramLibrary.js";

// AFTER (inside tools/kinhdich/)
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { getSectorPeers } from "../../../../domain/services/sectorPeers.js";
import { logger } from "../../../../infrastructure/logger.js";
import { ... } from "../../../../domain/services/kinhDich/kinhDichWrapper.js";
import { formatReading } from "../../../../domain/services/kinhDich/kinhDichFormatter.js";
import { QUE_META, QUE_DATA } from "../../../../domain/services/kinhDich/hexagramLibrary.js";
```

### kinhDichWrapper.ts (moves from `domain/services/` → `domain/services/kinhDich/`)

```typescript
// BEFORE (at domain/services root)
import { QUE_META } from "./kinhDich/hexagramLibrary.js";

// AFTER (inside domain/services/kinhDich/)
import { QUE_META } from "./hexagramLibrary.js";
```

## Barrel updates

### `src/interface/mcp/tools/kinhdich/index.ts`

```typescript
// BEFORE
export { registerKinhDichTools } from "../kinhDichTools.js";

// AFTER
export { registerKinhDichTools } from "./kinhDichTools.js";
```

### `src/domain/services/index.ts`

```typescript
// BEFORE (last line)
export * from "./kinhDichWrapper.js";

// AFTER
export * from "./kinhDich/kinhDichWrapper.js";
```

## Test strategy

File: `src/__tests__/211-kinhdich-module-move.test.ts`

```typescript
// RED phase: import from barrels — fails while files at old paths
// GREEN phase: passes after moves + path fixes
import { describe, it, expect } from "bun:test";

describe("Sprint 211 — kinhdich module move", () => {
  it("tools/kinhdich barrel exports registerKinhDichTools", async () => {
    const mod = await import("../interface/mcp/tools/kinhdich/index.js");
    expect(typeof mod.registerKinhDichTools).toBe("function");
  });

  it("domain/services barrel still exports appendKinhDich", async () => {
    const mod = await import("../domain/services/index.js");
    expect(typeof mod.appendKinhDich).toBe("function");
  });
});
```

## Execution sequence

1. Write test → confirm RED
2. Move `kinhDichTools.ts` → `kinhdich/` subfolder
3. Fix `../../../../` import prefixes inside it
4. Move `kinhDichWrapper.ts` → `kinhDich/` subfolder
5. Fix `./hexagramLibrary.js` import inside it
6. Update `kinhdich/index.ts` barrel: `../kinhDichTools.js` → `./kinhDichTools.js`
7. Update `domain/services/index.ts`: `./kinhDichWrapper.js` → `./kinhDich/kinhDichWrapper.js`
8. `bun tsc --noEmit` — must be clean
9. `bun test` — full suite green

## Risk: none

- Callers outside the module use only the barrel (`tools/index.ts` → `kinhdich/index.ts`) — path is unchanged
- `domain/services/index.ts` re-export path changes but callers import from barrel, not direct files
- No circular dependencies introduced
