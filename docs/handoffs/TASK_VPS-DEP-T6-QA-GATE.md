# TASK_VPS-DEP-T6-QA-GATE — QA gate: verify all guard assertions + 14-feed coverage

**Owner:** qa  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Priority:** HIGH  
**Status:** READY (gates on T5-OPS-DEPLOY PASS)  
**Estimated:** 1h  
**Blocks:** PM SPRINT EXIT

---

## Summary

QA executes the gate proof per the existing PLACEHOLDER-GUARD spec (docs/handoffs/TASK_PLACEHOLDER-GUARD.md), adapted for the consolidated deployer. Test plan confirms: (1) GUARD-1 pre-SCP assert blocks deploy when a test script contains a sentinel, (2) Clean scripts pass, (3) Post-deploy SSH verify detects leaks, (4) TE_API_KEY sentinel handling correct, (5) deploy-vps-proxy.sh retired, (6) .env cleaned.

---

## Acceptance Criteria

### AC-1: GUARD-1 pre-SCP assert blocks dirty fixture
**Test:** Inject a sentinel into a test fixture script (e.g., fetch-prices.sh with `__TEST_TOKEN__` inside).

Create a temporary test copy:
```bash
cd scripts
cp -r vps-scripts vps-scripts-test-guard-1
echo "# __TEST_TOKEN__" >> vps-scripts-test-guard-1/fetch-prices.sh
```

Run deploy-vinahost.sh (will fail on render assert).

**Expected:** Deploy fails at GUARD-1 assert with error message naming the TMP file. Exit code 1.

**AC-PASS condition:** Deploy fails with `GUARD-1 FAIL` message; exit code is 1; error logged.

Cleanup: `rm -rf vps-scripts-test-guard-1`

### AC-2: Clean script passes assert
**Test:** Render a clean script (no sentinel), confirm GUARD-1 assert passes.

```bash
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|https://zenmidi.com|g" \
    -e "s|__API_KEY__|test-api-key|g" \
    vps-scripts/fetch-prices.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "GUARD-1 FAIL"
  rm -f "$TMP"
  exit 1
else
  echo "GUARD-1 PASS"
fi
rm -f "$TMP"
```

**Expected:** "GUARD-1 PASS" message; exit code 0.

**AC-PASS condition:** Grep finds zero matches; exit code 0.

### AC-3: Post-deploy SSH verify detects injected leak
**Test (on Vinahost after deploy):** Inject a sentinel on the remote side, confirm GUARD-1 post-verify detects it.

```bash
ssh root@125.212.251.27 "echo '# __INJECTED_TEST__' >> /root/fetch-prices.sh"
ssh root@125.212.251.27 "grep -rl '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py 2>/dev/null || true"
```

**Expected:** grep finds `/root/fetch-prices.sh` containing the injected sentinel.

**AC-PASS condition:** grep output lists the file with the injected token. Cleanup: remove the injected line from the live script.

### AC-4: TE_API_KEY sentinel handled correctly
**Test:** Render fetch-tradingeconomics.sh without TRADING_ECONOMICS_API_KEY set (empty-string expansion).

```bash
unset TRADING_ECONOMICS_API_KEY
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|https://zenmidi.com|g" \
    -e "s|__API_KEY__|test-api-key|g" \
    -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g" \
    vps-scripts/fetch-tradingeconomics.sh > "$TMP"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP"; then
  echo "TE_API_KEY sentinel LEAKED"
  rm -f "$TMP"
  exit 1
else
  echo "TE_API_KEY render OK (empty string passes)"
fi
rm -f "$TMP"
```

**Expected:** Render produces empty string (not literal `__TE_API_KEY__`); grep finds zero matches.

**AC-PASS condition:** No sentinel leak; sed expansion works correctly.

### AC-5: deploy-vps-proxy.sh no longer exists
**Test:** Check repo and filesystem.

```bash
git ls-tree HEAD scripts/ | grep deploy-vps-proxy.sh
[ -f scripts/deploy-vps-proxy.sh ] && echo "File exists" || echo "File not found"
```

