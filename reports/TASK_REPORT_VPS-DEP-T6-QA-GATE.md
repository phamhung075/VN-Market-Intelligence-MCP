## Task Report VPS-DEP-T6-QA-GATE

sprint: VPS-DEPLOY-PLACEHOLDER-GUARD
task: T6-QA-GATE
verdict: FAIL — AC-6 blocked (VULTR_IP comment-tombstone in .env)
date: 2026-06-02
qa-agent: qa (cycle-178)

---

## AC Summary

### AC-1: GUARD-1 fence is real — PASS

Pre-SCP regex used: `__[A-Za-z][A-Za-z0-9_]*__` (lines 55, 98, 128, 156, 184, 212, 240, 274 of scripts/deploy-vinahost.sh)
Post-deploy SSH verify regex: `__[A-Z][A-Z0-9_]*__` (line 357)

**Deliberate violation test (raw):**
```
TMP=$(mktemp); echo "# __API_KEY__" >> $TMP
grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP" → EXIT 1 (guard fires)
Result: GUARD-1 fires non-zero
```

**Clean render test (raw):**
```
sed -e "s|__MCP_BASE__|https://zenmidi.com|g" -e "s|__API_KEY__|test-key|g" vps-scripts/fetch-prices.sh > $TMP
grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP" → EXIT 0 (no match)
Result: GUARD-1 passes on clean render
```

**Real config placeholders caught (raw):**
- `__MCP_BASE__` → guard fires (PASS)
- `__API_KEY__` → guard fires (PASS)
- `__TE_API_KEY__` → guard fires (PASS)

**Python dunders NOT flagged by post-deploy SSH verify (raw):**
```
echo 'if __name__ == "__main__":' > $TMP
grep -q '__[A-Z][A-Z0-9_]*__' "$TMP" → EXIT 1 (no match)
```
Reason: `__name__` has lowercase letters; `__[A-Z][A-Z0-9_]*__` requires uppercase-only body.

**Note on split regex:** The pre-SCP guards use mixed-case `__[A-Za-z][A-Za-z0-9_]*__` — NOT changed by ed967839. Only the post-deploy SSH verify (line 357) was tightened to uppercase-only. This is intentional and correct: pre-SCP guards only run on rendered shell scripts (no Python files), so Python dunder false-positives are NOT reachable in the pre-SCP path. The post-deploy SSH verify scans `.py` files (`/root/*.py`), so uppercase-only is required there.

**AC-1 VERDICT: PASS**

---

### AC-2 (task spec AC-1): GUARD-1 pre-SCP blocks dirty fixture — PASS

Verified same as AC-1 deliberate violation test. The guard check runs before any `$SCP` call in all 8 render blocks (confirmed by code inspection of scripts/deploy-vinahost.sh). Exit code 1 before scp is reached.

**AC-2 VERDICT: PASS**

---

### AC-3: Post-deploy SSH verify detects injected leak — PASS (raw, live VPS)

```
ssh root@125.212.251.27 "echo '# __INJECTED_TEST__' >> /root/fetch-prices.sh"
→ Injected sentinel

ssh root@125.212.251.27 "grep -rl '__[A-Z][A-Z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null"
→ /root/fetch-prices.sh  (correctly detected)

# Cleanup
ssh root@125.212.251.27 "sed -i '$ d' /root/fetch-prices.sh"
→ Sentinel removed

# Post-cleanup verify
ssh root@125.212.251.27 "grep -rl '__[A-Z][A-Z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null"
→ CLEAN - no placeholders
```

**AC-3 VERDICT: PASS**

---

### AC-4: TE_API_KEY sentinel intact + empty-string expansion — PASS

**Sentinel intact in source (raw):**
vps-scripts/fetch-tradingeconomics.sh L15:
```
if [ -z "$TE_API_KEY" ] || [ "$TE_API_KEY" = "__TE_API_KEY__" ]; then
```
Sentinel present as VPS-side defense-in-depth guard (confirmed by Read).

**Empty-string expansion test (raw):**
```
unset TRADING_ECONOMICS_API_KEY
sed -e "s|__MCP_BASE__|https://zenmidi.com|g" \
    -e "s|__API_KEY__|test-key|g" \
    -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g" \
    vps-scripts/fetch-tradingeconomics.sh > $TMP
grep -q '__TE_API_KEY__' "$TMP" → EXIT 1 (not found)
grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP" → EXIT 0 (no placeholders)
Result: TE_API_KEY expands to empty string; GUARD-1 passes
```

**AC-4 VERDICT: PASS**

---

### AC-5: deploy-vps-proxy.sh deleted from HEAD — PASS

