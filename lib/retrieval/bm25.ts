import { contentTokens, termsMatch } from "../text";
import type { Chunk } from "../types";

const K1 = 1.5;
const B = 0.75;

export type Bm25Index = {
  chunks: Chunk[];
  tokens: string[][];
  lengths: number[];
  averageLength: number;
};

export type Bm25Hit = {
  index: number;
  score: number;
};

export function buildBm25(chunks: Chunk[]): Bm25Index {
  const tokens = chunks.map((chunk) => contentTokens(`${chunk.title} ${chunk.section} ${chunk.text}`));
  const lengths = tokens.map((list) => list.length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const averageLength = lengths.length === 0 ? 1 : Math.max(1, total / lengths.length);
  return { chunks, tokens, lengths, averageLength };
}

function documentFrequency(index: Bm25Index, term: string): number {
  let count = 0;
  for (const tokens of index.tokens) {
    if (tokens.some((token) => termsMatch(term, token))) count += 1;
  }
  return count;
}

function termFrequency(tokens: string[], term: string): number {
  let count = 0;
  for (const token of tokens) {
    if (termsMatch(term, token)) count += 1;
  }
  return count;
}

export function searchBm25(index: Bm25Index, queryTokens: string[], limit = 25): Bm25Hit[] {
  if (queryTokens.length === 0 || index.chunks.length === 0) return [];
  const n = index.chunks.length;
  const idf = new Map<string, number>();
  for (const term of queryTokens) {
    const df = documentFrequency(index, term);
    idf.set(term, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  const hits: Bm25Hit[] = [];
  for (let i = 0; i < index.chunks.length; i += 1) {
    const tokens = index.tokens[i];
    const length = index.lengths[i];
    if (tokens === undefined || length === undefined) continue;
    let score = 0;
    for (const term of queryTokens) {
      const tf = termFrequency(tokens, term);
      if (tf === 0) continue;
      const weight = idf.get(term) ?? 0;
      const denominator = tf + K1 * (1 - B + (B * length) / index.averageLength);
      score += weight * ((tf * (K1 + 1)) / denominator);
    }
    if (score > 0) hits.push({ index: i, score });
  }

  return hits.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
}
