/**
 * Infrastructure — Telegram Command Router (Task 214, Task 1063, Task NEWS-CMD)
 *
 * Processes incoming Telegram bot commands from webhook updates.
 * Each handler queries SQLite directly (no MCP layer) and returns
 * a plain-text Vietnamese response.
 *
 * Design rules:
 *   - Never throws — all errors wrapped in user-friendly message
 *   - Plain text only (no Markdown to avoid parse errors)
 *   - Returns null when the update has no actionable text
 *
 * Supported commands (task 1063 reduced set, task 1071 additions, task 1073 /ask, NEWS-CMD /news):
 *   /watchlist                  — list watchlist stocks with current prices
 *   /price VCB                  — price snapshot for a single stock
 *   /health                     — system health (uptime, DB size, watchlist count)
 *   /set_position VCB 75000 1000 — buy/sell/clear a position
 *   /check_position             — list all open positions with P/L, stop-loss, TP ladder
 *   /ask <question>             — enqueue a free-form question for the QA Responder agent
 *   /news [N]                   — full digest of today's news from rag_analyses (chunked if > 4096 chars)
 *   /report <mota>              — report a bug/issue to Dev Team (priority=medium)
 *   /fix   <mota>               — report an urgent bug to Dev Team (priority=high)
 *   /help                       — list all commands
 *
 * Removed in task 1063: /alerts, /briefing, /pnl, /why
 * (fake-AI or low-value commands superseded by scheduler-driven channels).
 * /ask re-added in task 1073 with real queue backend (ask_queue table, task 1072).
 *
 * @module infrastructure/notifiers/telegramCommands
 */

import type { Database } from "bun:sqlite";
import {
  applyPositionCommand,
  listOpenPositions,
} from "../db/positionStore.js";
import { insertAskQuestion } from "../db/askQueueStore.js";
import { spawnQaResponder } from "../agents/qaResponderSpawner.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import { assembleEveningSummary } from "../../application/usecases/assembleEveningSummary.js";
import type { EveningSummary } from "../../application/usecases/assembleEveningSummary.js";
import { generatePeriodicSummary } from "../../application/usecases/generatePeriodicSummary.js";
import type { PeriodicSummary } from "../../application/usecases/generatePeriodicSummary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal subset of a Telegram Update needed by the router. */
export interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string; id?: number };
  };
}

