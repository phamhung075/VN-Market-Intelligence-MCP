# Ops — Main Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
System alert, pipeline health check, or BUG channel report

## Output
Service restored | BUG channel report | WORK escalation if unresolvable

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `ops`)

## Escalate Immediately (do not attempt)
- VPS SSH timeout × 3 → network partition
- `docker-compose down` fails + services stuck
- `PRAGMA integrity_check` fails → data loss risk
- Multiple Docker services in restart loop
- Disk > 95%

```
🚨 ESCALATION REQUIRED
Issue: [what failed] | Root cause: [diagnosis]
Attempted recovery: [tried] | Blocker: [why human needed]
```

## VPS Operations
```bash
ssh root@$VINAHOST_IP "/root/vps-status.sh"
ssh root@$VINAHOST_IP "systemctl status vn-price-fetch.service"
ssh root@$VINAHOST_IP "systemctl restart vn-price-fetch.service"
ssh root@$VINAHOST_IP "journalctl -u vn-price-fetch.service -n 50 --no-pager"
ssh root@$VINAHOST_IP "bash /root/fetch-prices.sh"
```

## VPS Debug Triggers (prefer over SSH)
```
trigger_bctc_vps_fetch(tickers=["FPT","VCB"], verbose=true, dry_run=false)
trigger_price_vps_fetch(tickers=["FPT","VCB"], verbose=true, dry_run=false)
trigger_news_vps_fetch(verbose=true, dry_run=false)
trigger_sbv_vps_fetch(verbose=true, dry_run=false)
trigger_foreign_flow_vps_fetch(verbose=true, dry_run=false)
```
Debug: `dry_run=true` first → check `failed[].reason` → `send_telegram(channel="bug")` → `log_fix(...)`

```
🔍 VPS DEBUG REPORT — <service> — <date>
Trigger: <what ran> | Queue: <pending/skipped/done>
Success: <tickers> | Failed: <ticker: reason>
Root cause: <diagnosis> | Fix: <recommendation>
```

## Docker
```bash
docker-compose ps
docker logs -f mcp-server --tail 100
cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5
curl http://localhost:3000/health
```
NEVER: `bun --hot` | `bun --watch` | `nodemon` | `pm2` | manual Bun restarts

**MANDATORY post-rebuild 9-service health check** (any rebuild/restart, even single-service) → `docs/agents/ops/flow/docker.md` § Post-Rebuild Health Verification. Rationale: c71 — `--force-recreate macro-indicators` knocked mcp-server gateway port 3000; ~50 min blast radius before detection.

## DB Health
```bash
ls -lh apps/mcp-server/data/db.sqlite*            # WAL < 10MB normal, >50MB = flag
sqlite3 apps/mcp-server/data/db.sqlite "PRAGMA integrity_check;"  # must = "ok"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/ops.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/ops.md
git commit -m "chore(memory/ops): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

## Fleet OCR Regression Alert

When system-auditor (or any BUG channel message) reports that `3_OCR.vn_diacritic_ratio` dropped below threshold (`< 0.30` per `docs/data/bctc-eval-thresholds.json`) for **3 or more reports simultaneously**, treat as a PaddleOCR model or library regression — NOT a per-report data issue.

Diagnostic steps (in order):
1. Check PaddleOCR version in running pdf-extractor container:
   ```bash
   docker exec pdf-extractor pip freeze | grep paddleocr
   ```
2. Compare to `apps/pdf-extractor/requirements-pek.txt` — any version drift?
3. Check base image SHA for unintended updates:
   ```bash
   docker inspect pdf-extractor --format "{{.Image}}"
   docker inspect pdf-extractor --format "{{.Config.Image}}"
   ```
4. If version drift confirmed → REBUILD pdf-extractor (`docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD) pdf-extractor && docker compose up -d --no-deps --force-recreate pdf-extractor`), then re-run mandatory 9-service health check → `docs/agents/ops/flow/docker.md` § Post-Rebuild Health Verification.
5. Report to WORK channel with `send_telegram(channel="work")` detailing the drift and action taken.

Status semantics for eval: red = hard fail, yellow = soft warning, green = pass. A fleet-wide OCR regression typically shows `3_OCR` stage red across multiple reports — distinguish from isolated single-report red (single-PDF data issue, not a regression).

---

## Incident Protocol
1. Diagnose — Docker/VPS/DB/network?
2. `send_telegram(channel="bug")`: "Investigating [issue]"
3. Attempt recovery per section above
4. Fails → Escalate
5. Document → append to incident log
6. **After successful recovery**: if a `telegram_reports` ID triggered this incident → `log_fix(title=..., related_feedback_id=ID, commit_hash="ops-recovery")` + `process_telegram_report(id=ID, delete_telegram_message=true)`
