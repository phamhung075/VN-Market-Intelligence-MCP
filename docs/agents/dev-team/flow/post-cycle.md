# Dev Team — Step 4 & 4.5: Scan + Compact Checkpoint

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 4 / 4.5 dispatcher)

---

## Step 4 — Scan

**4.0 — Expire stale monitoring:**
```
expire_monitoring_reports()  # flips monitoring reports >72h to "wontfix"
log: "[dev-team] Expired {result.expired} monitoring reports"
```

**4.0.5 — Mock-in-production backstop:**
```bash
bash scripts/audits/mock-guard.sh --full
# Scopes to apps/*/src production paths; excludes tests/sandbox/scenarios/spike/.venv
```
If exit 1 (HARD-FAIL): write signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]`
  (skill: `.claude/skills/signal-dashboard/SKILL.md` § WRITE) with type `system-issue`,
  `to: "po"`, summary `mock-guard HARD-FAIL: fabricated data in production source`, payload_ref `null`.
  Also emit a second row with `to: "agents-architect"`.
  Do NOT block cycle exit — this is detective-only at the backstop level.
If exit 2 (CAUTION): log `[dev-team] mock-guard CAUTION: ambiguous markers found` to WORK only.
If exit 0: silent.

**4.1 — Post-execution checks:**
1. Non-main branches remain → add CLEAN batch → Step 1.
2. `read_telegram_reports(status="new").length > 0` → `send_telegram(work, "Found N new report(s)")` → Step 1.
3. `list_unresolved_reports()` non-monitoring count > 0 → `send_telegram(work, "Found N unresolved")` → Step 1.
4. **Monitoring-only guard (C-6):** ALL unresolved are monitoring → `send_telegram(work, "N in monitoring — no action.")` → archive + exit. (Prevents infinite loop.)
5. **Archive resolved** (fixed/wontfix/duplicate): `process_telegram_report(id, delete_telegram_message=true)` for each.
6. Nothing remaining → `send_telegram(work, "Dev loop idle.")` → EXIT.

---

## Step 4.5 — Compact Checkpoint

> Invariant: always `date -u +"%Y-%m-%dT%H:%M:%SZ"` — never speculative.

Run after Step 4 exits cleanly, before re-entering Step 1:
```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write docs/agent-memory/notebooks/main.md
  3. **Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
     git add docs/agent-memory/notebooks/main.md
     git commit -m "chore(memory/dev-team): notebook YYYY-MM-DD"
     # Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
  4. send_telegram(work, "Sprint boundary — offloaded state, ctx at N%")
  5. Return  # hook: ctx>40% → /compact | ctx 30-40% → decision:block | ctx<30% → silent
```
After compact: resume from Step 1 via smart-compact-protocol.md.

**If ctx ≤ 25%:** skip → Step 1.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Self-critique** → skill: `.claude/skills/self-critique/SKILL.md`

---

## Step 4.9 — Cycle Elapsed Announce

Run once, at the very end of every post-cycle exit path (after Step 4 idle/monitoring exits and after Step 4.5 compact checkpoint):

```
end_epoch   = $(date +%s)
elapsed_s   = end_epoch - start_epoch          # start_epoch set in Step 0-PREFLIGHT, same session
elapsed_min = elapsed_s / 60
elapsed_sec = elapsed_s % 60
send_telegram(channel="work", message="[dev-team] cycle DONE — elapsed {elapsed_s}s / {elapsed_min}m {elapsed_sec}s")
```

Note: `start_epoch` is a session-scoped variable defined in Step 0-PREFLIGHT of `main.md`. Sub-flows run within the same main-terminal session so the variable is available here without file I/O.
