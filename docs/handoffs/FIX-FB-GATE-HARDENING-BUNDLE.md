# Handoff — FIX-FB-GATE-HARDENING-BUNDLE

**Sprint:** S2-DATA-HONESTY
**Tasks:** FIX-FB-JARGON-WEEKDAY-ORDINAL-COLLISION (P2) · FIX-FB-GATE-TEMPLATE-STRUCTURE-VALIDATOR (P1) · FIX-FB-GATE-CURRENCY-UNIT-GUARD (P1)
**Zone:** scripts/ (cross-service, no dev-* specialist match → developer)
**Status:** REVIEW

---

## [Developer] Implementation Record

- **Files modified:**
  - `scripts/fb-jargon-gate.sh` lines 93–118 (Group E — weekday check block; added explanation comment block + removed `-i` flag from grep)
  - `scripts/fb-data-integrity-gate.sh` lines 28–41 (header CHECKS comment updated for F+G), lines 94–99 (POST_TICKERS pipefail guard), lines 635–850 (Check-F and Check-G added before Result block)

- **Tests written:** None (shell gates — verified by RAW execution against fixture posts; no test runner applicable. Per flow: gate-run results serve as AC evidence.)

- **Git commits:** pending (below)

- **tsc status:** N/A (bash scripts, not TypeScript)

- **Full suite:** RAW gate-run verification — see AC evidence below

- **Docs updated:** NONE (scripts/ self-contained; dev-standards.md already has CANONICAL pointer for both gates)

- **Graphify:** skipped (no docs impacted)

---

## AC Evidence

### TASK 1 — FIX-FB-JARGON-WEEKDAY-ORDINAL-COLLISION

**Root cause:** `grep -ni` (case-insensitive) matched "Thứ hai"/"Thứ ba" ordinals in the post body (= "secondly"/"thirdly") as if they were wrong weekday declarations.

**Fix:** Removed the `-i` flag from the grep in Group E. Now case-sensitive: only "Thứ Hai" (capital H = Monday name) matches, NOT "Thứ hai" (lowercase = ordinal). Same for all other weekday forms.

**Gate runs:**
```
bash scripts/fb-jargon-gate.sh docs/social/fb-post-2026-06-14.md 2026-06-14
# BEFORE fix → [FAIL] calendar:wrong-weekday found 'Thứ Hai' / 'Thứ Ba'  EXIT:1
# AFTER fix  → [PASS] fb-jargon-gate: 0 violations                        EXIT:0

bash scripts/fb-jargon-gate.sh docs/social/fb-post-2026-06-23.md 2026-06-23
# → [PASS] fb-jargon-gate: 0 violations   EXIT:0

bash scripts/fb-jargon-gate.sh docs/social/fb-post-2026-06-24.md 2026-06-24
# → [PASS] fb-jargon-gate: 0 violations   EXIT:0

# Synthetic wrong-weekday (06-24 = Thứ Tư, post declares Thứ Hai):
bash scripts/fb-jargon-gate.sh /tmp/.../test-wrong-weekday.md 2026-06-24
# → [FAIL] calendar:wrong-weekday — post date 2026-06-24 = Thứ Tư, found 'Thứ Hai'  EXIT:1
```

### TASK 2 — FIX-FB-GATE-TEMPLATE-STRUCTURE-VALIDATOR (Check-G)

**Location:** `scripts/fb-data-integrity-gate.sh` new Check-G block.

**Sub-checks and triggers:**
- G1 (missing-header): Line 1 must match `# Thị trường chứng khoán Việt Nam`
- G2 (missing-disclaimer or not fenced): verbatim disclaimer inside `---` fences
- G3 (missing-hashtag-block or missing mandatory tags): last line starts `#chungkhoan`, all 5 mandatory tags present, no diacritics in tokens
- G4 (markdown-in-body): detects `##` headings, `**bold**`/`__bold__`, `| table |` rows — line 1 is exempted
- G5 (word-ceiling): body word count > 1300 → BLOCK with trim guidance

