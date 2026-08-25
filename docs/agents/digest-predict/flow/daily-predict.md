# Digest & Predict — Daily Prediction Synthesis (17:30 UTC / 00:30 VN)

**Tools:** `docs/agents/tools/package/digest-predict.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
`get_calibration_report()` | watchlist evidence summaries

## Output
Up to 3 prediction claims created | WORK notified | session log

---

**0. Bootstrap + Regime** → skill: `.claude/skills/step-0-cowork/SKILL.md` (replace `<agent-id>` with `digest-predict`) — § 0b-0c only (this flow does not read notebook carry-over at Step 0a)
Variables: REGIME, DAMPENING_ACTIVE

Parse `get_macro_snapshot` text block in bootstrap:
```
REGIME = "Global Liquidity: X" → TIGHTENING | EASING | NEUTRAL
```
If `get_macro_snapshot` not in bootstrap → call it once now.
`REGIME=TIGHTENING` → `DAMPENING_ACTIVE=true` (regardless of calibration) + append to P-8 WORK: `"Thiên Thời TIGHTENING — xác suất tự động giảm 10%."`
Note: does NOT skip predictions entirely — predictions are still useful in TIGHTENING, but with lower confidence.

**P-0. Self-assessment** `get_calibration_report()`
- "No calibration data" → proceed normally
- "degrading" AND `trend_delta > 0.05` → `DAMPENING_ACTIVE=true`, apply `final_confidence = min(0.95, max(0.05, computed * 0.90))`
- Improving/stable → proceed normally
`log_agent_work(agent_name="digest-predict", status="running", summary="Self-assessment: {status}. Dampening: {yes/no}.")` — `agent_name`/`status` are REQUIRED on the live tool (verified 2026-08-13, prior prose omitted them); capture the returned `id` and pass it to the P-7 `status="completed"` call below to close the same session record.

**P-1.** `get_watchlist()`

**P-2. Prerequisite** `get_evidence_summary(stock)` for ≥1 ticker
All "No evidence" → `send_telegram(channel="work", message="[digest-predict] Daily prediction skipped: zero evidence.")` → EXIT

**P-2.5. Market indicators context** (MANDATORY — run BEFORE P-3 evidence gathering; duplicate "P-3" label on this step and the next confirmed live 2026-08-25 to have contributed to it being skipped entirely for one cycle — renumbered to remove the ambiguity, no step content changed):
```
call_tool(server="vn-market", tool="get_volatility_indicators", arguments={})
call_tool(server="vn-market", tool="get_breadth_thrust", arguments={})
call_tool(server="vn-market", tool="get_roc_momentum", arguments={})
call_tool(server="vn-market", tool="get_relative_strength", arguments={})
call_tool(server="vn-market", tool="get_52w_proximity", arguments={})
call_tool(server="vn-market", tool="get_insider_sentiment", arguments={})
```
If successful: extract volatility regime (rv_10/20/60d, GK vol), breadth indicators (McClellan/Zweig), momentum indicators (roc, z_score, decile), relative strength metrics (rs, percentile, composite_score), 52-week proximity (pct_from_52w_high, pct_from_52w_low), and insider sentiment (net_sentiment_score). Use to contextualize individual ticker predictions (e.g., if market volatility is elevated or breadth is weakening, adjust confidence; if momentum strong or positioning near 52w-low with rising momentum, increase conviction for recovery thesis; if insider buying concentration correlates with bullish evidence, boost confidence). If any tool returns NULL or error: log `[SKIP] <tool_name> unavailable` and continue with ticker-level evidence only (no market context).

**P-3. Evidence** per ticker `get_evidence_summary(stock)`
Skip "No evidence" | parse: `bullish_score`, `bearish_score`, `neutral_score`, likelihood ratios

**P-4. High-conviction** filter: `bullish_score > 0.6` OR `bearish_score > 0.6`
→ `get_bctc_full(code=stock)` (param name is `code`, NOT `stock` — verified live 2026-08-13, prior prose caused an invalid_type call) | `get_market_snapshot()`

If qualify_count == 0:
  `send_telegram(channel="work", message="[digest-predict] Daily prediction NO-OP {DATE}: zero tickers above conviction threshold. No claims created.")`
  EXIT cleanly — this is correct behavior, not an error.

**P-5. Claims** — DAILY CAP = 3 — >3 qualify → rank by `|bullish - bearish|` descending → top 3

Probability: `min(0.95, max(0.05, score * top_likelihood_ratio))`
- `sample_size < 10` → untrusted → `top_likelihood_ratio = 1.0`
- `DAMPENING_ACTIVE` → `final_confidence = min(0.95, max(0.05, computed * 0.90))`

Horizon:
| delta | horizon_days |
|-------|-------------|
| ≥ 0.5 | 5 |
| ≥ 0.3 | 10 |
| < 0.3 | 20 |

`claim_text` Vietnamese full diacritics.
`resolution_criteria` valid JSON:
```json
{"metric":"price_close","operator":">","value":80000,"currency":"VND","description":"..."}
```

**P-5.5 — CLAIM-TRUTH GATE (hard gate before claim persistence)**

→ skill: `.claude/skills/claim-truth-gate/SKILL.md`

Before any `create_prediction_claim()` persists a claim, run the gate on each `claim_text` to detect CCATO (Claim Contradicts Authorized Tool Output).

Invoke (Path A — MCP-native, this agent's default per SKILL.md; per each candidate claim):
```
GATE_VERDICT = call_tool(server="vn-market", tool="narrative_truth_gate", arguments={
  post_body: <claim_text for this ticker>,
  agent_id:  "digest-predict",
  cache:     <this cycle's tool-call results, or {} — Zod .optional() rejects literal null (invalid_type), verified live 2026-08-24>
})
```

**Verdict handling** (`GATE_VERDICT` = first line of the tool response text; see SKILL.md Verdict contract):
- `PASS` → proceed to create_prediction_claim call for this ticker.
- `FAIL (N contradiction(s))` — contradiction detected; signal emitted server-side to `po`. Self-correct:
  1. Call the named tool directly.
  2. Rewrite `claim_text` using real returned values.
  3. Re-run this skill on the rewritten claim_text.
  4. Second-pass PASS → proceed to create_prediction_claim.
  5. Second-pass FAIL (rewritten `claim_text` still classified NON_NULL/contradiction by the gate — this covers BOTH a genuine tool error and a live tool response that simply doesn't match a `tool_null_markers` string, e.g. "PDF downloaded but not yet extracted" — confirmed live 2026-08-22, SHB/compare_financials) → DROP this ticker from P-5 (do not file a claim built on a false negation, and do not attempt a 3rd rewrite to dodge the negation-lexicon match); write honest gap note in digest and continue to next ticker.
- `CONFIG_ERROR: <reason>` (`isError:true` on response) → fail-loud: `send_telegram(channel="bug", message="[digest-predict] claim-truth-gate CONFIG ERROR")` and EXIT.

**Signal:** Tool fires `narrative_contradiction` server-side on FAIL. Do NOT suppress it.

**P-5a — Published-marker gate (Phase 2 — commit point, MANDATORY) →**
skill: `.claude/skills/published-marker-gate/SKILL.md` (agent-id=digest-predict).

<!-- UC-CCA-P3-FR3-DIGEST-PREDICT (agent-father, 2026-08-14): this is the REAL landing site for
     the daily-path Phase-2 claim — NOT docs/agents/digest-predict/flow/daily.md, which the
     original architecture brief anchored on. daily.md is dead/unrouted (main.md's dispatch
     table routes the daily window to THIS file; confirmed by docs/architecture-briefs/
     2026-07-12-ultracode-workflow-improvement-audit.md's own "git rm daily.md" recommendation,
     never executed). This flow's own irreversible publish action is `create_prediction_claim()`
     below (a DB write, not a send_telegram — same class as fb-market-poster's file-Write
     publish action, see brief §1.1), so the marker gates the WHOLE daily claims batch under one
     key, same pattern as chef.md Step 0.5 gating a whole dish under one key: claim ONCE before
     the P-5 loop, not once per ticker. `MARKER_KEY` is the exact value main.md's Step pre-D
     Phase-1 probe computed (`"published:digest-daily:" + UTC_DATE`), carried forward as session
     state — do NOT recompute UTC_DATE here. -->

```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              MARKER_KEY,   # "published:digest-daily:" + UTC_DATE, from main.md Step pre-D
  task_kind:            "cowork-slot",
  owner_agent:          "digest-predict",
  owner_client_session: <coordination session UUID from spawn prompt, or fallback — REQUIRED>,
  ttl_seconds:          86400   # 24h — daily slot, matches main.md Step pre-D's original TTL
})

