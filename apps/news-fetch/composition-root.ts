/**
 * news-fetch Composition Root
 *
 * Wires scrapers → module → router. Exports composed Hono app.
 *
 * DDD rules:
 *   - Zero domain operations (no normalizeHeadline, parsePublishedAt calls here)
 *   - Zero business logic (no if conditions on data values)
 *   - Only: imports + DI bindings + router export
 *
 * G3 contract: `grep -E "if |switch |normalizeHeadline|parsePublishedAt|computeArticleKey" composition-root.ts` returns 0.
 */

import { createRouter } from './src/interface/handlers.js';
import { composeNewsIngest } from './src/module/news_ingest/index.js';
import { ReutersRssScraper } from './src/infrastructure/scrapers/reuters-rss.js';
import { ReutersStealthFallback } from './src/infrastructure/scrapers/reuters-stealth.js';
import { BloombergRssScraper } from './src/infrastructure/scrapers/bloomberg-rss.js';
import { BloombergStealth } from './src/infrastructure/scrapers/bloomberg-stealth.js';

// ── DI bindings ──────────────────────────────────────────────────────────────

const reutersRss = new ReutersRssScraper();
const reutersStealth = new ReutersStealthFallback();
const bloombergRss = new BloombergRssScraper();
const bloombergStealth = new BloombergStealth();

const reutersIngest = composeNewsIngest(reutersRss, reutersStealth);
const bloombergIngest = composeNewsIngest(bloombergRss, bloombergStealth);

// ── Composed Hono app ────────────────────────────────────────────────────────

export const app = createRouter(reutersIngest, bloombergIngest);
