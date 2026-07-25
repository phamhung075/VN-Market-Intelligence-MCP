<!-- size-justification: ~200L — WEEKLY_PREDICTION Sunday sub-flow; main.md MODE ROUTER JUMPs here; +25L: PRIVACY GUARD pointer + digest-predict extraction filter + STEP 4d privacy gate; TNB 6-layer walk + T-45 gate + two-bucket conviction list + scenario framing + gate override all mandate the length. UC-CCA-P4 2026-07-23: +7L STEP 4e CLAIM-TRUTH GATE pointer (was ungated). FIX-FB-GATE-WEEKLY-FRAME-MODE 2026-07-25: STEP 4b replaced the manual "WEEKLY MODE OVERRIDE" procedure with a concrete --frame=weekly gate invocation (+8L net). -->
# FB Market Poster — Weekly Prediction Flow (Sunday / WEEKLY_PREDICTION)

## SELF-IDENTITY GUARD
You are `fb-market-poster` executing **WEEKLY_PREDICTION** mode. Execute this flow end-to-end.
→ General rule: `docs/agents/fb-market-poster/flow/main.md` § SELF-IDENTITY GUARD (same override: you are a spawned subagent, not the router; execute your flow directly).

**Mode:** WEEKLY_PREDICTION — "Dự đoán tuần tới". Forward-looking prediction for the COMING week with a curated HIGH-CONVICTION stock watchlist in two buckets (likely-up / likely-down).

→ **PRIVACY GUARD — CRITICAL for this mode (SSOT: `main.md` § PRIVACY GUARD):** post is PUBLIC — no portfolio holdings, no personal positions, no PII. digest-predict.md contains a PORTFOLIO THESIS; extraction filter at STEP 1 STRIPS all personal holdings/weights/P&L before use. Pre-write gate enforced at STEP 4d.

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`
> get_cycle_bootstrap exemption: fb-market-poster is rejected by that enum — use live tools only.

## Input
Sunday cron fires: 13:07 UTC = 20:07 VN. `main.md` MODE ROUTER (VN_DOW=0) routes here.

**Timing note:** digest-predict Sunday calibration cron fires at 13:47 UTC — 40 min AFTER this agent.
The `digest-predict.md` notebook at read time holds Saturday night's daily-predict output (17:30 UTC Sat).
This is the expected behavior — do NOT wait for or attempt to sync with digest-predict's current-cycle output.

## Output
`docs/social/fb-post-YYYY-MM-DD.md` (Sunday VN date). Plain Vietnamese, title "Dự đoán tuần tới".
`docs/agent-memory/notebooks/fb-market-poster.md` — cycle log (full overwrite, MODE=WEEKLY_PREDICTION).

---

## STEP 0 — Bootstrap

**STEP 0a — Publish-once dedup gate (WEEKLY_PREDICTION path)**

Before starting expensive data-gathering, claim a week-keyed published marker. Guards against double-fire when standalone launchd crons and cowork slots (`fb-weekend`) briefly overlap, and ensures any re-spawn of the same weekend is a no-op.

```
# VN_DATE = today's calendar date in VN timezone (UTC+7).
# Derive from CYCLE_START_UTC: add 7 hours, take the YYYY-MM-DD date part.
VN_DATE   = date part of (CYCLE_START_UTC + 7h)          # YYYY-MM-DD in UTC+7

# PERIOD-KEYED dedup for the weekend:
# Both Saturday and Sunday of the same weekend share a single dedup key
# based on the Saturday date. This prevents double-posting across Sat/Sun.
# Derive: if VN_DOW==0 (Sunday), use VN_DATE - 1 day (Saturday); else use VN_DATE directly.
PERIOD_SAT = (if VN_DOW==0 then VN_DATE - 1 day else VN_DATE)  # Saturday of this weekend
DEDUP_KEY = "published:fb-weekend:" + PERIOD_SAT                # e.g. "published:fb-weekend:2026-06-27"

