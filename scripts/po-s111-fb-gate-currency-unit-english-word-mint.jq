# po-s111-fb-gate-currency-unit-english-word-mint.jq
# ──────────────────────────────────────────────────────────────────────────────
# Single-pass dual-MINT (idempotent) — two NEW defect classes from the
# 2026-06-22 week-ahead FB post that passed BOTH gates (jargon + data-integrity,
# exit 0) yet were real errors caught only by router manual review. Both extend the
# DONE FIX-FB-POST-DATA-INTEGRITY-GATE and the OPEN epic AUDIT-FB-GATE-PROSE-HARDENING.
#
#   LESSON 7 (P1, DANGEROUS) — VN stock price quoted in USD ("1,84 USD/VHM",
#     "TÍCH LŨY vào vùng 22–24 USD" for banks). VN equities are VND-only. Bad units
#     lived in prediction/watchlist PROSE, not the parsed per-ticker recap line, so
#     the data-integrity gate missed them. FIX → new Check-F currency-unit guard in
#     scripts/fb-data-integrity-gate.sh (reuse Check-E's system-map.json ticker list).
#   LESSON 8 (P2) — English word "ground" leaked past scripts/fb-jargon-gate.sh
#     ("chưa lấy lại toàn bộ ground"). FIX → broaden jargon-gate to flag stray
#     Latin-script English content-words in the VN prose body, whitelist-guarded.
#
# Both: type FIX, owner developer, zone scripts/, status BACKLOG (matches the epic's
# existing children which all sit in backlog as BACKLOG), epic AUDIT-FB-GATE-PROSE-HARDENING.
#
# M1: id-guarded append of FIX-FB-GATE-CURRENCY-UNIT-GUARD → .task_board.backlog[]
# M2: id-guarded append of FIX-FB-JARGON-ENGLISH-WORD-LEAK → .task_board.backlog[]
# M3: register both ids in the epic object's .tasks[] (active_sprints[idx], marker-guarded)
#
# Idempotent: each mint skipped if its id is already present in ANY board lane; epic
# registration skipped if the id is already in .tasks[]. Re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s111-fb-gate-currency-unit-english-word-mint.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.tmp \
#     && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#     && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# (commit orch-state by EXPLICIT PATH; PUSH HELD — PO's deferred call)
# ──────────────────────────────────────────────────────────────────────────────

# ── all ids currently on the board (every lane) ──────────────────────────────
([.task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa,.archive)
  | if type=="array" then .[] else empty end | .id? ] | map(select(.))) as $existing_ids
|

# ── M1: currency-unit guard (LESSON 7, P1) ───────────────────────────────────
def t_currency:
  {
    id: "FIX-FB-GATE-CURRENCY-UNIT-GUARD",
    title: "Add Check-F currency-unit guard to fb-data-integrity-gate.sh — BLOCK VN stock price quoted in USD",
    type: "FIX",
    size: "S",
    status: "BACKLOG",
    priority: "P1",
    owner: "developer",
    epic: "AUDIT-FB-GATE-PROSE-HARDENING",
    zone: "scripts/",
    depends: [],
    extends: ["FIX-FB-POST-DATA-INTEGRITY-GATE"],
    opened_at: $now,
    opened_by: "po-s111",
    root_cause: "2026-06-22 week-ahead FB post quoted VN equities in USD — \"Nếu giữ trên 1,84 USD/VHM\" and \"TÍCH LŨY ngay vào vùng 22–24 USD\" for banks. VN equities are VND-only (VHM 145.300đ, ACB 22.200đ). The post grabbed thousand-VND magnitudes and appended USD → telling readers to buy banks at 22–24 USD is catastrophically misleading. The data-integrity gate (Checks A-E) parses the per-ticker RECAP line only; the bad units lived in the prediction/watchlist PROSE, so exit 0 (false-green).",
    fix_spec: "New Check-F currency-unit guard in scripts/fb-data-integrity-gate.sh: BLOCK if a USD or $ token appears adjacent (within ~20 chars) to a watchlist ticker OR to a stock-price-magnitude number, EXCEPT whitelisted macro uses: USD/VND tỷ giá, gold USD/oz, Brent USD/thùng|USD/barrel. Magnitude sanity: a price < ~1000 labelled USD adjacent to a HOSE ticker is almost certainly a VND-as-USD error → BLOCK. REUSE the system-map.json watchlist ticker list already loaded by Check-E (SYSTEM_MAP_PATH / .project.watchlist) — do NOT hardcode tickers. Must EXIT NON-ZERO on BLOCK (log_block).",
    generic_mandate: "Guard keys on the SSOT watchlist + a generic price-magnitude regex + a macro-use whitelist — never a per-ticker hardcode. Applies to ALL watchlist tickers and any future ticker added to system-map.json.",
    verification_gate: "Feed the 2026-06-22 post text (USD-on-VHM + 22–24 USD banks) → Check-F EXIT NON-ZERO. Feed a clean post with whitelisted macro USD uses (USD/VND, USD/oz, USD/thùng) → exit 0 (no false-positive). Run from repo root.",
    note: "P1 DANGEROUS (misleading buy-advice). Extends DONE FIX-FB-POST-DATA-INTEGRITY-GATE; sibling under epic AUDIT-FB-GATE-PROSE-HARDENING (epic's Check-E task FIX-FB-GATE-SECTOR-NAME-VALIDATOR in REVIEW, commit eceee94a — Check-F reuses its ticker-load pattern)."
  };

