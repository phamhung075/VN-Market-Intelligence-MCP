# Task Context — 1297c: Deploy BCTC Discovery Fix to VPS

## TLDR

change: copy validated script to Vinahost VPS, restart vn-bctc-fetch.service
branch: main (ops task, no code change)
depends: 1297b ✓ (script validated at commit ef9d9a78)
knowledge_needed: [restart-policy.md]

---

## Sprint Context

**Sprint:** 1297 (BCTC Discovery Fix)
**Status:** Todo
**Type:** VPS Deployment (Ops)
**Depends on:** 1297b ✓ (script committed + validated)
**Blocked by:** None

---

## Goal

Deploy validated `discover-bctc-urls-browser.py` to Vinahost VPS so HNX/UPCOM BCTC filings are discovered correctly. Service must be running and producing output post-deploy.

---

## Pre-flight Checks

| Check | Command | Expected |
|-------|---------|----------|
| Script at correct commit | `git show ef9d9a78 --name-only` | `vps-scripts/discover-bctc-urls-browser.py` listed |
| Script executable | `ls -la vps-scripts/discover-bctc-urls-browser.py` | `-rwxr-xr-x` |
| VPS reachable | `ssh root@$VINAHOST_IP "echo ok"` | `ok` |

---

## Deployment Steps

1. **Verify script ready (local)**
   ```bash
   ls -la /path/to/vps-scripts/discover-bctc-urls-browser.py
   # expect: -rwxr-xr-x, commit ef9d9a78
   ```

2. **Copy script to VPS**
   ```bash
   scp vps-scripts/discover-bctc-urls-browser.py root@$VINAHOST_IP:/root/vps-scripts/
   ```

3. **Verify copy on VPS**
   ```bash
   ssh root@$VINAHOST_IP "ls -la /root/vps-scripts/discover-bctc-urls-browser.py"
   # expect: file present, correct size matches local
   ```

4. **Restart BCTC service**
   ```bash
   ssh root@$VINAHOST_IP "systemctl restart vn-bctc-fetch.service"
   ```

5. **Verify service running**
   ```bash
   ssh root@$VINAHOST_IP "systemctl status vn-bctc-fetch.service"
   # expect: Active: active (running)
   ```

6. **Smoke test — check discovery output**
   ```bash
   ssh root@$VINAHOST_IP "tail -50 /root/vps-scripts/logs/bctc-fetch.log"
   # expect: HNX/UPCOM filing URLs appearing in output
   ```

7. **Full health check**
   ```bash
   ssh root@$VINAHOST_IP "/root/vps-status.sh"
   # expect: vn-bctc-fetch.service green
   ```

---

## Requirements

| Item | Value |
|------|-------|
| VPS host | `$VINAHOST_IP` (Vinahost Vietnam) |
| Auth | SSH key (root) |
| Service name | `vn-bctc-fetch.service` |
| Script source | `vps-scripts/discover-bctc-urls-browser.py` @ ef9d9a78 |
| Script dest | `/root/vps-scripts/discover-bctc-urls-browser.py` |
| Log location | `/root/vps-scripts/logs/bctc-fetch.log` |

---

## Rollback

If service fails after deploy:

```bash
# restore previous script from git
git show HEAD~1:vps-scripts/discover-bctc-urls-browser.py > /tmp/discover-bctc-urls-browser.py.bak
scp /tmp/discover-bctc-urls-browser.py.bak root@$VINAHOST_IP:/root/vps-scripts/discover-bctc-urls-browser.py
ssh root@$VINAHOST_IP "systemctl restart vn-bctc-fetch.service"
```

---

## Acceptance Criteria

- [ ] `vn-bctc-fetch.service` status: `active (running)`
- [ ] Log file shows HNX/UPCOM filing URLs being discovered
- [ ] No Python errors in `/root/vps-scripts/logs/bctc-fetch.log`
- [ ] `vps-status.sh` reports service green

---

## Notes

- **Restart method**: `systemctl restart` on VPS (launchctl rules apply to Mac only)
- **Script validated**: commit ef9d9a78 (`feat(1297b): validate BCTC discovery script + cleanup duplicate`)
- **Geo-block**: VPS is Vietnam-hosted — SSC portal access expected to work without proxy
- **Service interval**: 6h refresh cycle (runs every 6 hours per systemd timer)
