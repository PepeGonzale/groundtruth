import { buildBm25, searchBm25 } from "./bm25";
import { embedQuery } from "./dense";
import { truncate, uniqueContentTokens, contentTokens, termsMatch } from "../text";
import type { IndexedChunk, RetrievalTrace, RetrievedChunk } from "../types";

const RRF_K = 60;
const DEFAULT_LIMIT = 8;

function dot(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined || bv === undefined) continue;
    sum += av * bv;
  }
  return sum;
}

function cleanPreview(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\|?[\s:-]+\|.*$/gm, "")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/·\s*·/g, "·")
    .replace(/^[·\s]+|[·\s]+$/g, "")
    .trim();
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export type RetrievalResult = {
  sources: RetrievedChunk[];
  trace: RetrievalTrace;
};

export async function retrieve(
  chunks: IndexedChunk[],
  question: string,
  options: { limit?: number } = {},
): Promise<RetrievalResult> {
  const startedAt = performance.now();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const tokens = uniqueContentTokens(question);
  const bm25 = buildBm25(chunks);
  const lexicalHits = searchBm25(bm25, tokens, 30);

  const denseStartedAt = performance.now();
  const dense = await embedQuery(question);
  const denseLatencyMs = performance.now() - denseStartedAt;

  const cosineByChunk = new Map<string, number>();
  const denseHits: { chunkId: string; score: number }[] = [];
  if (dense.vector !== null) {
    for (const chunk of chunks) {
      if (chunk.vector.length !== dense.vector.length) continue;
      const score = dot(chunk.vector, dense.vector);
      cosineByChunk.set(chunk.chunkId, score);
      denseHits.push({ chunkId: chunk.chunkId, score });
    }
    denseHits.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
  }

  const fused = new Map<string, number>();
  const bm25Score = new Map<string, number>();
  lexicalHits.forEach((hit, rank) => {
    const chunk = chunks[hit.index];
    if (chunk === undefined) return;
    bm25Score.set(chunk.chunkId, hit.score);
    fused.set(chunk.chunkId, (fused.get(chunk.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
  });
  denseHits.slice(0, 30).forEach((hit, rank) => {
    fused.set(hit.chunkId, (fused.get(hit.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
  });

  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const ranked = [...fused.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);

  const maxBm25 = lexicalHits[0]?.score ?? 0;
  const sources: RetrievedChunk[] = ranked.map(([chunkId, fusedScore], index) => {
    const chunk = byId.get(chunkId);
    if (chunk === undefined) throw new Error(`missing chunk ${chunkId}`);
    const { vector: _vector, ...publicChunk } = chunk;
    const rawBm25 = bm25Score.get(chunkId) ?? 0;
    return {
      ...publicChunk,
      rank: index + 1,
      bm25: Number(rawBm25.toFixed(3)),
      bm25Normalized: maxBm25 === 0 ? 0 : Number((rawBm25 / maxBm25).toFixed(4)),
      cosine: cosineByChunk.has(chunkId) ? Number((cosineByChunk.get(chunkId) ?? 0).toFixed(4)) : null,
      fused: Number(fusedScore.toFixed(5)),
      preview: truncate(cleanPreview(chunk.text), 280),
    };
  });

  const corpusTokens = chunks.map((chunk) => contentTokens(`${chunk.title} ${chunk.section} ${chunk.text}`));
  const unknownTerms = tokens.filter(
    (token) => !corpusTokens.some((list) => list.some((candidate) => termsMatch(token, candidate))),
  );

  const sourceTokens = sources.map((source) => contentTokens(`${source.title} ${source.section} ${source.text}`));
  let covered = 0;
  for (const token of tokens) {
    if (sourceTokens.some((list) => list.some((candidate) => termsMatch(token, candidate)))) covered += 1;
  }
  const coverage = tokens.length === 0 ? 0 : covered / tokens.length;
  const bestCosine = sources.reduce((max, source) => Math.max(max, source.cosine ?? 0), 0);
  const bm25Normalized = sources[0]?.bm25Normalized ?? 0;
  const confidence = Number(clamp(0.5 * coverage + 0.35 * bestCosine + 0.15 * bm25Normalized).toFixed(4));

  const hybrid = dense.vector !== null;
  const unknownAndUnsupported = unknownTerms.length > 0 && bestCosine < 0.42;
  const refusal = hybrid
    ? sources.length === 0 ||
      confidence < 0.5 ||
      unknownAndUnsupported ||
      bestCosine < 0.25 ||
      (coverage < 0.8 && bestCosine < 0.4)
    : sources.length === 0 || coverage < 0.6 || bm25Normalized < 0.25;

  const trace: RetrievalTrace = {
    query: question,
    tokens,
    mode: hybrid ? "hybrid" : "lexical",
    candidates: fused.size,
    coverage: Number(coverage.toFixed(4)),
    bestCosine: Number(bestCosine.toFixed(4)),
    unknownTerms,
    confidence,
    refusal,
    latencyMs: Number((performance.now() - startedAt).toFixed(1)),
    denseLatencyMs: Number(denseLatencyMs.toFixed(1)),
    denseError: dense.error,
    signals: {
      bm25Top: Number(maxBm25.toFixed(3)),
      denseTop: denseHits[0] === undefined ? null : Number(denseHits[0].score.toFixed(4)),
    },
  };

  return { sources, trace };
}
