# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-13T09:50Z (c69 close — RCA breakthrough on 1894a + 3 signals drained + concurrent activity acknowledged)

## c69 (2026-05-13T09:36Z → 09:50Z, ~14 min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | No HEAD.lock present | **lock-free cycle — 1st in many** |
| 0a Drain | 3 signals → processed/ | architect news-fetch design-complete + 2 qa (dev-vps-crawls HSX/HNX + dev-mcp-server VPS contract tests) |
| 1 PO Triage | Router discretion (state clear: 0 telegrams, 1899a brief now ready, USER 1894a still blocking) → BATCH(1) | ops-cloudflared-restart-c69 |
| 3 Tier 1 | ops (cloudflared service restart + curl verify) | **NO CODE SHIPPED but MAJOR RCA: cloudflared in NAMED-TUNNEL TOKEN MODE — local config.yml IGNORED** |
| MERGE GATE | n/a (no code commit from ops; only docs updates by dev-team) | — |
| Post | TASKS.md updates (1894a precision refine + 1899a brief-ready + 1894a-RCA-c69 Done row) + this notebook + pipeline-state + close commit | (in progress) |

### Merge chain (origin/main since c68 close `aa705af2`)
All concurrent-agent ships landed BEFORE the c69 cron tick fired:
- `0ce9162c` chore(memory/ops-vps-fetch): recon hsx-bctc HNX param contract fix
- `4a86eef3` fix(vps-crawls/hsx-bctc): HNX `/vi-vn/` referer + `pNhomTin` empty + homepage guard (Q1/2026 PDFs now flowing)
- `0da3f0ea` chore(memory/news-scout): notebook
- `3d6383a2` test(mcp-server): VPS contract tests for push-prices and push-news (10/10 pass)
- `171355cc` chore(memory/dev-mcp-server): notebook push-path-fix cycle
- (architect brief `docs/architecture-briefs/2026-05-13-news-fetch-service.md` written 06:00Z — uncommitted but on disk)

### 🔴 MAJOR RCA: 1894a 16-cycle blocker root cause finally identified

For the **16 cycles** the user has been blocked on `POST https://zenmidi.com/api/push-news → 404`:
- Multiple prior cycles claimed "applied fix to `~/.cloudflared/config.yml`" → fix was technically applied but **ineffective**.
- ops c69 discovered the actual reason: cloudflared on this Mac runs in **NAMED TUNNEL TOKEN MODE** (launchd plist). In this mode, the local `config.yml` is IGNORED. **Ingress rules come from the Cloudflare DASHBOARD.**
- Verified: localhost:4000/api/push-news returns 401 (mcp-server route healthy + auth working); `brew services restart cloudflared` succeeded; external `https://zenmidi.com/api/push-news` still returned 404.
- **USER action now PRECISE**: log into https://dash.cloudflare.com → Cloudflare Tunnel → vn-market-mcp → Public Hostnames → add ingress rule Path `^/api/*` → Service `http://localhost:4000`. (Not a config file edit, not a service restart — a dashboard click.)
- 1894a row in TASKS.md updated with the refined fix path. Priority bumped HIGH→CRITICAL.

### HEAD.lock (c69 = 0 cures)
- First lock-free cycle in many. Background pattern persists at ~1/cycle steady-state but absent this iteration.

### c69 BATCH outcomes
| Task | Outcome | Status |
|---|---|---|
| ops-cloudflared-restart-c69 | RCA discovered: token-mode tunnel → dashboard config required, not local file | DONE (diagnostic) — no code ship; USER action precision-refined |

### c70 carry-forward (priority order)
1. **1894a USER CRITICAL** — Cloudflare dashboard ingress rule `^/api/*` → `localhost:4000`. Now precisely specified. Single click in dashboard.
2. **1897b CRITICAL** — F1 USER Docker `.git/` exclude (HEAD.lock 23x/last-day; absent this cycle but pattern persists).
3. **1899a developer scaffold** — architect brief ready (`docs/architecture-briefs/2026-05-13-news-fetch-service.md`); 15 new files + 8 mods. Big SPRINT-M for c70.
4. **1898a HIGH** — `get_market_snapshot` electricity bug (ba spec → dev-mcp-server).
5. **1898b HIGH** — RSS regression (ba spec → dev-mcp-server / ops).
6. **1897f HIGH** — architect rethink (lower urgency post-1897g).
7. **1862c-E-dashboard** — overlaps with 1894a (same dashboard, same `/api/*` family of routes).
8. **Concurrent untracked agent work** — 4 new dev-*/ops-* agents + flows + handoffs still uncommitted by their owners; flag if lingers another cycle.
9. METHODOLOGY-INFRA + SSOT-CRITICAL + JANITOR long-tail.

### Steady state metrics
- HEAD.lock cure: 23/23 lifetime (100%); 0 this cycle (good signal, but small sample).
- C2 clean ships: 2/2 last shipping cycles (c67, c68). c69 had no code ship (ops diagnostic only).
- 1899a unblocked for c70 (architect brief done).
- 1894a finally has a PRECISE fix path after 16 cycles of misdiagnosis.

### Process win
- Spawning `ops` with a full step-list + verification curl + SSH e2e + DB check enabled the agent to **escalate diagnostic depth** beyond the assumed fix. Without that explicit escalation prompt, c69 might have just "applied config" again and reported success → 17th cycle. Lesson: when a fix has been "applied" 3+ cycles without effect, the prompt should demand verification before claiming success.