# ── M2: English-word leak (LESSON 8, P2) ─────────────────────────────────────
def t_english:
  {
    id: "FIX-FB-JARGON-ENGLISH-WORD-LEAK",
    title: "Broaden fb-jargon-gate.sh — flag stray Latin-script English content-words in VN prose body",
    type: "FIX",
    size: "S",
    status: "BACKLOG",
    priority: "P2",
    owner: "developer",
    epic: "AUDIT-FB-GATE-PROSE-HARDENING",
    zone: "scripts/",
    depends: [],
    extends: ["FIX-FB-POST-DATA-INTEGRITY-GATE"],
    opened_at: $now,
    opened_by: "po-s111",
    root_cause: "2026-06-22 week-ahead FB post contained \"chưa lấy lại toàn bộ ground\" — the English word \"ground\" in a plain-Vietnamese post. scripts/fb-jargon-gate.sh passed it (exit 0) because its detection is a FIXED English-term blocklist that did not include \"ground\".",
    fix_spec: "Broaden scripts/fb-jargon-gate.sh: instead of ONLY a fixed blocklist, flag Latin-script English content-words appearing in the Vietnamese prose body, allowing a WHITELIST of accepted tokens (ticker symbols, USD/VND, EPS, P/E, Fed, Brent, oz, etc.). Goal: catch stray English like \"ground\", \"selloff\", \"breakout\" not in the current list. Keep false-positives low via the whitelist. Distinguish from existing blocklist (additive, not a replacement).",
    generic_mandate: "Detect by Latin-English-content-word heuristic + whitelist, not by enumerating every bad word — catches NOVEL leaks. Whitelist is the single tuning surface (extendable without code change where practical).",
    verification_gate: "Feed a post containing \"ground\" / \"selloff\" / \"breakout\" in VN prose → jargon-gate EXIT NON-ZERO. Feed a clean VN post with whitelisted tokens (tickers, USD/VND, EPS, P/E, Fed, Brent) → exit 0 (no false-positive).",
    note: "P2. Extends DONE FIX-FB-POST-DATA-INTEGRITY-GATE; sibling under epic AUDIT-FB-GATE-PROSE-HARDENING. NB: fb-jargon-gate has a prior false-green class (exits 0 even on BLOCK — feedback_fb_poster_gate_false_green) — ensure the broadened path EXITS NON-ZERO on detection."
  };

($existing_ids | index("FIX-FB-GATE-CURRENCY-UNIT-GUARD") | not) as $mint1
| ($existing_ids | index("FIX-FB-JARGON-ENGLISH-WORD-LEAK") | not) as $mint2
|

# ── M1 + M2: append to backlog (id-guarded) ──────────────────────────────────
.task_board.backlog +=
  ( (if $mint1 then [t_currency] else [] end)
    + (if $mint2 then [t_english] else [] end) )
|

# ── M3: register both ids in the epic object's .tasks[] (marker-guarded) ──────
.task_board.active_sprints |= map(
  if .id == "AUDIT-FB-GATE-PROSE-HARDENING" then
    .tasks = (.tasks // [])
    | ( if (.tasks | map(.id) | index("FIX-FB-GATE-CURRENCY-UNIT-GUARD")) then .
        else .tasks += [{id:"FIX-FB-GATE-CURRENCY-UNIT-GUARD", title:"Check-F currency-unit guard — block VN price quoted in USD", type:"FIX", size:"S", status:"BACKLOG", owner:"developer", depends:[], zone:"scripts/", note:"P1 DANGEROUS. From LESSON 7 (2026-06-22 USD-on-VN-stock). Reuses Check-E ticker SSOT load."}] end )
    | ( if (.tasks | map(.id) | index("FIX-FB-JARGON-ENGLISH-WORD-LEAK")) then .
        else .tasks += [{id:"FIX-FB-JARGON-ENGLISH-WORD-LEAK", title:"Broaden jargon-gate — flag stray English content-words in VN prose", type:"FIX", size:"S", status:"BACKLOG", owner:"developer", depends:[], zone:"scripts/", note:"P2. From LESSON 8 (2026-06-22 \"ground\" leak). Whitelist-guarded English-word detector."}] end )
  else . end
)
|

# ── metadata bump ────────────────────────────────────────────────────────────
.task_board._updated_at = $now
| .task_board._updated_by = "po-s111"
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s111"
