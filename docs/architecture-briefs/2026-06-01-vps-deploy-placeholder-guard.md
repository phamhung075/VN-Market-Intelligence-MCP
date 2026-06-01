# Architecture Brief — VPS-DEPLOY-PLACEHOLDER-GUARD

**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD
**Author:** architect
**Date:** 2026-06-01T11:20Z
**Status:** DESIGN COMPLETE → next: ba

---

## 1. Brownfield Index

### 1.1 Zone assignments

| Zone | Scope |
|---|---|
| `dev-vps-crawls` | `vps-scripts/` — owns all 6 hardcode-form scripts + `article-body-fetcher.py` |
| cross-service (`scripts/`) | `scripts/deploy-vps-proxy.sh` — the canonical deployer |
| `ops` | VPS-side pip install, SSH verify, systemd restarts |

### 1.2 What `scripts/deploy-vps-proxy.sh` deploys today (full inventory)

The script deploys exactly 5 rendered services (sed substitutes `__MCP_BASE__` + `__API_KEY__`):

| Block | Source rendered | Landing on VPS |
|---|---|---|
| fetch-prices | `vps-scripts/fetch-prices.sh` | `/root/fetch-prices.sh` |
| fetch-bctc | `vps-scripts/fetch-bctc.sh` | `/root/fetch-bctc.sh` |
| fetch-vn-news | `vps-scripts/fetch-vn-news.sh` | `/root/fetch-vn-news.sh` |
| fetch-sbv | `vps-scripts/fetch-sbv.sh` | `/root/fetch-sbv.sh` |
| fetch-foreign-flow | `vps-scripts/fetch-foreign-flow.sh` | `/root/fetch-foreign-flow.sh` |

**NOT deployed by the canonical script (critical gap):**
- `vps-scripts/fetch-tradingeconomics.sh` — no deploy block
- `vps-scripts/fetch-gso.sh` — no deploy block
- `vps-scripts/enrich-bctc-urls.sh` — no deploy block
- `vps-scripts/article-body-fetcher.py` — no deploy block (the cafef sprint bypass)

### 1.3 Placeholder form taxonomy (raw-verified)

**Hardcode-no-env-fallback form (DANGEROUS — 6 scripts):**
```
API_URL="__MCP_BASE__/api/push-news"        # fetch-vn-news.sh L7
API_URL="__MCP_BASE__/api/push-gso"         # fetch-gso.sh L8
API_URL="__MCP_BASE__/api/push-sbv-rates"   # fetch-sbv.sh L7
API_URL="__MCP_BASE__/api/push-tradingeconomics" # fetch-tradingeconomics.sh L7
API_URL="__MCP_BASE__/api/push-prices"      # fetch-prices.sh L15
FOREIGN_FLOW_URL="__MCP_BASE__/api/push-foreign-flow"  # fetch-prices.sh L16
WATCHLIST_URL="__MCP_BASE__/api/watchlist"  # fetch-prices.sh L17
API_ENRICH_URL="__MCP_BASE__/api/enrich-queue-item"  # enrich-bctc-urls.sh L8
QUEUE_URL="__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true" # enrich-bctc-urls.sh L9
```

**Safe env-fallback form (SAFE — reference model):**
```bash
FOREIGN_FLOW_API_URL="${FOREIGN_FLOW_API_URL:-__MCP_BASE__/api/push-foreign-flow}"
WATCHLIST_URL="${WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"
API_KEY="${API_KEY:-__API_KEY__}"
# fetch-foreign-flow.sh L32-34
```

**Special case — fetch-tradingeconomics.sh:**
Has an existing self-guard for `__TE_API_KEY__` at L13-17 (`exit 0` if still a literal placeholder). This guard is functional but covers only TE_API_KEY, not `__MCP_BASE__` or `__API_KEY__`. The MCP_BASE/API_KEY vars still hardcode without fallback. The guard pattern is a useful model for "fast exit when unconfigured" but does not replace the env-fallback conversion.

### 1.4 article-body-fetcher.py surface

`vps-scripts/article-body-fetcher.py` is a Python 3 script with:
- `import requests` (required, not stdlib)
- `from bs4 import BeautifulSoup` (conditional — graceful fallback to regex if absent)
- **No placeholder variables** — the script takes `--url` as a CLI arg; it does NOT contact the MCP server. Therefore it carries ZERO `__MCP_BASE__`/`__API_KEY__` tokens.
- It is deployed to `/root/article-body-fetcher.py` and invoked by the VPS Flask proxy (not by a cron loop directly).

