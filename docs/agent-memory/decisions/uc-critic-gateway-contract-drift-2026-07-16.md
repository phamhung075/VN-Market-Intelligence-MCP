# Decision Journal — UC-CRITIC-GATEWAY-CONTRACT-DRIFT

**Task:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT  
**Sprint:** ULTRACODE-AUDIT-FIXALL  
**Priority:** P1 / Size: S / Zone: cross-service/  
**Fixed by:** fixer agent  
**Date:** 2026-07-16

## Summary

Mechanical reconciliation of stale `mcp__claude_ai_gateway__` prefix to canonical `mcp__gateway__` across 8 documentation files. Gateway contract and MCP tool surface now align with CLAUDE.md (June-16-2026 rename commit 775e2d8ee, already live in codebase).

## Files Changed

1. **docs/standards/gateway-call-contract.md** (5 changes)
   - L13: §1 canonical call form
   - L30-32: §2 meta-tool table (3 rows: search_tools, list_server_tools, list_servers)
   - L94: §6 Degraded-Mode COLLAPSE (removed stale dual-prefix mention, retained single canonical form)

2. **docs/standards/mcp-tools.md** (1 change)
   - L28: Quick reference call form

3. **docs/protocols/task-lock-protocol.md** (1 change)
   - L162: Sprint verification checklist instruction

4. **docs/guides/guide-agent-definition-frontmatter.md** (2 changes)
   - L23: Cowork (analysis) family typical tools
   - L25: Dev + MCP family typical tools

5. **docs/REQ_DYN-WF-FOUNDATION.md** (2 changes)
   - L134: AC-P0-3-1 acceptance criterion (is_trading_day example)
   - L332: NFR-8 interface requirement row

6. **docs/data/quality-checklist.json** (1 change, JSON valid)
   - L2347: MCPGW-CONTRACT-01 recheck_how instruction (mcp__gateway__list_server_tools)

7. **.claude/skills/task-lock/SKILL.md** (1 change, folded from I11)
   - L169: INV-GATEWAY-1 invariant description

8. **docs/agents/tran-ngoc-bau/flow/bootstrap.md** (1 change, folded from I14)
   - L30: Gateway-down handling mode (A) diagnosis

## Rationale — L94 COLLAPSE

Section 6 "Degraded Mode" previously documented dual-prefix behavior (`mcp__claude_ai_gateway__*` / `mcp__gateway__*` tools are absent). This was historical — the dual form reflected pre-June-16 ambiguity about which prefix was canonical. After June-16 rename and this reconciliation pass, only `mcp__gateway__*` is correct. Rewrote L94 to drop the stale prefix half, leaving a single coherent reference to the canonical form.

## Post-Verify

```bash
grep -rn "claude_ai_gateway" <8-files> 
# Result: 1 hit on L16 gateway-call-contract.md (NOT a target — that line documents INCORRECT server names in a "do NOT use" list; BA spec table specifies L13,30,31,32,94 only)

jq empty docs/data/quality-checklist.json
# Result: exit 0 (JSON valid)
```

## Folding Decision

Architect ruling (BA spec §4, architectural brownfield findings): batch-or-separate I11/I14 → FOLD IN. Both files (task-lock/SKILL.md:169 and tran-ngoc-bau/bootstrap.md:30) are identical mechanical prefix swaps, near-zero marginal cost. Avoids duplicate future verification work. Both included in this commit (total 8 files).

## Carry-Forward (PM post-ship action — NOT executed now)

Once QA signs off, PM updates:
- `UC-RDL-UNVERIFIED-BATCH.note` — drop "P9 (gateway tool-name drift in INV-GATEWAY-1)" (→ 8 remaining)
- `UC-CCA-UNVERIFIED-BATCH.note` — drop "P12 (fix stale wrapper name in TNB bootstrap)" (→ 7 remaining)

These are SPIKE row edits, not this task's scope; PM handles post-ship via orch-apply.sh per architect ruling (BR-2 in BA spec §5.2).

## Build Standard

Not-applicable (doc-only, no executable code, no new interfaces).

---

**DONE** — all 8 files staged, grep-verify clean, JSON valid.
