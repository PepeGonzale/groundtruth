import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chunkDocuments, parseDocument, type ParsedDocument } from "./chunk";
import type { Chunk, DocSummary } from "./types";

export const CORPUS_DIR = path.join(process.cwd(), "corpus");

export async function loadDocuments(dir = CORPUS_DIR): Promise<ParsedDocument[]> {
  const entries = await readdir(dir);
  const files = entries.filter((entry) => entry.endsWith(".md")).sort();
  const documents: ParsedDocument[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf8");
    documents.push(parseDocument(raw, file));
  }
  return documents;
}

export function summarizeDocuments(documents: ParsedDocument[], chunks: Chunk[]): DocSummary[] {
  return documents.map((doc) => {
    const own = chunks.filter((chunk) => chunk.id === doc.meta.id);
    const sections = [...new Set(own.map((chunk) => chunk.section))];
    return { ...doc.meta, sections, chunks: own.length };
  });
}
