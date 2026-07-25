<!-- size-justification: ~167L — WEEKLY_RECAP Saturday sub-flow; main.md MODE ROUTER JUMPs here; +12L: PRIVACY GUARD pointer + STEP 3d privacy gate; three-section composition + gate-override docs + notebook format mandate the length; no prediction section. UC-CCA-P4 2026-07-23: +7L STEP 3e CLAIM-TRUTH GATE pointer (was ungated). FIX-FB-GATE-WEEKLY-FRAME-MODE 2026-07-25: STEP 3b replaced the manual "WEEKLY MODE OVERRIDE" procedure with a concrete --frame=weekly gate invocation (+8L net). -->
# FB Market Poster — Weekly Recap Flow (Saturday / WEEKLY_RECAP)

## SELF-IDENTITY GUARD
You are `fb-market-poster` executing **WEEKLY_RECAP** mode. Execute this flow end-to-end.
→ General rule: `docs/agents/fb-market-poster/flow/main.md` § SELF-IDENTITY GUARD (same override: you are a spawned subagent, not the router; execute your flow directly).

**Mode:** WEEKLY_RECAP — "Tổng kết tuần". Week-over-week summary of the week just ended.
**EXPLICITLY NO prediction for the coming week. NO "Dự đoán" section.**

→ **PRIVACY GUARD (SSOT: `main.md` § PRIVACY GUARD):** post is PUBLIC — no portfolio holdings, no personal positions, no PII. Pre-write gate enforced at STEP 3d below.

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`
> get_cycle_bootstrap exemption: fb-market-poster is rejected by that enum — use live tools only (same as `main.md` STEP 0 note).

## Input
Saturday cron fires: 13:07 UTC = 20:07 VN. `main.md` MODE ROUTER (VN_DOW=6) routes here.

## Output
`docs/social/fb-post-YYYY-MM-DD.md` (Saturday VN date). Plain Vietnamese, title "Tổng kết tuần".
`docs/agent-memory/notebooks/fb-market-poster.md` — cycle log (full overwrite, MODE=WEEKLY_RECAP).

---

## STEP 0 — Bootstrap

**STEP 0a — Publish-once dedup gate (WEEKLY_RECAP path)**

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

## STEP 1 — Read this week's daily posts and notebooks

Identify VN dates of Mon–Fri of the current VN week (Sat − 1..5 days).
For each day, read `docs/social/fb-post-{YYYY-MM-DD}.md` (guard: missing or <50 chars → log + skip).
Extract: VN-Index level + daily %, sector moves (direction + delta%), notable tickers, foreign flow summary. Hold as `$daily_posts[]`.

**Grounding check:** ≥3 posts must yield a VN-Index reading. If <3 → continue with available data + STEP 1b tools; log gaps. If 0 posts AND STEP 1b also fails → send_telegram(bug, "[fb-market-poster] WEEKLY_RECAP: no usable week data") → EXIT.

Also read (guard each — missing/< 50 chars → log + skip):
- `docs/agent-memory/notebooks/unified-agent.md` — week's CHEF outputs; key events, sector summaries.
- `docs/agent-memory/notebooks/news-scout.md` — week's top named news items.
- `docs/agent-memory/notebooks/market-watcher.md` — week's anomalies.

---

## STEP 1b — Live enrichment (Friday-close figures)

```
snapshot     = call_tool(server="vn-market", tool="get_market_snapshot",     arguments={})
market_ctx   = call_tool(server="vn-market", tool="get_market_context",      arguments={})
foreign_flow = call_tool(server="vn-market", tool="get_market_foreign_flow", arguments={})
macro        = call_tool(server="vn-market", tool="get_macro_snapshot",      arguments={})
```

**Date handling:** If snapshot dated Friday → authoritative week-end figure. If dated Saturday (weekend stale) → use Friday daily post as primary; note discrepancy.

**is_estimate / null rules (same as `main.md` STEP 1b):**
- `foreign_flow.net_bn = null` → state direction only, NO tỷ đồng amount.
- `macro.usdVndDelta = null` → "tỷ giá USD/VND đi ngang quanh {value}" — NOT "unfetchable".

Derive: week-end VN-Index + weekly delta vs prior Friday (if derivable from Monday's post or prior close), sector weekly performance, foreign net direction, top weekly movers across watchlist.

---

## STEP 2 — Compose weekly recap post

**Language:** Plain everyday Vietnamese. Same jargon rules as `main.md` STEP 3 (forbidden English terms table applies). Anti-filler rule applies: every sentence must name something specific.

**Section structure (MANDATORY order):**

### Tóm tắt nhanh (required — NO prediction)

1. **VN-Index week change:** Friday close vs prior Friday (if traceable) → weekly ±X điểm (±Y%) + direction. State honestly if prior-week close is unavailable.
2. **Best & worst sectors of the week:** ≥2 named sectors with direction + weekly delta%.
3. **Foreign flow net for the week:** direction (mua ròng / bán ròng); tỷ đồng only if `net_bn` non-null.
4. **Top movers of the week:** ≥5 named tickers with weekly % (from $daily_posts + live snapshot). Include direction for each.
5. **≥2 key named news/events of the week** (from news-scout notebook — named items, not generic placeholders like "tin tức trong nước").

### Phân tích (what changed this week)

One paragraph ≤5 sentences: what changed vs last week — regime shift, sector rotation, notable policy/macro event. Must name specific events, sectors, or tickers. No generic filler.

### Tổng kết (week conclusion — NO prediction)

≤3 sentences: what the week showed, overall market tone, what to watch as an observation only.
**Forbidden in this section:** "tuần tới dự đoán", "kỳ vọng tuần sau", "dự báo" — any forward-looking phrasing must be reframed as observation ("thị trường đang theo dõi X" ok; "tuần tới sẽ tăng" forbidden).

**Shared output rules (same as `main.md` STEP 3):**
- Disclaimer block verbatim at end (Vietnamese AI disclaimer — see `main.md` STEP 3 post template).
- Hashtag block: 5 mandatory tags exactly (`#chungkhoan #chungkhoanvietnam #vnindex #dautu #thitruongchungkhoan`), lowercase, no diacritics, immediately after closing `---`.
- 150–1300 words (body only, exclude header + separator lines).

