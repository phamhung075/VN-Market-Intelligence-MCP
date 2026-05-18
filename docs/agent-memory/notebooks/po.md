# PO Notebook

## Last updated: 2026-05-18T20:00Z · Cycle: c200 — Sprint 1952 backlog planning (analysis-quality 5-item brief)

### c200 session summary

**Spawn:** User-driven planning cycle. Input: 5 highest-leverage analysis-quality items (feedback loop / TNB rubric / triangulation / business-context / regime classifier). Output: prioritised dispositions, Backlog entries, Done rotation.

**Step 0 — pre-flight:** N/A (user input bypasses signal dashboard). TASKS.md was 79L at cap-1 — required Done rotation before new entries.

**Dispositions:**
1. **Feedback loop / Brier** — Sprint 1948 Phase 1 already covers shadow-mode degradation detection (gate-blocked 2026-05-20T07:22Z). Per-agent Brier weighting is Phase 2 extension NOT in current brief. Filed as `1952e-brier-per-agent-weighting` SPIKE for architect, pre-cond = Sprint-1948-stable + 1941b seed window.
2. **TNB 6-layer rubric** — needs ARCH brief (rubric schema, retry mechanism, table extension). Filed `SPIKE-1952a-tnb-layer-rubric` HIGH architect 3h timebox.
3. **Cross-source triangulation** — multi-zone (alert-engine reads mcp-server agent_signals), needs ARCH brief. Filed `SPIKE-1952b-convergence-detector` HIGH architect 3h timebox.
4. **Business-context coverage** — incremental extension of 1939 critic-gate, direct PM. Filed `1952c-business-context-mandatory` MEDIUM dev-mcp-server, pre-block until 2026-05-25 (post-1939 stability gate).
5. **Macro regime classifier** — finer 3-axis overlay on existing macro_snapshot. Needs ARCH brief (rules vs LLM, gate semantics, backward-compat). Filed `SPIKE-1952d-macro-regime-classifier` MEDIUM architect 3h timebox.

**Done rotation:** 12 rows archived to `docs/TASKS_ARCHIVE.md` § "Added 2026-05-18 by PO c200" (Sprint 1949/1950/1951a-d closed). TASKS.md: 79L → 73L (after +5 Backlog rows). Pointer row added in Done section.

**WIP discipline:** WIP=2 unchanged (1951b OBSERVE + 1951c blocked). All new entries land in Backlog. No new dev dispatch this cycle.

**Architect queue:** 3 SPIKE tasks (1952a, 1952b, 1952d) now in Backlog — architect picks up by priority (1952a/1952b HIGH first, 1952d MEDIUM after).

**Files modified this cycle:**
- `docs/TASKS.md` — rotated 12 Done rows; added 5 new Backlog entries (1952a/b/c/d/e); 73L.
- `docs/TASKS_ARCHIVE.md` — new archive section "Added 2026-05-18 by PO c200" with 12 archived rows.
- `docs/agent-memory/notebooks/po.md` — this entry (overwrite per skill).

**Files NOT touched (intentional):**
- `docs/SPRINT_GOAL.md` — Sprint 1948 still QUEUED behind gate; Sprint 1952 has no active dev work yet (3 SPIKEs pending architect pickup).

**WORK Telegram:** SEND on commit — one-liner: Sprint 1952 backlog seeded (5 analysis-quality items dispatched: 3 SPIKE → architect, 1 PM-direct gate-blocked, 1 Phase-2 SPIKE pre-cond on 1948).

### Carry-over for next cycle

- **WATCH 2026-05-18T23:00Z** — FA cycle: verify HPG `get_cash_flow` non-zero (post-1942c gate). Pass → auto-close in Todo.
- **WATCH 2026-05-19T00:00Z** — news-scout offhours slot. If `list_connectors()` empty 2nd time → counter=2. 3rd within 24h → file `SPIKE-1951f-cowork-session-mcp-autoconnect`.
- **WATCH 2026-05-19T05:23Z** — chef-morning RemoteTrigger fire = 1951b tick 2/3. AC-3 idempotency check.
- **WATCH 2026-05-19T08:37Z** — chef-eod RemoteTrigger fire = 1951b tick 3/3. On confirm → 1951b → Review for QA; 1951c unblocks.
- **GATE 2026-05-20T07:22Z** — post-1945-verdict-resolution-scored-pct + bug-storm silence. Clears unblocks 1948a/b/c chain.
- **GATE 2026-05-25** — 1939 critic-gate stability window. Clears unblocks 1952c business-context-mandatory.
- **Architect queue:** SPIKE-1952a (TNB rubric, HIGH), SPIKE-1952b (convergence, HIGH), SPIKE-1952d (regime classifier, MEDIUM), 1952e (Brier, MEDIUM pre-cond). Architect picks 1952a + 1952b first.
- **1951e (BACKLOG)** — agent-father pickup after 1951b ticks 2/3 + 3/3 confirm.
- **USER-action blockers:** 1907a (Claude Desktop restart), 1897b (Docker VirtioFS `.git/`). Unchanged.
- **Recurring-bug counter:** unchanged.
- **WIP discipline:** strict cap=2. Do NOT promote any 1952* SPIKE until architect has bandwidth + 1951b closes.
