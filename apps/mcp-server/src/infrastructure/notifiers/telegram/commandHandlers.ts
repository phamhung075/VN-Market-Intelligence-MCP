/**
 * Infrastructure — Telegram Command Handlers (FACTORY-INFRA-split-telegramCommands)
 *
 * The 8 non-/news, non-/recap* command handlers (/help, /watchlist, /price,
 * /health, /report, /fix, /ask, /set_position, /check_position). Extracted
 * verbatim from telegramCommands.ts — zero behavior/logic drift. Raw SQL
 * moved to dedicated stores (watchlistReadStore, systemHealthStore,
 * agentFeedbackStore); positionStore/askQueueStore/qaResponderSpawner calls
 * are unchanged (already store-backed before this split).
 *
 * @module infrastructure/notifiers/telegram/commandHandlers
 */

import type { Database } from "bun:sqlite";
import {
  applyPositionCommand,
  listOpenPositions,
} from "../../db/positionStore.js";
import { insertAskQuestion } from "../../db/askQueueStore.js";
import { insertAgentFeedback } from "../../db/agentFeedbackStore.js";
import {
  listWatchlistWithPrices,
  getPriceQuote,
} from "../../db/watchlistReadStore.js";
import { getSystemHealthCounts } from "../../db/systemHealthStore.js";
import { spawnQaResponder } from "../../agents/qaResponderSpawner.js";
import { fmtNum, HELP_TEXT } from "./format.js";

// ─────────────────────────────────────────────────────────────────────────────
// /help — lists available commands
// ─────────────────────────────────────────────────────────────────────────────

export function handleHelp(): string {
  return HELP_TEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
// /watchlist — query watchlist + market_prices, format Vietnamese list
// ─────────────────────────────────────────────────────────────────────────────

export function handleWatchlist(db: Database): string {
  const rows = listWatchlistWithPrices(db);

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

// ─────────────────────────────────────────────────────────────────────────────
// /price <CODE> — query market_prices for a single stock
// ─────────────────────────────────────────────────────────────────────────────

export function handlePrice(db: Database, args: string[]): string {
  const rawCode = args[0];
  if (!rawCode) {
    return "Cách dùng: /price VCB";
  }

  const code = rawCode.toUpperCase().trim();
  const row = getPriceQuote(db, code);

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

// ─────────────────────────────────────────────────────────────────────────────
// /health — system health: uptime, DB size, watchlist count
// ─────────────────────────────────────────────────────────────────────────────

export function handleHealth(db: Database): string {
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

  const { watchlistCount, alertCount, priceCount } = getSystemHealthCounts(db);

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

/**
 * /report <description> — write a medium-priority issue to agent_feedback.
 * /fix   <description> — same but priority='high'.
 */
export function handleReport(
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

  insertAgentFeedback(db, {
    agent: "user-telegram",
    category: "user_report",
    title,
    detail: text,
    priority,
  });

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
export function handleAsk(db: Database, args: string[], userId: string): string {
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
export function handleSetPosition(db: Database, args: string[]): string {
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
export function handleCheckPosition(db: Database): string {
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
