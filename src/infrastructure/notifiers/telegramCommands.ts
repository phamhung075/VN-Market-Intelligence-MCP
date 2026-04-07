/**
 * Infrastructure — Telegram Command Router (Task 214)
 *
 * Processes incoming Telegram bot commands from webhook updates.
 * Each handler queries SQLite directly (no MCP layer) and returns
 * a plain-text Vietnamese response.
 *
 * Design rules:
 *   - Never throws — all errors wrapped in user-friendly message
 *   - Plain text only (no Markdown to avoid parse errors)
 *   - All financial values in VND (positions) or million VND (BCTC)
 *   - Returns null when the update has no actionable text
 *
 * Supported commands:
 *   /watchlist        — list watchlist stocks with current prices
 *   /price VCB        — price snapshot for a single stock
 *   /alerts           — last 5 alerts
 *   /briefing         — condensed morning briefing from DB
 *   /health           — system health (uptime, DB size, watchlist count)
 *   /pnl              — portfolio P&L from positions + market_prices
 *   /report <mota>    — report a bug/issue to Dev Team (priority=medium)
 *   /fix <mota>       — report an urgent bug to Dev Team (priority=high)
 *   /help             — list all commands
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
/alerts     Cảnh báo gần nhất
/briefing   Tóm tắt thị trường
/pnl        Lãi/Lỗ danh mục
/health     Trạng thái hệ thống
/ask ...    Hỏi AI phân tích
/why VCB    Tại sao biến động?
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

/** Format a percentage with 2 decimal places and a leading sign. */
function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
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

