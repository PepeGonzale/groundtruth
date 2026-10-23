import { loadDocuments } from "../corpus";
import type { DocMeta, SourceInfo } from "../types";
import { readStore } from "./store";

export type IndexDocument = {
  meta: DocMeta;
  body: string;
  source?: SourceInfo;
};

export async function loadDocumentsForIndex(): Promise<IndexDocument[]> {
  const store = await readStore();
  if (store !== null && store.documents.length > 0) {
    return store.documents.map((document) => ({
      meta: document.meta,
      body: document.body,
      source: document.source,
    }));
  }
  const corpus = await loadDocuments();
  return corpus.map((document) => ({ meta: document.meta, body: document.body }));
}
