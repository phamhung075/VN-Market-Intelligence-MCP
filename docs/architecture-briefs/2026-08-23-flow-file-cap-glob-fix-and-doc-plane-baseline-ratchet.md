# flow-file cap: glob fix + doc-plane baseline/ratchet rollout

**Task:** `FIX-FILESIZECAPS-FLOWFILE-GLOB-NESTED-DIR-ONLY-173-FLOW-FILES-UNGOVERNED` (P2, ready[], `next_agent=agents-architect`)
**Author:** agents-architect · 2026-08-23
**Policy owner:** `docs/data/file-size-caps.json` `_maintained_by: agents-architect (policy) / agent-father (implementation)`
**Verification gate (from the row):** *a rollout decision is recorded AND the corrected glob is validated against the full 173-file cohort, not a single file.*

---

## 1. Defect — confirmed at source, re-executed

`docs/data/file-size-caps.json` carries `{pattern: "docs/agents/*/flow/**/*.md", cap: 120, class: "flow-file"}`. Its only pattern consumer is `scripts/agents-flow/context-bloat-backstop.sh:119`, which matches with bash `case`. Re-run live:

```
case docs/agents/system-auditor/flow/main.md in docs/agents/*/flow/**/*.md)  -> NOMATCH
case docs/agents/x/flow/sub/y.md             in docs/agents/*/flow/**/*.md)  -> MATCH
find docs/agents -path '*/flow/*.md'   = 173
find docs/agents -path '*/flow/*/*.md' = 0
```

bash `case` has no globstar: `**` is two adjacent `*`, and the literal `/` after it forces ≥1 component below `flow/`. Zero such files exist, so `MATCHED_CAP` stays empty and the hook exits at the non-governed fast path before it ever runs `wc`. **173/173 ungoverned.** Row's diagnosis stands verbatim.

**The sibling pattern is fine by accident.** `.claude/skills/**/*.md` matches `.claude/skills/dispatch/SKILL.md` because there the `**` consumes exactly the one real directory component (80 files at depth 1, 22 deeper — all matched, since `*` in `case` also matches `/`). Same broken idiom, opposite outcome, purely because of corpus shape. Do not read the skills cap working as evidence the flow cap should.

**Fix:** delete `**/`. Verified — `docs/agents/*/flow/*.md` matches `…/flow/main.md`, `…/flow/sub/y.md`, and correctly rejects `docs/agents/pm/handlers.md` and `docs/flow/x.md`.

---

## 2. Blast radius — independently re-measured (all 173, cap 120L / BC-1 byte cap 120×60 = 7200 B)

| Bucket | n | |
|---|---:|---|
| within both caps — no emit | **98** | unaffected |
| line-over, **absorbed** by a current `size-justification` header, byte-OK | **12** | already handled |
| line-over, unjustified, byte-OK | **3** | fixable today by adding a header |
| **byte-cap breach involved** | **60** | **no escape hatch exists** |
| **would emit on next edit** | **63** | = 3 + 60 |

The row estimated 62/59/13; my independent count is 63/60/12. Same conclusion, corrected arithmetic.

**The sharpest number is 26.** Of the 64 line-over files, 38 carry a *current, in-tolerance* `size-justification` header — and **26 of those would still emit**, because `context-bloat-backstop.sh` TE-T24 rules that a header declares a LINE count only and **never** honors a byte-cap breach. The fleet's existing escape hatch is structurally incapable of covering the dominant breach dimension in this cohort. Any rollout that does not fix that is asking 26 authors to re-justify into a mechanism that cannot accept the justification.

Live distribution (n=173): lines p50 **102** / p75 145 / p90 226 / max 1425 — the 120L cap sits near p60, i.e. **the line cap is well calibrated.** Bytes p50 **5786** / p75 9177 / p90 15804 / max 192014 — 7200 B sits near p62, so the byte cap is *not* wildly off either. What is off is the **60 B/line budget** BC-1 hardcodes: measured bytes-per-line is p50 **54**, p90 **88**, max **1190**. Prose-dense flow docs with tables and fenced blocks routinely exceed 60 B/L without being "bloated" in any sense a reader would recognise.

Worst bytes-per-line — the mega-line class BC-1 was actually written for:

```
  1190 B/L    74L   88023B  docs/agents/po/flow/scripts-registry.md
   435 B/L   122L   53097B  docs/agents/po/flow/triage-signals.md
   363 B/L    23L    8341B  docs/agents/po/flow/triage-signals-longtail.md
   150 B/L  1279L  192014B  docs/agents/dev-team/flow/main.md
```

`po/flow/scripts-registry.md` is 74 lines and 88 KB. It is *not* a line-cap problem at all and no line-based mechanism will ever see it.

---

## 3. Correcting the row's risk framing — this is a drain-lane flood, not a write blocker

The row says the fix "turns the fleet's most-edited documents into permanent every-edit breach emitters." Read at source, that overstates it in one direction and understates it in another:

