# Docker Deployment Runbook

## Pre-flight

**Script:** `scripts/preflight-disk.sh`

Before running `docker compose up -d`, execute the pre-flight disk check to ensure sufficient disk space:

```bash
scripts/preflight-disk.sh
```

**Rationale:** Sprint 1958 RCA (signal `docs/signals/ops-1958-rca.json`) identified disk pressure (97% full) as the proximate cause of RAG cold-start hang during service initialization. The script prevents reproduction by enforcing a minimum 15 GB free disk threshold before Docker pulls images and starts containers.

**Expected output (healthy):**
```
OK: Docker disk has 33GB free (≥15GB threshold).
```

**If threshold not met:**
```
ERROR: Docker disk has 3GB free, need ≥15GB. Run disk-relief: docker builder prune -a -f && docker image prune -a -f
```

When the error appears, run the suggested disk-relief commands and retry the pre-flight check before attempting `docker compose up -d`.

---

## Deploy

After pre-flight passes, start the full stack:

```bash
docker compose up -d
```

Wait ~30 seconds for health checks to stabilize, then verify:

```bash
curl http://localhost:4000/health
```

Expected response (all 9 services healthy):
```json
{
  "status": "ok",
  "services": {
    "alert-engine": { "status": "ok", "latency_ms": 3 },
    "kinh-dich-service": { "status": "ok", "latency_ms": 3 },
    "macro-indicators": { "status": "ok", "latency_ms": 2 },
    "mcp-server": { "status": "ok", "latency_ms": 6 },
    "news-fetch": { "status": "ok", "latency_ms": 3 },
    "pdf-extractor": { "status": "ok", "latency_ms": 3 },
    "rag-service": { "status": "ok", "latency_ms": 4 },
    "stock-price": { "status": "ok", "latency_ms": 3 },
    "technical-analysis": { "status": "ok", "latency_ms": 3 }
  }
}
```

---

## Troubleshooting

### RAG service hangs on startup

If `docker logs rag-service` shows "Waiting for application startup" stuck for >30s under normal disk conditions (>15GB free):

1. Restart the service in isolation:
   ```bash
   docker restart vn-market-intelligence-mcp-rag-service-1
   ```

2. Poll the health endpoint until responding:
   ```bash
   for i in {1..30}; do curl -s http://localhost:5002/health && break; sleep 1; done
   ```

3. Verify full stack recovery:
   ```bash
   curl http://localhost:4000/health
   ```

### Disk pressure preventing startup

If any service fails with I/O errors or ENOSPC:

1. Check available disk:
   ```bash
   df -h /
   ```

2. Run disk relief (safe order):
   ```bash
   docker image prune -a -f
   docker builder prune -a -f
   ```

3. Retry pre-flight + deploy:
   ```bash
   scripts/preflight-disk.sh && docker compose up -d
   ```

---

## Microservice Code-Change Close Gate ("Restart ≠ Rebuild" rule)

**CANONICAL RULE — referenced by `po/sprint-signoff.md` and `developer/microservice-main.md`.**

A microservice code change is NOT shipped until its container is rebuilt with the new image AND the live container is verified to carry that new code. This rule applies to every dev-team task that touches `apps/<service>/`.

### Why restart is not enough

`docker compose restart <svc>` relaunches the LAST-BUILT image. Code committed to the repo after the last build is silently absent from the running container. The MCP tools will succeed, return data, and report healthy — but the committed logic does not execute. This is the **Restart ≠ Rebuild gotcha** (memory: `project_host_memory_panic`, `feedback_ship_completion`).

### Close-gate sequence (mandatory, in order)

| Step | Actor | Action |
|------|-------|--------|
| 1 | ops | Check free Docker memory: `docker stats --no-stream` + `free -m` (8 GB Docker cap — memory: `project_host_memory_panic`). If used > 7 GB, report to BUG and WAIT. |
| 2 | ops | Rebuild the changed service: `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc>` then `docker compose up -d <svc>` (ONE service at a time — never rebuild the full stack unless explicitly instructed). |
| 3 | ops | Verify container started: `docker compose ps <svc>` → state = `running (healthy)`. |
| 4 | ops | **SHA gate (authoritative deploy-complete check):** `bash scripts/verify-deploy-sha.sh <svc>` — **MUST exit 0**. Any non-zero exit (SHA drift or label absent) = deploy is **BLOCKED**; do NOT declare the deploy complete. Re-investigate: rebuild the service with the `--build-arg GIT_SHA` flag above. Full sequence: `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc> && docker compose up -d <svc> && bash scripts/verify-deploy-sha.sh <svc>`. **First-run note:** containers built before this guard was introduced carry no `vn.market.git_sha` label; the script will exit 1 with "label absent — rebuild required". This is correct behavior: rebuild the container to acquire the label. **`flaresolverr` is skipped** (pulled image, no local Dockerfile — the SHA gate does not apply). **`pdf-extractor` SHA gate is DEFERRED to Phase B** (its Dockerfile does not yet carry the `vn.market.git_sha` label; the label will be added once the active BCTC-LAYOUT-FIRST session closes). |
| 4b | ops | **Forward to QA (atomic board+head write):** `scripts/ops-closegate-handoff.jq` — **NEVER** a hand-rolled inline jq one-liner (root cause of the recurring `.head`/board-row desync bug, memory: `feedback_close_gate_step4_head_sync_gap`, 2 confirmed occurrences `f4afa0e03`, `b907a8ea6`). One jq expression sets the board row's `next_agent` AND conditionally syncs `.head.next_agent`/`.head.updated_at`/`.head.updated_by` — only if `.head.active_task_id` still points at this task (never a blind `.head` overwrite, since `.head` may legitimately be parked on a different in-flight task). Copy-paste invocation is a real shell pipe and cannot be embedded unescaped in this GFM table cell — see the fenced code block immediately below this table. Full design: `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md` §2.1. |
| 5 | qa | Hit `/health` endpoint for the service + verify tool count / key behaviour matches the new code (not a pre-build snapshot). |
| 6 | po | Only after Steps 1–5 pass: mark the sprint task DONE in `docs/data/orch/orch-state.json` `.task_board` (atomic write per §2.3). |

