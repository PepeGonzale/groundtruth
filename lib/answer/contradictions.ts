import { contentTokens, splitSentences, termsMatch } from "../text";
import type { Citation, Contradiction, RetrievedChunk } from "../types";

type Claim = { value: number; unit: string };

const CLAIM_PATTERN =
  /(-?\d[\d.,]*)\s*(?:(?:calendar|business|working|full)\s+)?(%|percent|hours?|minutes?|days?|months?|years?|°c|degrees? celsius|eur|euros?)/gi;

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^-?\d{1,3}(,\d{3})+$/.test(trimmed)) return Number(trimmed.replace(/,/g, ""));
  if (/^-?\d+,\d+$/.test(trimmed)) return Number(trimmed.replace(",", "."));
  const value = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function unitGroup(unit: string): string {
  const normalized = unit.toLowerCase();
  if (normalized === "%" || normalized === "percent") return "%";
  if (normalized.includes("hour") || normalized.includes("minute") || normalized.includes("day") || normalized.includes("month") || normalized.includes("year")) {
    return "time";
  }
  if (normalized.includes("°c") || normalized.includes("celsius")) return "temperature";
  return "money";
}

function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().replace(/\s+/g, " ");
  if (normalized === "%" || normalized === "percent") return "%";
  if (normalized.startsWith("business hour")) return "business hours";
  if (normalized.startsWith("hour")) return "hours";
  if (normalized.startsWith("minute")) return "minutes";
  if (normalized.startsWith("day")) return "days";
  if (normalized.startsWith("month")) return "months";
  if (normalized.startsWith("year")) return "years";
  if (normalized.startsWith("°c") || normalized.includes("celsius")) return "°C";
  return "EUR";
}

function extractClaims(sentence: string): Claim[] {
  const claims: Claim[] = [];
  for (const match of sentence.matchAll(CLAIM_PATTERN)) {
    const number = match[1] === undefined ? null : parseNumber(match[1]);
    const unit = match[2];
    if (number === null || unit === undefined) continue;
    claims.push({ value: number, unit: normalizeUnit(unit) });
  }
  return claims;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.some((candidate) => termsMatch(token, candidate))) shared += 1;
  }
  return shared / (a.length + b.length - shared);
}

function laterDocument(left: RetrievedChunk, right: RetrievedChunk): RetrievedChunk {
  const leftSupersedes = left.supersedes?.includes(right.id) ?? false;
  const rightSupersedes = right.supersedes?.includes(left.id) ?? false;
  if (leftSupersedes && !rightSupersedes) return left;
  if (rightSupersedes && !leftSupersedes) return right;
  return left.effective >= right.effective ? left : right;
}

type SentenceRecord = {
  sentence: string;
  tokens: string[];
  claims: Claim[];
  source: RetrievedChunk;
  citation: Citation;
};

export function detectContradictions(sources: RetrievedChunk[], citations: Citation[]): Contradiction[] {
  const records: SentenceRecord[] = [];
  for (const source of sources) {
    const citation = citations[source.rank - 1];
    if (citation === undefined || citation.chunkId !== source.chunkId) continue;
    for (const sentence of splitSentences(source.text)) {
      const claims = extractClaims(sentence);
      if (claims.length === 0) continue;
      records.push({ sentence, tokens: contentTokens(sentence), claims, source, citation });
    }
  }

  const results: Contradiction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < records.length; i += 1) {
    const left = records[i];
    if (left === undefined) continue;
    for (let j = i + 1; j < records.length; j += 1) {
      const right = records[j];
      if (right === undefined) continue;
      if (left.source.id === right.source.id) continue;
      if (left.citation.marker === right.citation.marker) continue;

      const leftWords = left.tokens.filter((token) => !/^\d+$/.test(token));
      const rightWords = right.tokens.filter((token) => !/^\d+$/.test(token));
      const similarity = jaccard(leftWords, rightWords);
      if (similarity < 0.32) continue;

      const shared = leftWords.filter((token) => rightWords.some((candidate) => termsMatch(token, candidate)));
      if (shared.length < 2) continue;

      const disagreement = left.claims.find((claim) =>
        right.claims.some(
          (candidate) =>
            unitGroup(candidate.unit) === unitGroup(claim.unit) && Math.abs(candidate.value - claim.value) > 0.0001,
        ),
      );
      if (disagreement === undefined) continue;

      const rightClaim = right.claims.find((claim) => unitGroup(claim.unit) === unitGroup(disagreement.unit));
      if (rightClaim === undefined) continue;
      const values = [disagreement.value, rightClaim.value].sort((a, b) => a - b).join("-");
      const key = [left.source.id, right.source.id, unitGroup(disagreement.unit), values].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      const preferred = laterDocument(left.source, right.source);
      const subjectTokens = [...new Set(shared)].sort((a, b) => b.length - a.length).slice(0, 8);
      results.push({
        subject: subjectTokens.join(" "),
        left: {
          docId: left.source.id,
          docTitle: left.source.title,
          section: left.source.section,
          effective: left.source.effective,
          value: `${disagreement.value} ${disagreement.unit}`,
          marker: left.citation.marker,
        },
        right: {
          docId: right.source.id,
          docTitle: right.source.title,
          section: right.source.section,
          effective: right.source.effective,
          value: `${rightClaim.value} ${rightClaim.unit}`,
          marker: right.citation.marker,
        },
        preferred: preferred.id,
        reason:
          preferred.supersedes?.includes(preferred.id === left.source.id ? right.source.id : left.source.id) === true
            ? "explicit supersession"
            : "later effective date",
      });
      if (results.length >= 2) return results;
    }
  }

  return results;
}

export function filterContradictions(question: string, contradictions: Contradiction[]): Contradiction[] {
  const queryTokens = contentTokens(question);
  return contradictions.filter((contradiction) => {
    const subjectTokens = contentTokens(contradiction.subject);
    const hits = queryTokens.filter((token) => subjectTokens.some((candidate) => termsMatch(token, candidate)));
    const leftRank = Number(contradiction.left.marker.replace("S", ""));
    const rightRank = Number(contradiction.right.marker.replace("S", ""));
    const nearTop = Math.min(leftRank, rightRank) <= 2;
    return hits.length >= 1 && (nearTop || hits.length >= 2);
  });
}