**Key implication for GUARD-1:** The post-deploy SSH grep for `__[A-Z_]+__` on `/root/article-body-fetcher.py` will always return empty (no placeholders present in this file), which is correct. The guard does not need to skip this file — it genuinely passes. Still include it in the glob for completeness.

---

## 2. GUARD-1 — Leak Guard (b): Pre-scp assert + post-deploy SSH verify

### 2.1 Mechanism

**Pre-scp assert (in `scripts/deploy-vps-proxy.sh`):**

After each `sed` render step that produces a `TMP_*` file, immediately assert no placeholder survived:

```bash
# Immediately after each sed block:
if grep -q '__[A-Z_][A-Z0-9_]*__' "$TMP_FETCH"; then
  echo "ERROR: placeholder leak in rendered TMP_FETCH — deploy aborted" >&2
  rm -f "$TMP_FETCH"
  exit 1
fi
```

Placement: one assert per TMP file, immediately after the `sed ... > "$TMP_xxx"` line and before the `$SCP` line. This is the earliest possible detection point — before any artifact reaches the VPS.

**Coverage:** Every TMP file the deployer renders (TMP_FETCH, TMP_BCTC, TMP_NEWS, TMP_SBV, TMP_FF). After GUARD-3 adds `article-body-fetcher.py`, that file has no placeholders by design — the assert still runs for consistency but will trivially pass (see §1.4).

**Fail-loud semantics:** `exit 1` immediately after printing the error to stderr. The `set -e` at the top of the script propagates this. The deploy does not proceed to `scp`. No VPS state is mutated.

**Post-deploy SSH verify (in the SSH heredoc after all scp steps complete):**

```bash
$SSH << 'VERIFYEOF'
set -e
LEAKED=$(grep -rl '__[A-Z_][A-Z0-9_]*__' \
  /root/fetch-prices.sh /root/fetch-bctc.sh /root/fetch-vn-news.sh \
  /root/fetch-sbv.sh /root/fetch-foreign-flow.sh \
  /root/article-body-fetcher.py 2>/dev/null || true)
if [ -n "$LEAKED" ]; then
  echo "ERROR: deployed artifacts still contain placeholders: $LEAKED" >&2
  exit 1
fi
echo "GUARD-1 post-deploy verify: CLEAN (0 placeholder leaks)"
VERIFYEOF
```

This is a belt-and-suspenders check. The pre-scp assert should catch all cases — the post-deploy SSH verify serves as the QA-provable anti-false-green gate (see §2.2).

**Glob scope:** `/root/fetch-*.sh` plus `/root/article-body-fetcher.py` explicitly. The glob pattern covers all rendered scripts. If future GUARD-3 additions add more Python files, they are added to this list at the same time.

### 2.2 Deliberate-violation test (anti-false-green proof)

QA's test:

1. Create a fixture: `vps-scripts/fetch-vn-news.sh` with `__MCP_BASE__` left un-substituted (simulating the cafef-sprint bypass scenario). The easiest implementation: pass an empty/blank `MCP_BASE` value so `sed` substitutes with empty string... actually WRONG — the placeholder must survive. **Correct method:** inject a second placeholder token that sed does NOT know about, e.g. add a line `EXTRA="__UNRENDERED_TOKEN__"` to a copy of the script in a test fixture directory, and run the deploy pointing at that fixture.

   **Simpler, fully correct approach for QA:** Create `vps-scripts/fetch-vn-news.sh.test-fixture` with `API_URL="__MCP_BASE__/api/push-news"` intact (sed replaces `__MCP_BASE__` with `${MCP_BASE}` which is set to `https://zenmidi.com`). To force a leak, temporarily pass `MCP_BASE=""` — but that replaces with empty string, not a placeholder.

   **Definitive correct approach:** The test fixture uses a NEW placeholder name that `sed` does not substitute: add `GUARD_TEST="__GUARD_TEST_TOKEN__"` to a copy of the source script, and verify that the pre-scp assert fires on the rendered TMP file. Since `deploy-vps-proxy.sh` only substitutes `__MCP_BASE__` and `__API_KEY__`, `__GUARD_TEST_TOKEN__` survives the render → assert fires → exit 1 before scp.

   **QA can prove this without touching the VPS:** run the sed command from the deploy script against the modified fixture, then run the grep assert manually — must exit non-zero. No SSH required for this tier.

