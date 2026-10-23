import { contentTokens, splitSentences, termsMatch } from "../text";
import type { AnswerBlock, Citation, Contradiction, RetrievedChunk } from "../types";

type Candidate = {
  text: string;
  source: RetrievedChunk;
  marker: string;
  score: number;
  matched: string[];
  roleBoost: boolean;
  actionBoost: boolean;
};

function cleanSentence(input: string): string {
  return input
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,4}\s*/, "")
    .replace(/^\d+(?:\.\d+)*\s+(?=[A-Z])/, "")
    .replace(/\s*\|\s*/g, " — ")
    .replace(/^[—\s]+|[—\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/:\s*$/, "")
    .trim();
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.some((candidate) => termsMatch(token, candidate))) shared += 1;
  }
  return shared / (a.length + b.length - shared);
}

function hasQuantity(text: string): boolean {
  return /\d/.test(
    text
      .replace(/\b[A-Z]{2,}-\d+[A-Z]?\b/g, "")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
      .replace(/\bSEV\d+\b/gi, "")
      .replace(/\bP\d\b/gi, "")
      .replace(/\b(section|step|version|chapter|article)\s+\d+\b/gi, ""),
  );
}

function isWhoQuestion(question: string): boolean {
  return /^\s*who\b/i.test(question) || /\bwho (approves|pages|owns|signs|authorises|authorizes)\b/i.test(question);
}

function isMetaSentence(sentence: string): boolean {
  if (/\b(this|the (?:following|table)|below)\b.*\b(document|amendment|section|playbook|agreement|policy|schedule|table)\b/i.test(sentence)) {
    return true;
  }
  return /\b(does not replace|in full|is out of scope for this (?:playbook|document))\b/i.test(sentence);
}

function isProcedural(question: string): boolean {
  return /\b(steps?|procedure|process|how do|how should|how can|who do|what do|what happens|what is the process)\b/i.test(
    question,
  );
}

function isQuantitative(question: string): boolean {
  return /\b(how (long|many|fast|much|soon|often)|deadline|target|percentage|duration|window|limit|threshold|rate|retention|notice|number|days?|hours?|minutes?|years?|months?)\b/i.test(
    question,
  );
}

function enumeratedSteps(source: RetrievedChunk): string[] {
  const steps: string[] = [];
  for (const line of source.text.split("\n")) {
    const match = line.trim().match(/^\d+[.)]\s+(.+)$/);
    if (match && match[1] !== undefined) steps.push(match[1].trim());
  }
  return steps;
}

function markerFor(citations: Citation[], source: RetrievedChunk): string {
  return citations.find((citation) => citation.chunkId === source.chunkId)?.marker ?? `S${source.rank}`;
}

