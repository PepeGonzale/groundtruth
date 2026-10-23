import { composeAnswer, prepareAnswer, sanitizeQuestion } from "@/lib/answer/engine";
import { rateLimit } from "@/lib/rate-limit";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded === null) return "local";
  return forwarded.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request));
  if (!limited.ok) {
    return Response.json(
      { error: "Too many questions. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const question = sanitizeQuestion((body as { question?: unknown } | null)?.question);
  if (question === null) {
    return Response.json({ error: "Ask a question between 3 and 400 characters." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const prepared = await prepareAnswer(question);
        send({
          type: "retrieval",
          sources: prepared.sources,
          trace: prepared.trace,
          contradictions: prepared.contradictions,
        });

        const result = await composeAnswer(prepared);
        send({ type: "answer", result });
      } catch (error) {
        console.error("groundtruth: ask failed", error);
        send({ type: "error", message: "The assistant could not answer. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
