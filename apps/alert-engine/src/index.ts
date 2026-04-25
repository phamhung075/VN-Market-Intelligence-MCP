/**
 * Alert Engine — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 5006
 */

import { Database } from 'bun:sqlite';
import { loadConfig } from './infrastructure/config.js';
import {
  initAlertTables,
  SQLiteAlertRepository,
  SQLiteMuteRepository,
} from './infrastructure/repositories.js';
import { TelegramClient } from './infrastructure/telegram.js';
import { EvaluateAlertUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';

const config = loadConfig();

const db = new Database(config.ownDbPath, { create: true });
initAlertTables(db);

const alertRepo = new SQLiteAlertRepository(db);
const muteRepo = new SQLiteMuteRepository(db);
const telegram = new TelegramClient(config);

const evaluateUseCase = new EvaluateAlertUseCase(alertRepo, muteRepo, telegram);

const app = createRouter(evaluateUseCase);

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`alert-engine running on port ${config.port}`);
