# TASK_VPS-DEP-T2-GUARD1-MIGRATE — Migrate GUARD-1 placeholder assert into deploy-vinahost.sh

**Owner:** dev-vps-crawls  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Priority:** HIGH  
**Status:** READY (gates on T1 PASS)  
**Estimated:** 1.5h  
**Blocks:** nothing (parallel with T3 on same owner)

---

## Summary

Migrate the pre-SCP placeholder-leak assert (GUARD-1) from deploy-vps-proxy.sh into all 9 render blocks in deploy-vinahost.sh. This ensures no `__TOKEN__` sentinels slip through deployment.

---

## Acceptance Criteria

### AC-1: GUARD-1 pattern ported to all 9 blocks
Deploy-vinahost.sh currently has 9 service blocks (prices, bctc, news, sbv, foreign-flow, ohlcv-backfill, bctc-enrich, tradingeconomics, vps-proxy).

For EACH block that renders a shell script via sed (blocks 1-6 and 8):
- Create a TMP variable
- Render the sed command output to TMP
- Add `grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"` check
- If match found: echo error message, `rm -f "$TMP"`, exit 1
- SCP the TMP file
- `rm "$TMP"`

**AC-PASS condition:** All 9 blocks follow this pattern (or are skipped if no sed render needed).

### AC-2: TE_API_KEY sentinel handled correctly
Block 8 (tradingeconomics) uses 3-token sed:
```bash
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g" \
    ...
```
The `-` expansion means if TRADING_ECONOMICS_API_KEY is unset, it renders as empty string (not literal `__TE_API_KEY__`).

**AC-PASS condition:** GUARD-1 assert fires AFTER all three sed rules applied. Empty string passes (correct). Literal `__TE_API_KEY__` fails (correct).

### AC-3: No render blocks skipped
Audit the full script. Blocks that do NOT render (only SCP template files, no sed):
- ohlcv-backfill (block 7) — no render, only SCP timer config
- vps-proxy (block 9) — no render, only SCP binary + config

**AC-PASS condition:** Blocks 7 and 9 are marked with a comment explaining no render needed. Other 7 blocks have GUARD-1.

### AC-4: Existing code from deploy-vps-proxy.sh used as reference
Reference source: `scripts/deploy-vps-proxy.sh` lines 38-50 (fetch-prices block, GUARD-1 pattern).
Copy the pattern exactly; do not invent new assertions.

**AC-PASS condition:** Developer confirms the grep pattern and exit logic matches the reference.

### AC-5: Line count reasonable
deploy-vinahost.sh currently ~300L. Adding guards (~10L per block × 7 blocks ≈ 70L) → ~370L expected.

**AC-PASS condition:** Final script ≤400L (acceptable for an infra script, no cap applies).

### AC-6: Post-deploy verify block not yet appended
Do NOT append the global post-deploy verify block in this task (that is T4). This task is ONLY pre-SCP guards.

**AC-PASS condition:** grep "VERIFYEOF" in final script returns ZERO (not yet present).

---

## Implementation approach

1. **Read** the current deploy-vinahost.sh carefully (sections 1–9)
2. **Read** deploy-vps-proxy.sh lines 38–50 and 82–100 (GUARD-1 pattern reference)
3. **Edit** deploy-vinahost.sh:
   - Section 1 (prices): TMP variable + sed + assert + scp + rm pattern
   - Section 2 (bctc): same pattern
   - Section 3 (news): same pattern
   - Section 4 (sbv): same pattern
   - Section 5 (foreign-flow): same pattern
   - Section 6 (ohlcv-backfill): add comment "no render, only SCP; no GUARD-1 needed"
   - Section 7 (bctc-enrich): pattern (if render needed)
   - Section 8 (tradingeconomics): pattern with 3-token sed
   - Section 9 (vps-proxy): add comment "no render, only SCP; no GUARD-1 needed"
4. **Test locally** (no real deploy yet): parse script with `bash -n` to ensure no syntax errors
5. **Commit** to main: one-file diff

---

## Test plan

- **DV-1:** `bash -n scripts/deploy-vinahost.sh` returns zero exit (syntax OK)
- **DV-2:** grep -c "GUARD-1 FAIL" scripts/deploy-vinahost.sh returns 7 (one per render block)
- **DV-3:** grep "VERIFYEOF" scripts/deploy-vinahost.sh returns zero (T4 task, not yet present)
- **DV-4:** Line count ≤ 400

---

## Risk flags

| Risk | Mitigation |
|---|---|
| Copy-paste error in grep pattern | Reference the exact pattern from deploy-vps-proxy.sh; do not invent |
| TMP variable shadowing | Use unique name per block if needed (e.g., TMP_PRICES, TMP_BCTC) or reuse TMP with rm between blocks |
| TE_API_KEY empty-string false-positive | Confirm `${TRADING_ECONOMICS_API_KEY:-}` expands to empty, not literal sentinel, in test |

---

## Related docs

- Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md` § T2 GUARD-1 pattern
- Reference: `scripts/deploy-vps-proxy.sh` lines 38–50, 82–100 (GUARD-1 pattern)
- Committed work: commit 96446b5d (deploy-vps-proxy.sh GUARD-1 implementation, to be migrated)