- `context-bloat-backstop.sh` **always `exit 0`** and is wired as a hook in `.claude/settings.local.json:71`. It never blocks a write. There is no CI gate on this cap — `scripts/audits/size-lint-justification.sh` (the `[size-lint]` pre-push gate) is **code-plane only** (`apps/**/*.ts|py|go`, `packages/**/*.ts`) and does not read the pattern table at all.
- It **dedups per file**: if an unprocessed `context-bloat-<path>-*.json` already sits in `docs/signals/`, it exits silently. So the correct worst case is a **one-shot burst of ≤63 signals**, then at most one re-emit per file per drain cycle — not per edit.
- But that burst lands on a signals inbox with a known standing drain-behind (dozens of files) and routes `to: claude-manager-helper` at `priority: high`. **The real risk is inbox flooding and burying genuinely new breaches, not blocked work.** That is what the rollout must manage.

---

## 4. Ruling — (a) + (b), ported from the already-live code-plane sibling. Do not invent a new mechanism.

The row offers (a) grandfather allowlist / (b) staged tightening / (c) per-file caps / (d) split the class. The decision is **(a) combined with (b)**, and specifically **not a new design**: this exact problem — switch on a size gate over a corpus that already carries debt — was solved on the code plane 2026-07-24 and has been live since, grandfathering **648** files.

Prior art, verified live: `scripts/audits/size-lint-justification.sh` + `docs/data/size-lint-baseline.json` (648 entries) + `docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md` §2. Semantics: ≤cap **or** current justification → PASS; over cap but grandfathered in the baseline and still within **±10 % (min 5)** tolerance → PASS; grandfathered but **grown past tolerance** → FAIL (the regrowth case); over cap and **not** in the baseline → FAIL (zero tolerance for new offenders); `--update` regenerates the baseline wholesale and entries drop out automatically once a file shrinks or gains a header.

(c) is rejected — 63 per-file caps is an unmaintainable table and the 2026-06-14 `RECALIBRATE` precedent already recorded inline in `file-size-caps.json` chose a class-level recalibration over per-file exceptions. (d) is rejected on its own — splitting `flow-file` into `flow-dispatcher`/`flow-body` reshuffles the line dimension and does nothing about the 60 byte-cap breaches, which are the actual blocker.

### 4.1 The four changes, in landing order

**R1 — Extend the escape hatch to the byte dimension (MUST land before R3).**
`size-justification` gains an optional byte declaration:

```
<!-- size-justification: 1279L/192014B — reason -->
```

`context-bloat-backstop.sh` honors a byte-cap breach **only** when the header declares an explicit byte figure and the live byte count is within the same ±10 %/min-5 tolerance already applied to lines. This **preserves** TE-T24's intent rather than reversing it: TE-T24's objection is that a *line* declaration cannot speak to bytes, and that a mega-line file could otherwise evade the byte dimension for free. An explicit, reviewable, staleness-checked byte number is not a free pass — `po/flow/scripts-registry.md` would have to publish `74L/88023B` in its own header, which is exactly the visibility BC-1 wants. Backward compatible: a header with no `/NNNNB` term behaves exactly as today (line-only).

**R2 — Generate the doc-plane baseline BEFORE flipping the glob.**
`docs/data/context-bloat-baseline.json`, same shape and same `--update` regeneration semantics as `size-lint-baseline.json`, but recording **both** dimensions per path: `{"<path>": {"lines": N, "bytes": M}}`, plus `_generated_by`, `generated_at`, `threshold`, `tolerance_note`. Seed = the 63 emitters measured in §2, dated 2026-08-23. `context-bloat-backstop.sh` consults it after the justification check and before emitting: in-baseline **and** within tolerance on **both** dimensions → silent; grown past tolerance on either → emit (this is the ratchet — a grandfathered file that gets *worse* is exactly what the gate is for); not in baseline → emit (new offenders, zero tolerance).

**R3 — Fix the glob.** `docs/agents/*/flow/**/*.md` → `docs/agents/*/flow/*.md`, with an inline `_note` recording the `case`-has-no-globstar reason so it is not "corrected" back.

**R4 — Do not retune `cap: 120`.** Measured p50 = 102 L; the line cap is correctly calibrated and 12 files already absorb their line breach cleanly. The BC-1 `×60` byte budget is the miscalibrated knob, and R1+R2 address it per-file with explicit declarations rather than by loosening the global multiplier for everyone. Revisit only if a post-rollout `--update` shows the baseline failing to shrink over two cycles.

### 4.2 Rollout sequence and the FENCE

Ordering is load-bearing: **R1 → R2 → R3.** Flipping R3 first produces the 63-signal burst this brief exists to prevent; generating R2 before R1 bakes 26 files into the baseline that should instead have been resolved by their own (now byte-capable) headers.

`feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` fence, satisfied and carried forward:
- **Before** state is in §2 — the full 173-file cohort, not a sample. The exact enumeration is reproducible from `find docs/agents -path '*/flow/*.md'`.
- The implementer MUST re-run the full 173 after R1+R2+R3 and **diff the emit set**. Acceptance is `emit_after == 0` with every one of the 63 accounted for as either header-resolved (R1) or baseline-grandfathered (R2) — never as "no longer matched".
- The baseline is **opt-IN and dated** (a generated snapshot of measured state), never an opt-out allowlist an author can append to by hand.
- `feedback_ctxbloat_breach_on_live_sprint_file_defer` is unaffected: the hook is non-blocking by construction (`exit 0` on every path), so a breach on a live in-flight file already defers rather than blocks.