if CLAIM.claimed != true:
  log "[digest-predict] daily-predict publish blocked (Phase-2 claim) — already published date=" + UTC_DATE
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # a peer claimed between main.md's Phase-1 probe and this Phase-2 claim — do NOT create any claims.
```

If `claimed == true`: proceed immediately to the P-5 claim-creation loop below. NEVER call
`task_release` on success or any exit after this point — a partial batch (e.g. 1 of 3 claims
created before a mid-loop failure) still leaves the marker held; TTL is the sole expiry path.

For each qualifying ticker (bullish_score > 0.6 OR bearish_score > 0.6):
  Run P-5.5 gate on claim_text
  If PASS:
    `create_prediction_claim(stock, claim_text, probability, horizon_days, resolution_criteria, direction?, expected_move_pct?)`
    — `direction`/`expected_move_pct` are OPTIONAL (only affect the computed `target_price`); `creation_price` is
    ALWAYS captured server-side from the latest `daily_ohlcv` close regardless of whether they are supplied
    (FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT, 2026-07-25 — a ticker with no OHLCV data is REJECTED
    outright, never silently persisted scoreless). Passing `direction` (bullish/bearish, derived from the
    same bullish_score/bearish_score used for the qualifying-ticker check above) is RECOMMENDED where known —
    it costs nothing and additionally populates `target_price` — but omitting it is no longer a data-quality bug.
  If FAIL second-pass:
    Skip claim creation for this ticker; log as honest-gap in digest (e.g., "[SKIP] VCB claim contradicts 52w data — re-evaluated, unresolved")

**P-6. Notebook write** — APPEND class → skill: `.claude/skills/notebook-write/SKILL.md` (AC-1 dated `## ` section; AC-2 3-section retention; AC-5 gate; AC-4 blank-state fallback)