2. The post-deploy SSH verify is tested by running the grep command against a file on the VPS that still contains a placeholder (ops can manually create `/root/test-placeholder.sh` with `LEAK="__TEST__"`, run the grep, confirm non-zero exit, then delete it).

3. The full "clean path" test: a standard deploy with real creds — verify the post-deploy SSH verify emits "GUARD-1 post-deploy verify: CLEAN".

---

## 3. GUARD-2 — Env-Fallback Convert (c): All 6 scripts, one slice

### 3.1 Decision: ALL-6 in one slice

**Rationale:** The blast radius is symmetric across all 6 scripts — every one uses the identical dangerous form. Doing "news-push-critical-first" and deferring the remaining 5 creates a window where a future developer touches `fetch-gso.sh`, deploys it ad-hoc, and hits the same class of outage. The purpose of GUARD-2 is to make the class of failure impossible, not to reduce one instance. The conversion is mechanical (a known pattern exists in `fetch-foreign-flow.sh`), low-risk, and does not change any runtime behavior when the VPS env is correctly set up (which it always is post-render). All 6 convert in one dev-vps-crawls task.

### 3.2 Exact conversion per script

Mirror the `fetch-foreign-flow.sh` pattern (L32-34): `VAR_NAME="${ENV_VAR_NAME:-<default_fallback>}"`.

The fallback value when the env var is NOT set on the VPS should be the un-rendered placeholder form (e.g. `__MCP_BASE__/api/push-news`). This makes "env unset + render skipped" fail loudly (curl to `__MCP_BASE__` = http=000, which is detectable and logged) rather than silently routing to a wrong server. This is the same fail-loud degradation the safe form already exhibits.

**Script-by-script conversion table:**

| Script | Current hardcode | Converted form | Env var name (SSOT) | Note |
|---|---|---|---|---|
| `fetch-vn-news.sh` | `API_URL="__MCP_BASE__/api/push-news"` | `API_URL="${VN_NEWS_API_URL:-__MCP_BASE__/api/push-news}"` | `VN_NEWS_API_URL` | Primary outage root cause |
| `fetch-vn-news.sh` | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | Same pattern as foreign-flow |
| `fetch-gso.sh` | `API_URL="__MCP_BASE__/api/push-gso"` | `API_URL="${GSO_API_URL:-__MCP_BASE__/api/push-gso}"` | `GSO_API_URL` | Not news-push; same class |
| `fetch-gso.sh` | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-sbv.sh` | `API_URL="__MCP_BASE__/api/push-sbv-rates"` | `API_URL="${SBV_API_URL:-__MCP_BASE__/api/push-sbv-rates}"` | `SBV_API_URL` | FX rates; same class |
| `fetch-sbv.sh` | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-tradingeconomics.sh` | `API_URL="__MCP_BASE__/api/push-tradingeconomics"` | `API_URL="${TE_PUSH_URL:-__MCP_BASE__/api/push-tradingeconomics}"` | `TE_PUSH_URL` | Has existing TE_API_KEY guard (L13-17) — keep it, it covers a different placeholder |
| `fetch-tradingeconomics.sh` | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-tradingeconomics.sh` | `TE_API_KEY="__TE_API_KEY__"` | `TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-__TE_API_KEY__}"` | `TRADING_ECONOMICS_API_KEY` | Existing guard at L13-17 already handles this defensively; conversion makes it consistent |
| `fetch-prices.sh` | `API_URL="__MCP_BASE__/api/push-prices"` | `API_URL="${PRICES_API_URL:-__MCP_BASE__/api/push-prices}"` | `PRICES_API_URL` | |
| `fetch-prices.sh` | `FOREIGN_FLOW_URL="__MCP_BASE__/api/push-foreign-flow"` | `FOREIGN_FLOW_URL="${PRICES_FF_URL:-__MCP_BASE__/api/push-foreign-flow}"` | `PRICES_FF_URL` | fetch-prices.sh has a separate FF push path distinct from fetch-foreign-flow.sh |
| `fetch-prices.sh` | `WATCHLIST_URL="__MCP_BASE__/api/watchlist"` | `WATCHLIST_URL="${PRICES_WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"` | `PRICES_WATCHLIST_URL` | |
| `fetch-prices.sh` | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `enrich-bctc-urls.sh` | `API_ENRICH_URL="__MCP_BASE__/api/enrich-queue-item"` | `API_ENRICH_URL="${BCTC_ENRICH_URL:-__MCP_BASE__/api/enrich-queue-item}"` | `BCTC_ENRICH_URL` | BCTC enrichment; deployed separately from canonical deployer (see §4) |
| `enrich-bctc-urls.sh` | `QUEUE_URL="__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true"` | `QUEUE_URL="${BCTC_QUEUE_URL:-__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true}"` | `BCTC_QUEUE_URL` | |
| `enrich-bctc-urls.sh` | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |

