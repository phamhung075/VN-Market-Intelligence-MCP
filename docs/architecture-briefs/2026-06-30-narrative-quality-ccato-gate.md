# Architecture Brief — Narrative Quality CCATO Gate
**Date:** 2026-06-30  
**Author:** agents-architect  
**Status:** READY — route to po for Tier-1 sprint mint

---

## 1. Trigger Incident (verified)

`docs/social/fb-post-2026-06-30.md` shipped publish-ready with two CCATO instances and three typos that cleared all six existing gates:

| Line | Defect | Tool that contradicts it |
|------|--------|--------------------------|
| 28 | "Tôi không có dữ liệu kỹ thuật chi tiết phiên này để đưa ra mức hỗ trợ cụ thể" (VNM) | `get_technical_indicators(VNM)` → RSI 20.3 / MACD bearish / sub-Bollinger |
| 10 | "Dữ liệu dòng vốn ngoại chi tiết phiên này công cụ chưa trả được số từng mã" | `get_foreign_flow` → per-ticker data present |
| 16 | "bảo bệ" | → bảo vệ |
| 19 | "bất chất", "dự liệu" | → bất chấp, dữ liệu |
| 26 | "forecast", "macro" | English jargon — missed by `scripts/fb-jargon-gate.sh` token table |

Root cause of CCATO passage: `main.md:176-177` — NO_TA is self-reported by the agent on per-ticker TA call error, with NO re-probe to verify the error. `main.md:358` rewards this by mandating a lighter verdict path (QUAN_SAT/GIU). `main.md:419` Rule T2 drops untraceable TA levels, making NO_TA the path of least resistance. `scripts/fb-data-integrity-gate.sh` Checks A–G (lines 26–44) gate only numbers that appear in the post; an absence sentence carries no number, so zero checks fire.

---

## 2. Gap Map — The Empty Cell

| Mechanism | Re-probes tools for claim truth? | Blocks before publish? |
|-----------|----------------------------------|------------------------|
| TNB (audit-market.md Step 2) | Partial — 4 ticker types only (price/earnings/sigma/sector); macro and absence claims: NO | NO — cron `13 20 * * *`, ~36 min post-publish |
| qa merge gate | NO — never sees cowork output | YES — but code branches only |
| system-auditor | NO — never reads a narrative artifact | NO — plan-only/detect-only |
| digest-predict calibration | NO — grades future price targets, never source tool output | NO — weekly post-hoc |
| self-critique | NO — agent self-report, weakest reviewer by design | NO — shadow, 2-agent allowlist |
| fb pre-write gate (4a/4b/4c) | NO — numeric plausibility of figures present; absence claims carry no number | YES — but only for present numbers |

**Net gap:** "narrative claim-vs-truth re-probe" × "blocks before publish" = EMPTY across all six mechanisms.

---

## 3. Failure Class: CCATO

**CCATO = Claim Contradicts Authorized Tool Output.**  
An agent emits an assertion of absence or unavailability for a dimension its own authorized tools would populate, while the tool returns non-null data.

**Why deterministically checkable:** re-probe the mapped tool → non-null result ⇒ FAIL; null result ⇒ PASS. The PASS-on-null property is structural: honest-NULL claims (e.g. deep indicators pending OHLCV depth per `project_indicator_program_gated_on_ohlcv_depth`) cannot false-positive because the tool returns null and the gate passes. No model judgment, no threshold tuning.

---

## 4. Tier-1 Contract — `claim-truth-gate` Shared Skill

### 4.1 Artifacts

| Artifact | Purpose |
|----------|---------|
| `docs/data/claim-tool-map.json` | Dimension → tool routing SSOT. Script reads this at runtime — NO hardcode in script. |
| `scripts/narrative-truth-gate.sh` | Re-probe engine. Reads claim-tool-map.json. Produces contradiction report. Exits non-zero on any FAIL. |
| `.claude/skills/claim-truth-gate/SKILL.md` | Shared skill: every cowork agent and TNB invoke this single SSOT so in-flow and backstop logic never drift. |
| `narrative_contradiction` signal schema | Signal row written to `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` on FAIL. |

### 4.2 `docs/data/claim-tool-map.json` Schema

