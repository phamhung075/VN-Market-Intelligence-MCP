/**
 * Infrastructure — Telegram Presentation Helpers (FACTORY-INFRA-split-telegramCommands)
 *
 * Pure formatting helpers shared by telegramCommands.ts's command handlers and
 * renderers. No SQL, no application-layer imports — presentation only.
 * Extracted verbatim from telegramCommands.ts (was lines 76-90, 96-99, 113-129).
 *
 * @module infrastructure/notifiers/telegram/format
 */

// ─────────────────────────────────────────────────────────────────────────────
// Help text
// ─────────────────────────────────────────────────────────────────────────────

export const HELP_TEXT = `VN Market Bot

/watchlist              Danh mục theo dõi
/price VCB              Giá cổ phiếu
/health                 Trạng thái hệ thống
/news [N]               Tất cả tin quan trọng hôm nay (hoặc N bài gần nhất)
/recap                  Tổng kết hôm nay (chỉ số, cổ phiếu, tin tức, cảnh báo, danh mục)
/recapw                 Tổng kết tuần này
/recapm                 Tổng kết tháng này
/set_position VCB 75000 1000  Thêm/bán/xóa vị thế (qty>0 mua, qty<0 bán, 0 0 xóa)
/check_position         Xem vị thế + P/L + stop-loss + TP
/ask <câu hỏi>          Đặt câu hỏi phân tích (trả lời trong 12 phút)
/report ...             Báo lỗi
/fix ...                Báo lỗi khẩn cấp
/help                   Trợ giúp`;

// ─────────────────────────────────────────────────────────────────────────────
// Number formatter
// ─────────────────────────────────────────────────────────────────────────────

/** Format a number with thousands separator (period-separated, Vietnamese style). */
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML stripping (NEWS-FULLDAY + RECAP-CMD)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string, preserving inner text of element content.
 * Self-closing / void elements (img, br, hr, input, etc.) are discarded entirely.
 * Null or undefined input returns ''. Never throws.
 *
 * Called by handleNews (NEWS-FULLDAY sprint) and handleRecap* (RECAP-CMD sprint).
 * Module-level export for unit testing and sibling-sprint reuse.
 */
export function stripHtml(raw: string | null | undefined): string {
  if (raw == null) return "";
  try {
    // Remove void/self-closing elements entirely (no inner text to preserve)
    let s = raw.replace(
      /<(img|br|hr|input|meta|link|area|base|col|embed|param|source|track|wbr)\b[^>]*\/?>/gi,
      "",
    );
    // Replace all remaining tags with nothing (strip the angle brackets)
    s = s.replace(/<[^>]*>/g, "");
    // Collapse runs of whitespace and trim
    s = s.replace(/\s+/g, " ").trim();
    return s;
  } catch {
    return raw.replace(/<[^>]*>/g, "").trim();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunking helpers (shared by handleNews and the recap renderers)
// ─────────────────────────────────────────────────────────────────────────────

/** Chunk an array of story-block strings into sequential messages each <= maxLen chars. */
export function chunkStories(header: string, storyBlocks: string[], maxLen = 4096): string[] {
  const chunks: string[] = [];
  let current = header;

  for (const block of storyBlocks) {
    const candidate = current + "\n\n" + block;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      chunks.push(current);
      // New chunk starts with the story block directly (no repeated header)
      current = block;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Pre-split a single section block at newline boundaries if it exceeds maxLen.
 * Appends "(tiếp theo…)" to non-final sub-blocks.
 * Defensive guard — in practice no production section block hits 4096 chars.
 */
export function splitBlockAtNewlines(block: string, maxLen = 4096): string[] {
  if (block.length <= maxLen) return [block];
  const parts: string[] = [];
  let remaining = block;
  while (remaining.length > maxLen) {
    const cut = remaining.lastIndexOf("\n", maxLen);
    const boundary = cut > 0 ? cut : maxLen;
    parts.push(remaining.slice(0, boundary) + "\n(tiếp theo…)");
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}