**Expected:** git ls-tree returns nothing; file not found.

**AC-PASS condition:** Both commands confirm file is gone.

### AC-6: .env no longer contains VULTR_IP
**Test:**
```bash
grep "VULTR_IP" .env && echo "FOUND" || echo "NOT FOUND"
grep "VULTR_IP" .env.example && echo "FOUND" || echo "NOT FOUND"
```

**Expected:** Both grep commands return "NOT FOUND" (exit code 1).

**AC-PASS condition:** grep -q "VULTR_IP" .env; $? = 1 (not found).

### AC-7: Article-body-fetcher deployed and beautifulsoup4 installed
**Test (on Vinahost):**
```bash
ssh root@125.212.251.27 "ls -la /root/article-body-fetcher.py"
ssh root@125.212.251.27 "pip3 show beautifulsoup4"
```

**Expected:** Both commands return clean output (file exists, package installed).

**AC-PASS condition:** `ls -la` shows the file; `pip3 show` lists beautifulsoup4.

### AC-8: 14-feed verification confirmed
**Test:** Verify all 14 feeds (9 services + 5 upstream sources) returned HTTP 200 within the first 2h after ops deploy.

From `docs/handoffs/TASK_VPS-DEP-T5-OPS-DEPLOY.md` AC-5, ops has already confirmed this. QA reviews the logs ops provided.

**Expected:** Ops report shows all 5 main services (price, bctc, news, sbv, foreign-flow) logged at least one successful fetch with HTTP 200 or "received=X items".

**AC-PASS condition:** No permanent http=000 errors; all 5 services show successful poll/push.

---

## Implementation approach

1. **DV-1:** Create test fixture, inject sentinel, run deploy-vinahost.sh
2. **DV-2:** Clean script render, confirm GUARD-1 passes
3. **DV-3:** SSH to Vinahost, inject remote sentinel, verify GUARD-1 post-check detects it
4. **DV-4:** Render TE_API_KEY without env var, confirm empty-string expansion
5. **DV-5:** Verify deploy-vps-proxy.sh deleted from repo
6. **DV-6:** Verify VULTR_IP removed from .env / .env.example
7. **DV-7:** SSH to Vinahost, confirm article-body-fetcher.py + beautifulsoup4
8. **DV-8:** Review ops logs for 14-feed HTTP 200 confirmation
9. **Report:** Post gate PASS/FAIL to WORK channel

---

## Test plan (QA gate proof)

- **DV-1:** GUARD-1 pre-SCP assert blocks deploy on sentinel fixture (exit 1)
- **DV-2:** Clean script passes assert (exit 0)
- **DV-3:** Post-deploy SSH verify detects injected leak
- **DV-4:** TE_API_KEY empty-string expansion, no sentinel leak
- **DV-5:** deploy-vps-proxy.sh not in git HEAD
- **DV-6:** VULTR_IP not in .env or .env.example
- **DV-7:** article-body-fetcher.py + beautifulsoup4 on Vinahost
- **DV-8:** ops logs confirm 14-feed HTTP 200 coverage

---

## Risk flags

| Risk | Mitigation |
|---|---|
| Sentinel test fixture interferes with live deploy | Use separate vps-scripts-test-guard-1 directory; clean up after test |
| Remote injection test modifies live script | Inject a test marker, verify detection, then remove immediately (document in logs) |
| TE_API_KEY test requires unsetting env var | Run in isolated shell session or subshell to avoid polluting main environment |

---

## Gate rule

**HARD GATE:** All 8 AC verdicts must be PASS before PM exits sprint. If any AC fails, escalate to dev-vps-crawls or ops for immediate correction.

---

## Related docs

- Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md` § QA test plan
- Reference: `docs/handoffs/TASK_PLACEHOLDER-GUARD.md` (original guard spec, adapted here)
- Committed work: T1-T5 handoffs + developer/ops tasks
