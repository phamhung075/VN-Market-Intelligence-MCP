## Task Report VPS-DEPLOY-PLACEHOLDER-GUARD-QA

sprint: VPS-DEPLOY-PLACEHOLDER-GUARD
task: PLACEHOLDER-GUARD-QA
verdict: APPROVED (LOCAL GATE)
commit reviewed: 96446b5d
date: 2026-06-01

changed:
- scripts/deploy-vps-proxy.sh (+53L: 5 GUARD-1 pre-scp blocks + post-deploy SSH verify + GUARD-3 deploy block)
- vps-scripts/fetch-vn-news.sh (marker rename __HTTP__→_HTTP_, __heartbeat__→_heartbeat_; env fallbacks)
- vps-scripts/fetch-gso.sh (env fallbacks)
- vps-scripts/fetch-sbv.sh (env fallbacks)
- vps-scripts/fetch-tradingeconomics.sh (env fallbacks, TE_API_KEY empty-string default)
- vps-scripts/fetch-prices.sh (env fallbacks)
- vps-scripts/enrich-bctc-urls.sh (env fallbacks)
- vps-scripts/article-body-fetcher.py (GUARD-3, no placeholders)

---

### CHECK 1 — bash -n syntax (7 files) — PASS

```
scripts/deploy-vps-proxy.sh:        exit 0
vps-scripts/fetch-vn-news.sh:       exit 0
vps-scripts/fetch-gso.sh:           exit 0
vps-scripts/fetch-tradingeconomics.sh: exit 0
vps-scripts/fetch-sbv.sh:           exit 0
vps-scripts/fetch-prices.sh:        exit 0
vps-scripts/enrich-bctc-urls.sh:    exit 0
python3 -m py_compile article-body-fetcher.py: exit 0
```

---

### CHECK 2 — Deliberate-violation test (load-bearing AC) — PASS

Reproduced dev's proof independently. Two-stage test:

**Stage A — minimal injection:**
```
TMP=$(mktemp)
cp vps-scripts/fetch-prices.sh $TMP
echo "__GUARD_TEST_TOKEN__=injected" >> $TMP
grep -q '__[A-Za-z][A-Za-z0-9_]*__' $TMP
→ GUARD-1 FIRES: placeholder detected — EXIT 1 BEFORE any scp
```

**Stage B — partial-substitution simulation (exact deployer logic):**
```
TMP=$(mktemp)
cp vps-scripts/fetch-prices.sh $TMP
sed -i "s|__MCP_BASE__|https://zenmidi.com|g" $TMP   # sub only one var
# __API_KEY__ left un-substituted deliberately
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' $TMP; then
  echo "GUARD-1 FAIL: placeholder leak in $TMP — deploy aborted"
  rm -f $TMP; exit 1
fi
→ GUARD-1 FAIL: placeholder leak detected
→ EXIT CODE: 1 — NO scp reached
→ VERDICT: GUARD FIRES NON-ZERO — PASS
```

The guard executes BEFORE any `$SCP` call in all 5 blocks (confirmed by grep -A2 of each block).
All 5 blocks also `rm -f $TMP` before exit 1 (no temp file leaks on guard failure).

---

### CHECK 3 — Clean-render no-leak (6 scripts, sed __MCP_BASE__+__API_KEY__) — PASS WITH NOTE

**5 deployer-managed scripts (rendered + deployed by deploy-vps-proxy.sh):**
```
fetch-vn-news.sh:       CLEAN (0 leaks)
fetch-gso.sh:           CLEAN (0 leaks)
fetch-sbv.sh:           CLEAN (0 leaks)
fetch-prices.sh:        CLEAN (0 leaks)
enrich-bctc-urls.sh:    CLEAN (0 leaks)
```
Post-deploy simulation (grep -rl on rendered dir): CLEAN.

**fetch-tradingeconomics.sh — ANNOTATION (not a blocker):**
Line 15 contains a sentinel comparison string `"__TE_API_KEY__"`:
```bash
if [ -z "$TE_API_KEY" ] || [ "$TE_API_KEY" = "__TE_API_KEY__" ]; then
```
This IS matched by the `__[A-Za-z][A-Za-z0-9_]*__` regex when only __MCP_BASE__+__API_KEY__ are substituted.