export function composeExtractive(
  question: string,
  sources: RetrievedChunk[],
  citations: Citation[],
  contradictions: Contradiction[],
): AnswerBlock[] {
  const queryTokens = contentTokens(question);
  const quantitative = isQuantitative(question);
  const proceduralQuestion = isProcedural(question);
  const whoQuestion = isWhoQuestion(question);
  const candidates: Candidate[] = [];

  for (const source of sources) {
    const marker = markerFor(citations, source);
    for (const rawSentence of splitSentences(source.text)) {
      const sentence = cleanSentence(rawSentence);
      if (sentence.length < 20 || sentence.endsWith(":")) continue;
      if (/^(metric|target|measured|class|condition|response|data class|retention|starts)$/i.test(sentence)) continue;
      if (isMetaSentence(sentence)) continue;

      const tokens = contentTokens(sentence);
      const matched = queryTokens.filter((token) => tokens.some((candidate) => termsMatch(token, candidate)));
      const weight = (token: string) => Math.min(token.length, 10);
      const totalWeight = queryTokens.reduce((sum, token) => sum + weight(token), 0);
      const overlap =
        totalWeight === 0 ? 0 : matched.reduce((sum, token) => sum + weight(token), 0) / totalWeight;
      const hasFigure = hasQuantity(sentence);
      const lengthPenalty = sentence.length > 340 ? -0.25 : sentence.length < 35 ? -0.2 : 0.05;
      const rankBonus = source.rank === 1 ? 0.16 : source.rank === 2 ? 0.06 : 0;
      const sectionTokens = contentTokens(`${source.title} ${source.section}`);
      const sectionMatches = queryTokens.filter((token) => sectionTokens.some((candidate) => termsMatch(token, candidate)));
      const sectionBoost = Math.min(0.36, sectionMatches.length * 0.12);
      const metaPenalty = isMetaSentence(sentence) ? -0.7 : 0;
      const roleBoost =
        isWhoQuestion(question) &&
        /\b(board|chief financial officer|cfo|director|manager|lead|owner|primary|secondary|quality assurance|qa|procurement|approver)\b/i.test(
          sentence,
        )
          ? 0.4
          : 0;
      const actionBoost =
        proceduralQuestion &&
        /\b(stop|move|switch|quarantine|notify|treat|page|escalate|record|submit|confirm|approve|review|execute)\b/i.test(
          sentence,
        )
          ? 0.35
          : 0;
      const priorityBoost = isWhoQuestion(question)
        ? /\bprimary\b/i.test(sentence)
          ? 0.8
          : /\boperations director\b/i.test(sentence)
            ? 0.4
            : /\bsecondary\b/i.test(sentence)
              ? 0.25
              : 0
        : 0;
      candidates.push({
        text: sentence,
        source,
        marker,
        score:
          overlap +
          (hasFigure ? 0.3 : 0) +
          (quantitative && !whoQuestion && !hasFigure ? -0.35 : 0) +
          lengthPenalty +
          rankBonus +
          sectionBoost +
          metaPenalty +
          roleBoost +
          actionBoost +
          priorityBoost,
        matched,
        roleBoost: roleBoost > 0,
        actionBoost: actionBoost > 0,
      });
    }
  }

  const priorityRank = (candidate: Candidate): number => {
    if (!whoQuestion) return 0;
    if (/\bprimary\b/i.test(candidate.text) && /(?<![\w-])(page|escalate)(?![\w-])/i.test(candidate.text)) return 0;
    if (/\bsecondary\b/i.test(candidate.text) && /(?<![\w-])(page|escalate)(?![\w-])/i.test(candidate.text)) return 1;
    if (/\boperations director\b/i.test(candidate.text)) return 2;
    return 3;
  };
  candidates.sort((a, b) => {
    const byScore = Math.round(b.score * 1000) - Math.round(a.score * 1000);
    if (byScore !== 0) return byScore;
    return priorityRank(a) - priorityRank(b) || a.source.rank - b.source.rank;
  });
  if (process.env["GROUNDTRUTH_DEBUG"]) {
    for (const candidate of candidates.slice(0, 10)) {
      console.log(candidate.score.toFixed(3), candidate.matched, candidate.marker, candidate.text.slice(0, 110));
    }
  }
  const accepted: Candidate[] = [];
  const perSource = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.score <= 0) continue;
    if ((perSource.get(candidate.source.chunkId) ?? 0) >= 2) continue;
    if (accepted.some((entry) => jaccard(contentTokens(entry.text), contentTokens(candidate.text)) > 0.7)) continue;
    if (accepted.some((entry) => entry.text.includes(candidate.text) || candidate.text.includes(entry.text))) continue;
    accepted.push(candidate);
    perSource.set(candidate.source.chunkId, (perSource.get(candidate.source.chunkId) ?? 0) + 1);
    if (accepted.length >= 8) break;
  }

  if (accepted.length === 0) {
    const fallback = sources[0];
    if (fallback === undefined) return [];
    const marker = markerFor(citations, fallback);
    return [{ kind: "direct", text: `${cleanSentence(fallback.preview)} [${marker}]` }];
  }

  const [first, ...rest] = accepted;
  if (first === undefined) return [];
  const blocks: AnswerBlock[] = [{ kind: "direct", text: `${first.text} [${first.marker}]` }];

  if (proceduralQuestion) {
    const steps = enumeratedSteps(first.source);
    if (steps.length >= 3) {
      blocks.push({
        kind: "list",
        items: steps.slice(0, 6).map((step) => `${step} [${first.marker}]`),
      });
      return appendContradictions(blocks, contradictions);
    }
  }

  const minimumOverlap = Math.max(1, Math.ceil(queryTokens.length * 0.34));
  const bullets: string[] = [];
  const usedSources = new Set([first.source.chunkId]);
  const covered = new Set(first.matched);
  const ordered = whoQuestion
    ? rest
    : [...rest].sort((a, b) => {
        const aNew = usedSources.has(a.source.chunkId) ? 0 : 1;
        const bNew = usedSources.has(b.source.chunkId) ? 0 : 1;
        return bNew - aNew;
      });
  for (const candidate of ordered) {
    if (candidate.matched.length === 0) continue;
    const hasFigure = hasQuantity(candidate.text);
    if (quantitative && !whoQuestion && !hasFigure) continue;
    if (candidate.matched.length < minimumOverlap && !(isWhoQuestion(question) && (candidate.roleBoost || candidate.actionBoost))) continue;
    if (carriesSupersededValue(candidate.text, contradictions)) continue;
    const addsInformation = candidate.matched.some((token) => !covered.has(token));
    if (!addsInformation && !candidate.roleBoost && !candidate.actionBoost) continue;
    if (process.env["GROUNDTRUTH_DEBUG"]) console.log("bullet", candidate.matched, candidate.marker, candidate.text);
    bullets.push(`${candidate.text} [${candidate.marker}]`);
    for (const token of candidate.matched) covered.add(token);
    usedSources.add(candidate.source.chunkId);
    if (bullets.length >= 3) break;
  }

  if (bullets.length > 0) blocks.push({ kind: "list", items: bullets });
  return appendContradictions(blocks, contradictions);
}

function carriesSupersededValue(text: string, contradictions: Contradiction[]): boolean {
  return contradictions.some((contradiction) => {
    const superseded = contradiction.preferred === contradiction.left.docId ? contradiction.right : contradiction.left;
    return text.includes(superseded.value);
  });
}

function appendContradictions(blocks: AnswerBlock[], contradictions: Contradiction[]): AnswerBlock[] {
  for (const contradiction of contradictions) {
    blocks.push({
      kind: "note",
      text: `Sources disagree: ${contradiction.left.docId} §${contradiction.left.section} states ${contradiction.left.value} [${contradiction.left.marker}], while ${contradiction.right.docId} §${contradiction.right.section} states ${contradiction.right.value} [${contradiction.right.marker}]. ${contradiction.preferred} takes precedence (${contradiction.reason}).`,
    });
  }
  return blocks;
}
