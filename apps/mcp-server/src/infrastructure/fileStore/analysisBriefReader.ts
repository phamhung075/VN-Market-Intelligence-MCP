/**
 * analysisBriefReader.ts — Infrastructure adapter: per-ticker analysis brief reader
 *
 * MAW-P0-3: Reads `docs/analysis-briefs/{TICKER}.md` from disk and parses the
 * four canonical agent sections into a structured JSON DTO.
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

import { readFileSync, statSync } from "node:fs";
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
