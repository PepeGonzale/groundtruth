import { claudeConfigured, modelName } from "@/lib/answer/claude";
import { embeddingsEnabled, MODEL_ID } from "@/lib/retrieval/dense";
import { getIndex } from "@/lib/retrieval/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const index = getIndex();
  return Response.json({
    status: "ok",
    generation: claudeConfigured() ? "claude" : "extractive",
    model: claudeConfigured() ? modelName() : "none",
    embeddings: embeddingsEnabled() ? MODEL_ID : "disabled",
    index: {
      builtAt: index.builtAt,
      documents: index.stats.documents,
      chunks: index.stats.chunks,
    },
  });
}