**Step 4b invocation (copy-paste-safe, real unescaped shell pipe):**

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg task_id "$TASK_ID" --arg from_lane "review" --arg next_agent "qa" --arg now "$NOW" -f scripts/ops-closegate-handoff.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```

### Step 4/4b Commit-Gate Invariant (mandatory, non-negotiable)

**Modeled directly on agents-architect's own Brief-Commit Invariant** (`docs/agents/agents-architect/handlers.md` § Brief-Commit Invariant) — same 3-step pattern, applied to ops's Close Gate handoff. Recurring-bug fix (memory: `feedback_close_gate_step4_head_sync_gap`, 2 confirmed occurrences `f4afa0e03` 2026-07-08, `b907a8ea6` 2026-07-09 — router/PO had to discover ops's uncommitted board+journal artifacts via `git status` and commit them itself).

**Step 4/4b is NOT complete until ops's own commit lands.** The `scripts/orch-apply.sh` write above only settles the *working tree*; ops must still stage and commit its own Close-Gate artifacts before returning:

1. **Explicit-stage (commit-boundary RULE 1 — never `git add -A`/`git add .`):**
   ```bash
   git add docs/agent-memory/notebooks/ops.md \
           docs/agent-memory/decisions/sprint-<sprint_id>-ops.md \
           docs/data/orch/orch-state.json
   ```
2. **Commit:**
   ```bash
   git commit -m "chore(ops): close-gate <task_id> — board+head forward to qa"
   ```
3. **Raw self-verify (commit-boundary RULE 3):**
   ```bash
   git show --name-only HEAD
   ```
   Verify ONLY the 3 paths above appear. If unexpected files appear: `git reset --soft HEAD~1`, unstage intruders, re-commit.

**Step 4's RETURN block/report MUST carry the resulting commit SHA.** A completion report that says "board forwarded to qa" without a commit SHA is **INCOMPLETE** — bounce it back to ops, do not proceed to Step 5. **A router/PO/other-agent commit of ops's uncommitted Close-Gate artifacts is a defect to report, not a recovery path** — that silent-fallback is exactly what produced `f4afa0e03`/`b907a8ea6`. If this recurs a 3rd time post-fix, escalate per the standing recurring-bug-escalation policy (memory: `feedback_recurring_bug_escalation`) rather than patching again.

**Journal filename discipline (closes the one-off-filename anti-pattern):** the Close-Gate decision-journal entry MUST use the decision-journal skill's own `SPRINT_ID` resolution (`.claude/skills/decision-journal/SKILL.md` § Resolve Sprint ID) and append a `STEP ops-S<N>` block to `docs/agent-memory/decisions/sprint-<resolved-id>-ops.md`. A one-off dated filename (e.g. `docs/agent-memory/decisions/YYYY-MM-DD-<slug>-OPS-CLOSE-GATE.md`) is **never correct** for this step — 3 prior occurrences of this anti-pattern were folded into `sprint-SYSTEMIC-REMAKE-P1-ops.md`'s `STEP ops-Sn` sequence (2026-07-09).

Full design: `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md` §2.2+§2.3.

### Delegation rule

ops performs the rebuild, SHA gate, and atomic board+head forward to qa (Steps 1–4b). qa verifies liveness (Step 5). The user NEVER runs docker commands. If ops is unavailable, PO signals to BUG and holds the DONE gate open.

---

## Related

- RCA: `docs/signals/ops-1958-rca.json`
- Disk relief signal: `docs/signals/ops-1958-disk-relief.json`
- Dockerfile volume policy: `docs/standards/dockerfile-volume-policy.md` (baked-asset placement rules — named-volume shadow prevention)
- Memory (Restart ≠ Rebuild context): `project_host_memory_panic` (8 GB Docker cap) · `feedback_ship_completion` (code committed ≠ shipped)