```json
{
  "version": "1",
  "negation_lexicon": [
    "không có dữ liệu",
    "chưa có dữ liệu",
    "chưa trả được",
    "công cụ chưa trả",
    "không trả được số",
    "không đủ dữ liệu",
    "thiếu dữ liệu",
    "không truy xuất được",
    "không có thông tin",
    "không có dữ liệu kỹ thuật phiên này",
    "NO_TA"
  ],
  "dimensions": [
    {
      "id": "technical_indicators",
      "keywords": ["kỹ thuật", "RSI", "MACD", "Bollinger", "hỗ trợ", "kháng cự", "chỉ báo"],
      "tool": "get_technical_indicators",
      "requires_ticker": true
    },
    {
      "id": "foreign_flow",
      "keywords": ["từng mã", "khối ngoại", "nước ngoài", "mua bán ròng", "dòng vốn ngoại chi tiết"],
      "tool": "get_foreign_flow",
      "requires_ticker": false
    },
    {
      "id": "macro",
      "keywords": ["vĩ mô", "lãi suất", "tỷ giá", "lạm phát", "chính sách"],
      "tool": "get_macro_snapshot",
      "requires_ticker": false
    },
    {
      "id": "financials",
      "keywords": ["lợi nhuận", "EPS", "báo cáo tài chính", "BCTC", "doanh thu"],
      "tool": "compare_financials",
      "requires_ticker": true
    },
    {
      "id": "market_snapshot",
      "keywords": ["thanh khoản", "giá", "phiên", "giao dịch", "khối lượng"],
      "tool": "get_market_snapshot",
      "requires_ticker": true
    }
  ]
}
```

### 4.3 `scripts/narrative-truth-gate.sh` — Re-probe Engine

**Inputs:**
- `$1` = path to composed post body file (or `-` for stdin)
- `$2` = agent_id (for signal attribution)
- `$3` = optional: path to working-memory tool cache JSON from agent's data-acquisition step (cheap pre-filter; live re-probe is authoritative)

**Algorithm:**
1. Load `docs/data/claim-tool-map.json` — fail-loud if missing.
2. For each sentence in the body: check against `negation_lexicon` (substring match, Vietnamese-safe). Collect matching sentences.
3. For each matched sentence: scan surrounding window (±50 chars) for dimension keywords → identify dimension. Extract ticker from the sentence window (VN-ticker regex: `[A-Z]{2,4}` not matching known non-ticker tokens). For `requires_ticker=false` dimensions, use dimension key.
4. Re-probe via gateway: `mcp__gateway__call_tool(server="vn-market", tool=<dimension.tool>, arguments={code: ticker})` — NEVER `mcp__vn-market__*` directly.
5. If working-memory cache supplied and cache[ticker][dimension] is non-null: short-circuit PASS-on-cache (performance optimization only; live probe is the authoritative path).
6. Verdict per match: tool returns non-null/non-empty for the negated field ⇒ **FAIL** (contradiction). Tool returns null/empty ⇒ **PASS** (honest no-data).
7. **Output (stdout):** per-contradiction report: `{claim_text, tool, ticker_or_dim, returned_summary}`.
8. **Exit code:** 0 = all PASS; non-zero = at least one FAIL. Agent write step checks this exit code.
9. **Signal emit on FAIL:** write `signal_queue` row via `scripts/orch-apply.sh`:
   ```json
   {
     "signal_type": "narrative_contradiction",
     "to": "po",
     "payload": {"agent_id": "<agent_id>", "claim": "<text>", "tool": "<tool>", "ticker": "<ticker>", "returned_value": "<summary>", "cycle": "<ISO-date>"},
     "status": "NEW"
   }
   ```

### 4.4 Negation Lexicon (Vietnamese, extensible)

Sourced from `claim-tool-map.json` `.negation_lexicon` array — never hardcoded in script. Seed entries:

- `không có dữ liệu` / `chưa có dữ liệu` — generic absence
- `công cụ chưa trả` / `chưa trả được` / `không trả được số` — tool invocation failure claims
- `không đủ dữ liệu` / `thiếu dữ liệu` — sufficiency claims
- `không truy xuất được` / `không có thông tin` — retrieval failure claims
- `(không có dữ liệu kỹ thuật phiên này)` — the exact NO_TA marker from `main.md:176`
- `NO_TA` — the literal sentinel

Extension path: add entries to `.negation_lexicon` array in `claim-tool-map.json` without touching the script.

### 4.5 `narrative_contradiction` Signal Schema

