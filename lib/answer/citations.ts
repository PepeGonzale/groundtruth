import type { Citation, RetrievedChunk } from "../types";

export function buildCitations(sources: RetrievedChunk[]): Citation[] {
  return sources.map((source, index) => ({
    marker: `S${index + 1}`,
    chunkId: source.chunkId,
    docId: source.id,
    docTitle: source.title,
    section: source.section,
    effective: source.effective,
    version: source.version,
  }));
}

export function citationFor(citations: Citation[], marker: string): Citation | undefined {
  return citations.find((citation) => citation.marker === marker);
}

export function findMarkers(text: string): string[] {
  return [...new Set([...text.matchAll(/\[(S\d+)\]/g)].map((match) => match[1] ?? ""))].filter(
    (marker) => marker.length > 0,
  );
}

export function countMarkers(text: string): number {
  return [...text.matchAll(/\[S\d+\]/g)].length;
}
