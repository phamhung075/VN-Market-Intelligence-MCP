# TASK 1328b — Validator propagation verification (agentSignalTools.ts)

**Sprint:** 1328 | **Phase:** 1 | **Layer:** interface/mcp (verify only) | **Size:** S
**Status:** Todo | **Depends on:** 1328a merged | **Blocks:** nothing

---

## What to do

This task has NO code changes. It is a verification step after 1328a merges.

`SIGNAL_TYPE_VALIDATORS.chain_catalyst` at `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` line 78 already references `ChainCatalystFindingDataSchema` by import. Schema updates from 1328a propagate automatically.

`PayloadSchema` uses `.passthrough()` on the top-level payload object. The 3 new fields live in `finding_data` (validated via `SIGNAL_TYPE_VALIDATORS`), not in `PayloadSchema` — no change needed there.

---

## Verification steps

After 1328a branch merges to main:

```bash
cd apps/mcp-server && bun test --grep "1328"
```

Manually verify:
- `validateSignalPayload("chain_catalyst", { ...validBase, newsSentiment: 0.7, kinhDichConfidence: 80, agentSignalsMajority: "BUY" })` → `{ valid: true }`
- `validateSignalPayload("chain_catalyst", { ...validBase, newsSentiment: 1.5 })` → `{ valid: false }`

If both pass: close task. No PR needed.

---

## Acceptance criteria

- [ ] Post-1328a: `validateSignalPayload` accepts new fields in valid range
- [ ] Post-1328a: `validateSignalPayload` rejects out-of-range new fields
- [ ] No changes to `PayloadSchema` or tool registration in `agentSignalTools.ts`
