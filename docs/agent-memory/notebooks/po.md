# PO Notebook

## 2026-06-01T11:15Z — triage 2 VPS follow-ups → OPENED VPS-DEPLOY-PLACEHOLDER-GUARD (HIGH)

Spawned by dev-team :07 tick to triage 2 newly-filed follow-ups. WIP 0/2. No new actionable file-signals (cowork-fire heartbeats drained).

**Verdict (raw-verified myself, NOT relaying ops badge):**
- **VPS-DEPLOY-PLACEHOLDER-GUARD = HIGH confirmed → OPEN NOW.** Headroom (0/2) + recurring silent-outage class (cost ~1h, all 14 news feeds http=000 to literal `__MCP_BASE__`).
- **VPS-BS4-INSTALL = LOW confirmed → BUNDLED** into GUARD-3 (deployer owns the dep) + ops one-off pip install now.

**KEY raw findings (corrected the filed framing):**
- The render step EXISTS and WORKS: `scripts/deploy-vps-proxy.sh` L108-110 does `sed __MCP_BASE__/__API_KEY__` for fetch-vn-news.sh. So root cause is a **deploy-process BYPASS**, not a missing renderer. cafef sprint (814088b0) deployed fetch-vn-news.sh + new article-body-fetcher.py via an ad-hoc path that skipped this deployer → clobbered the live rendered `/root/` script with the raw template.
- Proof of bypass: `deploy-vps-proxy.sh` deploys NEITHER article-body-fetcher.py NOR bs4 → cafef artifacts never went through it.
- **Blast radius wider than filed:** 6 scripts hardcode the no-fallback form (fetch-vn-news/gso/sbv/tradingeconomics/prices + enrich-bctc-urls); 9 use safe `${VAR:-…}` form. fetch-foreign-flow.sh L32-34 is the safe template to mirror.

**Scope = combination a+b+c** (architect refines boundary):
- GUARD-1 (b, cross-service): leak guard rejects `__[A-Z_]+__` pre-scp + post-deploy SSH grep empty.
- GUARD-2 (c, dev-vps-crawls): convert 6 hardcode scripts to env-fallback.
- GUARD-3 (a, cross-service+ops): bring article-body-fetcher.py + bs4 under the deployer (closes the bypass).

**Routed:** po→architect (signal `docs/signals/po-20260601T111530Z.json`). pipeline-state: current_sprint set, status=planning, next_agent=architect. SPRINT_GOAL.md prepended; TASKS.md +4-item block.

**Carry-over:**
- FU-DEV-CAFEF-1 (wire /proxy/article-body into push-news) stays AWAITING USER GREENLIGHT — did NOT open.
- TASKS.md now 90L (>80 cap) from the new active sprint block. Acceptable transient for active HIGH work; next closed sprint MUST migrate to TASKS_ARCHIVE before adding more (this is the 2nd cycle I've flagged this — it's the NB-PRUNE-FIX/ctx_bloat theme, not over-prunable live).
- RE-CAP-1 still the prior dispatch awaiting architect→agent-father (signal-dashboard SKILL lazy-load).
