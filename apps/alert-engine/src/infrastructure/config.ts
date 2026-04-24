/**
 * Alert Engine — Infrastructure Config
 */

export interface ServiceConfig {
  port: number;
  dbPath: string;
  telegramBotToken: string;
  telegramMarketId: string;
  telegramWorkId: string;
  telegramBugId: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '5006', 10),
    dbPath: process.env['DB_PATH'] ?? './data/market.db',
    telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
    telegramMarketId: process.env['TELEGRAM_INFO_MARKET_GROUP_ID'] ?? '',
    telegramWorkId: process.env['TELEGRAM_INFO_WORK_CHANNEL_ID'] ?? '',
    telegramBugId: process.env['TELEGRAM_REPORT_BUG_CHANNEL_ID'] ?? '',
  };
}
