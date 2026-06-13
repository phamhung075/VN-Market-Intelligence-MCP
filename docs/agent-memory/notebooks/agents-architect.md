# agents-architect — Notebook

## 2026-06-06T18:46:34Z

**Brief:** `docs/architecture-briefs/2026-06-06-headroom-context-compression.md`

Headroom context compression integration design: evaluated 4 candidate points; selected gateway-side SmartCrusher middleware inside apps/mcp-server as primary (non-ML, zero new containers, fail-open, TypeScript-native). Rejected CLI wrap (fleet blast radius), MCP server mode (tool surface growth), and ML Kompress model (16GB host memory risk). Defined financial data exemption list (get_bctc_full, get_bctc_refined, FX, price history — passthrough required for numeric integrity). 3-phase rollout: Phase 1 = 3 high-volume non-financial tools (get_cycle_bootstrap, get_market_snapshot, fetch_news_batch) with golden-output validation gate; Phase 2 = full allowed list + CacheAligner; Phase 3 = metrics dashboard. Owner: dev-mcp-server. P3 improvement-proposal signal dropped to po.

**Signal dropped:** `docs/signals/headroom-context-compression-20260606T184634Z.json` → po

---

## 2026-06-08T18:07:55Z

**Brief:** `docs/architecture-briefs/2026-06-08-ci-health-fix-bridge.md`

CI-health → fix-task bridge design: institutionalizes automated CI failure detection into the dev-team cron loop as Step 0a.5 (ci-health-probe sub-flow + canonical script). Probe reads GitHub Actions latest CI run for origin/main HEAD via gh CLI; on non-success terminal conclusion emits a deduped `ci_red` signal into the signal_queue routed to PO, which creates a FIX task via the existing repair_task_request pathway. Key constraints encoded: STALE-RUN GATE (headSha == origin/main HEAD after git fetch), three-layer dedup (probe DB fingerprint + drain fingerprint + PO task-board open-entry check), VERIFICATION GATE (task DONE only after ci_green on a subsequent push), SAFE-JSON throughout (execFileSync array args + jq --arg bound params), non-fatal on gh absence or API error. 5 files to create/edit; developer owns canonical script. Sprint CI-RED-RECONCILE (go-lint/technical-analysis, HEAD 8ffb1985) used as live grounding case.

**Signal dropped:** `docs/signals/ci-health-fix-bridge-20260608T180755Z.json` → agent-father

---

## 2026-06-08T20:00:00Z

**Brief:** `docs/architecture-briefs/2026-06-08-ci-test-isolation-spike.md`

CI-TEST-ISOLATION-SPIKE: 3-bucket triage of 639 bun failures. B1 (DOMINANT) — `1862c-transport-session-eviction.test.ts` poisons process-level module cache via `mock.module()` at module scope with no restore; all test files after 1862c in run order inherit MockMcpServer without `.tool()` → ~269 cascade failures. Fix: wrap mock in `beforeAll`/`afterAll` + `mock.restore()`. B2 — 63 inline test DDLs missing `data_env` column (canonical DDL in schema-news.ts adds it via guarded ALTER; inline copies don't replicate) → ~96 SQLiteError + pollNews timeout failures. Fix: replace inline DDLs with `initNewsTables(db)` call. B3 — BANK-AWARE-1 missing `statement_section` → 3 failures. Bucket A (24 obsolete): 089-tool-macro (15 tests, HTTP rewire 98df0f43 removed injection points), 1414 FILE 1 (7+ tests, HTTP rewire 6fc7b6b3 deleted template literals), 1503 AC3 (1 test, DPI-4 upsert strategy 32d201e8), 1190 schedulerFileCount (1 test, hardcoded 44 vs actual 64). Bucket C (~39 real regressions): TR-RED-5b (finalize_bctc_refine, e74dd0e1), macro freshness (239a/239c), orch-state wip fields (1837a), notebook .bak + developer.md (1839b), diacritics (1472), cron-registry missing entry. DWF canary intentionally RED — DO NOT TOUCH. Fix plan: B first (2 systemic fixes), then A (removal dev task), then C (regression fixes per zone).

**Signal dropped:** `docs/signals/ci-test-isolation-spike-20260608T200000Z.json` → pm

---

## 2026-06-11T23:20:00Z

**Brief:** `docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md` (GFD-1 CLOSE — §c recalibration)

GFD-1 final close: all 13 GO-FLEET-DEPLOY tasks now DONE; sprint marked COMPLETE. §(c) HONOR-PANIC-GUARD soak gate corrected in-place — "swap > 4 GiB" abort threshold DISPROVEN by live soak (raw swap sat at ~9.9 GiB while fleet ran perfectly healthy; macOS compresses/over-reports swap). Corrected gate: PRIMARY = `memory_pressure` ≥ 20% free (live: 64–78%); SECONDARY = Docker VM RSS < 6,500 MiB (live: 1.3–2.1 GiB); PER-CONTAINER = OOMKilled==true. exit-137 with OOMKilled=false is external SIGKILL, not a soak failure. Sprint evidence: 9/9 services ok at 1–2ms latency, zero OOMKilled, origin/main HEAD 74770141.

**Signal dropped:** none (brief update only; sprint complete; no new agent-father action required)

---

## 2026-06-13T16:18:10Z

**Brief:** `docs/architecture-briefs/2026-06-13-origin-lag-push-discipline.md`

FU-ORIGIN-LAG-PUSH-DISCIPLINE: recurring root-cause (30+ unpushed commits/2h, 3 consecutive maintenance passes). Root cause confirmed: commit-mutex and commit-boundary NEVER push; generic commit/SKILL.md pushes bare (no rebase-retry, fails non-fast-forward). Design: fold bounded rebase-retry push step into commit-mutex critical section as Step 3d-PUSH (1 initial + 1 rebase-retry attempt, abort on conflict, bug-telegram on failure). TTL bumped 60s → 90s to preserve 4× headroom. commit-boundary gets RULE 4 (same guard, no-gateway path). commit/SKILL.md Step 3 gets guard. PO flow inline commit block replaced with skill reference. 4 agent-father tasks decomposed in brief §6. Race-safety: push is inside the already-serialized mutex window; no two agents push concurrently; rebase-retry operates on stable local HEAD. orch-state.json updated on disk (backlog→ready); pm to commit.

**Signal dropped:** `docs/signals/origin-lag-push-discipline-20260613T161810Z.json` → pm
