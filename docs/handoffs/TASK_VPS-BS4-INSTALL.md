# TASK — VPS-BS4-INSTALL: Immediate beautifulsoup4 Install (Ops One-Off)

**Task ID:** VPS-BS4-INSTALL  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Owner:** ops  
**Estimated:** ≤5m  
**Status:** READY  
**Priority:** LOW (bundled with GUARD-3; can ship independently NOW)

---

## Scope

Run an immediate SSH command on the Vinahost VPS to install the `beautifulsoup4` Python package. This restores the 8000-character article extraction path (`/proxy/article-body`) to active use while the code changes (GUARD-2, GUARD-1, GUARD-3) are being implemented.

---

## Acceptance Criteria

**AC-1:** After the command completes, `pip3 show beautifulsoup4` returns a version string (e.g., `Version: 4.12.2`).

**AC-2:** No service restart required (article-body-fetcher.py is invoked per-request by the VPS Flask proxy, not by a cron loop).

**AC-3:** One SSH command, no code change, no Docker rebuild.

---

## Implementation

Run this SSH command on the VPS:

```bash
ssh ${VULTR_USER}@${VULTR_IP} 'pip3 install beautifulsoup4'
```

Or equivalently:

```bash
pip3 install beautifulsoup4
```

(run directly on the VPS via SSH or the existing connection)

**Verification:**

```bash
ssh ${VULTR_USER}@${VULTR_IP} 'pip3 show beautifulsoup4 | grep Version'
```

Expected output: `Version: <version-number>` (e.g., `Version: 4.12.2`)

---

## Notes

### Durable ownership

This one-off install is the **immediate fix** to restore extraction quality. The **durable ownership** of the dependency is GUARD-3, which adds `pip3 install beautifulsoup4` to the canonical deployer's SSH heredoc. Future redeploys via `deploy-vps-proxy.sh` will idempotently re-install if needed.

### No service restart

`article-body-fetcher.py` does not run as a daemon or cron job. It is invoked per-request by the VPS Flask proxy (`/proxy/article-body`). No systemd service restart needed.

### Sequencing

- **Ships first, independent of code changes.** Can run NOW while PLACEHOLDER-GUARD-2/1/3 are being implemented.
- **GUARD-3 adds durable ownership.** The deployer will idempotently reinstall beautifulsoup4 on future redeploys.

---

## Handoff References

- **BA spec:** `docs/handoffs/TASK_VPS-PLACEHOLDER-GUARD.md` (§VPS-BS4-INSTALL, lines 161–162)
- **Architect brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md` (§4.2, beautifulsoup4 disposition)
- **Durable GUARD-3 task:** `docs/handoffs/TASK_PLACEHOLDER-GUARD-3.md`

---

## Dependencies

- **Blocks:** None (independent).
- **Depends on:** None (can run immediately).

---

## Ship Criteria

1. SSH command executed successfully.
2. `pip3 show beautifulsoup4` returns a version.
3. Confirmation logged (one-liner SSH result).
4. No code changes; no commits required.
