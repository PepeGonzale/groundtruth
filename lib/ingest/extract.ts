import { readFile } from "node:fs/promises";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set(["md", "markdown", "txt", "pdf", "docx"]);

export function extensionOf(filename: string): string {
  return path.extname(filename).replace(/^\./, "").toLowerCase();
}

export function isSupported(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extensionOf(filename));
}

export async function extractTextFromBytes(filename: string, bytes: Uint8Array): Promise<string> {
  const extension = extensionOf(filename);
  if (extension === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const document = await getDocumentProxy(bytes);
    const { text } = await extractText(document, { mergePages: false });
    return text.map((page, index) => `## Page ${index + 1}\n\n${page.trim()}`).join("\n\n");
  }
  if (extension === "docx") {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value.trim();
  }
  return new TextDecoder("utf-8").decode(bytes).trim();
}

export async function extractTextFromPath(filename: string): Promise<string> {
  const bytes = new Uint8Array(await readFile(filename));
  return extractTextFromBytes(filename, bytes);
}
