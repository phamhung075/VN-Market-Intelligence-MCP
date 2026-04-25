# TASK 1328j — Raise impact threshold 7→8 in config

**Sprint:** 1328 | **Phase:** 3 | **Layer:** infrastructure/config | **Size:** S
**Status:** Todo | **Gate: PO must review 1328k output before this task starts** | **Blocks:** nothing

---

## TLDR

Change `defaultImpactScoreMin` default from `7` to `8` in both `config.ts` and `mcp.config.json`. Signals with `impact_score = 7` will be rejected by `post_agent_signal` validator. Expected effect: News Scout noise from 35% → ~27%.

---

## GATE (mandatory)

**This task must NOT start until:**
1. 1328k script is run and output delivered to PO
2. PO has reviewed the 1328k output and given explicit approval
3. 1328h (cowork routing) and 1328i (NFC) are complete and deployed

Developer does NOT self-approve threshold changes (PO decision 4).

---

## Files to modify

### 1. `apps/mcp-server/src/infrastructure/config.ts` — line 451

```typescript
// Before:
defaultImpactScoreMin: num(f, "alerts.defaultImpactScoreMin", "DEFAULT_IMPACT_SCORE_MIN", 7),

// After:
// Task 1328j — threshold raised 7→8 after 1328k PO review (2026-04-25).
// Gate: PO must re-approve before raising further. See docs/handoffs/TASK_1328k.md.
defaultImpactScoreMin: num(f, "alerts.defaultImpactScoreMin", "DEFAULT_IMPACT_SCORE_MIN", 8),
```

### 2. `mcp.config.json` (project root)

Find `alerts.defaultImpactScoreMin` field and change value from `7` to `8`.

---

## Test file

`apps/mcp-server/src/__tests__/1328j-threshold-config.test.ts`

- Config loads default → `alerts.defaultImpactScoreMin === 8`
- `validateSignalPayload` with `impact_score: 7` → rejected
- `validateSignalPayload` with `impact_score: 8` → accepted
- `validateSignalPayload` with `impact_score: 10` → accepted

---

## Risk

If the 7–8 bucket contains > 15% of total signals or critical tickers (VNM, VCB, BID, FPT), PO may choose to keep threshold at 7 or raise to 7.5 instead. 1328k analysis determines this.

---

## Acceptance criteria

- [ ] PO approval documented (comment in PR or explicit sign-off in 1328k output)
- [ ] `config.ts` default is `8`
- [ ] `mcp.config.json` value is `8`
- [ ] `bun test --grep "1328j"` passes
- [ ] `bun tsc --noEmit` clean
- [ ] Docker restart after deploy: `docker-compose down && docker-compose up -d`
