/**
 * Package metadata — single source of truth for version/name.
 * Avoids JSON assert imports across ESM / Bun bundler differences.
 */
export const pkg = {
  name: 'news-fetch',
  version: '1.0.0',
} as const;
