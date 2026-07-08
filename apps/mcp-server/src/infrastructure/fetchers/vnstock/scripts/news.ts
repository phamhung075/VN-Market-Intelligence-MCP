/**
 * vnstock Python template — Company news (Gap 6, 6th news source).
 *
 * Column names discovered empirically:
 *   'news_title', 'news_source_link', 'public_date' (epoch ms), 'lang_code'
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * NEWS_SCRIPT, now built through the shared `wrapVnstockScript` preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildNewsScript(symbol: string, limit: number): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "news",
    emptyValue: "[]",
    fetch: "df = stock.company.news()",
    body: `        df = df.head(${limit})
        results = []
        for _, r in df.iterrows():
            pub = r.get('public_date', None)
            if pub:
                try:
                    from datetime import datetime, timezone
                    ts = int(pub) / 1000
                    date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')
                except:
                    date_str = str(pub)[:10]
            else:
                date_str = ''
            results.append({
                'code': '${symbol}',
                'title': str(r.get('news_title', '')),
                'date': date_str,
                'source': str(r.get('lang_code', 'vi')),
                'url': str(r.get('news_source_link', ''))
            })
        print(json.dumps(results))`,
  });
}