/** Result returned by handleTelegramCommand to the webhook handler. */
export interface CommandResult {
  /** Plain text to send back to Telegram (single-message commands). */
  text: string;
  /**
   * Multi-message commands (e.g. /news with a large digest).
   * When present, webhookHandler.ts iterates this array sequentially
   * and ignores `text`. Each element is guaranteed <= 4096 chars.
   */
  texts?: string[];
  /** Telegram chat ID to reply to. */
  chatId: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Help text
// ─────────────────────────────────────────────────────────────────────────────

const HELP_TEXT = `VN Market Bot

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
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared render helpers (NEWS-FULLDAY + RECAP-CMD)
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
// Command handlers
// ─────────────────────────────────────────────────────────────────────────────

/** /help — lists available commands */
function handleHelp(): string {
  return HELP_TEXT;
}

/** /watchlist — query watchlist + market_prices, format Vietnamese list */
function handleWatchlist(db: Database): string {
  interface WatchlistRow {
    code: string;
    company_name: string | null;
    exchange: string;
    domain: string;
    price: number | null;
    change_pct: number | null;
  }

  const rows = db
    .prepare<WatchlistRow, []>(
      `SELECT w.code, w.company_name, w.exchange, w.domain,
              COALESCE(
                (SELECT mp.price FROM market_prices mp WHERE mp.code = w.code AND mp.price IS NOT NULL AND mp.price > 0),
                (SELECT d.close FROM daily_ohlcv d WHERE d.code = w.code ORDER BY d.date DESC LIMIT 1)
              ) AS price,
              (SELECT mp2.change_pct FROM market_prices mp2 WHERE mp2.code = w.code AND mp2.price IS NOT NULL AND mp2.price > 0) AS change_pct
       FROM watchlist w
       ORDER BY w.code ASC`,
    )
    .all();

  if (rows.length === 0) {
    return "Danh mục trống. Chưa có cổ phiếu nào.";
  }

  const header = `Danh mục (${rows.length} mã):`;
  const lines = rows.map((r) => {
    const name = r.company_name ? ` ${r.company_name}` : "";
    if (r.price == null) {
      return `${r.code}${name}\n   Chưa có giá`;
    }
    const arrow = r.change_pct != null ? (r.change_pct >= 0 ? "+" : "") : "";
    const changePart = r.change_pct != null ? `  ${arrow}${r.change_pct.toFixed(2)}%` : "";
    return `${r.code}${name}\n   ${fmtNum(r.price)} VND${changePart}`;
  });

  return [header, "", ...lines].join("\n");
}

/** /price <CODE> — query market_prices for a single stock */
function handlePrice(db: Database, args: string[]): string {
  const rawCode = args[0];
  if (!rawCode) {
    return "Cách dùng: /price VCB";
  }

  const code = rawCode.toUpperCase().trim();

  interface PriceRow {
    code: string;
    price: number | null;
    change_amt: number | null;
    change_pct: number | null;
    volume: number | null;
    updated_at: string | null;
  }

  // Try market_prices first, then fall back to daily_ohlcv
  let row = db
    .prepare<PriceRow, [string]>(
      `SELECT code, price, change_amt, change_pct, volume, updated_at
       FROM market_prices WHERE code = ? AND price IS NOT NULL AND price > 0`,
    )
    .get(code);

  if (!row || row.price == null) {
    // Fallback to daily_ohlcv latest close
    const ohlcv = db
      .prepare<{ code: string; close: number; volume: number; updated_at: string }, [string]>(
        `SELECT code, close, volume, updated_at FROM daily_ohlcv WHERE code = ? ORDER BY date DESC LIMIT 1`,
      )
      .get(code);
    if (ohlcv) {
      row = { code: ohlcv.code, price: ohlcv.close, change_amt: null, change_pct: null, volume: ohlcv.volume, updated_at: ohlcv.updated_at };
    }
  }

  if (!row || row.price == null) {
    return `Không tìm thấy giá cho mã: ${code}`;
  }

  const arrow = row.change_pct != null ? (row.change_pct >= 0 ? "+" : "") : "";
  const changeStr =
    row.change_pct != null
      ? `Thay đổi: ${arrow}${row.change_pct.toFixed(2)}%`
      : "";
  const volumeStr =
    row.volume != null ? `Khối lượng: ${fmtNum(row.volume)}` : "";
  const updatedStr =
    row.updated_at ? `Cập nhật: ${row.updated_at.slice(0, 16)}` : "";

  return [
    `${code}: ${fmtNum(row.price)} VND`,
    changeStr,
    volumeStr,
    updatedStr,
  ]
    .filter(Boolean)
    .join("\n");
}

/** /health — system health: uptime, DB size, watchlist count */
function handleHealth(db: Database): string {
  const uptimeSec = process.uptime();
  const d = Math.floor(uptimeSec / 86400);
  const h = Math.floor((uptimeSec % 86400) / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = Math.floor(uptimeSec % 60);
  const uptimeStr = [
    d > 0 ? `${d}d` : "",
    h > 0 ? `${h}h` : "",
    m > 0 ? `${m}m` : "",
    `${s}s`,
  ]
    .filter(Boolean)
    .join(" ");

  interface CountRow { count: number }

  let watchlistCount = 0;
  let alertCount = 0;
  let priceCount = 0;

  try {
    watchlistCount =
      (db.prepare<CountRow, []>("SELECT COUNT(*) as count FROM watchlist").get()?.count) ?? 0;
  } catch { /* table may not exist */ }

  try {
    alertCount =
      (db.prepare<CountRow, []>("SELECT COUNT(*) as count FROM alerts").get()?.count) ?? 0;
  } catch { /* table may not exist */ }

  try {
    priceCount =
      (db.prepare<CountRow, []>("SELECT COUNT(*) as count FROM market_prices").get()?.count) ?? 0;
  } catch { /* table may not exist */ }

  return [
    "Hệ thống: OK",
    `Uptime: ${uptimeStr}`,
    `Danh mục: ${watchlistCount} mã`,
    `Giá: ${priceCount} mã`,
    `Cảnh báo: ${alertCount}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// /report and /fix handlers (Task 232)
// ─────────────────────────────────────────────────────────────────────────────

// agent_feedback DDL is now canonical in src/infrastructure/db/schema.ts (task 1022).
// No inline guard needed here — initDatabase() creates the table on server start.

/**
 * /report <description> — write a medium-priority issue to agent_feedback.
 * /fix   <description> — same but priority='high'.
 */
function handleReport(
  db: Database,
  args: string[],
  priority: "medium" | "high",
): string {
  const text = args.join(" ").trim();

  if (!text) {
    const cmd = priority === "high" ? "fix" : "report";
    return `Cách dùng: /${cmd} mô tả lỗi`;
  }

  const title = text.slice(0, 100);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  db.prepare(
    `INSERT INTO agent_feedback
       (agent, category, title, detail, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`,
  ).run("user-telegram", "user_report", title, text, priority, now);

  if (priority === "high") {
    return "Đã gửi báo cáo KHẨN CẤP. Sẽ xử lý ngay.";
  }
  return "Đã gửi báo cáo. Sẽ xử lý trong giờ tới.";
}

// ─────────────────────────────────────────────────────────────────────────────
// /ask handler (Task 1073)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * /ask <question> — enqueue a free-form question to ask_queue.
 *
 * The server does NOT answer the question here. The question is stored
 * with status='pending' and handled asynchronously by the 07-qa-responder
 * Cowork agent which polls via askQueueCheckJob (task 1074).
 *
 * @param db      Database connection
 * @param args    Remaining tokens after /ask
 * @param userId  Telegram user ID (string form for storage; defaults to 'default')
 * @returns       Vietnamese confirmation or usage hint
 */
function handleAsk(db: Database, args: string[], userId: string): string {
  const question = args.join(" ").trim();

  if (!question) {
    return (
      "Vui lòng cung cấp câu hỏi sau /ask\n" +
      "Ví dụ: /ask VCB có nên giữ không?"
    );
  }

  const id = insertAskQuestion(db, question, userId);
  // Fire-and-forget — spawn QA Responder immediately; askQueueCheckJob is the fallback
  try { spawnQaResponder(); } catch { /* silent — fallback cron handles it */ }
  return `Câu hỏi đã ghi nhận (#${id}). Đang xử lý...`;
}

// ─────────────────────────────────────────────────────────────────────────────
// /set_position and /check_position handlers (Task 1071)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that a string is a pure-alpha ticker (2–10 uppercase letters only).
 * Rejects strings with digits or special characters.
 */
function isValidTicker(s: string): boolean {
  return /^[A-Za-z]{2,10}$/.test(s);
}

/**
 * /set_position TICKER PRICE QTY
 *
 * Parses and validates the three arguments, then dispatches via
 * `applyPositionCommand`.  Returns a Vietnamese explanation on success,
 * or a usage hint / error on invalid input.
 *
 * Routing (matches applyPositionCommand semantics):
 *   qty > 0             → buy
 *   qty < 0             → sell (abs clamped to holdings)
 *   price == 0 qty == 0 → clear
 *   qty == 0 price > 0  → error (invalid)
 */
function handleSetPosition(db: Database, args: string[]): string {
  if (args.length < 3) {
    return (
      "Cách dùng: /set_position VCB 75000 1000\n" +
      "  qty > 0 = mua, qty < 0 = bán, 0 0 = xóa vị thế"
    );
  }

  const [rawTicker, rawPrice, rawQty] = args;

  // Validate ticker
  if (!isValidTicker(rawTicker!)) {
    return `Lỗi: ticker không hợp lệ "${rawTicker}" — chỉ dùng chữ cái (VD: VCB, FPT).`;
  }

  // Validate price
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || isNaN(price)) {
    return `Lỗi: price không hợp lệ "${rawPrice}" — phải là số (VD: 75000).`;
  }

