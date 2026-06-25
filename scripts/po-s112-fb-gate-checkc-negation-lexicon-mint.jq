# po-s112-fb-gate-checkc-negation-lexicon-mint.jq
#
# Single-task id-guarded MINT under the active AUDIT-FB-GATE-PROSE-HARDENING epic:
# append FIX-FB-GATE-CHECKC-NEGATION-LEXICON (P2) -> .task_board.backlog[].
#
# DEFECT (2026-06-25, FB daily-post production):
#   scripts/fb-data-integrity-gate.sh Check-C "selloff narrative vs live breadth" is
#   NEGATION-BLIND to the Vietnamese adverb "chưa" (not yet / not). SELLOFF_AFFIRM_LINES
#   (line ~342) strips lines matching {không phải|không có|không bán|chứ không|mà không}
#   but "chưa" is absent, so an EXPLICITLY-negated panic statement
#   ("lực bán chưa hoảng loạn", "chưa phải bán tháo") is misclassified AFFIRMATIVE and on
#   a mild day (|VN-Index|<2%, ~0 floor) Check-C FALSE-BLOCKS a correct orderly-pullback
#   post (today: a legit -0,80% post blocked twice until "hoảng loạn" was removed).
# Secondary: floor-stock regex (line ~361) uses `chỉ \d mã sàn` — `\d` under BSD grep -E
#   (macOS) is treated literally; fragile cross-platform. Replace with `[0-9]`.
#
# PLACEMENT RATIONALE: matches the one-Check-per-row sibling convention of the epic
#   (FIX-FB-GATE-STALE-MACRO-GUARD, FIX-FB-GATE-BREADTH-PCT-INTERNAL, ...). NOT folded
#   into FIX-FB-JARGON-ENGLISH-WORD-LEAK — that is a jargon-lexicon surface; this is the
#   Check-C breadth-narrative classifier. Distinct root, distinct fix.
#
# Idempotent: skipped entirely if the id is already present in ANY board lane (re-run mints 0).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s112-fb-gate-checkc-negation-lexicon-mint.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.tmp \
#     && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#     && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   (commit orch-state by EXPLICIT PATH; PUSH HELD — PO's deferred call.)

def task_id: "FIX-FB-GATE-CHECKC-NEGATION-LEXICON";

# Gather all ids already on the board across every ARRAY lane.
# .task_board mixes array lanes (backlog/done/...) with scalar/object meta keys
# (head, _updated_at, ...) and some lanes carry bare-string entries — guard both:
# keep only array-valued lanes, then only object entries.
def all_ids:
  [ .task_board | to_entries[] | .value | select(type=="array")
    | .[] | select(type=="object") | (.id // empty) ];

def new_task($now):
  {
    id: "FIX-FB-GATE-CHECKC-NEGATION-LEXICON",
    title: "fb-gate Check-C: negation-blind to Vietnamese 'chưa' false-blocks orderly-pullback posts + \\d->[0-9] BSD-grep portability",
    type: "FIX",
    status: "BACKLOG",
    priority: "P2",
    epic: "AUDIT-FB-GATE-PROSE-HARDENING",
    lesson: "L4 (2026-06-25 -0,80% orderly post FALSE-BLOCKED twice: 'chưa hoảng loạn'/'chưa phải bán tháo' counted AFFIRMATIVE — 'chưa' absent from Check-C negation-strip set)",
    zone: "cross-service/",
    dev_agent: "developer",
    files: [
      "scripts/fb-data-integrity-gate.sh"
    ],
    desc: "Check-C builds SELLOFF_AFFIRM_LINES by removing lines that match the negation set {không phải|không có|không bán|chứ không|mà không} (line ~342). 'chưa' (not yet/not) is NOT in that set, so an explicitly-negated panic statement ('lực bán chưa hoảng loạn', 'chưa phải bán tháo') survives the strip, is counted as an AFFIRMATIVE selloff claim, and on a mild day (|VN-Index|<2%, ~0 floor) FALSE-BLOCKS a correct non-panic post. FIX (1): add 'chưa' and common variants ('chưa phải','chưa từng') to the negation-stripping lexicon. FIX (2): replace `\\d` with `[0-9]` in the floor-stock regex `chỉ \\d mã sàn` (line ~361) — BSD grep -E on macOS treats `\\d` literally; `[0-9]` is GNU/BSD portable.",
    generic_mandate: "Broaden the negation lexicon generically (any 'chưa'-prefixed negation of panic language), not a one-off literal; the [0-9] portability fix applies to EVERY `\\d` in the gate's grep -E patterns — audit the whole script for stray `\\d` while here.",
    verification_gate: "Add a fixture post containing 'lực bán chưa hoảng loạn' / 'chưa phải bán tháo' on a MILD day (live VN-Index between -2% and 0, snapshot stubbed) -> gate MUST PASS (Check-C 0 violations). Add a contrasting fixture with an AFFIRMATIVE 'thị trường bán tháo, hoảng loạn' on a mild day -> Check-C MUST still BLOCK. Confirm `chỉ [0-9] mã sàn` matches under the macOS BSD grep -E used by the gate.",
    size: "S",
    rebuild_required: false,
    minted_at: $now,
    minted_by: "po-s112"
  };

if (all_ids | index(task_id)) then
  .                                              # already present anywhere — no-op
else
  .task_board.backlog += [ new_task($now) ]
  | .meta.updated_at = $now
end