### 3.3 VPS environment contract

The deploy render step (`sed`) substitutes `__MCP_BASE__` and `__API_KEY__` into the rendered TMP file. After GUARD-2 conversion, the script uses `${ENV_VAR:-__MCP_BASE__/path}` — so at runtime on the VPS the env var takes precedence over the default. **The render step does not change** — `sed` still substitutes the placeholder text in the source, producing e.g. `API_URL="${VN_NEWS_API_URL:-https://zenmidi.com/api/push-news}"`. If the env var is set in the systemd unit's `EnvironmentFile` (e.g. `/root/vn-market.env`), that takes precedence. If not set, the rendered literal `https://zenmidi.com/api/push-news` is used as the fallback.

**This is degradation-safe in two directions:**
1. Normal deploy (render step ran): env var unset → uses rendered literal `https://zenmidi.com/api/push-news` → correct, same as today.
2. Bypass deploy (raw template deployed): env var unset → uses `__MCP_BASE__/api/push-news` → curl http=000 → logged loudly → detectable, not silent. **This is the key improvement over the current hardcode form.**
3. Bypass deploy + env var IS set in the systemd unit: uses the env var value → correct, resilient.

**No new env vars need to be set on the VPS for normal operation.** The env var names are for override/resilience, not for current function. The rendered literal fallback covers the production case.

### 3.4 GUARD-2 and the deploy render contract

GUARD-2 does NOT change the deploy render contract. `sed` continues to substitute `__MCP_BASE__` and `__API_KEY__` in the source. The rendered output has the literal URL as the fallback in the shell expansion expression. GUARD-1's pre-scp assert will continue to fire correctly because after sed substitution, no `__[A-Z_]+__` token survives in the rendered file.

**One edge case:** `fetch-tradingeconomics.sh` has `TE_API_KEY="__TE_API_KEY__"`. The deploy script does NOT currently substitute `__TE_API_KEY__` (no `TRADING_ECONOMICS_API_KEY` in the `.env` template). After GUARD-2, `TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-__TE_API_KEY__}"` — if `deploy-vps-proxy.sh` does not have a sed rule for `__TE_API_KEY__`, the rendered file will contain the literal `__TE_API_KEY__` inside the shell expansion (as the fallback string, not as a bare assignment). The GUARD-1 regex `__[A-Z_][A-Z0-9_]*__` WILL match `__TE_API_KEY__` inside the fallback string and the pre-scp assert will fire. **This is a risk.**

**Resolution (RISK-TE):** The dev implementing GUARD-2 must handle `fetch-tradingeconomics.sh` one of two ways:
- **Option A (recommended):** Use a non-placeholder string as the fallback: `TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-}"` (empty string fallback). The existing guard at L13-17 already exits cleanly when TE_API_KEY is empty or still `__TE_API_KEY__`. This avoids the GUARD-1 false-block entirely.
- **Option B:** Add a sed substitution for `__TE_API_KEY__` in `deploy-vps-proxy.sh` using `TRADING_ECONOMICS_API_KEY` from `.env`. Then the GUARD-1 assert works correctly. This requires `TRADING_ECONOMICS_API_KEY` to exist in `.env` (currently unconfirmed). Risky if the key is absent.

**Architect decision: use Option A for `TE_API_KEY` only.** The empty-string fallback is safe because the existing guard at L13-17 explicitly handles that case. The `API_URL` and `API_KEY` for tradingeconomics still use `__MCP_BASE__/api/push-tradingeconomics` and `__API_KEY__` as their fallback strings (which are substituted by sed at deploy time → no GUARD-1 conflict).