**File header:**
```
# Thị trường chứng khoán Việt Nam — Tổng kết tuần {DATE}

_Được tạo bởi bot AI lúc {HH:MM} giờ Việt Nam_
```

---

## STEP 3 — Pre-write validation

### STEP 3a — Jargon gate (HARD-FAIL, REAL EXECUTION MANDATORY)
→ Execute identically to `main.md` STEP 4a (skill: `.claude/skills/fb-jargon-gate/SKILL.md`). Must run as real shell command; paste verbatim stdout in RETURN. Gate exit non-zero → block write, fix all [FAIL] lines, re-run.

### STEP 3b — Data-integrity gate — WEEKLY FRAME (FIX-FB-GATE-WEEKLY-FRAME-MODE)

Invoke `scripts/fb-data-integrity-gate.sh` with **`--frame=weekly`** — compares the
post's stated index moves against a WEEKLY close series (`get_price_history` REST
mirror), NOT the latest daily snapshot. This is what closes lesson L5 (2026-06-21
weekly "+1,84% w/w" false-blocked against that day's daily −0,32% snapshot) and
SUPERSEDES the former manual "WEEKLY MODE OVERRIDE" workaround this replaced. Under
`--frame=weekly`, Check-A (±7% daily price-limit) does not run at all — a per-session
exchange limit never applies to a week's cumulative move — so no override is needed.

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

### STEP 3c — Structural checks
- Disclaimer + hashtag block present (see STEP 2 rules).
- Section order: Tóm tắt nhanh → Phân tích → Tổng kết.
- NO prediction language in Tổng kết (scan for "tuần tới", "dự đoán", "kỳ vọng" → reframe as observation).
- 150–1300 words.

### STEP 3d — Privacy leakage gate (HARD-FAIL — no bypass)
→ Rule SSOT and full forbidden-token list: `main.md` § PRIVACY GUARD + STEP 4c.

LLM semantic scan of the full post body for personal portfolio language. WEEKLY_RECAP reads unified-agent and market-watcher notebooks — these may contain analyst context with personal framing.

**Forbidden tokens (scan verbatim and semantically):**
"danh mục của tôi", "tôi đang nắm/giữ/mua/bán", "vị thế của tôi", "tỷ trọng" + personal %, "giá vốn", "cost basis", "P&L", "lãi/lỗ của tôi".

**On violation:** Fix inline → replace with "cổ phiếu đáng chú ý" / "có thể tăng" / "cần thận trọng". If unresolvable → remove the claim. WRITE BLOCKED until clean. Unresolvable after fix → send_telegram(bug, "[fb-market-poster] PRIVACY GATE WEEKLY_RECAP: portfolio language detected") + EXIT.

Log "PRIVACY GATE: PASS" in RETURN block after clean scan.

### STEP 3e — CLAIM-TRUTH GATE (hard gate — last pre-write check)
→ Execute identically to `main.md` STEP 4d (skill: `.claude/skills/claim-truth-gate/SKILL.md`; `post_body` = composed weekly-recap post body from STEP 2; `agent_id` = "fb-market-poster"; non-real-time semantics per SKILL.md — persistent second-pass FAIL blocks the write; exit 2 = config-error → `send_telegram(channel="bug", message="[fb-market-poster] claim-truth-gate CONFIG ERROR")` + EXIT, never treat as PASS).

Log "CLAIM-TRUTH GATE: PASS" in RETURN block after clean pass (or "FAIL-corrected" / "BLOCKED" per outcome).

---

## STEP 4 — Write deliverable

DATE = Saturday VN date (UTC+7), YYYY-MM-DD.
Write to `docs/social/fb-post-{DATE}.md` using the file format in `main.md` STEP 5.
Verify/create `docs/social/fb-feedback.md` (same as `main.md` STEP 6).

---

## STEP 5 — Notification + session log

```
send_telegram(channel="work", message="[fb-market-poster] Weekly recap written: docs/social/fb-post-{DATE}.md (WEEKLY_RECAP)")

call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster", "id": $logId, "status": "completed",
  "summary": "Weekly recap post: docs/social/fb-post-{DATE}.md",
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
- Mode: WEEKLY_RECAP
- Post file: docs/social/fb-post-{DATE}.md
- Daily posts read: {N}/5 (Mon–Fri); data gaps: {list or none}
- Jargon gate: PASS (0 violations) | BLOCKED (N violations, post not written)
- Integrity gate (--frame=weekly): PASS | BLOCK (details: {details}) | SKIP
- Privacy gate: PASS | BLOCK (violations found and fixed: {details})
- Claim-truth gate: PASS | FAIL-corrected | BLOCKED
- Status: {published/failed}
## Known patterns
- WEEKLY_RECAP: gate runs with --frame=weekly — cumulative weekly % moves compared against the weekly close series, not the daily snapshot; Check-A (daily limit) does not apply
```

---

## RETURN

```
DONE: Weekly recap post for {DATE} (WEEKLY_RECAP) → docs/social/fb-post-{DATE}.md
NEXT: idle (user copy-pastes to Facebook Page manually)
PIPELINE: complete
MODE: WEEKLY_RECAP
QUALITY: full | partial — daily posts read: {N}/5; gaps: {list or none}
JARGON GATE: [paste verbatim stdout of fb-jargon-gate.sh]
INTEGRITY GATE (--frame=weekly): [PASS | BLOCK — {detail} | SKIP]
PRIVACY GATE: [PASS | BLOCK — violations found and fixed: {detail}]
CLAIM-TRUTH GATE: [PASS | FAIL-corrected | BLOCKED]
```