  // Validate qty
  const qty = Number(rawQty);
  if (!Number.isFinite(qty) || isNaN(qty)) {
    return `Lỗi: qty không hợp lệ "${rawQty}" — phải là số nguyên (VD: 1000 hoặc -500).`;
  }

  const ticker = rawTicker!.toUpperCase();
  const result = applyPositionCommand(db, { ticker, price, qty });

  if (!result.ok) {
    return `Lỗi: ${result.message}`;
  }

  return result.message;
}

/**
 * /check_position — list all open positions with:
 *   - Current price and P/L percentage
 *   - Stop-loss floor (avgCost * 0.93)
 *   - TP ladder: TP1 (+10%), TP2 (+20%), TP3 (+30%)
 *
 * Shows "Chưa có giá" when no market price is available for a position.
 */
function handleCheckPosition(db: Database): string {
  const positions = listOpenPositions(db);

  if (positions.length === 0) {
    return "Bạn chưa có vị thế nào.";
  }

  const lines: string[] = [`Vị thế (${positions.length} mã):\n`];

  for (const pos of positions) {
    const stopFloor = Math.round(pos.avgPrice * 0.93);
    const tp1 = Math.round(pos.avgPrice * 1.10);
    const tp2 = Math.round(pos.avgPrice * 1.20);
    const tp3 = Math.round(pos.avgPrice * 1.30);

    const avgPriceStr = fmtNum(pos.avgPrice);
    const stopStr = fmtNum(stopFloor);
    const tp1Str = fmtNum(tp1);
    const tp2Str = fmtNum(tp2);
    const tp3Str = fmtNum(tp3);

    let pnlLine: string;
    if (pos.currentPrice == null) {
      pnlLine = "Chưa có giá";
    } else {
      const sign = pos.unrealizedPnlPct >= 0 ? "+" : "";
      // Use vi-VN locale so decimal separator is comma (6,67%)
      const pctStr = pos.unrealizedPnlPct.toLocaleString("vi-VN", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      const currentStr = fmtNum(pos.currentPrice);
      pnlLine = `Giá hiện tại: ${currentStr} VND  P/L: ${sign}${pctStr}%`;
    }

    lines.push(
      `${pos.code} — ${fmtNum(pos.shares)} CP @ ${avgPriceStr} VND`,
      `  ${pnlLine}`,
      `  Stop-loss sàn: ${stopStr} VND`,
      `  TP: +10% ${tp1Str}  +20% ${tp2Str}  +30% ${tp3Str}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// /news handler (Task NEWS-CMD)
// ─────────────────────────────────────────────────────────────────────────────

/** Map sentiment column value to plain Vietnamese label. */
function sentimentLabel(raw: string | null | undefined): string {
  switch (raw) {
    case "positive":
    case "tích cực":
      return "tích cực";
    case "negative":
    case "tiêu cực":
      return "tiêu cực";
    case "neutral":
    case "trung tính":
      return "trung tính";
    default:
      return "trung tính";
  }
}

/** Inline midnight-Vietnam-as-UTC arithmetic (mirrors assembleEveningSummary.ts). */
function midnightVietnamAsUtcInline(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const midnight = new Date(
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - VN_OFFSET_MS,
  );
  return midnight.toISOString();
}

/** Chunk an array of story-block strings into sequential messages each <= maxLen chars. */
function chunkStories(header: string, storyBlocks: string[], maxLen = 4096): string[] {
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
 * /news [N] — query rag_analyses for today's stories (UTC+7 midnight), format
 * as plain Vietnamese digest. Returns `texts[]` for chunked delivery.
 *
 * Primary query (no-arg): all of today's rows — NO LIMIT (full-day coverage).
 * Explicit /news N: clamps to MIN(MAX_LIMIT_EXPLICIT, N).
 * Fallback (zero today-rows): most-recent FALLBACK_LIMIT rows, no date constraint.
 * Header changes to "Tin tức gần đây" when fallback is active.
 *
 * Dedup: collapse same-story duplicates (normalized source_title key);
 * keep highest-impact copy (impact_score DESC, then created_at DESC, then longer summary).
 * HTML: stripHtml applied to source_title and summary before render.
 */
function handleNews(db: Database, args: string[]): { texts: string[] } {
  /** Cap for an explicit /news N request — no cap on the default full-day query. */
  const MAX_LIMIT_EXPLICIT = 200;
  const MIN_LIMIT = 1;
  /** Fallback path (no today-rows) stays capped at 20 (stale multi-day data). */
  const FALLBACK_LIMIT = 20;

  // Parse optional count argument
  // null = uncapped (default full-day query); number = explicit user cap
  let explicitLimit: number | null = null;
  if (args[0] !== undefined) {
    const parsed = parseInt(args[0], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      explicitLimit = Math.min(MAX_LIMIT_EXPLICIT, Math.max(MIN_LIMIT, parsed));
    }
    // parsed <= 0 or NaN → treat as no-arg (uncapped)
  }

  interface NewsRow {
    source_title: string | null;
    source_url: string | null;
    summary: string | null;
    sentiment: string | null;
    impact_direction: string | null;
    impact_score: number | null;
    created_at: string;
  }

  let rows: NewsRow[] = [];
  let isFallback = false;

  try {
    const midnight = midnightVietnamAsUtcInline();

    if (explicitLimit !== null) {
      // Explicit /news N path — apply LIMIT
      rows = db
        .prepare<NewsRow, [string, number]>(
          `SELECT source_title, source_url, summary, sentiment, impact_direction, impact_score, created_at
           FROM rag_analyses
           WHERE created_at >= ?
           ORDER BY impact_score DESC, created_at DESC
           LIMIT ?`,
        )
        .all(midnight, explicitLimit);
    } else {
      // Default no-arg path — fetch ALL of today's rows (no LIMIT)
      rows = db
        .prepare<NewsRow, [string]>(
          `SELECT source_title, source_url, summary, sentiment, impact_direction, impact_score, created_at
           FROM rag_analyses
           WHERE created_at >= ?
           ORDER BY impact_score DESC, created_at DESC`,
        )
        .all(midnight);
    }

    // Fallback: most-recent FALLBACK_LIMIT rows regardless of date
    if (rows.length === 0) {
      isFallback = true;
      rows = db
        .prepare<NewsRow, [number]>(
          `SELECT source_title, source_url, summary, sentiment, impact_direction, impact_score, created_at
           FROM rag_analyses
           ORDER BY impact_score DESC, created_at DESC
           LIMIT ?`,
        )
        .all(FALLBACK_LIMIT);
    }
  } catch {
    // DB error (e.g. table not yet created) — return friendly fallback
    return { texts: ["Chưa có tin hôm nay."] };
  }

  // Empty DB entirely
  if (rows.length === 0) {
    return { texts: ["Chưa có tin hôm nay."] };
  }

  // ── Dedup: collapse same-story duplicates (normalized source_title key) ──
  // Rows are already ordered by impact_score DESC, created_at DESC from SQL.
  // First occurrence of each normalized key wins (highest-impact copy).
  // Null/empty titles each get a unique Symbol key (treated as individual stories).

  function normalizeTitle(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const stripped = stripHtml(raw);
    if (!stripped) return null;
    // lowercase → collapse whitespace → strip trailing punctuation
    const normalized = stripped
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,!?;:]+$/, "");
    return normalized || null;
  }

  const seenKeys = new Map<string, true>();
  const dedupedRows: NewsRow[] = [];

  for (const row of rows) {
    const key = normalizeTitle(row.source_title);
    if (key === null) {
      // Null or empty-after-normalize: each is unique — always keep
      dedupedRows.push(row);
    } else {
      if (!seenKeys.has(key)) {
        seenKeys.set(key, true);
        dedupedRows.push(row);
      }
      // duplicate — skip (SQL order guarantees highest-impact comes first)
    }
  }

  // Build header using POST-DEDUP count
  const headerLabel = isFallback ? "Tin tức gần đây" : "Tin tức hôm nay";
  const header = `${headerLabel} (${dedupedRows.length} bài):`;

  // Build per-story blocks (HTML stripped from title and summary)
  const storyBlocks: string[] = dedupedRows.map((row) => {
    // Strip HTML from title before display
    const strippedTitle = stripHtml(row.source_title);
    const titleLine = strippedTitle || "(không có tiêu đề)";

    const lines: string[] = [titleLine];

    // One-line gist from summary (strip HTML, then truncate at 200 chars plain text)
    if (row.summary != null && row.summary.length > 0) {
      const plainSummary = stripHtml(row.summary);
      if (plainSummary.length > 0) {
        const gist =
          plainSummary.length > 200
            ? plainSummary.slice(0, 200) + "…"
            : plainSummary;
        lines.push(gist);
      }
    }

    // Sentiment label (plain Vietnamese — no raw English, no numeric score)
    lines.push(`Cảm xúc: ${sentimentLabel(row.sentiment)}`);

    return lines.join("\n");
  });

  // Chunk stories into Telegram-safe messages (<= 4096 chars each)
  const chunks = chunkStories(header, storyBlocks, 4096);

  return { texts: chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECAP-CMD helpers and handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-split a single section block at newline boundaries if it exceeds maxLen.
 * Appends "(tiếp theo…)" to non-final sub-blocks.
 * Defensive guard — in practice no production section block hits 4096 chars.
 */
function splitBlockAtNewlines(block: string, maxLen = 4096): string[] {
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

/** Map severity string to plain Vietnamese label for alert rendering. */
function severityLabelVi(raw: string | null | undefined): string {
  switch (raw) {
    case "critical": return "Nghiêm trọng";
    case "warning":  return "Cảnh báo";
    case "info":     return "Thông tin";
    case "high":     return "Cao";
    default:         return "Thông tin";
  }
}

/** Map direction string to plain Vietnamese direction word. */
function directionVi(raw: string | null | undefined): string {
  switch (raw) {
    case "up":   return "tăng";
    case "down": return "giảm";
    default:     return "ổn định";
  }
}

/**
 * /recap — day synthesis from assembleEveningSummary.
 * assembleFn is an injectable override for tests (zero DB side-effects, zero filesystem).
 * Production omits it — the real assembleEveningSummary is called.
 * Exported for direct unit testing with injected assembleFn.
 */
export async function handleRecap(
  db: Database,
  assembleFn?: (db: Database) => Promise<EveningSummary>,
): Promise<{ texts: string[] }> {
  try {
    const fn = assembleFn ?? ((d: Database) => assembleEveningSummary({ db: d }));
    const summary = await fn(db);

    const sectionBlocks: string[] = [];

    // Section 2 — VN-Index (present only when defined)
    if (summary.vnIndex !== undefined) {
      const direction = summary.vnIndex.change >= 0 ? "tăng" : "giảm";
      const absChange = Math.abs(summary.vnIndex.change);
      const absPct = Math.abs(summary.vnIndex.changePct).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      sectionBlocks.push(
        `VN-Index: ${fmtNum(summary.vnIndex.close)} điểm (${direction} ${fmtNum(absChange)} điểm, ${direction} ${absPct}%)`,
      );
    }

    // Section 3 — Watchlist movers (always present)
    {
      const lines: string[] = ["Cổ phiếu nổi bật:"];
      if (summary.watchlistMovers.length === 0) {
        lines.push("Không có cổ phiếu nào biến động đáng kể hôm nay.");
      } else {
        for (const mover of summary.watchlistMovers) {
          const dir = mover.changePct >= 0 ? "tăng" : "giảm";
          const absPct = Math.abs(mover.changePct).toLocaleString("vi-VN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          lines.push(`${mover.code}: ${dir} +${absPct}% (giá ${fmtNum(mover.price)})`);
        }
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 4 — Top news (present only when non-empty)
    if (summary.topStories.length > 0) {
      const lines: string[] = [`Tin tức nổi bật (${summary.topStories.length} bài):`];
      for (const story of summary.topStories) {
        const title = stripHtml(story.title) || "(không có tiêu đề)";
        lines.push(title);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 5 — Alerts (present only when non-empty)
    if (summary.topAlerts.length > 0) {
      const lines: string[] = ["Cảnh báo:"];
      for (const alert of summary.topAlerts) {
        const sevLabel = severityLabelVi(alert.severity);
        const msg = alert.message.length > 120
          ? alert.message.slice(0, 120) + "…"
          : alert.message;
        lines.push(`[${sevLabel}] ${msg}`);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 6 — Portfolio P/L (present only when non-null/undefined)
    if (summary.portfolioPnl != null) {
      const lines: string[] = ["Danh mục:"];
      for (const item of summary.portfolioPnl.items) {
        if (item.pnlPct === null || item.pnlAmount === null) {
          lines.push(`${item.code}: chưa có giá`);
        } else {
          const dir = item.pnlAmount >= 0 ? "lãi" : "lỗ";
          const absPct = Math.abs(item.pnlPct).toLocaleString("vi-VN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          lines.push(`${item.code}: ${dir} +${absPct}% (${dir} ${fmtNum(Math.abs(item.pnlAmount))} đ)`);
        }
      }
      // Aggregate footer
      const totalDir = summary.portfolioPnl.totalPnlAmount >= 0 ? "lãi" : "lỗ";
      const totalAbsPct = Math.abs(summary.portfolioPnl.totalPnlPct).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      lines.push(
        `Tổng: ${totalDir} +${totalAbsPct}% (${totalDir} ${fmtNum(Math.abs(summary.portfolioPnl.totalPnlAmount))} đ)`,
      );
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 7 — Foreign flow (present only when defined and non-empty)
    if (summary.foreignFlowMovers && summary.foreignFlowMovers.length > 0) {
      const lines: string[] = ["Khối ngoại:"];
      for (const mover of summary.foreignFlowMovers) {
        const dir = mover.foreignNetVol > 0 ? "mua ròng" : "bán ròng";
        lines.push(`${mover.code}: ${dir} ${fmtNum(Math.abs(mover.foreignNetVol))} cổ phiếu`);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    const header = `Tổng kết ngày ${summary.date}`;
    const flatBlocks = sectionBlocks.flatMap((b) => splitBlockAtNewlines(b));
    return { texts: chunkStories(header, flatBlocks, 4096) };
  } catch {
    return { texts: ["Lỗi khi tổng kết ngày. Vui lòng thử lại sau."] };
  }
}

/**
 * /recapw — weekly synthesis from generatePeriodicSummary.
 * assembleFn injectable override for tests.
 * Exported for direct unit testing with injected assembleFn.
 */
export async function handleRecapWeek(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicSummary>,
): Promise<{ texts: string[] }> {
  try {
    const fn = assembleFn ?? ((d: Database) => generatePeriodicSummary("weekly", undefined, d));
    const summary = await fn(db);
    return { texts: buildPeriodicTexts(summary, "week") };
  } catch {
    return { texts: ["Lỗi khi tổng kết tuần. Vui lòng thử lại sau."] };
  }
}

/**
 * /recapm — monthly synthesis from generatePeriodicSummary.
 * assembleFn injectable override for tests.
 * Exported for direct unit testing with injected assembleFn.
 */
export async function handleRecapMonth(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicSummary>,
): Promise<{ texts: string[] }> {
  try {
    const fn = assembleFn ?? ((d: Database) => generatePeriodicSummary("monthly", undefined, d));
    const summary = await fn(db);
    return { texts: buildPeriodicTexts(summary, "month") };
  } catch {
    return { texts: ["Lỗi khi tổng kết tháng. Vui lòng thử lại sau."] };
  }
}

/**
 * Shared section builder for /recapw and /recapm.
 * period = "week" | "month" determines the header label.
 */
function buildPeriodicTexts(summary: PeriodicSummary, period: "week" | "month"): string[] {
  const periodLabel = period === "week" ? "tuần" : "tháng";
  const header = `Tổng kết ${periodLabel} ${summary.periodStart} đến ${summary.periodEnd}`;

  const sectionBlocks: string[] = [];

  // Section 2 — Totals (always present)
  sectionBlocks.push(
    [
      "Tổng quan:",
      `Tin tức: ${summary.newsCount} bài`,
      `Cảnh báo: ${summary.alertCount} cảnh báo`,
      `Báo cáo tài chính: ${summary.reportCount} báo cáo`,
    ].join("\n"),
  );

  // Section 3 — Key events (present only when non-empty)
  if (summary.keyEvents.length > 0) {
    const lines: string[] = ["Sự kiện nổi bật:"];
    const events = summary.keyEvents.slice(0, 5);
    for (const ev of events) {
      const localDate = (ev.date ?? "").slice(0, 10);
      const dir = directionVi(ev.direction);
      const title = stripHtml(ev.title);
      const truncTitle = title.length > 100 ? title.slice(0, 100) + "…" : title;
      lines.push(`${localDate} — ${dir} — ${truncTitle}`);
    }
    sectionBlocks.push(lines.join("\n"));
  }

  // Section 4 — Per-stock moves (present only when at least one non-null changePct)
  {
    const entries = Object.entries(summary.stockPerformance)
      .filter(([, perf]) => perf.changePct !== null)
      .sort((a, b) => Math.abs(b[1].changePct!) - Math.abs(a[1].changePct!));

    if (entries.length > 0) {
      const lines: string[] = ["Biến động cổ phiếu:"];
      for (const [code, perf] of entries) {
        const dir = (perf.changePct ?? 0) >= 0 ? "tăng" : "giảm";
        const absPct = Math.abs(perf.changePct!).toLocaleString("vi-VN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        lines.push(`${code}: ${dir} +${absPct}%`);
      }
      sectionBlocks.push(lines.join("\n"));
    }
  }

  // Section 5 — Alert breakdown (present only when alertCount > 0)
  if (summary.alertCount > 0) {
    const lines: string[] = ["Phân loại cảnh báo:"];
    for (const [sev, count] of Object.entries(summary.alertsSummary.bySeverity)) {
      lines.push(`${severityLabelVi(sev)}: ${count}`);
    }
    const topAlerts = (summary.alertsSummary.topAlerts ?? []).slice(0, 3);
    for (const msg of topAlerts) {
      const truncMsg = msg.length > 100 ? msg.slice(0, 100) + "…" : msg;
      lines.push(`- ${truncMsg}`);
    }
    sectionBlocks.push(lines.join("\n"));
  }

  const flatBlocks = sectionBlocks.flatMap((b) => splitBlockAtNewlines(b));
  return chunkStories(header, flatBlocks, 4096);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route an incoming Telegram update to the appropriate command handler.
 *
 * Returns null when the update has no actionable message (no text, no message).
 * Never throws — errors are caught and wrapped in a user-friendly Vietnamese message.
 */
export async function handleTelegramCommand(
  update: TelegramUpdate,
  db: Database,
): Promise<CommandResult | null> {
  const message = update.message;
  if (!message) return null;

  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  if (!text) return null;

  // Parse command and arguments
  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = (rawCmd ?? "").toLowerCase();

  // Telegram user id — stringify for DB storage (ask_queue.user_id is TEXT)
  const userId = message.from?.id != null ? String(message.from.id) : "default";

  try {
    // /news returns { texts: string[] } — handle separately from single-text commands
    if (cmd === "/news") {
      const newsResult = handleNews(db, args);
      return { text: newsResult.texts[0] ?? "", texts: newsResult.texts, chatId };
    }

    // Recap commands — async handlers returning { texts: string[] }
    if (cmd === "/recap") {
      const r = await handleRecap(db);
      return { text: r.texts[0] ?? "", texts: r.texts, chatId };
    }
    if (cmd === "/recapw") {
      const r = await handleRecapWeek(db);
      return { text: r.texts[0] ?? "", texts: r.texts, chatId };
    }
    if (cmd === "/recapm") {
      const r = await handleRecapMonth(db);
      return { text: r.texts[0] ?? "", texts: r.texts, chatId };
    }

    let responseText: string;

    switch (cmd) {
      case "/help":
        responseText = handleHelp();
        break;

      case "/watchlist":
        responseText = handleWatchlist(db);
        break;

      case "/price":
        responseText = handlePrice(db, args);
        break;

      case "/health":
        responseText = handleHealth(db);
        break;

      case "/set_position":
        responseText = handleSetPosition(db, args);
        break;

      case "/check_position":
        responseText = handleCheckPosition(db);
        break;

      case "/ask":
        responseText = handleAsk(db, args, userId);
        break;

      case "/report":
        responseText = handleReport(db, args, "medium");
        break;

      case "/fix":
        responseText = handleReport(db, args, "high");
        break;

      default:
        // Unknown command or plain text — show help
        responseText = `Lệnh không hợp lệ: "${rawCmd ?? text}"\n\n${HELP_TEXT}`;
        break;
    }

    return { text: responseText, chatId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      text: `Lỗi xử lý lệnh "${rawCmd ?? text}": ${errMsg.slice(0, 100)}`,
      chatId,
    };
  }
}