**Gate runs:**
```
# Clean 06-23/06-24/06-14 → PASS (all G checks clean)
bash scripts/fb-data-integrity-gate.sh docs/social/fb-post-2026-06-23.md 2026-06-23 <empty-snap>
# → [PASS] fb-data-integrity-gate: 0 violations  EXIT:0

# Synthetic no-header → G1 fires
# → [BLOCK] Check-G1 missing-header  EXIT:1

# Synthetic no-disclaimer → G2 fires
# → [BLOCK] Check-G2 missing-disclaimer  EXIT:1

# Synthetic bad hashtag → G3 fires
# → [BLOCK] Check-G3 missing-hashtag-block  EXIT:1

# Synthetic markdown-in-body (##, **bold**, | table |) → G4 fires (5 violations)
# → [BLOCK] Check-G4 markdown-heading/bold/table  EXIT:1

# Real 05-30 post (1857w) → G5 fires + G4 fires (has **bold** sections)
# → [BLOCK] Check-G5 word-ceiling: 1702 words > 1300  EXIT:1
```

Also fixed pre-existing silent abort bug: `POST_TICKERS` pipeline used `grep -vE` which exits 1 on 0 matches; under `set -euo pipefail` this aborted the script before any check ran for posts with no recognisable tickers. Fixed with `(set +o pipefail; ...)` guard on that pipeline.

### TASK 3 — FIX-FB-GATE-CURRENCY-UNIT-GUARD (Check-F)

**Location:** `scripts/fb-data-integrity-gate.sh` new Check-F block.

**Detection:** Co-occurrence of VN-ticker + USD-price (`$NNN` or `USD NNN`, range 5-9999) on the same line.

**False-positive guards:**
- Commodity lines (`thùng`, `oz`, `ounce`, `barrel`, `tấn`) → skip entire line
- FX-pair lines (`USD/VND`, `$/EUR`) → skip entire line
- Macro-aggregate lines (`3 tỷ USD`, `X billion USD`) → skip entire line
- `NON_TICKERS` set excludes `USD`, `VND`, `FX`, `GDP`, etc.
- Range guard 5-9999 excludes implausibly small/large values

**Gate runs:**
```
# Synthetic: HPG $23,50 + TCB USD 32,05 → BLOCK (2 violations)
# VIC 230.500đ → no USD match (đồng suffix)
# dầu Brent $87/thùng → SKIP commodity line
# tỷ giá USD/VND → SKIP FX pair
bash scripts/fb-data-integrity-gate.sh test-usd-price.md 2026-06-24 <empty-snap>
# → [BLOCK] Check-F currency-unit: 'HPG' and USD-price '$23,50' co-occur on line 5
# → [BLOCK] Check-F currency-unit: 'TCB' and USD-price 'USD 32,05' co-occur on line 6
# EXIT:1

# Clean 06-23/06-24/06-14 → no Check-F violations  EXIT:0
```

### Exit-code discipline
Both gates use `VIOLATIONS` counter accumulation and exit only at the Result block:
- `$VIOLATIONS -eq 0` → `exit 0` (PASS)
- `$VIOLATIONS -gt 0` → `exit 1` (BLOCK)

No early exits from individual check blocks. The exit code IS the source of truth (not stdout). Fixed the pre-existing pipefail silent-abort which was the root cause of `feedback_fb_poster_gate_false_green` (gate returning exit 0 on abort rather than processing violations).

---

## NEXT AGENT

QA — verify raw gate runs against:
1. `docs/social/fb-post-2026-06-14.md 2026-06-14` via `fb-jargon-gate.sh` → must EXIT:0 (no wrong-weekday)
2. `docs/social/fb-post-2026-06-23.md 2026-06-23` + `docs/social/fb-post-2026-06-24.md 2026-06-24` via both gates → must EXIT:0
3. Synthetic wrong-weekday fixture → `fb-jargon-gate.sh` must EXIT:1 with `[FAIL] calendar:wrong-weekday`
4. Synthetic markdown-in-body → `fb-data-integrity-gate.sh` must EXIT:1 with `[BLOCK] Check-G4`
5. Synthetic word-ceiling >1300 → `fb-data-integrity-gate.sh` must EXIT:1 with `[BLOCK] Check-G5`
6. Synthetic VN-ticker in USD → `fb-data-integrity-gate.sh` must EXIT:1 with `[BLOCK] Check-F`
7. Legitimate USD references (commodity, FX, macro) → `fb-data-integrity-gate.sh` must NOT block
