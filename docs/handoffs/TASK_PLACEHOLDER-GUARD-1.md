# TASK — PLACEHOLDER-GUARD-1: Deploy-Time Placeholder-Leak Guard

**Task ID:** PLACEHOLDER-GUARD-1  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Owner:** dev-vps-crawls  
**Estimated:** ≤2h  
**Status:** READY  
**Dependencies:** Follows PLACEHOLDER-GUARD-2 (optional, but safe form + guard together are more trustworthy).

---

## Scope

Add a two-layer leak guard to `scripts/deploy-vps-proxy.sh`:

1. **Pre-scp assert blocks** (after each `sed` render step, before `scp`): grep for unrendered `__[A-Za-z][A-Za-z0-9_]*__` tokens → exit 1 and abort deploy if match.
2. **Post-deploy SSH verify** (after all scp steps complete): SSH into the VPS and glob-verify `/root/fetch-*.sh /root/*.py` contains zero `__[A-Za-z][A-Za-z0-9_]*__` tokens.

---

## Acceptance Criteria

**AC-1 (Pre-scp assert — local test, no SSH):**  
Create a test fixture with an injected `__GUARD_TEST_TOKEN__` placeholder that the deployer's sed rules do NOT substitute. Run the pre-scp assert against the rendered temp file. Must exit non-zero BEFORE any scp step is executed. **Proven locally — no VPS required.**

**AC-2 (Clean deploy path):**  
A standard deploy run with real credentials (all sed rules apply, all placeholders substituted) completes end-to-end and prints `"GUARD-1 post-deploy verify: CLEAN (0 placeholder leaks)"` to stdout from the SSH verify block.

**AC-3 (Post-deploy SSH verify via glob):**  
After a clean deploy, SSH into the VPS and run `grep -rl '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null || true` → returns empty string (no files match).

**AC-4 (Anti-false-green — fence rule):**  
"Green exit code from the test" is NOT acceptance. The deliberate-violation test must FAIL (exit non-zero) — proving the guard fires. The fixture file does NOT get committed.

---

## Implementation Guide

### Pre-scp assert blocks

After each `sed` render step (identified in `scripts/deploy-vps-proxy.sh` lines as documented in the BA spec), add:

```bash
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_xxx"; then
  echo "ERROR: placeholder leak in rendered $TMP_xxx — deploy aborted" >&2
  rm -f "$TMP_xxx"
  exit 1
fi
```

**Placement (from BA spec advisory):**

- **TMP_FETCH** — after L41 `sed ... > "$TMP_FETCH"`, before L45 `$SCP` command (fetch-prices)
- **TMP_BCTC** — after BCTC render (L82–101), before scp
- **TMP_NEWS** — after L110 news render, before L112 scp
- **TMP_SBV** — after SBV render, before scp
- **TMP_FF** — after foreign-flow render, before scp

**Line numbers are advisory.** Verify exact locations in the file with `grep -n "TMP_FETCH\|TMP_BCTC\|TMP_NEWS\|TMP_SBV\|TMP_FF"` before editing.

### Post-deploy SSH verify block

After all scp steps complete (typically at the end of the deployer, before any final echo), add:

```bash
$SSH << 'VERIFYEOF'
set -e
LEAKED=$(grep -rl '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null || true)
if [ -n "$LEAKED" ]; then
  echo "ERROR: deployed artifacts still contain placeholders: $LEAKED" >&2
  exit 1
fi
echo "GUARD-1 post-deploy verify: CLEAN (0 placeholder leaks)"
VERIFYEOF
```

---

## Deliberate-Violation Test (QA-Proven, Not Dev)

**Setup (dev or qa):**

1. Copy `vps-scripts/fetch-vn-news.sh` to a temporary test fixture.
2. Append a line with an unrendered placeholder token: `GUARD_TEST="__GUARD_TEST_TOKEN__"`
3. Run the deployer's sed substitution command (from `scripts/deploy-vps-proxy.sh`) against the fixture file:
   ```bash
   sed -e "s|__MCP_BASE__|https://zenmidi.com|g" -e "s|__API_KEY__|test_key|g" <fixture> > /tmp/rendered_test
   ```
4. Run the pre-scp assert against the rendered file:
   ```bash
   if grep -q '__[A-Za-z][A-Za-z0-9_]*__' /tmp/rendered_test; then
     echo "GUARD fires (expected)"
     exit 1
   fi
   ```
5. **Expected result:** exit non-zero (grep found the leaked `__GUARD_TEST_TOKEN__`). This proves the assert fires before scp.

**QA proves:** exit 1 + error message printed + no scp occurs.

---

## Notes

### Regex pattern choice

The regex `__[A-Za-z][A-Za-z0-9_]*__` (case-insensitive, starts with a letter, followed by alphanumerics/underscores) matches all current and future placeholder forms (including lowercase variants like `__mcp_base__`). This is broader than the "all-caps" variants in current scripts and is future-proof per architect guidance.

### Fail-loud semantics

- Each pre-scp assert uses `exit 1` + print to stderr + `rm -f "$TMP_xxx"` (cleanup).
- The deployer's `set -e` at L17 (confirmed in BA spec) propagates the exit.
- The deploy stops immediately — no VPS mutation occurs.

### article-body-fetcher.py trivial pass

The Python script has ZERO `__...__` tokens (verified in BA spec). The post-deploy SSH glob `/root/article-body-fetcher.py` will trivially pass the assert (no files leaked). This is correct behavior — the assert is proving "no new code contains placeholders," and article-body-fetcher correctly doesn't.

---

## Handoff References

- **BA spec:** `docs/handoffs/TASK_VPS-PLACEHOLDER-GUARD.md` (§GUARD-1, lines 36–85)
- **Architect brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md` (§2, pre-scp + post-deploy + deliberate-violation details)
- **Deployer script:** `scripts/deploy-vps-proxy.sh` (L17 `set -e` confirmed; TMP_* locations identified by architect)

---

## Dependencies

- **Blocks:** PLACEHOLDER-GUARD-3 (optional, but 1+3 typically land together).
- **Depends on:** PLACEHOLDER-GUARD-2 (recommended order, not hard dependency — 2 converts scripts, 1 guards render).

---

## DDD Layer

Infrastructure (deployment script). No domain layer, no application layer, no interface layer.

---

## Ship Criteria

1. Pre-scp assert blocks added after each TMP file render (5 locations).
2. Post-deploy SSH verify added after all scp steps.
3. Deliberate-violation test proven locally (exit non-zero before scp) — QA responsibility.
4. Clean deploy proven end-to-end, prints "CLEAN" message.
5. One commit (all `scripts/deploy-vps-proxy.sh` edits) on `main`.
6. No Docker rebuild required.