---

## 4. GUARD-3 — Deploy Coverage (a): Bring article-body-fetcher.py under deployer

### 4.1 What to add to `scripts/deploy-vps-proxy.sh`

Add a new deploy block after the existing 5 blocks (or bundled with the VN-news block as it is the cafef-specific companion). Recommended: a standalone "VN article body fetcher" section.

The deploy of `article-body-fetcher.py` does NOT require a `sed` render step (the file has no placeholders — see §1.4). It is a direct `scp`:

```bash
# ── VN Article Body Fetcher deploy ───────────────────────────────────────
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

Since `article-body-fetcher.py` has no placeholders, GUARD-1's pre-scp assert runs but trivially passes — no special-casing needed. GUARD-1's post-deploy SSH grep covers it via the explicit path in the glob.

### 4.2 beautifulsoup4 dependency disposition

Two-track:
1. **Immediate one-off (VPS-BS4-INSTALL, ops now):** `pip3 install beautifulsoup4` via SSH, no restart required (per-request invocation). Restores the 8000-char bs4 path immediately.
2. **Durable ownership (GUARD-3):** the deployer runs `pip3 install beautifulsoup4` idempotently in the deploy block (as shown above). Future redeploys are self-healing. This means ops runs VPS-BS4-INSTALL as an immediate fix and GUARD-3 locks in the durable ownership simultaneously — they are not mutually exclusive.

**Why pip install in the deployer rather than a provisioning doc?** The VPS is single-purpose (VN market crawlers). The dep is tied to a specific deployed artifact (`article-body-fetcher.py`). Keeping it in the deploy script creates co-location of artifact + dep, which prevents the same "bs4 not installed" failure class. A separate provisioning doc would drift.

### 4.3 Scripts NOT brought under the deployer (GUARD-3 scope boundary)

The following vps-scripts exist but are NOT currently deployed by `deploy-vps-proxy.sh` and are NOT in the blast radius of this sprint:

- `fetch-tradingeconomics.sh` — deployed via a separate mechanism (or manual). It is in GUARD-2 (env-fallback conversion), but bringing it under `deploy-vps-proxy.sh` is OUT OF SCOPE for this sprint. A future sprint can add the deploy block. Note: `TRADING_ECONOMICS_API_KEY` may not exist in the project `.env` — adding a deploy block without that key would break the render step. Flag as a RISK (RISK-TE-DEPLOY).
- `fetch-gso.sh` — GSO browser automation is DISABLED (fetch-gso.sh L23: "GSO browser fetch disabled"). The script pushes empty payloads. Bringing it under the deployer serves no practical purpose this sprint. Flag as deferred.
- `enrich-bctc-urls.sh` — BCTC enrichment. Deployed separately (has its own `vn-bctc-enrich.service` + `vn-bctc-enrich.timer`). Bringing it under `deploy-vps-proxy.sh` requires adding its systemd unit deploy. Deferred to a dedicated BCTC-infrastructure sprint.

**The GUARD-3 scope is: `article-body-fetcher.py` + `beautifulsoup4` only.** That is the exact gap the cafef sprint bypassed.

---

## 5. Ownership / Zone Split + Sequencing

### 5.1 Task-to-agent mapping

| Task | Owner | Zone | Rationale |
|---|---|---|---|
| **PLACEHOLDER-GUARD-2** (env-fallback convert 6 scripts) | `dev-vps-crawls` | `vps-scripts/` | Script content changes; matches zone ownership of vps-scripts/ |
| **PLACEHOLDER-GUARD-1** (leak guard in deploy-vps-proxy.sh) | `dev-vps-crawls` | `scripts/` (cross-service) | The deployer is not an mcp-server artifact; dev-vps-crawls owns the full VPS deploy surface. If a separate deploy-owning zone is desired, route to `dev-mcp-server` only for the `scripts/` file. **Architect recommendation: dev-vps-crawls owns both GUARD-1 and GUARD-2** — they are tightly coupled (the guard validates what the converted scripts look like after render). PM should not split them across two agents. |
| **PLACEHOLDER-GUARD-3** (article-body-fetcher.py under deployer + pip) | `dev-vps-crawls` | `scripts/` + `vps-scripts/` | Same zone owner as above; the deployer block is a `scripts/` change but its subject is the `vps-scripts/` artifact. |
| **VPS-BS4-INSTALL** (immediate pip install) | `ops` | VPS SSH lane | Immediate one-off, no code change, gateway-independent. Runs NOW before GUARD-3 is shipped. |
| **Post-deploy SSH verify** (GUARD-1 second layer) | `ops` | VPS SSH lane | After each deploy, ops runs the `grep -rl '__...__'` probe on the VPS and confirms CLEAN. |

### 5.2 Ship order

```
VPS-BS4-INSTALL (ops, NOW, immediate, no redeploy)
  ↓
