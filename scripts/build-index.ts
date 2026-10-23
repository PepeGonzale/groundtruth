import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chunkDocument } from "../lib/chunk";
import { loadDocumentsForIndex } from "../lib/ingest/index-source";
import { contentTokens } from "../lib/text";
import { DIMENSIONS, MODEL_ID, embedTexts, embeddingsEnabled } from "../lib/retrieval/dense";
import type { DocSummary, IndexFile, IndexedChunk } from "../lib/types";

async function main() {
  const startedAt = performance.now();
  const documents = await loadDocumentsForIndex();
  if (documents.length === 0) throw new Error("No documents found. Run `npm run ingest -- --source=local`.");

  const chunks = documents.flatMap((document) => chunkDocument(document.meta, document.body));
  const docs: DocSummary[] = documents.map((document) => {
    const own = chunks.filter((chunk) => chunk.id === document.meta.id);
    const summary: DocSummary = {
      ...document.meta,
      sections: [...new Set(own.map((chunk) => chunk.section))],
      chunks: own.length,
    };
    if (document.source !== undefined) {
      summary.source = {
        connectorId: document.source.connectorId,
        type: document.source.type,
        externalId: document.source.externalId,
        ...(document.source.url !== undefined ? { url: document.source.url } : {}),
        ...(document.source.updatedAt !== undefined ? { updatedAt: document.source.updatedAt } : {}),
      };
    }
    return summary;
  });
  console.log(`corpus: ${documents.length} documents, ${chunks.length} chunks`);

  let vectors: number[][] = [];
  let model = "none";
  let dimensions = 0;

  if (embeddingsEnabled()) {
    console.log(`embeddings: ${MODEL_ID} (first run downloads the model)`);
    const batchStartedAt = performance.now();
    vectors = await embedTexts(chunks.map((chunk) => `${chunk.title} — ${chunk.section}\n${chunk.text}`));
    model = MODEL_ID;
    dimensions = DIMENSIONS;
    console.log(`embeddings: ${vectors.length} vectors in ${Math.round(performance.now() - batchStartedAt)}ms`);
  } else {
    console.log("embeddings: disabled (GROUNDTRUTH_EMBEDDINGS=off) — lexical retrieval only");
  }

  const indexed: IndexedChunk[] = chunks.map((chunk, index) => ({
    ...chunk,
    vector: (vectors[index] ?? []).map((value) => Number(value.toFixed(5))),
  }));

  const tokenCounts = chunks.map((chunk) => contentTokens(`${chunk.title} ${chunk.section} ${chunk.text}`).length);
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const totalTokens = tokenCounts.reduce((sum, value) => sum + value, 0);

  const output: IndexFile = {
    builtAt: new Date().toISOString(),
    model,
    dimensions,
    docs,
    chunks: indexed,
    stats: {
      documents: documents.length,
      chunks: chunks.length,
      averageChunkChars: Math.round(totalChars / chunks.length),
      averageChunkTokens: Math.round(totalTokens / chunks.length),
    },
  };

  const target = path.join(process.cwd(), "data", "index.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const sizeKb = Math.round(Buffer.byteLength(JSON.stringify(output)) / 1024);
  console.log(
    `wrote data/index.json — ${output.stats.chunks} chunks, ${sizeKb} KB, ${Math.round(performance.now() - startedAt)}ms total`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