Section template — level-2 `## ` heading, ≤10L (`### ` is INVISIBLE to
`notebook-auto-prune.sh`'s `^## ` boundary parser — never use `### ` for this heading):
```
## <YYYY-MM-DD>T<HH:MM>Z Daily Predictions
- Calibration: [status], delta: [value] | Claims: N | Dampening: [yes/no]
```
**RETIRED (root cause of CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT, do
not reproduce):** cycles 07-12→08-22 appended a dated bullet to ONE permanent, undated
`## Known patterns / preferences` heading instead of opening a `## ` section per cycle. An
undated heading sorts to the pruner's MAX sentinel key — permanently exempt from
drop-oldest selection yet still byte-counted, so `section_count` stayed pinned at 1 and the
hook could only safe-fail (`notebook_single_section_overage_breach`, no truncation —
correct hook behavior, not a hook defect). Every cycle forward opens its OWN `## ` section
per the template above. Migrating existing history to
`docs/agent-memory/notebooks/archive/digest-predict-*.md` is separate, tracked work on the
same board row (next_agent=claude-manager-helper) — not done from this flow.
**Tool constraint:** `never_use_write_tool: true` (init.md) → land via `Edit` only: (1)
append — `Edit(old_string=<current last line>, new_string=<same>+"\n\n"+<new section>)`;
(2) retention (AC-2) — WHILE `## ` count (post-append) > 3: `Edit(old_string=<exact oldest
## block, heading→line-before-next-##-or-EOF>, new_string="")`, recount, repeat.

**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/digest-predict.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/digest-predict.md
git commit -m "chore(memory/digest-predict): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/digest-predict.md
```
**No-Bash sessions (recurring — categorical, no Bash tool bound; ≥13 consecutive cycles
07-31→08-13):** this commit step cannot run at all (`git` requires Bash). Skip it, note
in the notebook bullet that the file is left uncommitted this cycle, and rely on a
future Bash-capable cycle/dispatcher to commit — do not fabricate a commit that did not
happen.

**P-7.** `log_agent_work(agent_name="digest-predict", id=<id from P-0's running call>, status="completed", summary="Created {N} daily claims for {TICKERS}. Horizons: {5d:X,10d:Y,20d:Z}. Avg: {avg}. Dampening: {yes/no}.")`

**P-8. WORK**: `send_telegram(channel="work", message="[digest-predict] Daily claims {DATE}: {N}\n- {TICKER}: {claim_text} (p={prob}, {horizon}d)\n...")`
`DAMPENING_ACTIVE` → append "Self-correction: confidence -10%."

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`
