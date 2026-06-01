# TASK — PLACEHOLDER-GUARD-3: Bring article-body-fetcher.py Under Canonical Deployer

**Task ID:** PLACEHOLDER-GUARD-3  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Owner:** dev-vps-crawls  
**Estimated:** ≤1h  
**Status:** READY  
**Dependencies:** Optionally follows PLACEHOLDER-GUARD-2 + PLACEHOLDER-GUARD-1 (all three can land in same commit to `scripts/deploy-vps-proxy.sh`).

---

## Scope

Add a new deploy block to `scripts/deploy-vps-proxy.sh` that brings `vps-scripts/article-body-fetcher.py` and its dependency (`beautifulsoup4`) under the canonical deployer. This closes the bypass that allowed the cafef sprint to scp raw scripts without the render/guard pipeline.

---

## Acceptance Criteria

**AC-1:** The file `scripts/deploy-vps-proxy.sh` contains a new deploy block for `article-body-fetcher.py` (standalone "VN Article Body Fetcher" section after the existing 5 fetcher blocks, before the final SSH verify).

**AC-2:** The deploy block includes:
- A `$SCP` command copying `vps-scripts/article-body-fetcher.py` to `/root/article-body-fetcher.py`
- An SSH heredoc that: (a) `chmod +x /root/article-body-fetcher.py`; (b) runs an idempotent `pip3 install beautifulsoup4` check (if not present, install; else log version).

**AC-3:** After deployment, `/root/article-body-fetcher.py` exists on the VPS with +x permissions (verified via SSH `ls -la`).

**AC-4:** Post-deployment, `pip3 show beautifulsoup4` returns a version string (installed successfully).

**AC-5:** The post-deploy SSH verify (from PLACEHOLDER-GUARD-1) includes `/root/article-body-fetcher.py` in the glob check. The file has zero `__[A-Za-z][A-Za-z0-9_]*__` tokens by design, so it trivially passes the assert.

---

## Implementation Guide

Add this block to `scripts/deploy-vps-proxy.sh` (placement: after the existing 5 fetch-*/enrich blocks, before the final SSH verify from PLACEHOLDER-GUARD-1):

```bash
# ── VN Article Body Fetcher deploy ────────────────────────────────────────
echo ""
echo "Deploying VN article body fetcher..."
$SCP vps-scripts/article-body-fetcher.py ${VULTR_USER}@${VULTR_IP}:/root/article-body-fetcher.py

$SSH << 'ARTEOF'
set -e
chmod +x /root/article-body-fetcher.py
# Install beautifulsoup4 if not present (idempotent)
if ! pip3 show beautifulsoup4 > /dev/null 2>&1; then
  echo "Installing beautifulsoup4..."
  pip3 install beautifulsoup4
else
  echo "beautifulsoup4 already installed: $(pip3 show beautifulsoup4 | grep Version)"
fi
ARTEOF
```

---

## Notes

### No sed render step required

`vps-scripts/article-body-fetcher.py` is a Python script with **zero placeholder tokens** (`__MCP_BASE__`, `__API_KEY__`, etc.). The script takes `--url` as a CLI argument and does not contact the MCP server directly. Therefore:
- No `mktemp` for a temp file
- No `sed` substitution
- No pre-scp assert (the file trivially passes — no placeholders to leak)
- Direct `$SCP` command

### Idempotent pip3 install

The `pip3 show beautifulsoup4 > /dev/null 2>&1` guard ensures that repeat deploys do not fail or produce unexpected output. If beautifulsoup4 is already installed (from VPS-BS4-INSTALL one-off or a prior GUARD-3 deploy), the guard skips the install and logs the version.

### No service restart required

`article-body-fetcher.py` is invoked per-request by the VPS Flask proxy (`/proxy/article-body`), not by a cron loop. No systemd service restart needed after deploy.

### Future Python files

The post-deploy SSH verify glob `/root/*.py` covers `article-body-fetcher.py` and any other Python scripts added in the future (e.g., new scrapers). If future sprints add Python files, they inherit the same guard behavior automatically.

---

## Handoff References

- **BA spec:** `docs/handoffs/TASK_VPS-PLACEHOLDER-GUARD.md` (§GUARD-3, lines 129–167)
- **Architect brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md` (§4, article-body-fetcher deploy + beautifulsoup dep disposition)
- **Source file:** `vps-scripts/article-body-fetcher.py` (no placeholders; imports `requests` + `from bs4 import BeautifulSoup` at L49, conditional)
- **Reference deployer logic:** `scripts/deploy-vps-proxy.sh` (existing fetch-prices/news/sbv/FF/BCTC blocks, L39–179)

---

## Dependencies

- **Blocks:** None (this task is independent).
- **Depends on (optional):** PLACEHOLDER-GUARD-2 + PLACEHOLDER-GUARD-1 (all three can land in the same commit to the deployer).

---

## DDD Layer

Infrastructure (deployment script). No domain layer, no application layer, no interface layer.

---

## Ship Criteria

1. New deploy block added to `scripts/deploy-vps-proxy.sh` with correct indentation and syntax.
2. Block includes scp + SSH heredoc with chmod + idempotent pip3 install.
3. All 5 acceptance criteria met.
4. One commit (may be combined with PLACEHOLDER-GUARD-1 edits to the same file) on `main`.
5. No Docker rebuild required.

---

## Sequencing

**Parallel with PLACEHOLDER-GUARD-1:** Both are edits to `scripts/deploy-vps-proxy.sh` and can land in the same commit. GUARD-1 adds the pre-scp asserts and post-deploy verify; GUARD-3 adds the article-body-fetcher block.

**After PLACEHOLDER-GUARD-2:** Recommended order (convert scripts first, then guard the deployer), but not a hard block.