Written to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` via `scripts/orch-apply.sh`. Fields:

```json
{
  "id": "<uuid>",
  "signal_type": "narrative_contradiction",
  "status": "NEW",
  "to": "po",
  "created_at": "<ISO-8601 UTC>",
  "payload": {
    "agent_id": "<agent that produced the narrative>",
    "claim": "<exact sentence from the post>",
    "tool": "<re-probe tool name>",
    "ticker": "<ticker or dimension key>",
    "returned_value": "<non-null summary from tool>",
    "cycle": "<YYYY-MM-DD>",
    "gate_version": "1"
  }
}
```

The `signal_type` value `"narrative_contradiction"` must be added to the orch-state Zod StatusEnum if not present — route via Migration to dev-mcp-server.

### 4.6 Self-Correct In-Cycle Protocol

When the gate exits non-zero, the calling agent MUST:
1. Re-call the mapped tool with the ticker.
2. Rewrite the offending sentence using the real returned values (e.g. "RSI 20.3, MACD âm, giá dưới Bollinger lower band" for VNM).
3. Re-run `narrative-truth-gate.sh`. If PASS → continue to write. If FAIL again (tool genuinely errors this time) → write per-field honest gap per `main.md:176-177` existing protocol.
4. Emit `narrative_contradiction` signal regardless (marks that in-cycle self-correction occurred).

This makes the gate self-healing within one cycle: the 06-30 VNM line would have been rewritten to its real RSI/MACD/BB values and shipped correctly.

---

## 5. Wiring Points Per Agent

All agents call the same shared `claim-truth-gate` skill (backed by `narrative-truth-gate.sh`). The insertion is always at the last gate step before the narrative is written to a file or sent to a channel.

### 5.1 fb-market-poster — New STEP 4d

**File:** `docs/agents/fb-market-poster/flow/main.md`

**Insertion:** After existing STEP 4c (privacy gate), before STEP 5 (write to `docs/social/fb-post-YYYY-MM-DD.md`).

```
**STEP 4d — CLAIM-TRUTH GATE (new, mandatory)**
Run: skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed body from STEP 3>
  agent_id  = "fb-market-poster"
  cache     = <TA results from STEP 1b working memory>

If gate returns FAIL:
  → Apply self-correct protocol (§4.6): re-call mapped tool, rewrite offending line, re-run gate.
  → If second pass PASS → continue to STEP 5.
  → If second pass still FAIL (tool genuinely errors): write per-field honest gap per main.md:176.
  → In either case, emit narrative_contradiction signal (already done by gate script).
If gate returns PASS → continue to STEP 5.
```

### 5.2 unified-agent / CHEF — Rule AF-3 in Step 6.7

**File:** `docs/agents/unified-agent/flow/chef.md`

**Insertion:** In Step 6.7 (line 298), alongside existing AF-1 (no fabricated numerics) and AF-2 (qualitative-only vocabulary). Add as Rule AF-3:

```
### Rule AF-3 — CLAIM-TRUTH GATE (new, mandatory, runs with Step 6.7 pre-publish self-check)
Before constructing send_telegram calls in Step 7, run: skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed Block A + Block B text>
  agent_id  = "unified-agent"
  cache     = <working-memory from current cycle's tool calls>

On FAIL: apply self-correct protocol (§4.6). Do NOT proceed to Step 7 send_telegram until gate passes.
```

The Step 7.5 quality verdict gate already runs after Step 7; Rule AF-3 fires *before* the send_telegram calls in Step 7, so it is part of the pre-publish sequence alongside AF-1/AF-2.

### 5.3 market-watcher — New Step 4f

**File:** `docs/agents/market-watcher/flow/cycle.md`

**Insertion:** After existing Step 4e exec-proof gate (line 209), before Step 5 (notebook write + send_telegram). Market-watcher's narrative is brief (alert-style) but can contain absence claims on macro or TA dimensions.

```
**Step 4f — CLAIM-TRUTH GATE (new, mandatory)**
Run: skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed alert text>
  agent_id  = "market-watcher"
  cache     = <working-memory from Step 1-3>

On FAIL: apply self-correct protocol (§4.6). On second FAIL → write per-field honest gap, emit signal, proceed (do not block real-time alert indefinitely).
```

Note: for real-time market-watcher alerts, a persistent FAIL that cannot self-correct must still emit the signal and proceed with the honest-gap version rather than blocking the alert (time-sensitivity override). This exception must be explicit in the skill.

### 5.4 alert-commander — Before Step 4a send_telegram

**File:** `docs/agents/alert-commander/flow/stage-dispatch-log.md`

**Insertion:** After the Firing Gate evaluates true and before Step 4a `send_telegram(channel="market", ...)`.

```
**Step 4a-pre — CLAIM-TRUTH GATE (new, mandatory)**
Run: skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <alert_text>
  agent_id  = "alert-commander"
  cache     = <signal matrix from stage-signals.md>

