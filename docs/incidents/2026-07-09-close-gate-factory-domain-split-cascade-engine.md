# Docker Close Gate Steps 1-4: FACTORY-DOMAIN-split-cascade-engine (2026-07-09T11:59–12:05Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Task:** FACTORY-DOMAIN-split-cascade-engine  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77  
**Status:** ✓ COMPLETE (Steps 1-4 ops-gated, forwarded to qa)

**Context:** Dev-mcp-server split `cascadeEngine.ts` (3739L→779L): 9 rule-data constants extracted into `domain/services/cascade/rules/*.ts` (1 file per table: sectorRules/cascadeKeywordRule/legalRisk/policy/insiderDump/msciInclusion/msciWatchlist/msciExclusion/agricultureWeather/imfCascade). Orchestration split into `cascade/macroAdjustments.ts` (428L) + `cascade/comboDetectors.ts` (241L). buildCausalChain + all exported types remain in cascadeEngine.ts. Module surface parity exact (4 re-exported symbols only, barrel via cascade/rules/index.ts).

| Step | Result | Evidence |
|------|--------|----------|
| 1 — Preflight | ✓ PASS | Disk 22GB free, memory healthy (mcp-server 174MiB/3GiB) |
| 2 — Build/Deploy | ✓ PASS | Image rebuilt with GIT_SHA=f5b9b1f9f, container recreated |
| 3 — Health Check | ✓ PASS | Container up 16s (healthy), toolCount=183 (baseline match) |
| 4 — Cascade Path Live | ✓ PASS | cascade/rules/index.ts barrel live, buildCausalChain exported, imports verified |
| SHA-Gate | ✓ PASS | vn.market.git_sha=f5b9b1f9f (HEAD matches) |
| Board Update | ✓ DONE | next_agent ops→qa |

**RAW-Verify Evidence:**
- Cascade rules barrel exports all 9 rule modules (verified: `head -50 /app/src/domain/services/cascade/rules/index.ts`)
- cascadeEngine.ts imports from cascade/rules barrel at line 129 (verified: `import { SECTOR_RULES, type SectorRule } from "./cascade/rules/index.js"`)
- buildCausalChain still exported at line 178 (verified: `grep "export function buildCausalChain"`)
- /api/bctc-inspect returns 200 (HTML viewer)
- All 9 peer services healthy, no collateral impact

**Decision Journal:** docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-ops.md (STEP ops-S<N>)

Zone: `apps/mcp-server/` | Code commit: f5b9b1f9f

---
