/**
 * Infrastructure — Telegram Command Router (Task 214, Task 1063)
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
 * Supported commands (task 1063 reduced set):
 *   /watchlist        — list watchlist stocks with current prices
 *   /price VCB        — price snapshot for a single stock
 *   /health           — system health (uptime, DB size, watchlist count)
 *   /report <mota>    — report a bug/issue to Dev Team (priority=medium)
 *   /fix   <mota>     — report an urgent bug to Dev Team (priority=high)
 *   /help             — list all commands
 *
 * Removed in task 1063: /alerts, /briefing, /pnl, /ask, /why
 * (fake-AI or low-value commands superseded by scheduler-driven channels).
 *
 * @module infrastructure/notifiers/telegramCommands
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal subset of a Telegram Update needed by the router. */
export interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string };
  };
}

/** Result returned by handleTelegramCommand to the webhook handler. */
export interface CommandResult {
  /** Plain text to send back to Telegram. */
  text: string;
  /** Telegram chat ID to reply to. */
  chatId: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Help text
// ─────────────────────────────────────────────────────────────────────────────

const HELP_TEXT = `VN Market Bot

/watchlist  Danh mục theo dõi
/price VCB  Giá cổ phiếu
/health     Trạng thái hệ thống
/report ... Báo lỗi
/fix ...    Báo lỗi khẩn cấp
/help       Trợ giúp`;

// ─────────────────────────────────────────────────────────────────────────────
// Number formatter
// ─────────────────────────────────────────────────────────────────────────────

/** Format a number with thousands separator (period-separated, Vietnamese style). */
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
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
              mp.price, mp.change_pct
       FROM watchlist w
       LEFT JOIN market_prices mp ON mp.code = w.code
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

  const row = db
    .prepare<PriceRow, [string]>(
      `SELECT code, price, change_amt, change_pct, volume, updated_at
       FROM market_prices WHERE code = ?`,
    )
    .get(code);

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

  try {
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
