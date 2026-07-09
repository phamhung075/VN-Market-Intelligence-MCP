# size-justification: 245L — pure data module (regex + numeric constants only, zero
# logic). FACTORY-PDF-split-generic-md-table Stage 1/8: extracted verbatim from the
# 4111L generic_md_table_extractor.py god-file (docs/architecture-briefs/
# 2026-06-15-maintainability-factory-audit.md). Consolidates every top-level
# constant that was previously scattered across the god-file (main constants block +
# LF-EXTRACT block + AR-PDF FR-14 block) into one canonical source, matching the
# "shared constants.py for the regex/constant block" split approach. Two constants
# (_GUTTER_POSITION_TOLERANCE, _ROW_PITCH_CHANGE_TOLERANCE) were verbatim-duplicated
# in the original file (same name, same value, re-declared near point of use) —
# de-duplicated here to a single definition each; behavior-identical (same value both
# places). No logic, no I/O — data-only module; splitting further would fragment the
# single source of truth this task exists to create.
"""
infrastructure/generic_md_table/constants.py

Shared regex + numeric constants for the generic_md_table extraction package.

AC-0 compliance: ZERO BCTC-specific constants. No code ranges, no balance-sheet
    sentinels, no per-table label keywords. Geometry and generic text patterns only.
    Grep-proof generality per Decision D — no per-table keyword constants anywhere.

DDD layer: infrastructure (pure data — no I/O, no Tesseract, no PIL).
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Generic geometry constants (no BCTC semantics)
# ---------------------------------------------------------------------------

# Row clustering: start new row when next word top exceeds current row max by
# more than this fraction of median word height.
_ROW_GAP_FACTOR = 0.5

# Gap-histogram row clustering: same-line grouping tolerance as fraction of
# median word height. Words within this vertical distance share a physical scan
# line. Caps at 8px absolute to defuse H_med inflation from tall header tokens.
_SAME_LINE_FACTOR = 0.3

# Row-pitch multiplier: gap must exceed row_pitch × this factor to start a new
# logical row. 1.2 = allow 20% stretch in line spacing before a section break.
_ROW_PITCH_MULTIPLIER = 1.2

# Table boundary detection: vertical gap larger than this × H_med = section break.
_SECTION_GAP_FACTOR = 2.5

# Column detection: gap > this × median_word_width between left-edge clusters.
_COL_GAP_FACTOR = 1.5

# Minimum pixel gap between two distinct column clusters (at 200 DPI).
# Derived from A4 BCTC printing: columns are always separated by ≥1cm whitespace.
# At 200 DPI: 1cm = 79px. Using 80px as a round number with 1px headroom.
# DPI-DEPENDENT constant: calibrated at 200 DPI (the rasterization DPI used in
# extract_md_tables_usecase.py). If DPI changes, rescale this constant proportionally.
# AC-0: generic 200-DPI print geometry. No BCTC column semantics.
_MIN_INTER_COLUMN_GAP_PX = 80

# Histogram bin width for left-edge clustering: fraction of median word width.
_LEFT_EDGE_BIN_FACTOR = 0.3

# Minimum confidence from Tesseract to include a word (0–100 scale from TSV).
_MIN_WORD_CONF = 0

# Numeric value pattern: a token of ≥3 chars that looks like a number.
_NUMERIC_RE = re.compile(r"\d[\d.,]{2,}")

# ---------------------------------------------------------------------------
# DEFECT-B — Noise density gate constants (generic financial patterns)
#
# AC-0: all patterns below are GENERIC — they apply to any financial document
# with locale-agnostic number formatting. ZERO BCTC-specific string literals.
# ---------------------------------------------------------------------------

# Money-group pattern: N,NNN,NNN or N.NNN.NNN (at least one separator group).
# Locale-agnostic: works for both VN dot-thousands and comma-thousands formats.
# Derived from live FPT density profile: real tables have >= 6, noise <= 3.
_MONEY_GROUP_RE = re.compile(r"\d{1,3}(?:[.,]\d{3})+")

# K: minimum money-group matches for a region to be emitted as a table.
# Primary gate. Live data split is clean: real >= 6, noise <= 3, no 4-5 cases.
_MIN_MONEY_GROUPS = 6

# Three-digit standalone code pattern (e.g. 100, 200, 270, 300, 400, 440).
# Generic: these codes appear in income statement, cash flow, and segment
# tables of any BCTC document — not specific to balance sheet.
_CODE_LIKE_RE = re.compile(r"(?<!\d)\d{3}(?!\d)")

# J: minimum 3-digit code hits for the secondary gate (code-rich tables).
_MIN_CODE_HITS = 3

# Money-group floor for the secondary gate (code column + at least 1 value).
_MIN_MONEY_THIN = 1

# ---------------------------------------------------------------------------
# DEFECT-C — Header strip and label-coalescing constants
# ---------------------------------------------------------------------------

# Generic date pattern for column headers (DD/MM/YYYY — locale-agnostic).
# Matches: 31/12/2025, 1/6/2024, etc. No BCTC-specific semantics.
_DATE_HEADER_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")

# ---------------------------------------------------------------------------
# MD-EXTRACT-4 — Number-token-only y-clustering constants
#
# AC-0: all patterns below are GENERIC financial number formats.
# ZERO BCTC-specific string literals.
# ---------------------------------------------------------------------------

# NUMBER token classifier — matches generic financial number tokens:
#   - money groups: 1.234.567 / 1,234,567 / (1.234.567) / -1.234.567
#   - 2-3 digit standalone codes or small integers: 100 / 270 / -30
# TEXT tokens (labels, headers, units, prose) do NOT match.
# KEY INSIGHT: number tokens have uniform character height, no diacritics,
# clean shared baselines → ≤2px y-jitter. Label tokens have Vietnamese
# diacritics that inflate top by 2-4px, causing scatter if clustered together.
_NUMBER_TOKEN_RE = re.compile(
    r'^[\(\-]?\d{1,3}(?:[.,]\d{3})+[\)\-]?$'  # money group: 1.234.567 / (1,234)
    r'|^[\(\-]?\d{2,3}[\)\-]?$'               # 2-3 digit code or small int: 270 / 30
)

# Number-token y-clustering tolerance (pixels at 200 DPI).
# Number tokens on the same print row share a clean baseline with ≤2px jitter.
# Typical inter-row gap on dense financial statements: 8-12px.
# SAME_LINE_TOL=4 cleanly separates rows without false merges or scatter.
# Tunable: increase to 6 if LIVE-VERIFY shows split rows; decrease to 2 for false merges.
SAME_LINE_TOL: int = 4

# ---------------------------------------------------------------------------
# MD-EXTRACT-5 — D4b: Code vs value token discriminators
#
# CODE tokens: 2-3 digit standalone numbers (row codes: 100, 200, 270, 30, etc.)
# VALUE tokens: money-group format with at least one thousands-separator group.
# AC-0: purely numeric pattern matching — zero BCTC-specific label strings.
# ---------------------------------------------------------------------------

# CODE token: 2-3 digit standalone (with optional leading paren/minus, trailing paren/minus).
# Matches: 100, 270, 30, (30), -30  — never embedded in longer number strings.
_CODE_TOKEN_RE = re.compile(r'^[\(\-]?\d{2,3}[\)\-]?$')

# VALUE token: money-group format with at least one thousands-separator group.
# Matches: 1.234.567, 1,234,567, (1.234.567), 58.102.970.741.619 — not plain codes.
_VALUE_TOKEN_RE = re.compile(r'^\d{1,3}(?:[.,]\d{3})+')


# ---------------------------------------------------------------------------
# MD-EXTRACT-6 — Column-Anchor-First Ordinal Reconstruction constants
#
# AC-0: all constants below are GENERIC geometry parameters.
# ZERO BCTC-specific string literals or semantics.
# ---------------------------------------------------------------------------

# Maximum distance (as multiple of median_word_width) for assigning a number token
# to a column anchor. Tokens farther than this are noise — excluded from the grid.
_COL_ASSIGN_MAX_DIST_FACTOR = 3.0

# Skip-slot detection: a within-column gap exceeding this factor × local_pitch
# indicates a missing physical row. Insert ceil(gap/pitch)-1 empty rank slots.
SKIP_GAP_FACTOR = 1.5

# Minimum Tesseract word confidence for tokens entering the ordinal path.
# Filters low-confidence noise tokens before column assignment.
# Lower-confidence tokens are more likely OCR garbage that inflates rank counts.
_MIN_WORD_CONF_ORDINAL = 30

# Label attachment band: TEXT tokens within this factor × h_med of a row's y_median
# are considered label candidates for that row. Wider than MD-EXTRACT-5's 0.6 primary
# band because skewed pages may shift label top by up to half the row pitch.
LABEL_BAND_FACTOR = 1.5


# ---------------------------------------------------------------------------
# MD-EXTRACT-7-REV — Dense income-statement reconstruction constants
#
# AC-0: all constants below are GENERIC geometry parameters.
# ZERO BCTC-specific string literals or semantics.
# ---------------------------------------------------------------------------

# Threshold for classifying a column bucket as a pure-code column.
# A bucket is pure-code when: code_fraction >= this AND value_count == 0.
# Default=0.90: allows up to 10% OCR-noise non-code tokens in code columns.
# AC-0: uses _CODE_TOKEN_RE and _VALUE_TOKEN_RE, both generic numeric patterns.
PURE_CODE_COL_THRESHOLD = 0.90

# Dense-column threshold: when a value column has fewer than this many tokens,
# prefer the cross-column ref_pitch over its own local pitch in _insert_skip_slots.
# Prevents local_pitch contamination from large intra-column skip gaps.
# AC-0: pure geometry. Non-regressing on segment report (columns have 7+ tokens).
DENSE_COL_THRESHOLD = 6


# ---------------------------------------------------------------------------
# MD-EXTRACT-9 — Label-Row Ordinal Reconstruction constants
#
# AC-0: both constants are GENERIC 200-DPI print geometry. Zero BCTC label
# string semantics. Names derive from physical line-spacing geometry:
#   _LABEL_LINE_GAP_PX: any two OCR words within 15px vertical distance share
#       one physical print line (intra-line top variance ≤8px; inter-line gap
#       is 33-38px on dense A4 financial statements at 200 DPI).
#   _LABEL_HEADER_MARGIN_PX: a 20px margin above the first value row is the
#       zone containing column-header / date-band text fragments that are NOT
#       data label lines; 20px << typical inter-row pitch (36px) ensures no
#       data label line is accidentally excluded.
# DPI-DEPENDENT: calibrated at 200 DPI (rasterization DPI in
# extract_md_tables_usecase.py). If DPI changes, rescale proportionally.
# ---------------------------------------------------------------------------

# Vertical gap threshold (pixels) for greedy label-line clustering.
# Two consecutive text tokens whose top-gap exceeds this value belong to
# DIFFERENT physical print lines.
_LABEL_LINE_GAP_PX: int = 15

# Margin (pixels) above the first value-bearing row used to exclude column-header
# text fragments from the data label lines.
_LABEL_HEADER_MARGIN_PX: int = 20

# ---------------------------------------------------------------------------
# LF constants — AC-0 compliant geometry parameters
# ---------------------------------------------------------------------------

# Tier 0 low-DPI rasterization: 50 DPI.
# An A4 page at 50 DPI ≈ 280×396 px ≈ 110KB RAM — cheap.
_TIER0_DPI: int = 50

# Gutter detection threshold: a column is a gutter if its dark-pixel sum
# drops below this fraction of the MAX dark-pixel sum WITHIN the ink bounding box.
# Using the ink-bbox max (not the global median) prevents page margins from
# dominating: the global median is near-zero on real pages (most columns are
# whitespace), so threshold ≈ 0 and only the far-margin pure-white columns
# qualify as "gutters" — producing one pseudo-column spanning 97% of the page.
_GUTTER_DARK_FRACTION: float = 0.15

# Ink bounding box: a column is "ink-bearing" if its dark-pixel sum exceeds
# this fraction of the global maximum. Used to clamp the gutter search to the
# actual text region, excluding leading/trailing page margins.
_INK_BBOX_MIN_FRACTION: float = 0.01

# Gutter position tolerance: two pages belong to the same unit if all gutter
# x-fractions differ by less than this value (as fraction of page width).
# NOTE: de-duplicated — the original god-file re-declared this constant
# verbatim (same name, same value) a second time near _fingerprints_continuous.
# Single definition here is behavior-identical.
_GUTTER_POSITION_TOLERANCE: float = 0.05

# Row pitch change tolerance: a unit break fires if row_pitch changes by more
# than this fraction (50% change = significantly different row density).
# NOTE: de-duplicated — see _GUTTER_POSITION_TOLERANCE note above.
_ROW_PITCH_CHANGE_TOLERANCE: float = 0.50

# Tier 1 minimum gutter width at 200 DPI (≈2.5mm at 200 DPI).
_MIN_GUTTER_WIDTH_PX: int = 20

# LF-FIX: minimum text column width at 200 DPI.
# A real BCTC table column is at minimum ~1cm wide = 80px at 200 DPI.
# Any "text column" narrower than this is margin noise or edge whitespace,
# NOT a real column. Gutters that would produce sub-threshold columns are
# rejected so that 20-30px slivers at the page margins are never accepted
# as column boundaries (the root cause of the pre-fix 97%-wide col_0 defect).
_MIN_TEXT_COL_WIDTH_PX: int = 80

# LF-FIX: compound gutter merging threshold (200 DPI, Tier 1).
# Consecutive raw gutter candidates separated by <= this many ink-bearing pixels
# are merged into one combined gutter. This handles the case where the whitespace
# between text columns contains light OCR artifacts (descending tails, faint ink)
# that break the gutter into sub-segments; each sub-segment is individually too
# narrow or produces too-narrow columns, but the compound gap is a real structural
# column separator. Value ~60px covers the typical intra-column-separator noise
# without merging genuine adjacent columns (which are at least 200px+ apart).
_MAX_INTER_GUTTER_GAP_PX: int = 60

# FU-ORPHAN-TOLERANCE: Dense-page fallback gutter detection.
# On dense statement pages (income-stmt / cash-flow, FPT p7-9) the gutter between
# the label column and value columns has residual ink (tightly-packed rows spill
# ink into what should be the gutter). The standard _GUTTER_DARK_FRACTION=0.15 is
# too strict — the gutter dark count can be 20-30% of the peak, not below 15%.
# When the standard pass returns a single 1-column layout (no gutters), retry with
# a more permissive threshold fraction.
_GUTTER_DARK_FRACTION_DENSE: float = 0.35

# LF-FIX: same threshold scaled to 50 DPI (Tier 0 fingerprint).
# 80px at 200 DPI → 80 * 50/200 = 20px at 50 DPI.
# Raised to 30px to suppress noise gutters (1-px whitespace gaps within dense
# text blocks that pass the 20px bar accidentally). At 50 DPI a genuine structural
# column separator must have ≥30px of text on each side to be credible.
_MIN_TEXT_COL_WIDTH_PX_50DPI: int = 30

# Tier 0 gutter threshold for the 50-DPI FINGERPRINT only.
# Uses a HIGHER fraction (40%) than Tier 1 (15%) so that only the deepest
# whitespace valleys — the structural column separators — are detected.
# Smaller intra-column gaps (e.g. between sparse number rows within one column)
# don't reach this level and are correctly ignored. This keeps the fingerprint
# consistent across consecutive pages of the same logical document section.
_GUTTER_DARK_FRACTION_50DPI: float = 0.15

# Tier 1 header band: top fraction of page typically containing headers.
_HEADER_BAND_FRACTION: float = 0.15

# Tier 1 footer band: bottom fraction of page typically containing footers.
_FOOTER_BAND_FRACTION: float = 0.10

# Row band darkness threshold: a row band is "text-dense" if its dark-pixel
# mean (in the vertical profile) exceeds this fraction of the maximum.
_ROW_BAND_DARKNESS_THRESHOLD: float = 0.20

# Tier 0 OCR text density gate: a page is considered "table" if it has
# at least this many money-group tokens in its stored OCR text.
_TABLE_PAGE_MIN_MONEY_GROUPS: int = 3

# LF-IMPL-1 — Signal B: minimum 3-digit account-code tokens to classify a page as
# "table" even when money-group density is low (e.g. balance-unit START pages with a
# full-width heading block occupying the top half).  Re-uses _CODE_LIKE_RE (AC-0).
# Same threshold as _MIN_CODE_HITS used in _is_data_table().
_ACCOUNT_CODE_MIN_FOR_TABLE: int = 3

# LF-IMPL-1 — Signal C: minimum date-header tokens (DD/MM/YYYY) to classify a page
# as "table".  Financial statement pages invariably open with a date column header;
# prose/cover pages do not.  Re-uses _DATE_HEADER_RE (AC-0).
_DATE_HEADER_MIN_FOR_TABLE: int = 1

# LF-IMPL-2 — Relaxed continuity guard for prose pages inside a table unit.
# When True, a page classified as "prose" that is encountered during an ongoing
# table unit is NOT immediately treated as a unit break.  Instead,
# _fingerprints_continuous() is evaluated: if gutter geometry is continuous
# the page is accepted as a prose-in-table-unit continuation (its page_type
# metadata remains "prose" but it stays in the current unit).
# Set to False to restore strict page_type equality semantics.
_ALLOW_PROSE_IN_TABLE_UNIT: bool = True

# Minimum number of gutter columns to classify a page as a table (Tier 0).
_TABLE_MIN_GUTTER_COUNT: int = 1

# ---------------------------------------------------------------------------
# AR-PDF FR-14 — Title-band detector constants (D-5)
# Inlined from bctc_page_grouper.py (deleted in AR-PDF sprint).
# These constants are retained here for backward compatibility with
# existing callers and tests that import them from this module.
# ---------------------------------------------------------------------------

# Number of lines from the top of the page text to scan for a title band.
_TITLE_BAND_SCAN_LINES: int = 8

# Minimum character length for a candidate title line.
_TITLE_BAND_MIN_LEN: int = 5

# Maximum character length for a candidate title line.
_TITLE_BAND_MAX_LEN: int = 120

# Continuation marker strings — presence of any of these causes D-5 to return
# False (the page is a continuation of the previous table, not a new one).
_CONTINUATION_MARKERS: tuple = ("tiếp theo", "(continued)", "continued")

# AR-PDF FR-14 — _is_title_band inlined from bctc_page_grouper.py (deleted in
# AR-PDF sprint). Retained here for backward compatibility with existing test
# imports. Financial money-group pattern used by _is_title_band (document_map.py).
_BCTC_MONEY_GROUP_RE = re.compile(r"\d{1,3}(?:[.,]\d{3})+")

# ---------------------------------------------------------------------------
# BPE-DEV-5 — Tesseract retry constants
#
# Under host load spikes (macOS 16GB + Docker capped 8GB) Tesseract can receive
# SIGTERM (-15) mid-call.  The prior code caught the exception and silently
# dropped the page, producing an empty table unit.  With normalized load a retry
# on the same image succeeds immediately.
#
# MAX_TESSERACT_RETRIES = 2 means: initial attempt + up to 2 retries = 3 total
# calls maximum per page.  Each retry sleeps _TESSERACT_RETRY_SLEEP_S seconds
# to give the OS time to release memory pressure before the next attempt.
# ---------------------------------------------------------------------------

MAX_TESSERACT_RETRIES: int = 2

# Seconds to sleep between Tesseract retry attempts (brief — only needed when
# host is briefly over-committed; normalized load clears within 1-2 seconds).
_TESSERACT_RETRY_SLEEP_S: float = 1.5
