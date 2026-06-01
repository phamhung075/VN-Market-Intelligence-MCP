# TASK_VPS-DEP-T3-GUARD3-MIGRATE — Migrate article-body-fetcher.py into deploy-vinahost.sh

**Owner:** dev-vps-crawls  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Priority:** HIGH  
**Status:** READY (gates on T1 PASS)  
**Estimated:** 0.5h  
**Blocks:** nothing (parallel with T2 on same owner)

---

## Summary

Add a new section 10 to deploy-vinahost.sh that deploys article-body-fetcher.py (scp + chmod + idempotent pip3 install beautifulsoup4). This capability currently lives only in the dead deploy-vps-proxy.sh (Vultr decommissioned 2026-04-13); moving it to the live Vinahost deployer enables article-body fetching for the mcp-server cafef/vneconomy ingestion pipeline.

---

## Acceptance Criteria

### AC-1: New section 10 added to deploy-vinahost.sh
After section 9 (vps-proxy), add:
```bash
# ── 10. Article body fetcher (cafef GUARD-3) ─────────────────────────────
echo ""
echo "Deploying VN article body fetcher..."
$SCP vps-scripts/article-body-fetcher.py ${VH_USER}@${VH_IP}:/root/article-body-fetcher.py

$SSH << 'ARTEOF'
set -e
chmod +x /root/article-body-fetcher.py
if ! pip3 show beautifulsoup4 > /dev/null 2>&1; then
  echo "Installing beautifulsoup4..."
  pip3 install beautifulsoup4
else
  echo "beautifulsoup4 already installed"
fi
ARTEOF
```

**AC-PASS condition:** Section 10 present, follows this structure exactly.

### AC-2: Post-SCP ls check (hygiene)
After SCP, add a minimal verify:
```bash
$SSH ls -la /root/article-body-fetcher.py
```
No placeholder tokens in article-body-fetcher.py itself (it takes `--url` as CLI arg), so full GUARD-1 assert not needed. A simple ls confirms upload.

**AC-PASS condition:** ls -la command present in SSH block.

### AC-3: Beautifulsoup4 install idempotent
The `pip3 show beautifulsoup4` check ensures install does not fail on re-deploy (already present → no-op).

**AC-PASS condition:** `if ! pip3 show beautifulsoup4 > /dev/null 2>&1; then ... fi` pattern present.

### AC-4: No GUARD-1 assert for this block
article-body-fetcher.py has no `__TOKEN__` sentinels (confirmed: it takes CLI args, not env-injected). Do NOT add a GUARD-1 assert here (would be false work).

**AC-PASS condition:** grep for "__.*__" pattern in this section returns zero (confirming no false guards added).

### AC-5: Deploy message clear
Echo statement before SCP should say "Deploying VN article body fetcher..." for operator visibility.

**AC-PASS condition:** Echo message present + informative.

### AC-6: Source file exists in vps-scripts/
article-body-fetcher.py must exist at `vps-scripts/article-body-fetcher.py`. If missing, escalate to dev-vps-crawls pipeline leads (not a PM blocker, but confirms file is tracked).

**AC-PASS condition:** Developer confirms file exists in repo before committing.

---

## Implementation approach

1. **Read** current deploy-vinahost.sh end (sections 8–9)
2. **Read** deploy-vps-proxy.sh lines 206–221 (article-body block, reference source)
3. **Edit** deploy-vinahost.sh:
   - After section 9 close, add section 10 header
   - Add the SCP + SSH block per AC-1
   - Include ls verify per AC-2
   - Ensure beautifulsoup4 idempotent check per AC-3
4. **Verify** vps-scripts/article-body-fetcher.py exists in repo
5. **Test locally:** `bash -n scripts/deploy-vinahost.sh` (syntax OK)
6. **Commit** to main: one-file diff

---

## Test plan

- **DV-1:** `bash -n scripts/deploy-vinahost.sh` returns zero exit (syntax OK)
- **DV-2:** grep "Article body fetcher" scripts/deploy-vinahost.sh returns one match
- **DV-3:** grep "pip3 install beautifulsoup4" scripts/deploy-vinahost.sh returns one match
- **DV-4:** `vps-scripts/article-body-fetcher.py` exists and is readable
- **DV-5:** No `__.*__` placeholder tokens in section 10 (grep returns zero)

---

## Risk flags

| Risk | Mitigation |
|---|---|
| article-body-fetcher.py not yet in vps-scripts/ | Confirm file exists; if missing, escalate (not dev-vps-crawls fault) |
| beautifulsoup4 install hangs (slow pip) | Timeout is managed by systemd (set Restart=always, no explicit timeout here); operator can SSH and check manually |
| ls -la output too verbose | Output is informational only; not parsed; acceptable |

---

## Related docs

- Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md` § T3 article-body-fetcher
- Reference: `scripts/deploy-vps-proxy.sh` lines 206–221 (GUARD-3 implementation)
- Source: `vps-scripts/article-body-fetcher.py` (to be deployed)
