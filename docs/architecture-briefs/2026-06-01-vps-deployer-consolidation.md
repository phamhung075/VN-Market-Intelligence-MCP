# VPS Deployer Consolidation — Architecture Brief

**Date:** 2026-06-01
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD
**Author:** architect
**Status:** DECISION ISSUED → next: pm

---

## Decision: OPTION A — Consolidate to single deployer (deploy-vinahost.sh canonical)

Retire `scripts/deploy-vps-proxy.sh`. Migrate the 6 GUARD-1/2/3 blocks and the
`article-body-fetcher.py` deploy block into `scripts/deploy-vinahost.sh`. Remove
`VULTR_IP` and `VULTR_PASSWORD` from `.env`.

---

## Rationale

### Why not Option B (mirror)?

Option B leaves `deploy-vps-proxy.sh` alive, targeting a **permanently decommissioned
host** (Vultr IP 139.180.185.18, decomm 2026-04-13). Mirroring guards into both scripts
creates:
- Ongoing maintenance duplication across two scripts.
- Future agents will continue to target the wrong deployer (the root cause of this sprint).
- GUARD-1 post-deploy SSH verify in deploy-vps-proxy.sh would connect to a dead server
  — the guard itself becomes a false-green.

### Why Option A is safe

1. **deploy-vinahost.sh already ships a superset.** It deploys 9 services; deploy-vps-proxy.sh
   deploys 5 (a strict subset). No service is present in deploy-vps-proxy.sh that is absent
   from deploy-vinahost.sh.

2. **`__TE_API_KEY__` sed rule already exists in deploy-vinahost.sh** at lines 232-234:
   ```bash
   sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
       -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
       -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g" \
   ```
   The "redundant sentinel at L15" concern raised in the brief prompt is already handled —
   `fetch-tradingeconomics.sh` line 15 checks `if [ "$TE_API_KEY" = "__TE_API_KEY__" ]; exit 0`
   which is a graceful-skip guard on the VPS side. This is correct and should be retained;
   it is NOT redundant — it provides defence-in-depth if the deploy-side sed ever misses.

3. **`article-body-fetcher.py` belongs on Vinahost.** The cafef article-body endpoint
   (`/proxy/article-body`) is consumed by the mcp-server which pulls from Vinahost. Deploying
   to Vultr means the capability is unreachable from the live push path.

4. **GUARD-1/2/3 implementation is sound** (96446b5d, QA 6/6 local). The code does not need
   rewriting — only its deploy target changes.

5. **Eliminates the entire class of wrong-deployer misplacement.** With one canonical deployer,
   future guard/script additions have exactly one file to land in.

---

## Raw topology verified (independent read)

| File | Target IP var | Guards present | Services shipped |
|---|---|---|---|
| `scripts/deploy-vinahost.sh` | `$VINAHOST_IP` (125.212.251.27) | NONE | 9 (prices, bctc, news, sbv, foreign-flow, ohlcv-backfill, bctc-enrich, tradingeconomics, vps-proxy) |
| `scripts/deploy-vps-proxy.sh` | `$VULTR_IP` (139.180.185.18) | GUARD-1/2/3 | 5 (prices, bctc, news, sbv, foreign-flow) + article-body-fetcher.py |

`.env` raw:
- `VULTR_IP=139.180.185.18` — stale, Vultr decommissioned 2026-04-13
- `VINAHOST_IP=125.212.251.27` — live host

`fetch-tradingeconomics.sh` L15: VPS-side graceful-skip if `TE_API_KEY` unset/sentinel — intentional
defence-in-depth. Retain as-is.

`enrich-bctc-urls.sh` — already rendered by deploy-vinahost.sh (section 7, L206-222). No guards
needed (it takes only `__MCP_BASE__` and `__API_KEY__`, both already covered).

---

## Ops recon required BEFORE any redeploy

The architect cannot SSH. Before dev-vps-crawls migrates guards or ops redeploys, confirm:

**OPS-RECON-1 (mandatory):** On Vinahost (125.212.251.27), run:
```bash
grep -r '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null
```
If any match → the live script was deployed from an un-guarded path and may contain a
placeholder leak. Document the finding before proceeding with guarded redeploy.

**OPS-RECON-2 (mandatory):** Confirm Vinahost is the source of the live feed pushes:
```bash
systemctl is-active vn-news-fetch vn-price-fetch vn-bctc-fetch vn-sbv-fetch vn-foreign-flow
```
All must be `active`. If any is `inactive` on Vinahost but active on another host — STOP,
report to PO before proceeding.

