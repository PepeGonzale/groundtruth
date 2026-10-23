const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself",
  "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
  "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other", "our",
  "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
  "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
  "yourself", "yourselves", "please", "tell", "know", "want", "need", "get", "got", "make", "made",
  "shall", "must", "may", "might", "also", "let", "us",
]);

export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function rawTokens(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized.length === 0 ? [] : normalized.split(" ").filter(Boolean);
}

export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  return w;
}

export function contentTokens(input: string): string[] {
  return rawTokens(input)
    .filter((token) => !STOPWORDS.has(token))
    .map(stem)
    .filter((token) => token.length > 1);
}

export function uniqueContentTokens(input: string): string[] {
  return [...new Set(contentTokens(input))];
}

export function termsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

function pushUnits(units: string[], output: string[]): void {
  for (const unit of units) {
    const sentence = unit.trim();
    if (sentence.length < 12) continue;
    if (/^[\s|:-]+$/.test(sentence)) continue;
    if (/^\|?[\s:-]+\|/.test(sentence) && sentence.includes("-")) continue;
    output.push(sentence);
  }
}

export function splitSentences(text: string): string[] {
  const output: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    const isTable = lines.every((line) => line.startsWith("|"));
    if (isTable) {
      pushUnits(lines, output);
      continue;
    }

    const units: string[] = [];
    let buffer = "";
    let bufferIsListItem = false;

    const flush = () => {
      if (buffer.length > 0) units.push(buffer);
      buffer = "";
      bufferIsListItem = false;
    };

    for (const line of lines) {
      const listMatch = line.match(/^([-*•]|\d+[.)])\s+(.*)$/);
      if (listMatch && listMatch[2] !== undefined) {
        flush();
        buffer = listMatch[2];
        bufferIsListItem = true;
        continue;
      }
      if (bufferIsListItem && buffer.length > 0) {
        buffer = `${buffer} ${line}`;
        continue;
      }
      buffer = buffer.length === 0 ? line : `${buffer} ${line}`;
    }
    flush();

    for (const unit of units) {
      const parts = unit.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
      const merged: string[] = [];
      for (const part of parts) {
        const previous = merged[merged.length - 1];
        if (previous !== undefined && /^(it|this|these|they|that|those|such)\b/i.test(part.trim())) {
          merged[merged.length - 1] = `${previous} ${part.trim()}`;
        } else {
          merged.push(part);
        }
      }
      pushUnits(merged, output);
    }
  }

  return output;
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
