import type { Chunk, DocMeta } from "./types";

const TARGET_CHARS = 780;
const MAX_CHARS = 1150;

export type ParsedDocument = {
  meta: DocMeta;
  body: string;
  filename: string;
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match || match[1] === undefined) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key.length > 0) meta[key] = value;
  }
  return { meta, body: raw.slice(match[0].length) };
}

export function parseDocument(raw: string, filename: string): ParsedDocument {
  const { meta, body } = parseFrontmatter(raw);
  const fallbackId = filename.replace(/\.md$/, "").toUpperCase();
  const parsed: DocMeta = {
    id: meta["id"] ?? fallbackId,
    title: meta["title"] ?? fallbackId,
    owner: meta["owner"] ?? "Unassigned",
    version: meta["version"] ?? "0.0",
    effective: meta["effective"] ?? "1970-01-01",
    classification: meta["classification"] ?? "internal",
  };
  const supersedes = meta["supersedes"];
  if (supersedes !== undefined && supersedes.length > 0) parsed.supersedes = supersedes;
  return { meta: parsed, body: body.trim(), filename };
}

type Section = { heading: string; text: string };

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let heading = "Overview";
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) sections.push({ heading, text });
    buffer = [];
  };

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match && match[1] !== undefined) {
      flush();
      heading = match[1];
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (sections.length === 0 && body.length > 0) sections.push({ heading: "Overview", text: body });
  return sections;
}

function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const parts: string[] = [];
  let current = "";

  const push = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) parts.push(trimmed);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHARS) {
      push();
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let piece = "";
      for (const sentence of sentences) {
        if (`${piece} ${sentence}`.trim().length > TARGET_CHARS && piece.length > 0) {
          parts.push(piece.trim());
          piece = sentence;
        } else {
          piece = `${piece} ${sentence}`.trim();
        }
      }
      if (piece.length > 0) parts.push(piece.trim());
      continue;
    }
    if (`${current}\n\n${paragraph}`.trim().length > TARGET_CHARS && current.length > 0) {
      push();
      current = paragraph;
    } else {
      current = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    }
  }
  push();
  return parts;
}

export function chunkDocument(meta: DocMeta, body: string): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = splitSections(body);
  sections.forEach((section, sectionIndex) => {
    const parts = splitLongText(section.text);
    parts.forEach((text, part) => {
      chunks.push({
        ...meta,
        chunkId: `${meta.id}#s${sectionIndex + 1}-p${part + 1}`,
        section: section.heading,
        sectionIndex,
        part,
        text,
      });
    });
  });
  return chunks;
}

export function chunkDocuments(documents: ParsedDocument[]): Chunk[] {
  return documents.flatMap((document) => chunkDocument(document.meta, document.body));
}
