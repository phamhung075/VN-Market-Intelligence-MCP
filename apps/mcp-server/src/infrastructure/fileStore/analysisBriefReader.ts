/**
 * analysisBriefReader.ts — Infrastructure adapter: per-ticker analysis brief reader
 *
 * MAW-P0-3: Reads `docs/analysis-briefs/{TICKER}.md` from disk and parses the
 * four canonical agent sections into a structured JSON DTO.
 *
 * TASK-17 P1-3a: Also exposes readAnalysisBriefIndex — catalogue index of all
 * available briefs, used by GET /api/analysis-briefs.
 *
 * Canonical sections (per architecture brief MAW-2026-06-11):
 *   ## [Report Analyzer] Fundamentals & Valuation   → dto.fundamentals
 *   ## [News Scout] Headlines & Sentiment             → dto.news
 *   ## [Market Watcher] Price, Volume, Technicals    → dto.price
 *   ## [Unified Agent] Quarterly Syntheses           → dto.synthesis
 *
 * File source: `<projectRoot>/docs/analysis-briefs/{TICKER}.md`
 *   where TICKER is normalised to uppercase (e.g. "vcb" → "VCB").
 *
 * Returns null when the file is not found (caller maps this to 404).
 * Throws on unexpected I/O errors (caller maps these to 500).
 *
 * DDD Layer: infrastructure/fileStore — pure filesystem adapter.
 * NEVER imports from domain/.
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed sections from the analysis-brief markdown file. */
export interface AnalysisBriefDto {
  /** Ticker symbol (uppercase), e.g. "VCB" */
  ticker: string;
  /** Content of the ## [Report Analyzer] section, trimmed. Empty string if absent. */
  fundamentals: string;
  /** Content of the ## [News Scout] section, trimmed. Empty string if absent. */
  news: string;
  /** Content of the ## [Market Watcher] section, trimmed. Empty string if absent. */
  price: string;
  /** Content of the ## [Unified Agent] section, trimmed. Empty string if absent. */
  synthesis: string;
  /** Raw markdown content (full file) for consumers that want the original text. */
  raw: string;
  /** ISO 8601 file modification time — used to compute data freshness / SLA badge. */
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section heading patterns (match the four canonical agent sections)
// ─────────────────────────────────────────────────────────────────────────────

/** Maps a section key to the regex that matches its H2 heading. */
const SECTION_PATTERNS: Record<keyof Pick<AnalysisBriefDto, "fundamentals" | "news" | "price" | "synthesis">, RegExp> = {
  fundamentals: /##\s+\[Report Analyzer\]/i,
  news:         /##\s+\[News Scout\]/i,
  price:        /##\s+\[Market Watcher\]/i,
  synthesis:    /##\s+\[Unified Agent\]/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// Parser — exported for unit tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a markdown string into the four canonical sections.
 *
 * Algorithm:
 *   1. Split the file into lines.
 *   2. Walk lines; when a line matches a section heading, start collecting
 *      lines into that section's bucket.
 *   3. Any subsequent H2 heading (## ) ends the current section and starts
 *      a new one (which may or may not be a canonical section — unrecognised
 *      headings are collected into a trailing "other" bucket that is discarded).
 *   4. Return each bucket's content joined and trimmed.
 *
 * @param markdown - Raw markdown file content
 * @returns Parsed section strings (empty string for absent sections)
 */
export function parseAnalysisBriefSections(markdown: string): Pick<AnalysisBriefDto, "fundamentals" | "news" | "price" | "synthesis"> {
  const result: Pick<AnalysisBriefDto, "fundamentals" | "news" | "price" | "synthesis"> = {
    fundamentals: "",
    news: "",
    price: "",
    synthesis: "",
  };

  const sectionKeys = Object.keys(SECTION_PATTERNS) as Array<keyof typeof SECTION_PATTERNS>;

  const lines = markdown.split("\n");
  let currentSection: keyof typeof SECTION_PATTERNS | null = null;
  const buckets: Record<keyof typeof SECTION_PATTERNS, string[]> = {
    fundamentals: [],
    news: [],
    price: [],
    synthesis: [],
  };

  for (const line of lines) {
    // Check if this line is an H2 heading
    if (line.trimStart().startsWith("## ")) {
      // Determine if it matches a canonical section
      let matched: keyof typeof SECTION_PATTERNS | null = null;
      for (const key of sectionKeys) {
        if (SECTION_PATTERNS[key].test(line)) {
          matched = key;
          break;
        }
      }
      currentSection = matched; // null for unrecognised H2 headings
      // Don't push the heading line itself into the bucket
      continue;
    }

    if (currentSection !== null) {
      buckets[currentSection].push(line);
    }
  }

  for (const key of sectionKeys) {
    result[key] = buckets[key].join("\n").trim();
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main reader function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read and parse the analysis brief for a given ticker.
 *
 * @param ticker      - Ticker symbol (case-insensitive; will be normalised to uppercase)
 * @param projectRoot - Absolute path to the repo root (injected for testability)
 * @returns AnalysisBriefDto on success, or `null` if the file does not exist
 * @throws If the file exists but cannot be read (I/O error other than ENOENT)
 */
export function readAnalysisBrief(
  ticker: string,
  projectRoot: string,
): AnalysisBriefDto | null {
  const upperTicker = ticker.toUpperCase();

  // Sanitise: allow only alphanumeric + hyphen to prevent path traversal
  if (!/^[A-Z0-9\-]{1,20}$/.test(upperTicker)) {
    return null;
  }

  const filePath = resolve(projectRoot, "docs", "analysis-briefs", `${upperTicker}.md`);

  // Stat to get mtime — also acts as existence check
  let updatedAt: string;
  try {
    const stat = statSync(filePath);
    updatedAt = stat.mtime.toISOString();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw err;
  }

  // Read content
  const raw = readFileSync(filePath, "utf-8");

  const sections = parseAnalysisBriefSections(raw);

  return {
    ticker: upperTicker,
    ...sections,
    raw,
    updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-17 P1-3a — Index catalogue types and reader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One entry in the analysis-brief catalogue index.
 * All fields except ticker may be null when the brief file is malformed/partial.
 */
export interface AnalysisBriefIndexItem {
  /** Ticker symbol (uppercase), derived from filename */
  ticker: string;
  /** Exchange from "**Exchange**: HOSE" line, or null */
  exchange: string | null;
  /** Period string from latest ### {TICKER} {period} — Released ... heading */
  latest_period: string | null;
  /** Released date string from the same heading */
  released: string | null;
  /**
   * Leading label before the em-dash in **Verdict**: line
   * (e.g. "In-line", "Bullish", "Bearish", "Caution")
   */
  verdict_label: string | null;
  /** Text after the em-dash in **Verdict**: line, trimmed, capped at 200 chars */
  verdict_summary: string | null;
  /** Confidence score (0–1) from "Confidence: X" */
  confidence: number | null;
  /** ISO 8601 file mtime */
  updated_at: string | null;
}

/** Full response body for GET /api/analysis-briefs. */
export interface AnalysisBriefIndexResponse {
  generated_at: string;
  count: number;
  items: AnalysisBriefIndexItem[];
}

// ── Internal parsers (exported for unit tests) ────────────────────────────────

/**
 * Extract the exchange from a **Exchange**: line.
 * Returns null if the line is absent.
 */
export function parseExchange(markdown: string): string | null {
  const m = markdown.match(/^\*\*Exchange\*\*:\s*(.+)$/m);
  if (!m || !m[1]) return null;
  return m[1].trim() || null;
}

/**
 * Find the LATEST "### {ANYTHING} — Released {DATE}" heading in the markdown
 * and extract { latest_period, released }.
 *
 * Heading format (real examples):
 *   ### VCB Q4 2025 — Released 2026-05-12
 *   ### HPG Q3 2025 — Released 2025-10-28
 *
 * We scan ALL such headings and return the one with the latest released date.
 * When multiple headings share the same date we return the last one in
 * document order (i.e. the most recent entry).
 *
 * The "period" is the portion between the ticker prefix and the em-dash,
 * with the ticker stripped from the front (if present).  E.g.:
 *   "VCB Q4 2025 — Released ..."  →  latest_period = "Q4 2025"
 *   "Q2 2025 — Released ..."      →  latest_period = "Q2 2025"
 */
export function parseLatestPeriod(
  markdown: string,
  ticker: string,
): { latest_period: string | null; released: string | null } {
  // Match every "### ... — Released DATE" line
  // The em-dash may be U+2014 (—) or U+2013 (–) or the ASCII sequence " -- "
  const headingRe = /^###\s+(.+?)\s+[—–]\s+Released\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
  let best: { period: string; released: string; releasedMs: number } | null = null;

  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(markdown)) !== null) {
    const rawPeriod = match[1]!.trim();
    const releasedStr = match[2]!;
    const releasedMs = new Date(releasedStr).getTime();

    // Strip leading ticker prefix from period (e.g. "VCB Q4 2025" → "Q4 2025")
    const upperT = ticker.toUpperCase();
    const period = rawPeriod.startsWith(upperT)
      ? rawPeriod.slice(upperT.length).trim()
      : rawPeriod;

    // Keep the latest released date; on tie, last in document order wins
    if (best === null || releasedMs >= best.releasedMs) {
      best = { period, released: releasedStr, releasedMs };
    }
  }

  if (!best) return { latest_period: null, released: null };
  return { latest_period: best.period || null, released: best.released };
}

/**
 * Extract verdict label and summary from the "**Verdict**: ..." line.
 *
 * Expected format: **Verdict**: {Label} — {summary text}
 * where the em-dash (—) separates label from summary.
 *
 * Returns { verdict_label, verdict_summary }.  Both null if the line is absent
 * or does not contain an em-dash separator.
 */
export function parseVerdict(markdown: string): {
  verdict_label: string | null;
  verdict_summary: string | null;
} {
  const m = markdown.match(/^\*\*Verdict\*\*:\s*(.+)$/m);
  if (!m || !m[1]) return { verdict_label: null, verdict_summary: null };

  const text = m[1].trim();
  // Split on first em-dash (U+2014), en-dash (U+2013), or " -- "
  const dashIdx = text.search(/\s*[—–]\s*|\s+--\s+/);
  if (dashIdx === -1) {
    // No separator — treat whole text as label, no summary
    return { verdict_label: text || null, verdict_summary: null };
  }

  const label = text.slice(0, dashIdx).trim() || null;
  const rawSummary = text.slice(dashIdx).replace(/^[\s—–-]+/, "").trim();
  const summary = rawSummary.length > 0 ? rawSummary.slice(0, 200) : null;

  return { verdict_label: label, verdict_summary: summary };
}

/**
 * Extract the confidence score from "Confidence: X" or "| Confidence: X".
 * Returns null if absent or not a valid number.
 */
export function parseConfidence(markdown: string): number | null {
  const m = markdown.match(/Confidence:\s*([\d.]+)/);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) ? null : n;
}

/**
 * Parse one analysis-brief markdown file into an AnalysisBriefIndexItem.
 * A malformed/partial file will result in null fields (no throw).
 */
export function parseAnalysisBriefIndexItem(
  ticker: string,
  markdown: string,
  updatedAt: string,
): AnalysisBriefIndexItem {
  let exchange: string | null = null;
  let latest_period: string | null = null;
  let released: string | null = null;
  let verdict_label: string | null = null;
  let verdict_summary: string | null = null;
  let confidence: number | null = null;

  try {
    exchange = parseExchange(markdown);
  } catch {
    /* null */
  }
  try {
    const p = parseLatestPeriod(markdown, ticker);
    latest_period = p.latest_period;
    released = p.released;
  } catch {
    /* null */
  }
  try {
    const v = parseVerdict(markdown);
    verdict_label = v.verdict_label;
    verdict_summary = v.verdict_summary;
  } catch {
    /* null */
  }
  try {
    confidence = parseConfidence(markdown);
  } catch {
    /* null */
  }

  return {
    ticker,
    exchange,
    latest_period,
    released,
    verdict_label,
    verdict_summary,
    confidence,
    updated_at: updatedAt,
  };
}

/**
 * Read all `docs/analysis-briefs/*.md` files and return a sorted index.
 *
 * Uses the same directory-resolution logic as readAnalysisBrief — no hardcoded path.
 *
 * Sort: updated_at desc (most recently modified first); ties: alphabetical ticker.
 * A single bad file must not be fatal — malformed fields become null.
 * An empty or missing directory returns { count: 0, items: [] } (not an error).
 *
 * @param projectRoot - Absolute path to the repo root (injected for testability)
 * @returns AnalysisBriefIndexResponse
 */
export function readAnalysisBriefIndex(
  projectRoot: string,
): AnalysisBriefIndexResponse {
  const briefsDir = resolve(projectRoot, "docs", "analysis-briefs");
  const generated_at = new Date().toISOString();

  let filenames: string[];
  try {
    filenames = readdirSync(briefsDir).filter((f) => f.endsWith(".md"));
  } catch (err) {
    // Directory absent — empty catalogue (not a server error)
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { generated_at, count: 0, items: [] };
    }
    throw err;
  }

  const items: AnalysisBriefIndexItem[] = [];

  for (const filename of filenames) {
    const ticker = filename.slice(0, -3).toUpperCase(); // strip .md
    const filePath = resolve(briefsDir, filename);

    let updatedAt: string | null = null;
    let markdown = "";

    try {
      const stat = statSync(filePath);
      updatedAt = stat.mtime.toISOString();
    } catch {
      // Can't stat — still include with null updated_at
    }

    try {
      markdown = readFileSync(filePath, "utf-8");
    } catch {
      // Can't read — include ticker with all null fields
    }

    const item = parseAnalysisBriefIndexItem(ticker, markdown, updatedAt ?? "");
    // Normalise empty string updatedAt back to null for the response
    items.push({ ...item, updated_at: updatedAt });
  }

  // Sort: updated_at desc (nulls last), ties alphabetical by ticker
  items.sort((a, b) => {
    if (a.updated_at && b.updated_at) {
      const cmp = b.updated_at.localeCompare(a.updated_at);
      if (cmp !== 0) return cmp;
    } else if (a.updated_at && !b.updated_at) {
      return -1; // a has date, b does not → a first
    } else if (!a.updated_at && b.updated_at) {
      return 1; // b has date, a does not → b first
    }
    return a.ticker.localeCompare(b.ticker);
  });

  return { generated_at, count: items.length, items };
}
