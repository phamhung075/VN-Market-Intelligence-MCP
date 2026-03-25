/**
 * Embedding Text Builder — Domain Service
 *
 * Builds a deterministic text string from analysis entry fields
 * for use as input to the embedding model (multilingual-MiniLM).
 *
 * Format:
 *   [level] title          (level prefix only if present)
 *   summary
 *   tag1 tag2 tag3         (space-separated, only if non-empty)
 *   stock:CODE             (only if actionCode present)
 *
 * Pure function — no I/O, no infrastructure imports.
 */

export interface EmbeddingTextInput {
  title: string;
  summary: string;
  tags: string[];
  level?: string;
  actionCode?: string;
}

export function buildEmbeddingText(entry: EmbeddingTextInput): string {
  const parts: string[] = [];

  // Build title line with optional level prefix
  const title = entry.title.trim();
  const level = entry.level?.trim() ?? "";
  if (level && title) {
    parts.push(`[${level}] ${title}`);
  } else if (title) {
    parts.push(title);
  }

  // Add summary
  const summary = entry.summary.trim();
  if (summary) {
    parts.push(summary);
  }

  // Add tags (space-separated, filtered and trimmed)
  const cleanTags = entry.tags
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (cleanTags.length > 0) {
    parts.push(cleanTags.join(" "));
  }

  // Add actionCode
  const actionCode = entry.actionCode?.trim() ?? "";
  if (actionCode) {
    parts.push(`stock:${actionCode}`);
  }

  return parts.join("\n");
}
