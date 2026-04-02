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

const HELP_TEXT = `Cac lenh ho tro:
/watchlist - Danh muc theo doi
/price <MA> - Gia co phieu (vd: /price VCB)
/alerts - 5 canh bao gan nhat
/briefing - Tom tat thi truong
/health - Trang thai he thong
/pnl - Lai/Lo danh muc (P&L)
/ask <cau hoi> - Hoi AI phan tich (vd: /ask VCB giam vi sao?)
/why <MA> - Tai sao co phieu nay bien dong? (vd: /why VCB)
/report <mota> - Bao loi cho Dev Team
/fix <mota> - Bao loi khan cap
/help - Danh sach lenh nay`;

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
    return "Danh muc theo doi trong (chua co co phieu nao).";
  }

  const header = `Danh muc theo doi (${rows.length} co phieu):`;
  const lines = rows.map((r) => {
    const name = r.company_name ? ` — ${r.company_name}` : "";
    const priceStr =
      r.price != null
        ? `  ${fmtNum(r.price)} VND ${r.change_pct != null ? fmtPct(r.change_pct) : ""}`
        : "  (chua co gia)";
    return `• ${r.code} [${r.exchange}]${name}${priceStr}`;
  });

  return [header, ...lines].join("\n");
}

/** /price <CODE> — query market_prices for a single stock */
function handlePrice(db: Database, args: string[]): string {
  const rawCode = args[0];
  if (!rawCode) {
    return "Su dung: /price <MA_CO_PHIEU>\nVi du: /price VCB";
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
    return `Khong tim thay du lieu gia cho ma: ${code}`;
  }

  const changeStr =
    row.change_amt != null && row.change_pct != null
      ? `  Thay doi: ${fmtNum(row.change_amt)} VND (${fmtPct(row.change_pct)})`
      : "";
  const volumeStr =
    row.volume != null ? `  KL: ${fmtNum(row.volume)}` : "";
  const updatedStr =
    row.updated_at ? `  Cap nhat: ${row.updated_at}` : "";

  return [
    `Gia ${code}: ${fmtNum(row.price)} VND`,
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
    return "Khong co canh bao nao gan day.";
  }

  const SEVERITY_VI: Record<string, string> = {
    critical: "NGHIEM TRONG",
    high: "QUAN TRONG",
    medium: "LUU Y",
    low: "THONG TIN",
    info: "THONG TIN",
    warning: "LUU Y",
  };

  const header = `5 canh bao gan nhat:`;
  const lines = rows.map((r, i) => {
    const sevLabel = SEVERITY_VI[r.severity.toLowerCase()] ?? r.severity.toUpperCase();
    const msg = r.message ? ` — ${r.message.slice(0, 60)}` : "";
    const date = r.triggered_at.slice(0, 16);
    return `${i + 1}. [${sevLabel}] ${date}${msg}`;
  });

  return [header, ...lines].join("\n");
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
    "Trang thai he thong: OK",
    `Uptime: ${uptimeStr}`,
    `Watchlist: ${watchlistCount} co phieu`,
    `Gia thi truong: ${priceCount} ma`,
    `Canh bao trong DB: ${alertCount}`,
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
    return "Khong the doc du lieu vi the. Vui long kiem tra lai.";
  }

  if (rows.length === 0) {
    return "Chua co vi the nao dang mo.";
  }

  let totalCost = 0;
  let totalPnl = 0;
  let hasPnl = false;

  const lines = rows.map((r) => {
    const cost = r.shares * r.avg_price;
    totalCost += cost;

    if (r.current_price == null) {
      return `• ${r.code}: ${r.shares} cp @ ${fmtNum(r.avg_price)} — Gia: N/A`;
    }

    const pnl = (r.current_price - r.avg_price) * r.shares;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    totalPnl += pnl;
    hasPnl = true;

    const pnlStr = pnl >= 0
      ? `+${fmtNum(pnl)} VND (${fmtPct(pnlPct)})`
      : `${fmtNum(pnl)} VND (${fmtPct(pnlPct)})`;

    return `• ${r.code}: ${r.shares} cp @ ${fmtNum(r.avg_price)} -> ${fmtNum(r.current_price)} = ${pnlStr}`;
  });

  const header = `Lai/Lo danh muc (${rows.length} vi the):`;
  const totalLine = hasPnl
    ? `Tong L/L: ${totalPnl >= 0 ? "+" : ""}${fmtNum(totalPnl)} VND (${
        totalCost > 0 ? fmtPct((totalPnl / totalCost) * 100) : "N/A"
      })`
    : "Tong L/L: N/A (chua co gia)";

  return [header, ...lines, "", totalLine].join("\n");
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
      parts.push("Tin noi bat (24h qua):");
      stories.forEach((s, i) => {
        const title = s.source_title ?? "(khong co tieu de)";
        const sentiment = s.sentiment ?? "neutral";
        parts.push(`${i + 1}. [${sentiment}] ${title.slice(0, 70)}`);
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
      parts.push("\nGia danh muc:");
      prices.forEach((p) => {
        const priceStr = p.price != null
          ? `${fmtNum(p.price)} VND ${p.change_pct != null ? fmtPct(p.change_pct) : ""}`
          : "N/A";
        parts.push(`• ${p.code}: ${priceStr}`);
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
      parts.push("\nCanh bao gan day:");
      alerts.forEach((a) => {
        const msg = a.message ? a.message.slice(0, 50) : "(khong co noi dung)";
        parts.push(`• [${a.severity.toUpperCase()}] ${msg}`);
      });
    }
  } catch { /* skip section on error */ }

  if (parts.length === 0) {
    return "Tom tat thi truong: Chua co du lieu. Vui long cho he thong thu thap tin tuc.";
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
    return "Su dung: /ask <cau hoi>\nVi du: /ask VCB giam vi sao?";
  }

  ensureUserRequestsTableInline(db);
  const id = insertUserRequestInline(db, "ask", trimmed);

  return `Dang phan tich... Ket qua se gui trong vong 15 phut.\nID: ${id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// /report and /fix handlers (Task 232)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the agent_feedback table exists (idempotent — matches DDL in
 * dataAuditJob.ts and feedbackTools.ts).
 */
function ensureAgentFeedbackTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent      TEXT NOT NULL,
      category   TEXT NOT NULL,
      title      TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      priority   TEXT NOT NULL DEFAULT 'medium',
      status     TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent  ON agent_feedback(agent);
  `);
}

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
    return `Su dung: /${cmd} <mo ta loi>\nVi du: /${cmd} Price fetch bi loi cho ma VCB`;
  }

  ensureAgentFeedbackTable(db);

  const title = text.slice(0, 100);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  db.prepare(
    `INSERT INTO agent_feedback
       (agent, category, title, detail, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`,
  ).run("user-telegram", "user_report", title, text, priority, now);

  if (priority === "high") {
    return "Da gui bao cao KHAN CAP den Dev Team. Se xu ly ngay.";
  }
  return "Da gui bao cao den Dev Team. Se xu ly trong gio toi.";
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

      case "/why":
        // /why VCB → "Why did VCB move today?"
        responseText = handleAsk(
          db,
          args.length > 0 ? `Why did ${args[0]} move today?` : "",
        );
        break;

      case "/report":
        responseText = handleReport(db, args, "medium");
        break;

      case "/fix":
        responseText = handleReport(db, args, "high");
        break;

      default:
        // Unknown command or plain text — show help
        responseText = `Lenh khong hop le: "${rawCmd ?? text}"\n\n${HELP_TEXT}`;
        break;
    }

    return { text: responseText, chatId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      text: `Loi xu ly lenh "${rawCmd ?? text}": ${errMsg.slice(0, 100)}`,
      chatId,
    };
  }
}
