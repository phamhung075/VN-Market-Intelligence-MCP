# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-13T12:55Z (c72 close — big curl-cffi ship in-flight + 1900a STILL active correction)

## c72 (2026-05-13T12:47Z → 12:55Z, ~8 min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | No HEAD.lock, no index.lock, no expired worktree locks | **4th consecutive lock-free PREFLIGHT** |
| pre-cycle | Encoded ops/docker.md post-rebuild rule (212ea95e, F4 idiom resolved mid-commit HEAD.lock) | Lesson permanent |
| 0a Drain | 10 signals → processed/ | alert-commander, dev-mainserver-crawls×2, market-watcher×2, news-scout, ops-macro-rebuild×2, qa-bug-fred, qa-macro-curl-cffi |
| Gateway probe | `list_servers` returned 138 cached tools BUT `call_tool` connection refused | 🔴 GATEWAY STILL DOWN (cache survived process) |
| 1 PO Triage | Router discretion: in-flight merges already shipped; gateway still down → housekeeping + correction | NO BATCH spawn |
| Post | TASKS.md (close curl-cffi ship + ops-flow ship + 1894a fold + 1900a UPDATED + 1901a/b add) + notebook + pipeline-state + close commit | (in progress) |

### 🎉 BIG SHIP — curl-cffi upgrade IN-FLIGHT between c71 close and c72 tick
**5 commits + 2 merges + 2 notebooks** landed between 11:40Z and 12:47Z:
- `440b98ce` feat: yahoo-finance curl_cffi subprocess (parallel fetch)
- `99294859` feat: trading-economics curl_cffi + fix @graph JSON-LD
- `51bc3b11` feat: cnbc curl_cffi + fix symbol mapping (.SPX/.DJI/.IXIC/.N225/.HSI/.FTSE)
- `fc783aac` fix: investing-calendar — document CF Turnstile v2 escalation
- `39ab15c1` fix: raise per-source timeouts for Python subprocess scrapers
- `1c6a7a01` merge task/macro-external-allsettled-timeout (band-aid Promise.allSettled — was 1900b)
- `96823f44` merge task/macro-scrapers-curl-cffi-upgrade (REAL FIX)
- `e7ce66b2` chore(memory/ops): macro-indicators rebuild notebook
- `b0a5bea7` chore(memory/qa): merge gate notebook

**Smoke results (POST /macro/external):**
- Before: summary.ok=1 (calendar only)
- After: summary.ok=4 (calendar + yahoo + cnbc + tradingEconomics), timeout=2 (fred, worldBank), failed=0
- Technique: curl_cffi chrome136 + ThreadPoolExecutor (parallel ~4s, +15MB RAM each subprocess)
- Unit tests: 87 pass / 0 fail / 12 skip

### 🔴 GATEWAY CORRECTION (1900a STILL ACTIVE)
`mcp__claude_ai_gateway__list_servers` returned `{"cached_tool_count":138,"tools_cached":true}` — **misread as gateway-up**. Actual `call_tool` dial: `connection refused host.docker.internal:3000`. Cache survived gateway process death.

ops macro-indicators rebuild 12:19Z reported `collateral_damage: NONE` but smoke only verified port 5004 (macro service), NOT port 3000 (gateway). **This is the exact failure mode the new flow rule (212ea95e) prevents going forward** — ops MUST verify all 9 services post-rebuild before declaring success.

1900a stays in Todo as **OPS-CRITICAL** with explicit reference to new rule.

### 1901 carry-forwards added
- **1901a OPS-MEDIUM** — FlareSolverr provisioning for investing-economic-calendar (CF Turnstile v2 confirmed unbreakable by curl_cffi chrome124/131/136 + Sec-Fetch). Blocked by 1900a (need gateway up to coordinate). Adapter returns status=error gracefully.
- **1901b FIX-LOW** — FRED adapter design (sequential 8 series × 1s sleep can't fit 8s budget). NOT a regression (file unchanged on curl-cffi branch). qa confirmed do-not-block. Fix path: Promise.all batch-parallel like yahoo/cnbc/te (proven pattern from this branch).

### HEAD.lock (c72 = 1 mid-commit cure, lifetime 26/26)
- ops/docker.md encoding commit hit lock pre-commit; F4 retry idiom (sleep 10 + rm + retry) → success
- PREFLIGHT itself: 4th consecutive clean
- F1 USER ask (1897b) pressure subsiding but pattern persists

### c72 BATCH outcomes
| Task | Outcome | Status |
|---|---|---|
| (no BATCH — gateway still down + major work shipped in-flight; close + escalate) | 1900a-UPDATED + 1901a/b queued + 2 Done rows added | DONE (admin) |

### c73 carry-forward (priority order)
1. **🔴 1900a OPS-CRITICAL** — restore gateway port 3000 PER NEW RULE (`docker port mcp-server 3000` + `curl /health` + `docker restart mcp-server` if down). UNBLOCKS log_agent_work + send_telegram + cowork cron + 1901a follow-up.
2. **1898a HIGH** — `get_market_snapshot` electricity bug (ba spec → dev-mcp-server). Likely UNBLOCKED once gateway up.
3. **1898b HIGH** — RSS regression — re-test after 1900a (likely auto-resolves).
4. **1899a SPRINT-M** — news-fetch service scaffold (architect brief ready).
5. **1901a OPS-MED** — FlareSolverr (after 1900a).
6. **1901b FIX-LOW** — FRED parallel rewrite (developer, low priority).
7. **1862c-E-dashboard** — verify post-restore.
8. Untracked agent work — 4 new dev-*/ops-* agents + flows + 2 architecture-briefs still uncommitted.

### Steady state metrics
- HEAD.lock cure lifetime: 26/26 (100%); 1 mid-commit this cycle (4th consecutive clean PREFLIGHT).
- C2 clean ships: 3/3 last shipping cycles (212ea95e + curl-cffi merges + c70 close).
- **MCP gateway uptime: DEGRADED ~2h+ at c72 close (10:48Z → 12:55Z and counting)**.
- TASKS.md: 80L (cap hit exact, no headroom).

### Communication degraded
- WORK Telegram BLOCKED (send_telegram routes through gateway).
- log_agent_work: start call BLOCKED (cannot mark session).
- Cowork agents (cron-scheduled): silently failing.

### Process lesson (NEW)
- **Cache-survives-gateway-death** trap: `list_servers` returning 138 cached tools ≠ gateway alive. Future dev-team gateway probe MUST be `call_tool` with a no-op (e.g., `get_cycle_bootstrap`) — only an actual dial proves the socket is up.
- ops's smoke-test-the-rebuilt-service pattern is INSUFFICIENT for gateway health; cross-service `/health` curl is the only valid post-rebuild signal. Encoded in `flows/ops/docker.md` § Post-Rebuild Health Verification.