```
git ls-tree HEAD scripts/ | grep deploy-vps-proxy → (no output)
git ls-tree HEAD | grep deploy-vps-proxy → (no output)
[ -f scripts/deploy-vps-proxy.sh ] → false
```

All three checks confirm deletion. No `deploy-vps-proxy.sh` in git HEAD or on filesystem.

**AC-5 VERDICT: PASS**

---

### AC-6: .env contains zero VULTR_* lines — FAIL

**Exact test from task spec (raw):**
```
grep "VULTR_IP" .env && echo "FOUND" || echo "NOT FOUND"
→ # Vultr decommissioned 2026-04-13 — VULTR_IP / VULTR_USERNAME / VULTR_PASSWORD removed. Do not restore.
→ FOUND
```

Exit code: 0 (found). AC-PASS condition requires exit code 1 (not found).

**Finding:** Line 10 of `.env` is a comment-tombstone. No active VULTR variable assignment exists (`grep '^VULTR' .env` → empty). The string `VULTR_IP` appears only in the comment text as documentation.

**Impact:** Per the strict literal AC criterion, this is a FAIL. The comment line must be removed or the AC condition narrowed. No active credential leak. The fix is a 1-line removal.

**AC-6 VERDICT: FAIL**

---

### AC-7: article-body-fetcher.py + beautifulsoup4 on VPS — PASS (raw, live VPS)

```
ssh root@125.212.251.27 "ls -la /root/article-body-fetcher.py"
→ -rwxr-xr-x 1 root root 9365 Jun  2 01:25 /root/article-body-fetcher.py

ssh root@125.212.251.27 "pip3 show beautifulsoup4 | grep -E 'Name|Version'"
→ Name: beautifulsoup4
→ Version: 4.14.3
```

Both checks pass. --break-system-packages fix confirmed working on Ubuntu 24.04.

**AC-7 VERDICT: PASS**

---

### AC-8: All 9 VPS services active + feeds healthy — PASS (raw, live VPS)

**systemctl status (raw):**
```
ssh root@125.212.251.27 "systemctl is-active vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow vn-ohlcv-backfill.timer vn-bctc-enrich.timer vn-tradingeconomics-fetch vn-vps-proxy"
→ active (×9)
```

**VPS proxy health (raw):**
```
curl http://localhost:8765/health → HTTP 200
{"ok":true,"service":"vps-proxy","upstreams":{"ssc_iboard":"...","bctc_cache":"..."}}
```

**Service log evidence (raw tails):**
- price: "PUSH: 112 items → {ok:true,updated:112}" (2026-06-01T18:27Z)
- bctc: "=== BCTC FETCH COMPLETE ===" (2026-06-01T18:24Z)
- news: "heartbeat sentinel sent http=200" (2026-06-01T18:24Z)
- sbv: "PUSH: SBV rates → {ok:true,usdVnd:26114}" (2026-06-01T18:23Z)
- foreign-flow: "PUSH_RESPONSE: HTTP 200, body: {ok:true,upserted:103}" (2026-06-01T08:59Z)
- tradingeconomics: "SKIP: TE_API_KEY not configured" (expected — no TRADING_ECONOMICS_API_KEY set)
- ohlcv-backfill: "pending=false — sleeping 60s" (running correctly)
- bctc-enrich: "=== BCTC URL ENRICHMENT DONE ===" (2026-06-01T18:25Z)
- vps-proxy: 10,166 successful push entries in price log

No permanent http=000 errors across any service log.

**AC-8 VERDICT: PASS**

---

## Blocking Issue

**AC-6 FAIL:** `.env` line 10 contains a comment-tombstone: `# Vultr decommissioned 2026-04-13 — VULTR_IP / VULTR_USERNAME / VULTR_PASSWORD removed. Do not restore.`

The string `VULTR_IP` appears in the comment text. The literal AC criterion (`grep "VULTR_IP" .env; $? = 1`) is not satisfied.

**Fix required (1 line, dev-vps-crawls):** Remove line 10 from `.env`. The comment is informational only — the information it conveys is already recorded in MEMORY.md (`[VPS proxy for all geo-blocked]` entry: "Vultr Singapore decommissioned 2026-04-13").

**Fix is trivial.** After fix, re-run `grep "VULTR_IP" .env` → exit 1 → AC-6 PASS → sprint closeable.

---

## Overall Verdict

**T6 FAIL** — 7/8 ACs pass, 1 blocks (AC-6).

All guard logic is sound and live-verified on VPS. The only blocker is a 1-line comment removal from `.env`. Sprint is NOT closeable until AC-6 is resolved.
