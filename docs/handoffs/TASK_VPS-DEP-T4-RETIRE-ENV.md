# TASK_VPS-DEP-T4-RETIRE-ENV — Post-deploy verify, retire deploy-vps-proxy.sh, clean .env

**Owner:** dev-vps-crawls  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Priority:** HIGH  
**Status:** READY (gates on T1 PASS, gates on T2/T3 DONE)  
**Estimated:** 0.5h  
**Blocks:** nothing (final dev task before ops deploy)

---

## Summary

(1) Append the global post-deploy placeholder verify block (GUARD-1 post-check) to deploy-vinahost.sh. (2) Delete the dead deploy-vps-proxy.sh file. (3) Remove VULTR_IP, VULTR_USERNAME, and VULTR_PASSWORD from `.env` and `.env.example`.

---

## Acceptance Criteria

### AC-1: Post-deploy verify block appended to deploy-vinahost.sh
At the END of deploy-vinahost.sh (after section 10), append:
```bash
# ── GUARD-1: Post-deploy SSH placeholder verify ───────────────────────────
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

**AC-PASS condition:** Block present at EOF (after all 10 sections), unchanged from reference.

### AC-2: VERIFYEOF anchor present
Confirm the heredoc closes with VERIFYEOF (not a typo like VERIFYEOF with extra char).

**AC-PASS condition:** grep "VERIFYEOF" deploy-vinahost.sh returns exactly 2 matches (opening and closing).

### AC-3: deploy-vps-proxy.sh deleted
Remove `scripts/deploy-vps-proxy.sh` from the repo. Confirm via `ls -la scripts/deploy-vps-proxy.sh` that it no longer exists (or git status shows D).

**AC-PASS condition:** `git ls-tree HEAD | grep deploy-vps-proxy` returns zero (file not in HEAD after commit).

### AC-4: VULTR_IP removed from .env
Open `.env`, find and delete the line:
```
VULTR_IP=139.180.185.18
```

**AC-PASS condition:** grep "VULTR_IP" .env returns zero.

### AC-5: VULTR_USERNAME removed from .env
Delete:
```
VULTR_USERNAME=root
```

**AC-PASS condition:** grep "VULTR_USERNAME" .env returns zero.

### AC-6: VULTR_PASSWORD removed from .env
Delete:
```
VULTR_PASSWORD=Q]8pkg]fPnXUYexf
```
(or whatever the actual value is in the local .env).

**AC-PASS condition:** grep "VULTR_PASSWORD" .env returns zero.

### AC-7: .env.example updated to remove VULTR_* (FOLLOW-ON)
Apply the same removals to `.env.example`. Add a comment above VPS_PUSH_API_KEY explaining Vultr decommission:
```bash
# VPS SSH access — Vinahost only (Vultr decommissioned 2026-04-13)
```

**AC-PASS condition:** grep "VULTR_IP" .env.example returns zero. Comment added near VPS_PUSH_API_KEY.

### AC-8: Sentinel retention confirmed (TE_API_KEY)
Confirm that `fetch-tradingeconomics.sh` line 15 still contains the sentinel guard:
```bash
if [ "$TE_API_KEY" = "__TE_API_KEY__" ]; exit 0
```
This is intentional (defence-in-depth) and should NOT be removed.

**AC-PASS condition:** grep "__TE_API_KEY__" fetch-tradingeconomics.sh returns exactly 1 match (the guard, not removed).

---

## Implementation approach

1. **Read** deploy-vps-proxy.sh lines 224–232 (post-deploy VERIFY block reference)
2. **Read** deploy-vinahost.sh end (confirm section 10 is complete)
3. **Edit** deploy-vinahost.sh:
   - Append post-deploy verify block verbatim at EOF
4. **Delete** scripts/deploy-vps-proxy.sh
5. **Edit** .env:
   - Remove VULTR_IP=
   - Remove VULTR_USERNAME=
   - Remove VULTR_PASSWORD=
6. **Edit** .env.example:
   - Remove VULTR_IP= (add comment before VPS_PUSH_API_KEY)
   - Remove VULTR_USERNAME=
   - Remove VULTR_PASSWORD=
7. **Test locally:** `bash -n scripts/deploy-vinahost.sh` (syntax OK)
8. **Verify** fetch-tradingeconomics.sh sentinel present (AC-8)
9. **Commit** to main: three-file diff (deploy-vinahost.sh, delete deploy-vps-proxy.sh, .env/.env.example edits)

---

## Test plan

- **DV-1:** `bash -n scripts/deploy-vinahost.sh` returns zero exit (syntax OK)
- **DV-2:** grep "VERIFYEOF" scripts/deploy-vinahost.sh returns exactly 2 (opening+closing)
- **DV-3:** `git ls-tree HEAD scripts/` does not list deploy-vps-proxy.sh (deleted)
- **DV-4:** grep "VULTR_IP" .env returns zero
- **DV-5:** grep "VULTR_IP" .env.example returns zero
- **DV-6:** grep "__TE_API_KEY__" vps-scripts/fetch-tradingeconomics.sh returns exactly 1
- **DV-7:** git diff HEAD shows 3 files changed (deploy-vinahost.sh +, deploy-vps-proxy.sh -, .env mod, .env.example mod)

---

## Risk flags

| Risk | Mitigation |
|---|---|
| Accidental deletion of .env | Work on a local copy first; git will preserve history |
| VERIFYEOF typo breaks syntax | Reference the exact block from deploy-vps-proxy.sh; use copy-paste |
| TE_API_KEY sentinel mistakenly removed | Verify AC-8 before commit; grep check confirms presence |
| Vultr credentials left in git history | They are already in history (older commits); removal from .env prevents NEW commits containing them |

---

## Related docs

- Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md` § T4 post-deploy verify + retire
- Reference: `scripts/deploy-vps-proxy.sh` lines 224–232 (GUARD-1 post-verify block)
- Memory: VPS Infrastructure Setup (Vinahost access details)
