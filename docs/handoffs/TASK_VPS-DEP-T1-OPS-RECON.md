# TASK_VPS-DEP-T1-OPS-RECON — Vinahost placeholder & service recon (pre-gate)

**Owner:** ops  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Priority:** HIGH  
**Status:** READY  
**Estimated:** 0.5h  
**Gates:** T2/T3/T4 depend on T1 PASS

---

## Summary

Ops verifies that Vinahost (125.212.251.27) is the sole active VPS host and contains no placeholder leaks before dev-vps-crawls migrates guards into deploy-vinahost.sh. This is a pre-gate for the entire consolidation.

---

## Acceptance Criteria

### AC-1: OPS-RECON-1 — No placeholder leaks on live host
SSH to Vinahost and run:
```bash
grep -r '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null
```
**Expected result:** zero matches (empty output).  
**If matches found:** Document the leaked files and report to PO before proceeding. Do NOT proceed to AC-2.

### AC-2: OPS-RECON-2 — All 5 core services active on Vinahost
Run on Vinahost:
```bash
systemctl is-active vn-news-fetch vn-price-fetch vn-bctc-fetch vn-sbv-fetch vn-foreign-flow
```
**Expected result:** all 5 return `active`.  
**AC-PASS condition:** ALL 5 services report active. If any report `inactive` on Vinahost but are running elsewhere, STOP and report to PO.

### AC-3: OPS-RECON-3 — Socat bridge running (fragile, known issue)
Run:
```bash
pgrep -fl socat
```
**Expected result:** socat process found.  
**AC-PASS condition:** socat output shows one or more processes. If none found, restart socat per VPS-SOCAT-PERSIST memory and re-verify.

---

## Implementation

1. SSH to Vinahost: `ssh root@125.212.251.27` (use credentials from .env VINAHOST_PASSWORD)
2. Run AC-1 check → document any leaks found
3. Run AC-2 check → confirm all 5 services active
4. Run AC-3 check → confirm socat alive
5. Report findings to WORK channel (Telegram)

---

## Test Plan

- **DV-1:** Manual SSH recon, no fixtures needed
- **DV-2:** Log all three command outputs
- **DV-3:** If any AC fails → escalate to PO before unblocking T2/T3/T4

---

## Risk flags

| Risk | Mitigation |
|---|---|
| Vultr ghost services still running | Confirm EXPLICITLY that all 5 services report active on Vinahost, not Vultr |
| Socat crash mid-recon | Re-arm socat and re-test AC-3 |
| Leaked placeholders | Do NOT proceed; report to PO for investigation |

---

## Gate rule

**HARD GATE:** T2/T3/T4 do NOT start until ops reports AC-1/2/3 all PASS in WORK channel.

---

## Related docs

- Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md` § Ops recon required
- Memory: VPS-SOCAT-PERSIST (socat fragility + permanent fix tracked)
- Memory: VPS Infrastructure Setup (VPS access + troubleshooting)
