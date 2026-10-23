import path from "node:path";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const DIMENSIONS = 384;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let loadError: string | null = null;

function cacheDir(): string {
  return process.env["GROUNDTRUTH_MODEL_CACHE"] ?? path.join(process.cwd(), ".cache", "transformers");
}

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (loadError !== null) throw new Error(loadError);
  if (extractorPromise === null) {
    env.cacheDir = cacheDir();
    env.allowRemoteModels = true;
    extractorPromise = pipeline("feature-extraction", MODEL_ID, { dtype: "q8" }).catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error);
      extractorPromise = null;
      throw error;
    });
  }
  return extractorPromise;
}

export function embeddingsEnabled(): boolean {
  return process.env["GROUNDTRUTH_EMBEDDINGS"] !== "off";
}

export async function embedTexts(texts: string[], batchSize = 8): Promise<number[][]> {
  const extractor = await getExtractor();
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const tensor = await extractor(batch, { pooling: "mean", normalize: true });
    const rows = tensor.tolist() as number[][];
    for (const row of rows) vectors.push(row);
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<{ vector: number[] | null; error: string | null }> {
  if (!embeddingsEnabled()) return { vector: null, error: "dense retrieval disabled" };
  try {
    const [vector] = await embedTexts([text], 1);
    return { vector: vector ?? null, error: vector === undefined ? "empty embedding" : null };
  } catch (error) {
    return { vector: null, error: error instanceof Error ? error.message : String(error) };
  }
}