---

## 5. Acceptance criteria

| AC | Assertion |
|---|---|
| **AC-1** | `case` matrix: corrected pattern MATCHES `docs/agents/<a>/flow/main.md` **and** `docs/agents/<a>/flow/sub/y.md`, NOMATCHES `docs/agents/<a>/handlers.md` and `docs/flow/x.md`. Positive **and** negative fixtures. |
| **AC-2** | Full-cohort before/after: 173 files scanned both times; `emit_before == 63`, `emit_after == 0`; the diff enumerates each of the 63 as header-resolved or baseline-grandfathered. Not a single-file check. |
| **AC-3** | R1 regression: a file whose header declares `NNNL/MMMMB` within ±10 % on both → silent; the same file grown past byte tolerance → emits `reason=byte-cap`; a header with **no** byte term keeps today's line-only behaviour byte-for-byte. |
| **AC-4** | R2 ratchet: a baselined file edited **within** tolerance → silent; edited **past** tolerance on lines **or** bytes → emits; a brand-new over-cap flow file not in the baseline → emits (zero tolerance). |
| **AC-5** | `--update` idempotency: re-running against unchanged state reproduces a byte-identical baseline; a file that shrinks under cap or gains a current header drops out automatically. |
| **AC-6** | Dedup preserved: with an unprocessed `context-bloat-<path>-*.json` already present, no second signal is written for that path. |

Existing harness to extend, not replace: `scripts/agents-flow/context-bloat-backstop.test.sh`.

---

## 6. Rows to mint (zone-split — do not bundle)

| # | Row id | Owner / `next_agent` | Zone | Size | depends_on |
|---|---|---|---|---|---|
| 1 | `FIX-CTXBLOAT-SIZEJUSTIFICATION-BYTE-DIMENSION` | developer | `scripts/agents-flow/` | S | — |
| 2 | `FIX-CTXBLOAT-DOCPLANE-BASELINE-RATCHET` | developer | `scripts/agents-flow/` + `docs/data/` | M | 1 |
| 3 | `FIX-FILESIZECAPS-FLOWFILE-GLOB-CORRECT` | agent-father | `docs/data/file-size-caps.json` | XS | 2 |

Row 3 is the one-character change and must land **last**. `docs/data/file-size-caps.json` is agent-father's implementation zone per its own `_maintained_by`; `scripts/` is developer's. Rows 1 and 2 mirror `size-lint-justification.sh`'s semantics deliberately — reviewers should diff against it rather than re-deriving.

**Dispatchability note for PO:** `is_dev_role` is `^dev(-|$)|^developer$` (`scripts/lib/devteam-eligibility.jq:306-307`), so row 3 (`agent-father`) is not auto-dispatchable and needs a manual sweep or a `next_agent: po` shim.

---

## 7. Reported, not fixed

1. **272 of the 445 `docs/agents/**/*.md` files match no cap pattern at all** — every `init.md`, `handlers.md`, `audit-dimensions.md`, `handoff/*.md`. 68 of them exceed 120 L (`system-auditor/handlers.md` 342 L / 26803 B; `system-auditor/init.md` 173 L / 12777 B). Flow files are the *smaller* ungoverned half. Widening the pattern is a separate policy decision with its own blast radius — deliberately out of scope here, but it means "fix the flow glob" does not equal "agent docs are governed".
2. **`docs/agents/pm/flow/main.md` is 275 L today and about to grow** under `FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT` (see `docs/architecture-briefs/2026-08-23-pm-decompose-closeout-lane-resolution-and-fail-loud.md` §3, which rules the new transform into `scripts/` partly for this reason). It will be one of the 63 baseline entries. Land R2's snapshot after that row settles, or the baseline is stale on arrival.
3. The `**` idiom appears in **two** patterns; only one is currently harmful. `.claude/skills/**/*.md` works by corpus accident and will silently change meaning if anyone adds a `.claude/skills/<a>/<b>/<c>/x.md`. Normalising it to `.claude/skills/*/*.md` is a free correctness win, but it is a different class token and out of this row's scope.

---

## RETURN
DONE: Rollout decision recorded — `docs/architecture-briefs/2026-08-23-flow-file-cap-glob-fix-and-doc-plane-baseline-ratchet.md`. Glob defect re-executed and confirmed; full 173-file cohort measured independently (98 clean / 12 absorbed / 3 line-only / 60 byte-cap = 63 emitters, and 26 files carry a current header that BC-1 structurally cannot honor). Ruling: (a)+(b), ported from the live 648-entry code-plane baseline/ratchet, sequenced R1→R2→R3 so the glob flips last.
ZONE: `scripts/agents-flow/` + `docs/data/` (rows 1-2, developer) | `docs/data/file-size-caps.json` (row 3, agent-father)
NEXT: po (mint the 3 rows in §6) | developer (rows 1-2) | agent-father (row 3, last)
PIPELINE: continue
