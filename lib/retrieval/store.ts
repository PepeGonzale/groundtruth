import raw from "../../data/index.json";
import type { IndexFile } from "../types";

let cached: IndexFile | null = null;

export function getIndex(): IndexFile {
  if (cached === null) {
    const data = raw as unknown as IndexFile;
    if (!Array.isArray(data.chunks) || !Array.isArray(data.docs)) {
      throw new Error("data/index.json is malformed. Run `npm run index`.");
    }
    cached = data;
  }
  return cached;
}

export function indexBuiltAt(): string {
  return getIndex().builtAt;
}
