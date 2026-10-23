import type { AnswerBlock, Citation, RetrievedChunk } from "../types";
import { buildSystemPrompt } from "./prompt";

const DEFAULT_MODEL = "claude-sonnet-4-5";

export function claudeConfigured(): boolean {
  return (process.env["ANTHROPIC_API_KEY"] ?? "").length > 0;
}

export function modelName(): string {
  return process.env["ANTHROPIC_MODEL"] ?? DEFAULT_MODEL;
}

export type ClaudeResult =
  | { ok: true; text: string; blocks: AnswerBlock[]; model: string }
  | { ok: false; error: string };

function stripSourcesSection(text: string): string {
  return text
    .replace(/\n\s*(?:#{1,4}\s*)?\*{0,2}Sources\*{0,2}\s*:?\s*\n[\s\S]*$/i, "")
    .trim();
}

export function toBlocks(text: string): AnswerBlock[] {
  const cleaned = stripSourcesSection(text)
    .replace(/^Answer:\s*/i, "")
    .replace(/\r/g, "")
    .trim();
  if (cleaned.length === 0) return [];

  const blocks: AnswerBlock[] = [];
  const paragraphs = cleaned.split(/\n{2,}/);

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    const listLines = lines.filter((line) => /^([-*•]|\d+[.)])\s+/.test(line));
    if (listLines.length > 0 && listLines.length >= lines.length - 1) {
      blocks.push({
        kind: "list",
        items: listLines.map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, "").trim()),
      });
      continue;
    }
    const joined = lines.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length === 0) continue;
    blocks.push({ kind: blocks.length === 0 ? "direct" : "paragraph", text: joined });
  }

  return blocks;
}

export async function generateWithClaude(
  question: string,
  sources: RetrievedChunk[],
  citations: Citation[],
): Promise<ClaudeResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
  if (apiKey.length === 0) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const model = modelName();
    const response = await client.messages.create(
      {
        model,
        max_tokens: 900,
        temperature: 0,
        system: buildSystemPrompt(sources, citations),
        messages: [{ role: "user", content: question }],
      },
      { signal: AbortSignal.timeout(30_000) },
    );

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    if (text.length === 0) return { ok: false, error: "Claude returned an empty response" };
    return { ok: true, text, blocks: toBlocks(text), model: response.model };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