Assessment:
- fetch-tradingeconomics.sh is NOT deployed by `deploy-vps-proxy.sh` (confirmed: 0 tradingeconomics references in that deployer).
- It is deployed by `scripts/deploy-vinahost.sh` which explicitly adds `-e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g"` — renders clean on Vinahost.
- The GUARD-1 post-deploy SSH on VULTR (`/root/fetch-*.sh`) will not see this file (different host).
- The sentinel is a belt-and-suspenders legacy check; after Vinahost render it becomes `[ "$TE_API_KEY" = "" ]` (harmless redundancy with `-z`).
- Runtime is unaffected. The env-fallback line 9 `${TRADING_ECONOMICS_API_KEY:-}` is clean.

**Verdict on this annotation:** The `__TE_API_KEY__` sentinel at L15 is design-intentional per commit message ("deployer has no sed rule for __TE_API_KEY__") and safe because (a) the script is not in deploy-vps-proxy.sh scope and (b) deploy-vinahost.sh substitutes it. Not a blocking defect for this sprint. Recommend cleanup as follow-up (remove sentinel, keep only the `-z` check).

---

### CHECK 4 — Marker-rename safety (_HTTP_ / _heartbeat_) — PASS

Old markers fully absent from ALL vps-scripts:
```
grep -rn '__HTTP__\|__heartbeat__' vps-scripts/ → NO MATCHES
```

fetch-vn-news.sh renamed consistently — ALL producer/consumer pairs use `_HTTP_`:
```
Producer (curl -w):
  L128: curl -s -w "\n_HTTP_%{http_code}"
  L302: HB_RESP=$(curl -s -w "\n_HTTP_%{http_code}"
  L321: RESP=$(curl -s -w "\n_HTTP_%{http_code}"

Consumer (grep/sed):
  L135: HTTP_CODE=$(echo "$BODY" | grep "_HTTP_" | sed 's/_HTTP_//')
  L136: BODY=$(echo "$BODY" | grep -v "_HTTP_")
  L309: HB_HTTP=$(echo "$HB_RESP" | grep "_HTTP_" | sed 's/_HTTP_//')
  L328: HTTP_CODE=$(echo "$RESP" | grep "_HTTP_" | sed 's/_HTTP_//')
  L329: RESP_BODY=$(echo "$RESP" | grep -v "_HTTP_")
```
`_heartbeat_` sentinel at L301: single-underscore form, consistent.
No producer/consumer mismatch.

---

### CHECK 5 — env-unset behavior design — PASS

All 6 scripts: `__MCP_BASE__` and `__API_KEY__` appear ONLY as env-fallback defaults:
```
${VN_NEWS_API_URL:-__MCP_BASE__/api/push-news}
${API_KEY:-__API_KEY__}
etc.
```
None appear as bare top-level assignments. The design holds:
- Un-rendered deploy → GUARD-1 fires (literal `__MCP_BASE__` survives sed only if sed not run)
- Rendered deploy → `__MCP_BASE__` replaced, defaults resolve to real URLs
- Runtime with env vars set → env vars override defaults, rendered defaults never evaluated

---

### CHECK 6 — GUARD-3 article-body-fetcher.py — PASS

```
python3 -m py_compile vps-scripts/article-body-fetcher.py → exit 0
```

Deploy block in scripts/deploy-vps-proxy.sh:
- L209: `$SCP vps-scripts/article-body-fetcher.py ${VULTR_USER}@${VULTR_IP}:/root/article-body-fetcher.py`
- L213: `chmod +x /root/article-body-fetcher.py`
- L214-220: idempotent `pip3 install beautifulsoup4` with version log if already present
- No placeholders in the Python file (direct scp, no sed render needed)
- `from bs4 import BeautifulSoup` with graceful fallback (`BeautifulSoup = None`) if not installed

---

### Additional finding: GUARD-1 count

5 pre-scp assert blocks confirmed (grep -c): covers fetch, bctc, news, sbv, foreign-flow.
All 5 include `rm -f $TMP` before `exit 1` — no orphaned temp files on guard failure.
Post-deploy SSH VERIFYEOF heredoc glob: `/root/fetch-*.sh /root/*.py`.

---

verdict: APPROVED (LOCAL GATE)
next_agent: ops
next_action: >
  VPS-BS4-INSTALL one-off + full redeploy via updated deploy-vps-proxy.sh
  + GUARD-1 post-deploy verify CLEAN
  + 14-feed received>0 ×2 cycles
  NOTE: fetch-tradingeconomics.sh sentinel __TE_API_KEY__ L15 — if ops sees
  post-deploy GUARD flag on Vinahost, deploy-vinahost.sh already handles it;
  Vinahost deploy is separate from Vultr deploy-vps-proxy.sh run.
