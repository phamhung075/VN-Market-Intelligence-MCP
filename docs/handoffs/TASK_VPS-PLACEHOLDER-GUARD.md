# BA Spec — VPS-DEPLOY-PLACEHOLDER-GUARD

**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD
**BA author:** ba
**Date:** 2026-06-01
**Status:** SPEC COMPLETE → NEXT: pm (task decomposition)
**Architect brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md`

---

## Source verification (BA raw-read — not relayed from architect badges)

All 6 hardcode-no-fallback scripts confirmed by direct grep:

| Script | Lines confirmed dangerous |
|---|---|
| `vps-scripts/fetch-vn-news.sh` | L7 `API_URL="__MCP_BASE__/api/push-news"`, L8 `API_KEY="__API_KEY__"` |
| `vps-scripts/fetch-sbv.sh` | L7 `API_URL="__MCP_BASE__/api/push-sbv-rates"`, L8 `API_KEY="__API_KEY__"` |
| `vps-scripts/fetch-gso.sh` | L8 `API_URL="__MCP_BASE__/api/push-gso"`, L9 `API_KEY="__API_KEY__"` |
| `vps-scripts/fetch-tradingeconomics.sh` | L7 `API_URL`, L8 `API_KEY`, L9 `TE_API_KEY="__TE_API_KEY__"` |
| `vps-scripts/fetch-prices.sh` | L15–18 (API_URL + FOREIGN_FLOW_URL + WATCHLIST_URL + API_KEY) |
| `vps-scripts/enrich-bctc-urls.sh` | L8–10 (API_ENRICH_URL + QUEUE_URL + API_KEY) |

Safe reference model confirmed: `vps-scripts/fetch-foreign-flow.sh` L32–34 `${VAR:-__MCP_BASE__/path}` form.

`vps-scripts/article-body-fetcher.py` confirmed: zero `__MCP_BASE__`/`__API_KEY__` tokens. Imports: requests (stdlib-absent), bs4 (conditional at L49).

`scripts/deploy-vps-proxy.sh` confirmed: `set -e` at L17; TMP_FETCH mktemp+sed pattern at L38–41; scp at L45; rm at L48; TMP_NEWS pattern at L107–116. No existing pre-scp assert block anywhere in the file.

`vps-scripts/fetch-tradingeconomics.sh` L15–16: existing guard `[ -z "$TE_API_KEY" ] || [ "$TE_API_KEY" = "__TE_API_KEY__" ]` → SKIP exit. Confirmed functional. Covers only TE_API_KEY, not MCP_BASE/API_KEY.

---

## Requirements

### GUARD-1: Deploy-time placeholder-leak guard

**FR-G1-1 — Pre-scp assert in `scripts/deploy-vps-proxy.sh`**
DDD layer: **infrastructure** (deployment script)

After each `sed ... > "$TMP_xxx"` render step and before the `$SCP` line for that TMP file, insert a grep assert:
```bash
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP_xxx"; then
  echo "ERROR: placeholder leak in rendered $TMP_xxx — deploy aborted" >&2
  rm -f "$TMP_xxx"
  exit 1
