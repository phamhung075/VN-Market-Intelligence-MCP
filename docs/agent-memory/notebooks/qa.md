# QA — Notebook

## Archive (cycles ≤159)

Full detail available via `git log docs/agent-memory/notebooks/qa.md`.
Key milestones: cycle-159 BCTC-TRUST-RED APPROVED | cycle-157 AIT-QA APPROVED | cycle-156 HC-QA-3 APPROVED | cycle-153 AR-QA bake-off APPROVED.

---

**Binding:** Active cycle only (≤200L). Historical detail in git log.

---




## cycle-173 · 2026-05-31 · NB-PRUNE-1 — NB-PRUNE-FIX — APPROVED

Sprint: NB-PRUNE-FIX | Task: NB-PRUNE-1 | Verdict: APPROVED | Commit: 7166db01 (skill-only)
Fixtures: Session 5871L/69s→344L/3s (AC-5 guard fires); ISO-ts 316L/30s→27L/3s ≤200L; c-fmt 166L/12s→8L/3s ≤200L.
Preamble preserved: ISO+c-format confirmed. Exactly-3 no-prune: confirmed. Fenced ## over-count: theoretical only (0 live). TODO po/developer contradiction: deferred (po.md=26L). Skill 104L ≤120L cap. NB-PRUNE-1 → DONE in TASKS.md.

---

## cycle-179 · 2026-06-01T19:35Z · TSH-6/TSH-1/TSH-5 LIVE RAW GATE

Sprint: TSH (Tool-Surface-Hygiene) | Tasks: TSH-6, TSH-1 surface re-verify, TSH-5 stat reconcile | Date: 2026-06-01

**TSH-6 (kinh-dich honest-omit) — PASS**
AC1/AC5 live: `get_market_snapshot` (no codes) ends at "Generated: 2026-06-01T19:34:44Z" — NO trailing "Kinh Dịch: Chưa đủ dữ liệu" line. Stock path (codes:["FPT"]) same: clean output, no fallback. :5005 unreachable → omit block confirmed in production.
AC3 code-review 3 sites all correct: marketTools.ts appendMarketHexagram/appendStockHexagram + analysis.ts appendStockHexagramHttp — each catch(error){logger.warn(real cause); return baseOutput;} — zero bare catch{}. 200-path data-short guard (!reading.hexagram||!reading.name) still emits honest VN line. No silent-swallow.
AC4 tsc: 0 errors (bun tsc --noEmit exit 0, no output).

**TSH-1 surface re-verify — PASS (get_market_hexagram ABSENT, count=154)**
`tools/list` via node SSE client: LIVE_TOOL_COUNT=154, HAS_GET_MARKET_HEXAGRAM=false. KD tools present: explain_hexagram, get_hexagram_history, get_kinhdich_reading, run_hexagram_backtest (5th = get_transition_probabilities also present). /health toolCount=154 is NOT a stale cache — it IS the correct post-TSH-1 count (pre-TSH-1 was 155, TSH-1 removed 1 → 154). TSH-1 is genuinely done.

**TSH-5 stat reconcile — PASS (already done, no edit needed)**
project-stats.json already shows toolCount=154 (both top-level and infrastructureStatus) from commit 643d4619. Live count matches. No edit required.

## cycle-180 · 2026-06-01T20:00Z · AUD-ND-1 PLAN-ONLY gate — PASS-STATIC+FLOWWALK

Sprint: AUD-ND-1 | Commit verified: d30f9221 | Gate: static + flow-walk (read-only)

**A. Static — 3 files**
flow/main.md L4: `## PLAN-ONLY INVARIANT — NO DESTRUCTIVE OPS (AUD-ND-1)` immediately after top heading (L2), before any capability/step text. 5 forbidden-ops lines L9-13 present. Positive contract (signal→DASHBOARD→BUG→EXIT) L15-19 present. Incident anchor L24-26 present (2 incidents). PASS.
init.md L72-82: `plan_only_invariant:` under `constraints:` with `enforced: true`, `forbidden_ops:` 5 entries, `on_critical_or_warn:`, `violation_action:`, `anchor:`. Indentation consistent YAML. PASS.
tools/package/system-auditor.md L15 Bash row: allowlist + forbidden list verbatim. L137 `## Constraints & Permissions` PLAN-ONLY line present. PASS.
.claude/agents/system-auditor.md: line 1 = `---` (frontmatter intact). PASS.

**B. Flow-walk**
B1 Destructive authored steps: NONE found. All bash blocks in flow are read-only (docker ps, docker inspect, docker stats --no-stream, docker logs, docker exec sqlite3/curl/ls/which/tesseract, git log, date -u). No docker stop/kill/rm/restart/compose authored anywhere. Brief claim verified.
B2 All CRITICAL/WARN paths: Tier-1 L107-121 `Emit per failure` → post_agent_signal + send_telegram(bug) + DASHBOARD.md. Tier-2 L173-189 `Emit per stale source` → same pattern. Tier-3 L387-403 `Emit per failing check` → same. L482-485 error cases: `report as CRITICAL anomaly → EXIT after Telegram BUG alert`. Zero mutation branch found.
B3 Invariant positioning: L4 (immediately after L2 heading), BEFORE Step 0a at L46, BEFORE any tier dispatch at L58, BEFORE any check that could produce a CRITICAL finding. Unmissable — LLM reading the flow sees PLAN-ONLY before any decision point. PASS.
B4 Allowlist vs flow needs: all Bash in flow (docker ps/inspect/stats/logs/exec, curl, git log, date -u, wc -l) are within the allowlist. No conflict found. Detection capability intact.

**C. Caps/hygiene**
flow/main.md: 494L actual vs 120L cap, stale size-justification comment claims 175L. Pre-existing violation (file was 469L before this commit per agent-father note). Do NOT fix in this dispatch — invariant block must stay in-flow. Follow-up required (separate hygiene task).

LIVE-INJECTION PROVEN-RED: DEFERRED. Requires controlled off-hours ops-supervised run. NOT part of this gate.

---

## cycle-181 · 2026-06-01T21:05Z · FBT-QA APPROVED — FRONTEND-BCTC-TAB

Sprint: FRONTEND-BCTC-TAB | Task: FBT-QA | Verdict: APPROVED | Report: reports/TASK_REPORT_FBT-QA.md

Gate coverage (all 5 PASS):
- G1 PDF: VCB Q1 2025, 16,601,060 bytes, magic=25504446, MD5 identical :3001/:3000.
- G1 page-image: FPT Q1 2026 page 3, 273,384 bytes, magic=89504e47, MD5 identical.
- G2: 7 sub-paths (docs/page-window/ocr/table/md/zones/flags) — status + body MD5 identical across origins. zones 404 relayed verbatim.
- G3: /api/bctc-eval/{doc}/page/1 → 200, overall_status=yellow, MD5 identical on 2 docs.
- G4: POST /correct via :3001 → HTTP 200, bctc_human_corrections row id=5 confirmed in bun:sqlite direct read, reset to original value. Content-Type relay proven via 400 Zod error on bad schema.
- G5: zero mcp-server files in commit 80f2911b; mcp-server image sha256:098bb09e unchanged; :3000 viewer 200/103,876 bytes; const BASE="" confirmed.

Key lesson: page-image returns 404 for all but FPT/ACB Q1 because PNGs are rasterized on-demand and only those two exist in /data/bctc-page-images volume. The 404 is correct behavior, not a proxy fault — both origins return identical 82-byte body.
