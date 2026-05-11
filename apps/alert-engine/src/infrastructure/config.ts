/**
 * Alert Engine — Infrastructure Config
 */

export interface ServiceConfig {
  port: number;
  dbPath: string;           // market.db — kept for potential readonly reads
  ownDbPath: string;        // alert_engine.db — WRITE target
  telegramBotToken: string;
  telegramMarketId: string;
  telegramWorkId: string;
  telegramBugId: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '5006', 10),
    dbPath: process.env['DB_PATH'] ?? './data/market.db',
    ownDbPath: process.env['ALERT_ENGINE_DB_PATH'] ?? './data/alert_engine.db',
    telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
    telegramMarketId: process.env['TELEGRAM_INFO_MARKET_GROUP_ID'] ?? '',
    telegramWorkId: process.env['TELEGRAM_INFO_WORK_CHANNEL_ID'] ?? '',
    telegramBugId: process.env['TELEGRAM_REPORT_BUG_CHANNEL_ID'] ?? '',
  };
}