**OPS-RECON-3 (conditional):** Confirm socat bridge still running (known fragile):
```bash
pgrep -fl socat
```
If no socat → /api/* path dead → VPS fetch callbacks broken. Restart socat before redeploy.
(See memory: VPS-SOCAT-PERSIST for permanent fix.)

---

## Task list for PM decomposition

### T1 — OPS-RECON (ops one-off, pre-gate for T2/T3/T4)
- SSH Vinahost, run OPS-RECON-1/2/3 above.
- Report: list of any leaked scripts on live host + confirm all 5 services active.
- Gate: T2/T3/T4 do NOT start until OPS-RECON PASS.

### T2 — MIGRATE GUARD-1 into deploy-vinahost.sh (dev-vps-crawls)
Port the pre-scp placeholder-leak assert (GUARD-1) from deploy-vps-proxy.sh into each
of the 9 render blocks in deploy-vinahost.sh. Pattern per block:
```bash
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/<script>.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP — deploy aborted" >&2
  rm -f "$TMP"
  exit 1
fi
$SCP "$TMP" ...
rm "$TMP"
```
All 9 sed-rendered blocks need this. The tradingeconomics block already has a 3-token sed
(MCP_BASE + API_KEY + TE_API_KEY) — GUARD-1 assertion fires after all three are applied.

### T3 — MIGRATE GUARD-3 (article-body-fetcher.py) into deploy-vinahost.sh (dev-vps-crawls)
Add a new section 10 to deploy-vinahost.sh:
```bash
# ── 10. Article body fetcher (cafef GUARD-3) ─────────────────────────────
$SCP vps-scripts/article-body-fetcher.py ${VH_USER}@${VH_IP}:/root/article-body-fetcher.py
$SSH << 'ARTEOF'
set -e
chmod +x /root/article-body-fetcher.py
if ! pip3 show beautifulsoup4 > /dev/null 2>&1; then
  pip3 install beautifulsoup4
fi
ARTEOF
```
No placeholder tokens in article-body-fetcher.py (confirmed: it takes `--url` as CLI arg).
GUARD-1 assert is not needed for this block (no sed render), but add a post-scp ls check.

### T4 — MIGRATE GUARD-1 post-deploy SSH verify + RETIRE deploy-vps-proxy.sh (dev-vps-crawls)
Append the post-deploy global placeholder verify (the existing `VERIFYEOF` block from
deploy-vps-proxy.sh) at the END of deploy-vinahost.sh, scoped to Vinahost paths:
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
Then:
- Delete `scripts/deploy-vps-proxy.sh`.
- Remove `VULTR_IP` and `VULTR_PASSWORD` from `.env` (add a comment: "Vultr decommissioned 2026-04-13 — do not restore").

### T5 — QA gate (qa)
DV test plan (re-use the existing GUARD-QA spec from docs/handoffs/TASK_PLACEHOLDER-GUARD.md):
- DV-1: GUARD-1 pre-scp assert blocks deploy when a fixture script contains `__GUARD_TEST_TOKEN__`.
- DV-2: Clean script passes assert and is uploaded.
- DV-3: Post-deploy SSH verify detects a leak injected on the remote side (simulate via echo).
- DV-4: tradingeconomics block renders `__TE_API_KEY__` → empty string when `TRADING_ECONOMICS_API_KEY` unset; GUARD-1 passes (empty string ≠ sentinel).
- DV-5: `scripts/deploy-vps-proxy.sh` no longer exists in repo.
- DV-6: `.env` no longer contains `VULTR_IP`.

---

## Risk flags

| Risk | Severity | Mitigation |
|---|---|---|
| OPS-RECON skipped → guarded redeploy overwrites a live script mid-cycle | HIGH | T2/T3/T4 gate on T1 PASS |
| socat bridge dies between OPS-RECON and redeploy | MEDIUM | OPS-RECON-3 + restart socat first |
| deploy-vinahost.sh grows beyond manageable size (currently ~300L, +~80L for guards) | LOW | ~380L is acceptable for an infra script; no cap applies here |
| T4 `.env` edit removes VULTR_PASSWORD → ops cannot SSH to Vultr for any emergency | LOW | Vultr is decommissioned; if needed, retrieve from git history |

---

## Build standard classification

> BUG-FIX / REFACTOR — in-zone, no new primitives
> BUILD-STANDARD: not-applicable (skip)

Zone: `scripts/` (VPS deploy scripts, not an apps/ microservice zone)
