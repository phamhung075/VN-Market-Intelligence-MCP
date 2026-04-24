/**
 * RAG — Embedding Pipeline
 * Uses HuggingFace Transformers (ONNX, local, no API key)
 * Model: paraphrase-multilingual-MiniLM-L12-v2
 *   → 384-dim vectors, supports Vietnamese / French / English
 *   → ~400MB, auto-downloaded on first run to EMBEDDING_CACHE_DIR
 */

import type { FeatureExtractionPipeline } from '@huggingface/transformers'

const MODEL = Bun.env.EMBEDDING_MODEL ?? 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
const CACHE = Bun.env.EMBEDDING_CACHE_DIR ?? './data/models'

// ── Singleton pipeline (loaded once, reused) ──────────────────────────────

let _pipeline: FeatureExtractionPipeline | null = null
let _loading = false
let _loadPromise: Promise<FeatureExtractionPipeline> | null = null

export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (_pipeline) return _pipeline
  if (_loadPromise) return _loadPromise

  _loading = true
  console.log(`[RAG] Loading embedding model: ${MODEL} (first load ~400MB)...`)

  _loadPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = CACHE
    env.localModelPath = CACHE

    const pipe = await (pipeline as Function)('feature-extraction', MODEL, {
      dtype: 'fp32',
    }) as FeatureExtractionPipeline

    _pipeline = pipe
    _loading = false
    console.log('[RAG] Embedding model ready ✓')
    return pipe
  })()

  return _loadPromise
}

// ── Core embed function ───────────────────────────────────────────────────

/**
 * Embed a single text into a 384-dimensional vector.
 * Returns Float32Array[384] — convert to number[] via Array.from() for storage.
 */
export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline()
  const output = await pipe(text, { pooling: 'mean', normalize: true })
  const data = output.data as Float32Array
  // Return a copy to avoid sharing the underlying buffer
  return new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
}

/**
 * Embed multiple texts in one batch (more efficient than looping embed()).
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return []
  const pipe = await getEmbeddingPipeline()
  const output = await pipe(texts, { pooling: 'mean', normalize: true })

  // output.data is flat Float32Array: [384 dims × N texts]
  const dims = 384
  const result: Float32Array[] = []
  const data = output.data as Float32Array
  for (let i = 0; i < texts.length; i++) {
    result.push(new Float32Array(data.slice(i * dims, (i + 1) * dims)))
  }
  return result
}

/**
 * Cosine similarity between two vectors (for testing / ranking).
 * Accepts Float32Array or number[] for flexibility.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot  += (a[i] ?? 0) * (b[i] ?? 0)
    magA += (a[i] ?? 0) ** 2
    magB += (b[i] ?? 0) ** 2
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0
}

/**
 * Build the embedding text for a BCTC chunk.
 * Combines key fields for maximum semantic relevance.
 */
export function buildBctcEmbeddingText(opts: {
  actionCode: string
  companyName: string
  periodLabel: string    // "Q1 2025"
  chunkType: string      // "income_statement"
  content: string        // extracted financial text
  signals?: string[]     // ["strong_revenue_growth", "margin_compression"]
}): string {
  const signals = opts.signals?.join(' ') ?? ''
  return [
    `${opts.actionCode} ${opts.companyName}`,
    `${opts.periodLabel} ${opts.chunkType}`,
    opts.content,
    signals,
  ].filter(Boolean).join('\n').slice(0, 2000) // truncate to 2000 chars
}