PLACEHOLDER-GUARD-2 (dev-vps-crawls — convert 6 scripts)
  ↓ [parallel possible]
PLACEHOLDER-GUARD-1 + GUARD-3 (dev-vps-crawls — deploy-vps-proxy.sh changes)
  ↓
Full redeploy via updated scripts/deploy-vps-proxy.sh (ops SSH lane, no Docker)
  ↓
QA: deliberate-violation test + post-deploy SSH verify + live 14-feed cycle confirm
```

**VPS-BS4-INSTALL first** — it is already LOW priority but unblocks the 8000-char extraction quality NOW, independent of the code changes. No restart required.

**GUARD-2 before GUARD-1+3** — the guard is most valuable once the converted scripts are in place (it validates that the safe form also survives render correctly). However GUARD-1 and GUARD-3 can land in the same commit with GUARD-2 since they are all in `scripts/deploy-vps-proxy.sh` + `vps-scripts/`.

**Redeploy required to verify:** GUARD-1's post-deploy SSH verify can only be proven by a live deploy run. GUARD-2's safety (env-unset → `__MCP_BASE__` not reaching curl) can be proven by local inspection of the rendered TMP file (no VPS required). QA should prove both.

### 5.3 Rebuild impact

GUARD-1, GUARD-2, GUARD-3 are all shell script + Python changes in `vps-scripts/` and `scripts/`. They do NOT touch any microservice in `apps/`. **No Docker rebuild required.** The ops redeploy is a `scripts/deploy-vps-proxy.sh` run (scp + SSH + systemctl restart for the affected services). The services that need a restart after redeploy are those whose rendered scripts changed:
- `vn-news-fetch.service` (fetch-vn-news.sh converted)
- `vn-sbv-fetch.service` (fetch-sbv.sh converted)
- `vn-price-fetch.service` (fetch-prices.sh converted)

`fetch-gso.sh`, `fetch-tradingeconomics.sh`, `enrich-bctc-urls.sh` are NOT deployed by the canonical deployer and do not have systemd restarts triggered by this sprint.

---

## 6. DDD / Risk Review

### 6.1 Risk flags

**RISK-GUARD1-REGEX:** The grep pattern `__[A-Z_][A-Z0-9_]*__` must match the exact placeholder form used in scripts. Confirmed correct for `__MCP_BASE__`, `__API_KEY__`, `__TE_API_KEY__`. If a future script uses a lowercase or mixed-case placeholder (e.g. `__mcp_base__`), the pattern misses it. Recommendation: use `__[A-Za-z][A-Za-z0-9_]*__` (case-insensitive variant) in the guard.

**RISK-TE-DEPLOY (flagged, not blocking):** `fetch-tradingeconomics.sh` is NOT brought under `deploy-vps-proxy.sh` in this sprint. It remains manually/separately deployed. Any developer who deploys it ad-hoc after GUARD-2 conversion without a sed render step will get a functioning script (env-fallback protects `API_URL` and `API_KEY`) BUT `TE_API_KEY` will use the empty-string fallback (Option A) → existing guard exits cleanly. No silent outage. Low residual risk.

**RISK-TE-FALLBACK:** `fetch-tradingeconomics.sh` uses `TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-}"` (empty fallback, Option A). If `TRADING_ECONOMICS_API_KEY` is NOT set in the VPS environment and NOT substituted by sed, the script exits at L13-17 with a SKIP log line. This is correct and intentional behavior — same as current behavior. No regression.

