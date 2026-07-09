/**
 * news-fetch Sandbox — primitive/module function registries
 *
 * Maps scenario `primitive`/`module` field → import path + function name.
 * Each primitive entry carries an `argAdapter` mapping the scenario's
 * `input` object to positional args for its function signature — replaces
 * the by-name if/else switch previously inline in runner.ts
 * (FACTORY-NEWS-split-sandbox).
 */

import { resolve } from 'node:path';

export interface PrimitiveEntry {
  importPath: string;
  fnName: string;
  argAdapter: (input: Record<string, unknown>) => unknown[];
}

export interface ModuleEntry {
  importPath: string;
  fnName: string;
}

export const PRIMITIVE_REGISTRY: Record<string, PrimitiveEntry> = {
  'published-at-parser': {
    importPath: resolve(import.meta.dir, '../primitive/published-at-parser/index.js'),
    fnName: 'parsePublishedAt',
    argAdapter: (input) => [(input as { rfcDate: string }).rfcDate],
  },
  'headline-normalizer': {
    importPath: resolve(import.meta.dir, '../primitive/headline-normalizer/index.js'),
    fnName: 'normalizeHeadline',
    argAdapter: (input) => [(input as { raw: string }).raw],
  },
  'source-dedup-key': {
    importPath: resolve(import.meta.dir, '../primitive/source-dedup-key/index.js'),
    fnName: 'computeArticleKey',
    argAdapter: (input) => [(input as { article: unknown }).article],
  },
  'article-relevance-filter': {
    importPath: resolve(import.meta.dir, '../primitive/article-relevance-filter/index.js'),
    fnName: 'isRelevantArticle',
    argAdapter: (input) => {
      const i = input as { headline: string; keywords: string[] };
      return [i.headline, i.keywords];
    },
  },
};

// Module registry
export const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  news_ingest: {
    importPath: resolve(import.meta.dir, '../module/news_ingest/index.js'),
    fnName: 'processArticleBatch',
  },
};