DEDUP_CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  "task_id":              DEDUP_KEY,
  "task_kind":            "cowork-slot",
  "owner_agent":          "fb-market-poster",
  "owner_client_session": $CLAUDE_CODE_SESSION_ID,
  "ttl_seconds":          100800
})
```

- `claimed: true` → first run for this weekend → proceed to `Log cycle start` below.
- `claimed: false` → already published for this weekend → send WORK notification and EXIT cleanly:

```
if DEDUP_CLAIM.claimed != true:
  call_tool(server="vn-market", tool="send_telegram", arguments={
    "channel": "work",
    "message": "[fb-market-poster] dedup: already published for weekend " + PERIOD_SAT + " (slot=fb-weekend) — skipping re-run"
  })
  EXIT with: "DONE: duplicate-weekend-fb-post blocked | already published for weekend=" + PERIOD_SAT + " | PIPELINE: no-op"
```

Log cycle start:
```
CYCLE_START_UTC = date -u +"%Y-%m-%dT%H:%M:%SZ"
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "status": "running"
})
```
Store returned `id` as `$logId`.

---

## STEP 1 — Read forward-looking sources

**PRIMARY — `docs/agent-memory/notebooks/digest-predict.md`** (Saturday daily-predict output; guard: missing/stale → proceed with remaining sources; log gap).

**EXTRACTION FILTER — PRIVACY GUARD enforcement (CRITICAL):**
digest-predict.md contains a PORTFOLIO THESIS with personal holdings, allocations/weights, cost basis, entry prices, and P&L.
- **READ ONLY** (permitted): market-level / forward-looking signals — direction calls, key VN-Index levels, sector rotation thesis, conviction on PUBLIC tickers (ticker name + directional bias + public reasoning).
- **STRIP and IGNORE** (forbidden from carrying into post): holdings counts/amounts, "my/our position", "danh mục của tôi", % allocations as portfolio weight, cost basis, entry prices, personal P&L figures, broker-specific data, capital amounts.
- NEVER let portfolio-thesis language pass through to `$prediction_inputs` or the post body.

Extract ONLY: coming-week direction call, key VN-Index levels, sector rotation thesis, ticker-level conviction bias + public reasoning, calibrated probabilities.

Also read (guard each — missing/< 50 chars → log + skip):
- `docs/agent-memory/notebooks/unified-agent.md` — CHEF outlook/conviction section; look for "dự báo", "tuần tới", "kỳ vọng", "outlook". Re-check the LATEST entry.
- `docs/agent-memory/notebooks/market-watcher.md` — week-end anomalies, persistent signals.
- Up to 2 `docs/analysis-briefs/*.md` — tickers flagged in CHEF as key movers. Extract forward calls.

Hold extracted forward signals as `$prediction_inputs`.

**Grounding check:** At least one source must yield a directional signal (tăng/giảm/tích lũy/đi ngang) OR live STEP 1b tools produce usable data. If all sources empty AND tools fail → send_telegram(bug, "[fb-market-poster] WEEKLY_PREDICTION: no usable prediction data") → EXIT.

---

## STEP 1b — Live enrichment

```
snapshot       = call_tool(server="vn-market", tool="get_market_snapshot",      arguments={})
market_context = call_tool(server="vn-market", tool="get_market_context",       arguments={})
foreign_flow   = call_tool(server="vn-market", tool="get_market_foreign_flow",  arguments={})
macro          = call_tool(server="vn-market", tool="get_macro_snapshot",       arguments={})
legal_risk     = call_tool(server="vn-market", tool="get_legal_risk_signals",   arguments={})
```

For each high-conviction ticker candidate (from $prediction_inputs + watchlist tickers):
```
ticker_intel = call_tool(server="vn-market", tool="get_ticker_intelligence",  arguments={"code": ticker})
tech_ind     = call_tool(server="vn-market", tool="get_technical_indicators", arguments={"code": ticker})
```
Per-call errors: mark that ticker `data_quality = NO_TA` (same rule as `main.md` STEP 1b).
**data_quality=NO_TA ⇒ verdict MUST be QUAN_SAT only** (never MUA_TICH_LUY or GIAM_TY_TRONG without TA).

**is_estimate / null rules (same as `main.md` STEP 1b):**
- `foreign_flow.net_bn = null` → direction only, NO tỷ đồng amount.
- `macro.usdVndDelta = null` → "tỷ giá USD/VND đi ngang quanh {value}" — NOT "unfetchable".
- Store `$carry_usable = (macro.carry.is_estimate==false AND macro.carry.carrySpread != null)`.

---

## STEP 2 — TNB 6-Layer Walk + T-45 Adversarial Gate

**Reference:** Execute the TNB 6-Layer Walk as defined in `main.md` STEP 2b, and the T-45 Adversarial Gate as defined in `main.md` STEP 2c. Store results as `$tnb_synthesis` and `$t45_audit[]`.

**WEEKLY_PREDICTION adaptations to the standard walk:**
- Layer 1 (clock): orient to incoming week macro events + macro calendar if available.
- Layer 3 (regime): label the expected regime for the COMING week, not retrospective.
- Layer 4 (sector rotation): "INTO / OUT OF" claims = expected next-week direction, not last-week observation.
- Layer 5 (conviction): per-ticker records keyed on next-week expected direction; `watch_zone` = price zone for next-week entry/exit.

**HIGH-CONVICTION FILTER (non-negotiable):**
Retain ONLY tickers where conviction=cao AND T-45 gate survives all 5 rules (T1–T5).
DROP trung_binh and thap convictions from the post's stock lists.
If few survive, list few — do NOT pad. The post lists only "most sure" names.
All 5 T-45 hard-fail rules apply identically (cross-ticker contamination, false-precision levels, is_estimate-as-fact, noise-scale flow, internal contradiction).

---

## STEP 3 — Compose weekly prediction post

**Language:** Plain everyday Vietnamese. Same jargon rules as `main.md` STEP 3 (forbidden English terms table applies; jargon gate enforced at STEP 4a).

**Section structure (MANDATORY order — Dự đoán is THE main section):**

### Tóm tắt nhanh (brief context — KEEP SHORT, ≤3 sentences)

Week-ending VN-Index direction + level from STEP 1b. Macro context summary for coming week. Do NOT editorialize here.

### Phân tích (coming week setup — ≤5 sentences)

Regime narrative + what creates the coming week's setup. Source: `$tnb_synthesis.regime` + Layer 4 sector rotation. Must name specific sectors and supporting evidence. No generic filler.

### Dự đoán (THE main section — LONGEST)

**Required content:**

1. **Market direction call** for the coming week: tăng / giảm / tích lũy / đi ngang. Must trace to Phân tích reasoning (earned-prediction rule from `main.md` STEP 4 check 7).

2. **VN-Index key levels** to watch — only levels traceable to `get_technical_indicators` or `get_market_context` from this run. No carry-forward from prior sessions (T-45 Rule T2).

3. **Two conviction buckets** (T-45 survivors, conviction=cao only — "most sure" names):

   **"Có thể tăng" (likely-up):**
   Per ticker: name + 1-line reason + "nếu {condition} thì {action}" + "Rủi ro: {main risk}".
   `data_quality=NO_TA` → append "(không có dữ liệu kỹ thuật phiên này)" after verdict.
   If NO ticker survives T-45 for this bucket → state plainly: "Tuần này chưa có tín hiệu mua tích lũy rõ ràng — đây là tuần quan sát." Do NOT manufacture calls.

   **"Cần thận trọng / có thể giảm" (likely-down):**
   Per ticker: name + 1-line reason + "nếu {condition} thì {action}".
   Same data_quality and empty-bucket rules apply.

4. **≥1 if-then scenario** for the week (bull and/or bear): "Nếu {X} thì {outcome A}; nếu {Y} thì {outcome B}." Must be grounded in today's Phân tích.

**Known-gaps pass-through (same as `main.md` STEP 3 Section 3):**
- `foreign_net_tybillion = null` → direction only, no tỷ đồng amount.
- `carry_usable = false` → NO carry/FII spread thesis in prediction.
- `breadth = null` → acknowledge explicitly, never fabricate.

**Shared output rules (same as `main.md` STEP 3):**
- Disclaimer block verbatim at end (Vietnamese AI disclaimer).
- Hashtag block: 5 mandatory tags (`#chungkhoan #chungkhoanvietnam #vnindex #dautu #thitruongchungkhoan`), space-separated, lowercase, no diacritics, immediately after closing `---`.
- 150–1300 words. Dự đoán must be LONGEST section. Trim Tóm tắt if needed, never Dự đoán.

**Post title line:** `# Thị trường chứng khoán Việt Nam — Dự đoán tuần tới {DATE}`

---

## STEP 4 — Pre-write validation

### STEP 4a — Jargon gate (HARD-FAIL, REAL EXECUTION MANDATORY)
→ Execute identically to `main.md` STEP 4a (skill: `.claude/skills/fb-jargon-gate/SKILL.md`). Must run as real shell command; paste verbatim stdout in RETURN. Gate exit non-zero → block write, fix all [FAIL] lines, re-run.

### STEP 4b — Data-integrity gate — WEEKLY FRAME (FIX-FB-GATE-WEEKLY-FRAME-MODE)

Invoke `scripts/fb-data-integrity-gate.sh` with **`--frame=weekly`** — compares the
post's stated index moves against a WEEKLY close series (`get_price_history` REST
mirror), NOT the latest daily snapshot. SUPERSEDES the former manual "WEEKLY MODE
OVERRIDE" workaround this replaced. Under `--frame=weekly`, Check-A (±7% daily
price-limit) does not run at all — prediction posts citing forward-looking or
weekly-cumulative % ranges never trip it, so no override is needed.

```bash
TMPFILE=$(mktemp /tmp/fb-post-integrity-weekly-XXXXXX.txt)
printf '%s' "$POST_BODY" > "$TMPFILE"
bash scripts/fb-data-integrity-gate.sh --frame=weekly "$TMPFILE" "$DATE"
INTEGRITY_EXIT=$?
rm -f "$TMPFILE"
```
Paste the VERBATIM one-line gate stdout into the RETURN block.

Same bounded-retry (max 2 fix rounds), Check-C "bán tháo" negation-blind false-positive
handling, and EXIT-only-on-real-fabrication posture as `main.md` STEP 4b.

### STEP 4c — Structural checks
- Disclaimer + hashtag block present (see STEP 3 rules).
- Section order: Tóm tắt nhanh → Phân tích → Dự đoán.
- Dự đoán is LONGEST section (word count > Tóm tắt; trim Tóm tắt if needed).
- Both conviction buckets present (or honest "chưa có tín hiệu" for empty buckets).
- ≥1 if-then scenario present in Dự đoán.
- Earned-prediction check: every Dự đoán claim traces to a Phân tích fact.
- 150–1300 words.

### STEP 4d — Privacy leakage gate (HARD-FAIL — extra emphasis on this mode)
→ Rule SSOT and full forbidden-token list: `main.md` § PRIVACY GUARD + STEP 4c.
→ Extraction filter at STEP 1 already stripped holdings from $prediction_inputs. This gate confirms nothing leaked through into the composed post body.

LLM semantic scan of the FULL post body. Pay special attention to the Dự đoán conviction buckets — personal position framing is most likely to leak there from digest-predict.md portfolio thesis language.

**Forbidden tokens (scan verbatim and semantically):**
"danh mục của tôi", "cổ phiếu tôi đang nắm", "tôi đang mua/bán/giữ", "vị thế của tôi",
"tỷ trọng" + personal %, "giá vốn", "chi phí vốn", "cost basis", "P&L", "lãi/lỗ của tôi",
"portfolio thesis" (English leakage), any capital/account amount framed as personal.

**Conviction bucket check:** Each entry in "Có thể tăng" and "Cần thận trọng" must be framed as:
- "cổ phiếu đáng chú ý", "có thể tăng", "cần thận trọng", "thị trường đang theo dõi X"
- NOT: "tôi đang nắm X", "cổ phiếu trong danh mục của tôi"

**On violation:** Fix inline → replace with public-market framing. If unresolvable → remove the claim entirely. WRITE BLOCKED until clean. Unresolvable after fix → send_telegram(bug, "[fb-market-poster] PRIVACY GATE WEEKLY_PREDICTION: portfolio language detected") + EXIT.

Log "PRIVACY GATE: PASS" in RETURN block after clean scan.

### STEP 4e — CLAIM-TRUTH GATE (hard gate — last pre-write check)
→ Execute identically to `main.md` STEP 4d (skill: `.claude/skills/claim-truth-gate/SKILL.md`; `post_body` = composed weekly-prediction post body from STEP 3; `agent_id` = "fb-market-poster"; non-real-time semantics per SKILL.md — persistent second-pass FAIL blocks the write; exit 2 = config-error → `send_telegram(channel="bug", message="[fb-market-poster] claim-truth-gate CONFIG ERROR")` + EXIT, never treat as PASS).

Log "CLAIM-TRUTH GATE: PASS" in RETURN block after clean pass (or "FAIL-corrected" / "BLOCKED" per outcome).

---

## STEP 5 — Write deliverable

DATE = Sunday VN date (UTC+7), YYYY-MM-DD.
Write to `docs/social/fb-post-{DATE}.md` using the file format in `main.md` STEP 5.
Verify/create `docs/social/fb-feedback.md` (same as `main.md` STEP 6).

---

## STEP 6 — Notification + session log

```
send_telegram(channel="work", message="[fb-market-poster] Weekly prediction written: docs/social/fb-post-{DATE}.md (WEEKLY_PREDICTION)")

call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster", "id": $logId, "status": "completed",
  "summary": "Weekly prediction post: docs/social/fb-post-{DATE}.md",
  "actions": ["wrote docs/social/fb-post-{DATE}.md"]
})
```

Write notebook (full overwrite) → skill: `.claude/skills/notebook-write/SKILL.md`

Notebook entry:
```markdown
# FB Market Poster — Notebook
**Last updated:** {DATETIME} UTC
## Last cycle
- Date: {DATE}
- Mode: WEEKLY_PREDICTION
- Post file: docs/social/fb-post-{DATE}.md
- Primary source (digest-predict.md): available={yes/no}; dated: {date of notebook entry}
- TNB synthesis: clock_phase={value}, regime={value}, regime_confidence={HIGH/MEDIUM/LOW}
- Conviction calls: {N} total; T-45 survivors: {N}; Có thể tăng: {N tickers}; Cần thận trọng: {N tickers}
- T45_AUDIT: {N} checked; {N} dropped; {N} softened
- known_gaps: breadth={null/value}, foreign_net_tybillion={null/value}, carry_usable={true/false}
- Jargon gate: PASS (0 violations) | BLOCKED (N violations, post not written)
- Integrity gate (--frame=weekly): PASS | BLOCK (details: {details}) | SKIP
- Claim-truth gate: PASS | FAIL-corrected | BLOCKED
- Status: {published/failed}
## Known patterns
- WEEKLY_PREDICTION: gate runs with --frame=weekly — cumulative/forward weekly figures compared against the weekly close series, not the daily snapshot; Check-A (daily limit) does not apply
- WEEKLY_PREDICTION: digest-predict.md contains Sat daily-predict (17:30 UTC), not same-day Sunday calibration
- data_quality=NO_TA → verdict must be QUAN_SAT only
```

---

## RETURN

```
DONE: Weekly prediction post for {DATE} (WEEKLY_PREDICTION) → docs/social/fb-post-{DATE}.md
NEXT: idle (user copy-pastes to Facebook Page manually)
PIPELINE: complete
MODE: WEEKLY_PREDICTION
QUALITY: full | partial
SYNTHESIS: clock_phase={value} / regime={value} / regime_confidence={HIGH/MEDIUM/LOW}
T45_AUDIT: {N} claims checked; {N} dropped; {N} softened
CONVICTION: Có thể tăng: {N tickers}; Cần thận trọng: {N tickers}
JARGON GATE: [paste verbatim stdout of fb-jargon-gate.sh]
INTEGRITY GATE (--frame=weekly): [PASS | BLOCK — {detail} | SKIP]
PRIVACY GATE: [PASS | BLOCK — violations found and fixed: {detail}]
CLAIM-TRUTH GATE: [PASS | FAIL-corrected | BLOCKED]
```