On FAIL: apply self-correct protocol (§4.6). Same time-sensitivity override as market-watcher.
```

### 5.5 digest-predict — After P-5 claim composition, before create_prediction_claim

**File:** `docs/agents/digest-predict/flow/daily-predict.md`

**Insertion:** After P-5 constructs `claim_text`, before `create_prediction_claim(...)` call.

```
**P-5.5 — CLAIM-TRUTH GATE (new, mandatory)**
Run: skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <claim_text>
  agent_id  = "digest-predict"
  cache     = <BCTC + market snapshot from P-4>

On FAIL: rewrite claim_text with real values. If still FAIL: drop the ticker from P-5 (do not file a claim built on a false negation). Emit signal.
```

### 5.6 TNB Backstop — Extend audit-market.md Step 2

**File:** `docs/agents/tran-ngoc-bau/flow/audit-market.md`

**Insertion:** In Step 2 "Cross-validate with live data", extend the existing 4-ticker re-probe to call the shared `claim-truth-gate` skill on the full published dish body.

```
**Step 2 — Extended cross-validation (new)**
In addition to existing price/earnings/sigma/sector re-probes:
  Run: skill `.claude/skills/claim-truth-gate/SKILL.md`
    post_body = <full MARKET dish text or fb-post body>
    agent_id  = <source agent (unified-agent / fb-market-poster)>
    cache     = {}  # TNB has no working-memory cache from source agent; live re-probe only

On FAIL: log MISMATCH → existing TNB emit path (post_agent_signal + BUG-channel + signal_queue row to:po).
```

This is defense-in-depth: TNB catches anything that slipped past in-flow gates. Because TNB and the in-flow gates call the identical library, there is no in-flow/backstop logic drift.

---

## 6. Self-Heal Loop

```
CCATO DETECTED (gate exits non-zero)
    │
    ▼
[Self-correct in-cycle]
  re-call tool → rewrite line with real values → re-run gate
    │
    ├─ PASS → write artifact → emit narrative_contradiction signal (corrected)
    │
    └─ FAIL again (tool genuinely errors) → write per-field honest gap → emit signal (uncorrected)
    │
    ▼
narrative_contradiction signal_queue row (status=NEW, to=po) via orch-apply.sh
    │
    ├─ Single incident → po awareness, no sprint
    │
    └─ Recurring: same agent + dimension ≥2 cycles, OR signal NEW >2h unacked
            │
            ▼
        anomaly-task-bridge → repair_task_request → po mints sprint
            │
            ▼
        dev-team / flow-tooling: fix the mandate-to-gate boundary in the flow
        (wire mandatory tool consumption so agent cannot reach CCATO state)
            │
            ▼
        qa gates code → merge → gate-fail rate drops in Tier-4 scorecard