/** /alerts — last 5 alerts from alerts table */
function handleAlerts(db: Database): string {
  interface AlertRow {
    id: string;
    triggered_at: string;
    severity: string;
    message: string | null;
  }

  const rows = db
    .prepare<AlertRow, []>(
      `SELECT id, triggered_at, severity, message
       FROM alerts
       ORDER BY triggered_at DESC
       LIMIT 5`,
    )
    .all();

  if (rows.length === 0) {
    return "Không có cảnh báo nào gần đây.";
  }

  const SEV_ICON: Record<string, string> = {
    critical: "!!",
    high: "! ",
    medium: "- ",
    low: "  ",
    info: "  ",
    warning: "- ",
  };

  const header = `Cảnh báo gần nhất:`;
  const lines = rows.map((r, i) => {
    const icon = SEV_ICON[r.severity.toLowerCase()] ?? "  ";
    const msg = r.message ? r.message.slice(0, 80) : "(không có nội dung)";
    const date = r.triggered_at.slice(5, 16);
    return `${icon}${date}\n   ${msg}`;
  });

  return [header, "", ...lines].join("\n");
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

/** /pnl — compute P&L from positions + market_prices */
function handlePnl(db: Database): string {
  interface PositionRow {
    code: string;
    shares: number;
    avg_price: number;
    current_price: number | null;
  }

  let rows: PositionRow[] = [];
  try {
    rows = db
      .prepare<PositionRow, []>(
        `SELECT p.code, p.shares, p.avg_price,
                mp.price AS current_price
         FROM positions p
         LEFT JOIN market_prices mp ON mp.code = p.code
         WHERE p.closed_at IS NULL
         ORDER BY p.code ASC`,
      )
      .all();
  } catch {
    return "Không thể đọc dữ liệu vị thế.";
  }

  if (rows.length === 0) {
    return "Chưa có vị thế nào đang mở.";
  }

  let totalCost = 0;
  let totalPnl = 0;
  let hasPnl = false;

  const lines = rows.map((r) => {
    const cost = r.shares * r.avg_price;
    totalCost += cost;

    if (r.current_price == null) {
      return `${r.code}  ${r.shares} cp @ ${fmtNum(r.avg_price)}\n   Giá: chưa có`;
    }

    const pnl = (r.current_price - r.avg_price) * r.shares;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    totalPnl += pnl;
    hasPnl = true;

    const sign = pnl >= 0 ? "+" : "";
    return `${r.code}  ${fmtNum(r.current_price)} VND\n   ${r.shares} cp  ${sign}${fmtNum(pnl)} (${sign}${pnlPct.toFixed(1)}%)`;
  });

  const header = `Lãi/Lỗ (${rows.length} vị thế):`;
  const totalSign = totalPnl >= 0 ? "+" : "";
  const totalLine = hasPnl
    ? `TỔNG: ${totalSign}${fmtNum(totalPnl)} VND (${totalCost > 0 ? `${totalSign}${((totalPnl / totalCost) * 100).toFixed(1)}%` : "N/A"})`
    : "TỔNG: chưa có giá";

  return [header, "", ...lines, "", totalLine].join("\n");
}

/** /briefing — condensed market briefing from DB */
function handleBriefing(db: Database): string {
  interface StoryRow {
    source_title: string | null;
    sentiment: string | null;
    impact_score: number | null;
    level: string;
  }
  interface AlertRow {
    severity: string;
    message: string | null;
    triggered_at: string;
  }
  interface PriceRow {
    code: string;
    price: number | null;
    change_pct: number | null;
  }

  const parts: string[] = [];

  // ── Top stories from rag_analyses ────────────────────────────────────────
  try {
    const stories = db
      .prepare<StoryRow, []>(
        `SELECT source_title, sentiment, impact_score, level
         FROM rag_analyses
         WHERE created_at > datetime('now', '-24 hours')
         ORDER BY impact_score DESC
         LIMIT 3`,
      )
      .all();

    if (stories.length > 0) {
      parts.push("Tin nổi bật (24h):");
      stories.forEach((s, i) => {
        const title = s.source_title ?? "(không có tiêu đề)";
        const sent = s.sentiment === "bullish" ? "+" : s.sentiment === "bearish" ? "-" : " ";
        parts.push(`${sent} ${title.slice(0, 80)}`);
      });
    }
  } catch { /* skip section on error */ }

  // ── Watchlist prices ──────────────────────────────────────────────────────
  try {
    const prices = db
      .prepare<PriceRow, []>(
        `SELECT w.code, mp.price, mp.change_pct
         FROM watchlist w
         LEFT JOIN market_prices mp ON mp.code = w.code
         ORDER BY w.code ASC`,
      )
      .all();

    if (prices.length > 0) {
      parts.push("\nGiá danh mục:");
      prices.forEach((p) => {
        if (p.price == null) {
          parts.push(`${p.code}: chưa có giá`);
          return;
        }
        const arrow = p.change_pct != null ? (p.change_pct >= 0 ? "+" : "") : "";
        const changePart = p.change_pct != null ? `  ${arrow}${p.change_pct.toFixed(2)}%` : "";
        parts.push(`${p.code}: ${fmtNum(p.price)}${changePart}`);
      });
    }
  } catch { /* skip section on error */ }

  // ── Recent alerts ─────────────────────────────────────────────────────────
  try {
    const alerts = db
      .prepare<AlertRow, []>(
        `SELECT severity, message, triggered_at
         FROM alerts
         WHERE triggered_at > datetime('now', '-12 hours')
         ORDER BY triggered_at DESC
         LIMIT 3`,
      )
      .all();

    if (alerts.length > 0) {
      parts.push("\nCảnh báo:");
      alerts.forEach((a) => {
        const msg = a.message ? a.message.slice(0, 80) : "";
        parts.push(`${msg}`);
      });
    }
  } catch { /* skip section on error */ }

  if (parts.length === 0) {
    return "Chưa có dữ liệu. Hệ thống đang thu thập tin tức.";
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// /ask and /why handlers (Task 238)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure `user_requests` table exists (idempotent DDL).
 * Inline to keep telegramCommands self-contained — avoids an async import.
 */
function ensureUserRequestsTableInline(db: Database): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_requests (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        command     TEXT NOT NULL,
        payload     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        response    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        answered_at TEXT
      )
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status)`,
    );
  } catch { /* table already exists */ }
}

/**
 * Insert a pending user request row and return its auto-increment ID.
 */
function insertUserRequestInline(
  db: Database,
  command: string,
  payload: string,
): number {
  const result = db
    .prepare(
      `INSERT INTO user_requests (command, payload, status, created_at)
       VALUES (?, ?, 'pending', datetime('now'))`,
    )
    .run(command, payload);
  return result.lastInsertRowid as number;
}

/**
 * /ask <question> — queue an async AI analysis request.
 * /why <TICKER>   — queue "Why did <TICKER> move today?" as an ask request.
 *
 * Inserts a row into `user_requests` with status='pending'.
 * The intelligence cycle step F picks up pending rows, runs RAG search,
 * and sends the answer back via Telegram Chat Channel within ~15 minutes.
 *
 * @param db   - Active bun:sqlite Database connection.
 * @param text - The question text (already extracted by the caller).
 * @returns Plain-text Vietnamese response.
 */
function handleAsk(db: Database, text: string): string {
  const trimmed = text.trim();

  if (!trimmed) {
    return "Cách dùng: /ask VCB giảm vì sao?";
  }

  ensureUserRequestsTableInline(db);
  const id = insertUserRequestInline(db, "ask", trimmed);

  return `Đang phân tích... Kết quả sẽ gửi trong 15 phút.\nID: ${id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// /report and /fix handlers (Task 232)
// ─────────────────────────────────────────────────────────────────────────────

// agent_feedback DDL is now canonical in src/infrastructure/db/schema.ts (task 1022).
// No inline guard needed here — initDatabase() creates the table on server start.

/**
 * /report <description> — write a medium-priority issue to agent_feedback.
 * /fix   <description> — same but priority='high'.
 *
 * @param db       - Active bun:sqlite Database connection.
 * @param args     - Words after the command token.
 * @param priority - 'medium' for /report, 'high' for /fix.
 * @returns Plain-text Vietnamese response.
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

  // agent_feedback table guaranteed by initDatabase() in schema.ts (task 1022)
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
 *
 * @param update - The parsed Telegram Update object.
 * @param db     - Active bun:sqlite Database connection (injected by caller).
 * @returns CommandResult with text + chatId, or null if nothing to do.
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

      case "/alerts":
        responseText = handleAlerts(db);
        break;

      case "/health":
        responseText = handleHealth(db);
        break;

      case "/pnl":
        responseText = handlePnl(db);
        break;

      case "/briefing":
        responseText = handleBriefing(db);
        break;

      case "/ask":
        // /ask Why did VCB drop today?
        responseText = handleAsk(db, args.join(" "));
        break;

      case "/why": {
        // /why VCB → stores payload as "why:VCB" (Task 307)
        const ticker = args[0]?.trim() ?? "";
        if (!ticker) {
          responseText =
            "Vui lòng cung cấp mã chứng khoán, ví dụ: /why VCB";
        } else {
          responseText = handleAsk(db, `why:${ticker.toUpperCase()}`);
        }
        break;
      }

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
