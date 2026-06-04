---
sprint: RAPID-DATA-LAYER
branch: task/FIX-I-A-vps-board-details
size: M
zone: vps-scripts/
depends_on: []
blocks: ["FIX-I-B"]
---

## TLDR

Build VPS-side Python scraper + shell drivers to fetch Vietstock board-details (officer appointment years) and expose via proxy. Mirror FIX-G (AGM-plan) pattern exactly: same CSRF warmup, POST to /data/boarddetails endpoint, parse current-term officers, drop JSON to /root/data/, push to mcp-server on completion.

## [PM] Planning Context

- **Zone:** vps-scripts/ (Vinahost VPS 125.212.251.27, `/root/` owned by deploy user)
- **Acceptance Criteria:**
  - [ ] `vietstock-board-details.py` fetches 33 watchlist tickers, parses current-term officers, outputs JSON with `{status, tickers_ok, tickers_error, data:{TICKER:[{name, position_text, appointment_year, closed_date, year_of_birth, independence, total_shares}]}, fetched_at}`
  - [ ] `appointment_year` extracted from `FromDate` field (trim → integer year; "N/A" variants → null); no fabrication
  - [ ] `fetch-board-details.sh` validates JSON (non-empty + `status==ok`), atomically writes `/root/data/board-details-latest.json`, pushes `POST /api/push-board-details` (tolerate 404)
  - [ ] `fetch-board-details-loop.sh` fires daily at 02:00 UTC (after AGM 01:00), exponential backoff (5 failures → 1800s, 10+ failures → 3600s + Telegram alert)
  - [ ] `vn-board-details.service` installed, enabled, auto-started; MemoryMax=256M; `journalctl -u vn-board-details.service -f` shows clean fetch cycles
  - [ ] `/root/data/board-details-latest.json` present and served at `http://125.212.251.27:8765/proxy/board-details` (nginx route verified or added if missing)

- **Files to read first:** 
  - `docs/handoffs/TASK_FIX-I.md` (architect brownfield findings, full contracts)
  - `docs/vps-sources/officer-start-date/recon.md` (source verification)
  - Deployed FIX-G artifacts: `vps-scripts/vietstock-agm-plan.py`, `vps-scripts/fetch-agm-plan.sh`, `vps-scripts/fetch-agm-plan-loop.sh`, `vps-scripts/vn-agm-plan.service` (reference templates; clone structure verbatim)

- **Files to create:**
  - `vps-scripts/vietstock-board-details.py` — Python scraper, ~120L; mirror agm-plan.py CSRF warmup + session jar + SSL setup
  - `vps-scripts/fetch-board-details.sh` — shell driver, atomic write + push, ~40L
  - `vps-scripts/fetch-board-details-loop.sh` — cron-loop driver, exp-backoff, ~30L
  - `vps-scripts/vn-board-details.service` — systemd unit, ~15L

- **Files to modify:**
  - `docs/vps-sources/officer-start-date/recon.md` — add § 4 "Deployment Record" with date + successful fetch log excerpt
  - nginx `/etc/nginx/conf.d/` — verify `location /proxy/board-details` route exists (if not, add mirror of agm-plan route)

- **Dependencies:** 
  - None (parallel with FIX-I-B; both unit tests run in isolation)
  - END-TO-END gate: B's live-verify can only run after A's proxy is deployed and live

- **Knowledge needed:** 
  - `docs/protocols/vps-deploy.md` — systemd enable/start pattern + journalctl check
  - Vietstock board-details endpoint contract (recon.md § 1-3)
  - ASP.NET CSRF double-submit pattern (same as FIX-G, no new learning)

- **Build standard:** lean (existing deployment infrastructure, new feature script)
- **Idempotency:** Fetcher is read-only HTTP; Shell driver is idempotent (atomic temp→rename); systemd unit is idempotent; re-running does not corrupt data

## Test Strategy

**VPS-side only (no mcp-server dependency yet):**

1. **Manual smoke test (developer responsibility):**
   - SSH to VPS, run Python scraper manually on 3 tickers (FPT, VCB, VNM): `python3 vietstock-board-details.py FPT VCB VNM`
   - Verify stdout JSON: `tickers_ok≥3`, `data.FPT[0].appointment_year is int or null`, `status=="ok"`
   - Run shell driver: `bash fetch-board-details.sh` → verify `/root/data/board-details-latest.json` created, `ls -la` timestamp fresh
   - Verify push skips gracefully if `/api/push-board-details` route absent (404 tolerated, logged, no crash)

2. **Systemd unit smoke test:**
   - `systemctl status vn-board-details.service` → enabled + active (after enable --now)
   - `journalctl -u vn-board-details.service -n 20` → last 20 lines show clean startup, no errors

3. **File format validation (ops pre-deploy):**
   - `jq '.data | keys | length' /root/data/board-details-latest.json` → ≥30 (all watchlist tickers)
   - `jq '.data.FPT[].appointment_year | type' /root/data/board-details-latest.json` → "number" or "null" (no strings, no 0)

**No live mcp-server calls yet** — those gate on FIX-I-B deploy.

## Developer Handoff Path

1. Clone FIX-G artifacts (agm-plan.py/.sh) as templates
2. Implement board-details.py scraper: CSRF warmup → POST /data/boarddetails with `code=ticker` (NOT `stockCode`) → parse FromDate → output JSON
3. Implement fetch-board-details.sh + loop.sh: mirror agm-plan shell drivers
4. Implement vn-board-details.service: mirror agm-plan systemd unit
5. Test locally (Python env on VPS, mock HTTP if isolated): scraper shape matches contract
6. Push code to repo via normal dev-team flow (commit, not direct VPS edit)
7. Ops: deploy via VPS-DEPLOY flow (copy files, systemctl enable --now, verify journalctl, verify /root/data/ exists)
8. Verify proxy route live: `curl http://125.212.251.27:8765/proxy/board-details?batch=FPT,VCB` returns JSON (may error on batch param if not yet tuned, but route must be callable)
9. Return to PM: "FIX-I-A deployed, /proxy/board-details live, ready for FIX-I-B live-verify"

## Architect Notes

**Risk flag — nginx proxy route:**
The existing `:8765` nginx config may have explicit routes only (e.g., `/proxy/agm-plan`, `/proxy/prices`) and not a dynamic `/proxy/<filename>` catch-all. Developer must check `/etc/nginx/conf.d/` on VPS during deploy:
- If explicit routes only: add `/proxy/board-details` route (3 lines, mirror agm-plan)
- If dynamic catch-all exists (e.g., `location /proxy/ { alias /root/data/; }`): no change needed

Verify BEFORE marking task done.

---

## RETURN

```
TASK_ID: FIX-I-A
TITLE: VPS board-details scraper + fetch drivers
SIZE: M
ZONE: vps-scripts/
OWNER_RECOMMENDED: dev-vps-crawls
AC_COUNT: 6
BLOCKS: FIX-I-B (live-verify gate)
PIPELINE: ready
```