**RISK-PARTIAL-GUARD2:** 3 of the 6 scripts (`fetch-gso.sh`, `fetch-tradingeconomics.sh`, `enrich-bctc-urls.sh`) are not deployed by `deploy-vps-proxy.sh`. GUARD-2 converts their source form, but GUARD-1 (pre-scp assert) only runs when those scripts are deployed via the canonical deployer. If someone deploys them ad-hoc, GUARD-1 does not protect them. **Mitigation:** the env-fallback form (GUARD-2) is the primary defense for these 3 — even without GUARD-1, a bypass deploy degrades to `__MCP_BASE__` default in the shell expression which is detectable (curl http=000) not silent. GUARD-1 is a second layer, not the only layer for these 3.

**RISK-POSTDEPLOY-SCOPE:** The post-deploy SSH verify uses an explicit file list. If new scripts are added in the future without updating both the deploy block and the verify list, coverage silently erodes. Recommendation: use `/root/fetch-*.sh /root/*.py` glob in the post-deploy verify rather than explicit filenames. The glob is broader but safer. The dev implementing GUARD-1 should use the glob form.

**RISK-GUARD3-PYTHON-NO-RENDER:** `article-body-fetcher.py` has no placeholders. The pre-scp assert passes trivially. But if a future sprint adds a placeholder to this file (e.g. a hardcoded MCP URL), there is no corresponding sed render step in the deployer, and the assert will catch it and block the deploy loudly. This is the CORRECT behavior — the developer will need to add a sed rule. No action needed; mentioning it so the dev knows the guard is working as intended if this happens.

**DDD classification:** This sprint touches the `scripts/` (infra/deployment scripts) and `vps-scripts/` (infra/VPS-side fetchers). No domain layer, no application layer, no interface layer is modified. The DDD rules in `docs/policies/dev-standards.md` apply to `apps/` microservices and are not violated here. BUILD-STANDARD: **not-applicable** (no microservice created or modified).

---

## 7. [Architect] Brownfield Findings

**Zone:** `vps-scripts/` (dev-vps-crawls) + `scripts/deploy-vps-proxy.sh` (cross-service, dev-vps-crawls recommended)

**Verified paths:**
- `scripts/deploy-vps-proxy.sh` L39-45 — prices render+deploy (TMP_FETCH)
- `scripts/deploy-vps-proxy.sh` L82-101 — BCTC render+deploy (TMP_BCTC)
- `scripts/deploy-vps-proxy.sh` L107-127 — news render+deploy (TMP_NEWS)
- `scripts/deploy-vps-proxy.sh` L133-153 — SBV render+deploy (TMP_SBV)
- `scripts/deploy-vps-proxy.sh` L159-179 — foreign-flow render+deploy (TMP_FF)
- `vps-scripts/fetch-vn-news.sh` L7-8 — root-cause hardcode (no fallback)
- `vps-scripts/fetch-foreign-flow.sh` L32-34 — safe reference model
- `vps-scripts/article-body-fetcher.py` L48-54 — bs4 conditional import (graceful fallback)
- `vps-scripts/fetch-tradingeconomics.sh` L13-17 — existing `__TE_API_KEY__` self-guard (keep)

**Reuse patterns:**
- Mirror `fetch-foreign-flow.sh` L32-34 env-fallback form exactly — the pattern is proven, readable, and already in the codebase
- Mirror the `set -e` + `rm -f "$TMP_xxx"; exit 1` fail pattern from the existing error handling at the top of `deploy-vps-proxy.sh`

**Design decisions:**
- GUARD-1: pre-scp grep assert immediately after each sed block, plus post-deploy SSH verify via glob
- GUARD-2: ALL-6 scripts in one slice; TE_API_KEY uses empty-string fallback (not `__TE_API_KEY__`) to avoid GUARD-1 conflict
- GUARD-3: article-body-fetcher.py scp block (no sed), idempotent pip3 install beautifulsoup4 in SSH heredoc
- Zone: dev-vps-crawls owns all three guards + the deployer changes

**Scan clean:** true (no DDD violations; no microservice changes; no Docker rebuild required)

**BUILD-STANDARD: not-applicable** (BUG-FIX / maintenance class — existing scripts and existing deployer, no new services or primitives)

---

## 8. RETURN block

```
DONE: Technical design complete, brownfield findings written to docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md
ZONE: vps-scripts/ + scripts/ (both dev-vps-crawls)
NEXT: ba | spec the 3 guard tasks for PM task breakdown
HANDOFF: docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md
PIPELINE: continue
```