```

No human in the loop. "Trust verification is the system's job." The signal chain reuses the existing anomaly-task-bridge pattern already deployed for infra signals.

---

## 7. Tiers 2–4 Roadmap (brief — not full spec)

### Tier 2 — Completeness

Generalize TNB's 6-layer citation check to all cowork narrative agents. Per-agent mandate → required-citation map (e.g. fb STEP 1b mandates `get_technical_indicators` for ≥15 tickers ⇒ each per-ticker callout must cite ≥1 indicator token OR carry a gate-verified null marker). Catches silent omission (agent neither cites nor says "no data" — just leaves it out). Tier 1 alone misses this class.

### Tier 3 — Vietnamese Language Gate

Two-stage, cheapest-first:
- **Stage 1 (deterministic):** `hunspell vi_VN` + curated misspelling blocklist seeded from observed defects (`bất chất→bất chấp`, `bảo bệ→bảo vệ`, `dự liệu→dữ liệu`) + expanded jargon table adding `forecast` and `macro` (both slipped `scripts/fb-jargon-gate.sh` 4a).
- **Stage 2 (LLM, second-pass only if Stage 1 clean):** lightweight grammar/sense check for incoherence the dictionary cannot catch. Runs only on pre-write body.

### Tier 4 — Per-Agent Calibration Scorecard

**One-line unblock (verified):** `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:413` hardcodes `agent_id: "08-prediction-synthesizer"` — so `avg_brier_by_agent` in `calibrationReportJob` collapses to one bucket today. Stamp the real author `agent_id` at claim creation (single line change in that file) to unblock the per-agent cut that is already ~80% built (store takes `agent_id`; `getClaimsByAgent` exists; job already `GROUP BY agent_id`).

**Gate-fail axis:** every Tier-1/2/3 FAIL emits a row keyed by `agent_id`; a weekly aggregation produces `gate_fail_rate by agent + trend_delta` in the existing `calibration_snapshots` shape. Makes CCATO regressions visible as trend, not just per-incident. Feeds the self-heal loop's prioritization (recurring = higher priority repair task).

---

## 8. Build / Ownership Chain

| Phase | Owner | Deliverables | Zone |
|-------|-------|-------------|------|
| This brief | agents-architect | `docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md` | — |
| Sprint mint | po | Task cards for Tier-1 (scripts/ + JSON + skill + flow .md wiring) | — |
| Tier-1 impl | dev-team / flow-tooling | `scripts/narrative-truth-gate.sh`, `docs/data/claim-tool-map.json`, `.claude/skills/claim-truth-gate/SKILL.md`, flow wiring in 5 agents + TNB | NOT apps/mcp-server |
| Tier-4 agent_id fix | dev-mcp-server | `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:413` | apps/mcp-server |
| QA gate | qa | Standard merge gate (bun test + DDD + mock-guard) | — |

**Tier-1 is entirely `scripts/` + `docs/agents/*/flow/*.md` + `docs/data/` + `.claude/skills/` — no `apps/mcp-server` change.** The only server-side change for Tier 1 is adding `"narrative_contradiction"` to the Zod signal_type enum if required; po determines whether this needs a Migration or is already covered by a string type.

---

## 9. Definition of Done (Tier-1)

The sprint is not complete until the following are demonstrated end-to-end:

**(a) Positive case — VNM CCATO:**
Feed `docs/social/fb-post-2026-06-30.md` body to `narrative-truth-gate.sh` → gate detects "không có dữ liệu kỹ thuật chi tiết phiên này" → maps to `get_technical_indicators(VNM)` → re-probes via `mcp__gateway__call_tool(server="vn-market", tool="get_technical_indicators", arguments={"code":"VNM"})` → returns RSI 20.3 → **exits non-zero** with report naming `VNM` + returned indicators. The post is blocked.

**(b) Positive case — foreign-flow CCATO:**
Line 10 of same post → "Dữ liệu dòng vốn ngoại chi tiết phiên này công cụ chưa trả được số từng mã" → maps to `get_foreign_flow` → re-probe returns per-ticker data → **exits non-zero**. Second independent FAIL.

**(c) Negative control (no false positive):**
A true honest-NULL claim where `get_technical_indicators` returns null for a ticker with insufficient OHLCV depth (consistent with `project_indicator_program_gated_on_ohlcv_depth`) → gate **returns exit 0** (PASS). No false positive.

**(d) Determinism:**
Identical input body → identical verdict on all runs (same session, different sessions). No non-deterministic tool state leaks into the verdict.

**(e) Wired and live:**
`narrative-truth-gate.sh` is invoked as STEP 4d in `docs/agents/fb-market-poster/flow/main.md` before the STEP 5 write. The 06-30 post would not have shipped with either CCATO instance present.

**(f) TNB backstop functional:**
TNB `audit-market.md` Step 2 calls the same `claim-truth-gate` skill on published dish body and flags MISMATCH via existing TNB emit path.

---

## 10. Relationship to Prevention

**Tier 1 = DETECTION.** It catches CCATO after the agent produces it and blocks the artifact. It does not stop the agent from forming the false negation.

**The structural PREVENTION is the IND-P1-MOMENTUM-CONSUMER-WIRING family:** make mandated tool calls and citation of their results an enforced part of each flow so the agent never reaches a state where it can plausibly claim "no data" when the tool has rows. That removes the failure at source.

**Two are complementary, not redundant:**
- Detection (Tier 1) is the cheap deterministic backstop active during the entire rollout window of prevention work and stays valuable forever as a regression guard.
- Detection's gate-fail signals (Tier-4 scorecard) prioritize which prevention wiring to build next: the recurring-CCATO loop turns failing agents into the prevention sprint backlog automatically.
- **Critical interaction with honest-NULL:** `project_indicator_program_gated_on_ohlcv_depth` documents that some deep indicators are legitimately NULL today. The gate's PASS-on-null property (§4.3 step 6) ensures detection and in-progress depth work coexist without false positives during rollout.

---

## Signal to Agent-Father

See `docs/signals/narrative-quality-ccato-gate-20260630T175058Z.json`.