fi
```
Note: regex MUST use `[A-Za-z][A-Za-z0-9_]*` (mixed-case, not all-caps) per architect RISK-GUARD1-REGEX — future scripts may use lowercase placeholder tokens.

Placement for the 5 existing TMP files: TMP_FETCH (after L41, before L45); TMP_BCTC (after render, before scp — dev verifies exact lines); TMP_NEWS (after L110, before L112); TMP_SBV (after render); TMP_FF (after render). One assert block per TMP file — NOT a single end-of-file check.

Fail semantics: `exit 1` + print to stderr + `rm -f "$TMP_xxx"`. The existing `set -e` at L17 propagates the exit. No VPS mutation occurs.

**FR-G1-2 — Post-deploy SSH verify in `scripts/deploy-vps-proxy.sh`**
DDD layer: **infrastructure**

After all scp steps complete, add an SSH heredoc that runs:
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
Note: glob `/root/fetch-*.sh /root/*.py` is preferred over explicit filenames per architect RISK-POSTDEPLOY-SCOPE — avoids silent coverage erosion when new scripts are added.

**FR-G1-3 — Deliberate-violation test (anti-false-green proof)**
DDD layer: **infrastructure** (test fixture)

The test must be locally executable without SSH. Method:
1. Create a test fixture: copy `vps-scripts/fetch-vn-news.sh` to a temp file; append line `GUARD_TEST="__GUARD_TEST_TOKEN__"`.
2. Run the same `sed -e "s|__MCP_BASE__|...|g" -e "s|__API_KEY__|...|g"` command against the fixture (sed does not know `__GUARD_TEST_TOKEN__`).
3. Run the grep assert against the rendered output — must exit non-zero.
4. Confirm: the assert fires BEFORE any scp step. No VPS required.

QA must prove this test exits non-zero. "grep exits 0 and no output" is NOT acceptance. The fixture file does NOT get committed to the repo.

**NFR-G1-1** — The assert must not fire on correctly-rendered scripts. A clean run (real creds, all placeholders substituted) must produce "GUARD-1 post-deploy verify: CLEAN" with exit 0.

**NFR-G1-2** — The pre-scp assert adds at most 3 lines per TMP block. No shell subprocess, no temp file, no network call. Overhead is negligible.

---

### GUARD-2: Env-fallback conversion for all 6 scripts

**FR-G2-1 — Convert 6 scripts to `${VAR:-default}` form**
DDD layer: **infrastructure** (VPS crawler scripts)
Owner: dev-vps-crawls
Zone: `vps-scripts/`

All 6 scripts convert in one slice. Mirror `fetch-foreign-flow.sh` L32–34 exactly. Conversion table (advisory — dev verifies line numbers via grep before editing):

| File | Current line | Converted form | Env var | Note |
|---|---|---|---|---|
| `fetch-vn-news.sh` L7 | `API_URL="__MCP_BASE__/api/push-news"` | `API_URL="${VN_NEWS_API_URL:-__MCP_BASE__/api/push-news}"` | `VN_NEWS_API_URL` | Root-cause outage script |
| `fetch-vn-news.sh` L8 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-gso.sh` L8 | `API_URL="__MCP_BASE__/api/push-gso"` | `API_URL="${GSO_API_URL:-__MCP_BASE__/api/push-gso}"` | `GSO_API_URL` | |
| `fetch-gso.sh` L9 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-sbv.sh` L7 | `API_URL="__MCP_BASE__/api/push-sbv-rates"` | `API_URL="${SBV_API_URL:-__MCP_BASE__/api/push-sbv-rates}"` | `SBV_API_URL` | |
| `fetch-sbv.sh` L8 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-tradingeconomics.sh` L7 | `API_URL="__MCP_BASE__/api/push-tradingeconomics"` | `API_URL="${TE_PUSH_URL:-__MCP_BASE__/api/push-tradingeconomics}"` | `TE_PUSH_URL` | |
| `fetch-tradingeconomics.sh` L8 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `fetch-tradingeconomics.sh` L9 | `TE_API_KEY="__TE_API_KEY__"` | `TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-}"` | `TRADING_ECONOMICS_API_KEY` | **EMPTY-STRING fallback (Option A) — NOT `__TE_API_KEY__`**; existing guard at L13-17 handles empty correctly; avoids GUARD-1 false-block |
| `fetch-prices.sh` L15 | `API_URL="__MCP_BASE__/api/push-prices"` | `API_URL="${PRICES_API_URL:-__MCP_BASE__/api/push-prices}"` | `PRICES_API_URL` | |
| `fetch-prices.sh` L16 | `FOREIGN_FLOW_URL="__MCP_BASE__/api/push-foreign-flow"` | `FOREIGN_FLOW_URL="${PRICES_FF_URL:-__MCP_BASE__/api/push-foreign-flow}"` | `PRICES_FF_URL` | Separate from fetch-foreign-flow.sh path |
| `fetch-prices.sh` L17 | `WATCHLIST_URL="__MCP_BASE__/api/watchlist"` | `WATCHLIST_URL="${PRICES_WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"` | `PRICES_WATCHLIST_URL` | |
| `fetch-prices.sh` L18 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |
| `enrich-bctc-urls.sh` L8 | `API_ENRICH_URL="__MCP_BASE__/api/enrich-queue-item"` | `API_ENRICH_URL="${BCTC_ENRICH_URL:-__MCP_BASE__/api/enrich-queue-item}"` | `BCTC_ENRICH_URL` | |
| `enrich-bctc-urls.sh` L9 | `QUEUE_URL="__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true"` | `QUEUE_URL="${BCTC_QUEUE_URL:-__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true}"` | `BCTC_QUEUE_URL` | |
| `enrich-bctc-urls.sh` L10 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` | |

**CRITICAL (TE_API_KEY only):** The fallback for `TE_API_KEY` MUST be empty string `""`, NOT `__TE_API_KEY__`. Using `__TE_API_KEY__` as fallback would cause GUARD-1 to fire on every `fetch-tradingeconomics.sh` deploy (the deployer has no sed rule for `__TE_API_KEY__`). The existing guard at L13–17 already handles the empty-string case correctly — it exits with a SKIP log line, which is safe and intentional.

**NFR-G2-1 — Runtime behavior unchanged** for the 5 deployer-managed scripts (fetch-vn-news, fetch-sbv, fetch-prices + 2 FF paths). After sed render, the shell expansion produces e.g. `API_URL="${VN_NEWS_API_URL:-https://zenmidi.com/api/push-news}"` — with `VN_NEWS_API_URL` unset on the VPS, the rendered literal `https://zenmidi.com/api/push-news` is used. This is identical behavior to today's hardcode form.

**NFR-G2-2 — Degradation mode improved** for bypass-deploy scenario. If a script is deployed raw without render: env var unset + fallback `__MCP_BASE__/api/push-news` → curl to literal `__MCP_BASE__` → http=000 → logged loudly. This is DETECTABLE, not silent. Improvement over current hardcode form which also produces http=000 but with no indication that the cause is an unrendered template.

**NFR-G2-3 — No new env vars need to be configured on the VPS** for normal production operation. All new `${VAR:-...}` env var names are override handles only. No `.env` additions required.

**NFR-G2-4 — GUARD-1 compatibility.** After GUARD-2 conversion, the pre-scp assert still fires correctly on all 5 deployer-managed scripts: sed substitutes `__MCP_BASE__` and `__API_KEY__` → the rendered file contains no `__...__` tokens (the env var names like `VN_NEWS_API_URL` do NOT match the pattern). The `TE_API_KEY` empty-string fallback ensures `fetch-tradingeconomics.sh` also passes the assert when it is eventually brought under the deployer.

---

### GUARD-3: Bring article-body-fetcher.py under the canonical deployer

**FR-G3-1 — Add deploy block to `scripts/deploy-vps-proxy.sh`**
DDD layer: **infrastructure** (deployment script)
Owner: dev-vps-crawls

Add a new section (after the existing 5 blocks, before the final SSH verify):
```
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

**FR-G3-2 — No sed render step needed for article-body-fetcher.py**
The file has zero placeholder tokens (BA raw-verified). Direct scp — no TMP file, no mktemp, no grep assert required for pre-scp. GUARD-1's post-deploy SSH glob `/root/*.py` covers it for belt-and-suspenders.

**FR-G3-3 — pip3 install beautifulsoup4 is idempotent**
The `pip3 show beautifulsoup4` guard ensures repeat deploys do not fail or cause unexpected output. No service restart required — article-body-fetcher.py is invoked per-request by the VPS Flask proxy.

**FR-G3-4 — VPS-BS4-INSTALL one-off (ops, immediate)**
Ops runs `pip3 install beautifulsoup4` via SSH NOW, independently of the code changes landing. This restores the 8000-char bs4 extraction path immediately. GUARD-3's deploy block is the durable ownership layer — both tracks run concurrently, neither blocks the other.

**NFR-G3-1 — Scope boundary.** The following scripts are NOT brought under deploy-vps-proxy.sh in this sprint:
- `fetch-tradingeconomics.sh`: `TRADING_ECONOMICS_API_KEY` may not exist in `.env` — adding a deploy block without that key would break the render step. Deferred (RISK-TE-DEPLOY, non-blocking).
- `fetch-gso.sh`: GSO browser automation is DISABLED (L23 "disabled" guard pushes empty payloads). No practical value this sprint. Deferred.
- `enrich-bctc-urls.sh`: Has its own `vn-bctc-enrich.service` + timer. Bringing under the deployer requires adding systemd unit deploy. Deferred to a BCTC-infrastructure sprint.

---

## Edge cases

**EC-1 — fetch-tradingeconomics.sh TE_API_KEY fallback collision with GUARD-1.** Covered by FR-G2-1 NOTE: dev MUST use empty-string fallback `${TRADING_ECONOMICS_API_KEY:-}`, not `${TRADING_ECONOMICS_API_KEY:-__TE_API_KEY__}`. If dev uses the wrong form, GUARD-1 will fire and block the deploy of tradingeconomics — which would be a correct-but-confusing failure. The test in FR-G1-3 validates GUARD-1 fires on unknown tokens; a secondary local test with the TE_API_KEY empty-string form should confirm it does NOT fire.

**EC-2 — Scripts NOT under the canonical deployer (enrich-bctc-urls, fetch-gso, fetch-tradingeconomics).** GUARD-2 converts their source form to env-fallback. GUARD-1's pre-scp assert only runs when those scripts are deployed through `deploy-vps-proxy.sh`. If they are deployed ad-hoc, GUARD-1 does not protect them. Mitigation is GUARD-2 itself — even without GUARD-1, a bypass deploy of the converted form degrades gracefully (env-unset → rendered literal or empty-string).

**EC-3 — `article-body-fetcher.py` pre-scp assert trivially passes.** The file has no placeholder tokens. This is the correct behavior. If a future developer adds a hardcoded MCP URL to this file, the assert will fire and block the deploy — which is the intended guard behavior. No action needed; worth documenting in code comment so the developer understands the guard is working as intended.

**EC-4 — Post-deploy SSH glob `/root/*.py` scope.** Currently only `article-body-fetcher.py` exists as a Python file under `/root/`. If future sprints add more Python files, the glob covers them automatically. This is the intended breadth.

**EC-5 — `set -e` in the deployer propagates assert exit.** `scripts/deploy-vps-proxy.sh` has `set -e` at L17 (confirmed). The `exit 1` in each pre-scp assert block will correctly abort the entire deploy. The deployer does not re-enter after a mid-script exit. This is the fail-loud semantics the sprint requires.

**EC-6 — Systemd service restarts after redeploy.** After a full redeploy via the updated `deploy-vps-proxy.sh`, the services that use converted scripts must be restarted to pick up the new rendered scripts: `vn-news-fetch.service`, `vn-sbv-fetch.service`, `vn-price-fetch.service`. The deployer's SSH heredoc should issue `systemctl restart` for these. Dev should verify the existing deployer already does this for these services; if not, add it.

---

## Blockers

None. Zero PO-only questions. All decisions are encoded in the architect brief (Option A for TE_API_KEY is the architect's explicit call; all-6 in one slice is the architect's explicit call; scope boundaries for non-deployer scripts are explicit). The VPS-BS4-INSTALL one-off is already routed to ops independently.

---

## DDD layer summary

| Task | Files touched | DDD layer |
|---|---|---|
| GUARD-1 | `scripts/deploy-vps-proxy.sh` | infrastructure (deployment) |
| GUARD-2 | `vps-scripts/fetch-*.sh` (6 files) | infrastructure (VPS crawlers) |
| GUARD-3 | `scripts/deploy-vps-proxy.sh` | infrastructure (deployment) |
| VPS-BS4-INSTALL | VPS SSH lane only (no repo change) | infrastructure (ops one-off) |

No domain layer, no application layer, no interface layer modified. No microservice (`apps/`) touched. BUILD-STANDARD: not-applicable (shell/Python script changes only — no Docker rebuild required for GUARD-1/2/3 themselves; the ops redeploy IS required to activate GUARD-1/2/3 on the VPS).

---

## Acceptance criteria (consolidated, BA-owned)

**GUARD-1 AC:**
1. A deploy run with a fixture containing `__GUARD_TEST_TOKEN__` (a token sed does not substitute) exits non-zero BEFORE any scp step — proven locally, no SSH required.
2. Post-deploy SSH: `grep -rl '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py` returns empty after a clean deploy with real creds.
3. A standard clean-creds deploy completes end-to-end and prints "GUARD-1 post-deploy verify: CLEAN".
4. "exit 0" from the deliberate-violation test is NOT acceptance (fence-false-green rule).

**GUARD-2 AC:**
1. After conversion: `grep '__[A-Z_]*__' vps-scripts/fetch-vn-news.sh` returns only the fallback default inside the shell expansion (e.g. `__MCP_BASE__/api/push-news` inside `${...:- }`), not a bare assignment. Confirmed for all 6 scripts.
2. For fetch-tradingeconomics.sh specifically: `grep 'TE_API_KEY' vps-scripts/fetch-tradingeconomics.sh` shows `${TRADING_ECONOMICS_API_KEY:-}` — empty string fallback, NOT `__TE_API_KEY__`.
3. GUARD-1 pre-scp assert does NOT fire on any of the 5 deployer-managed converted scripts during a normal render (sed substitutes both `__MCP_BASE__` and `__API_KEY__`).
4. After a full redeploy, 14 news feeds land with received>0 for ≥2 cycles.

**GUARD-3 AC:**
1. `scripts/deploy-vps-proxy.sh` contains a deploy block for `vps-scripts/article-body-fetcher.py` with idempotent `pip3 install beautifulsoup4`.
2. `pip3 show beautifulsoup4` on the VPS returns a version (proven by VPS-BS4-INSTALL ops one-off first; then by GUARD-3 redeploy).
3. A fresh deploy via the updated deployer leaves `article-body-fetcher.py` on the VPS at `/root/article-body-fetcher.py` with +x permissions.
4. Spot-verify: one cafef/vneconomy article body length > 5000 chars where applicable (bs4 8000-char path active).

**Combined regression AC:**
- All 14 news feed sources land (received>0, cursor advances) for ≥2 cycles after full redeploy.
- No Docker rebuild required. Confirmed by: zero diff in `apps/`.
