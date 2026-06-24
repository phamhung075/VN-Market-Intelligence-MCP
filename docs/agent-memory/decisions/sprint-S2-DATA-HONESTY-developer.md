# Decision Journal — Sprint S2-DATA-HONESTY · developer

## STEP — FIX-FB-GATE-HARDENING-BUNDLE (2026-06-24)

task_id: FIX-FB-JARGON-WEEKDAY-ORDINAL-COLLISION + FIX-FB-GATE-TEMPLATE-STRUCTURE-VALIDATOR + FIX-FB-GATE-CURRENCY-UNIT-GUARD
agent: developer

### TASK 1 — weekday/ordinal collision fix

**What was considered:**
Only one viable approach: distinguish capitalised weekday-as-day-name forms ("Thứ Hai", "Thứ Ba") from lowercase ordinal enumerators ("Thứ nhất", "Thứ hai", "Thứ ba").

Option A (CHOSEN): Remove `-i` flag from `grep -ni` → case-sensitive grep.
- Rationale: weekday-as-day-name is ALWAYS capitalised in Vietnamese ("Phiên Thứ Ba 23/6", "Hôm nay là Thứ Hai"). Ordinals use lowercase second word ("Thứ nhất, lãi suất...", "phiên thứ ba liên tiếp").
- This is a one-character fix that perfectly separates the two uses without any regex complexity.
- "Chủ nhật" has no ordinal homograph so no false-positive risk at all.

Option B (rejected): Anchor match to date context (look for DD/MM digit sequence nearby). Too complex, brittle for posts that reference the weekday in a sentence without adjacent date digits.

**Why this option:** The capitalisation rule is part of Vietnamese grammar — it's a structural invariant, not a coincidence. The fix is robust for all future posts.

### TASK 2 — structural template validator (Check-G)

**What was considered:**
Added Check-G (5 sub-checks) to `fb-data-integrity-gate.sh`:

- G1 (header): Line 1 must match canonical post title pattern. Regex is flexible enough to match Vietnamese diacritic variants but strict enough to reject body text.
- G2 (disclaimer): Substring match on `DISCLAIMER_CORE` string, then verifies `---` fence enclosure via multiline regex.
- G3 (hashtag): Last non-empty line must start with `#chungkhoan` + validates 5 mandatory tags + diacritic check.
- G4 (no markdown): Detects `##` headings, `**bold**`/`__bold__`, and `| table |` rows. Exception: line 1 (file title `# Thị trường...`) is allowed.
- G5 (word ceiling): Counts body words (excludes header, `---` lines, disclaimer line, hashtag line). Fires at >1300. The 05-30 post (1857w) and 06-16 (1571w) both fire correctly; 06-14 (1318w) passes.

**Why chose Python3 block over bash greps:** Multiple sub-checks with stateful logic (last-line detection, word counting, multiline fence check) cannot be expressed cleanly in bash without many fragile temp variables. Python3 heredoc is already the pattern in this script (checks A-E all use it).

**Bug found and fixed:** Pre-existing `set -euo pipefail` + `grep -vE` pipeline bug — when a post contains NO recognizable ticker tokens (e.g. the synthetic no-header test file), `grep -vE` returns exit 1 (no lines passed filter), which `pipefail` catches and aborts the script before any output. Fixed with `(set +o pipefail; ...)` guard on the `POST_TICKERS` extraction pipeline. This is a narrowly scoped guard that only disables pipefail for the multi-pipe extraction chain.

### TASK 3 — currency-unit guard (Check-F)

**What was considered:**
Detection approach: co-occurrence of a VN-ticker (2-4 uppercase letters, not in NON_TICKERS) AND a USD-price pattern (`$NNN` or `USD NNN`, stock-price range 5-9999) on the SAME LINE.

**Why line-level (not proximity window):** Vietnamese financial prose puts ticker at start of clause and price later ("HPG hiện giao dịch ở mức $23,50", "TCB được mua mạnh với giá USD 32,05") — the two elements are on the same line but may be 30+ chars apart. A 15-char window (first implementation) missed both cases. Line-level is the correct surface.

**False-positive guards (all justified):**
1. `COMMODITY_UNITS`: lines with "thùng", "oz", "ounce", "barrel", "tấn" skip entirely → "dầu Brent $87/thùng", "vàng $4.238/oz" are never flagged. Commodity $/unit lines NEVER simultaneously quote a VN stock price.
2. `FX_PAIR`: pattern `(?:USD|\$)/[A-Z]{3}` skips lines with "USD/VND", "$/EUR" → FX-rate mentions excluded. FX lines won't have a VN ticker priced in USD.
3. `MACRO_AGGREGATE`: pattern `\d\s*(?:tỷ|triệu|billion|million)\s*(?:USD|\$)` skips lines with "3 tỷ USD", "X billion USD" → trade/export aggregate USD figures excluded.
4. `NON_TICKERS` exclusion set: prevents flagging "USD" itself as a "ticker" adjacent to a USD price.
5. `USD_PRICE_PAT` negative lookbehind `(?<![A-Z])` and lookahead `(?![/A-Z])`: prevents matching "USD" inside "USD/VND" or in a word like "USDEUR".
6. Range guard `5 <= num_val <= 9999`: filters out $1-$4 (too small to be stock prices) and $10000+ (implausible for VN stock in USD notation).

**Verified:** HPG $23,50 → BLOCK; TCB USD 32,05 → BLOCK; VIC 230.500đ → no match (đồng suffix, no $ pattern); dầu Brent $87/thùng → SKIP commodity; USD/VND → SKIP FX pair.
