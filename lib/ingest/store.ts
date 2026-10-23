import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureUniqueIds } from "./normalize";
import type { ConnectorStatus, ExternalStore, SourceDocument, SyncDelta } from "./types";

export const STORE_PATH = path.join(process.cwd(), "data", "documents.json");

export async function readStore(): Promise<ExternalStore | null> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as ExternalStore;
    if (!Array.isArray(parsed.documents) || !Array.isArray(parsed.connectors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStore(store: ExternalStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function mergeStore(
  existing: ExternalStore | null,
  connectorId: string,
  documents: SourceDocument[],
  status: ConnectorStatus,
): ExternalStore {
  const kept = (existing?.documents ?? []).filter((document) => document.source.connectorId !== connectorId);
  const statuses = (existing?.connectors ?? []).filter((entry) => entry.id !== connectorId);
  const connectors = [...statuses, status].sort((a, b) => a.id.localeCompare(b.id));
  return {
    generatedAt: new Date().toISOString(),
    connectors,
    documents: ensureUniqueIds([...kept, ...documents]),
  };
}

export function computeDelta(previous: SourceDocument[], next: SourceDocument[]): SyncDelta {
  const previousByKey = new Map(previous.map((document) => [`${document.source.connectorId}:${document.source.externalId}`, document]));
  const nextKeys = new Set<string>();
  let added = 0;
  let changed = 0;
  let unchanged = 0;

  for (const document of next) {
    const key = `${document.source.connectorId}:${document.source.externalId}`;
    nextKeys.add(key);
    const before = previousByKey.get(key);
    if (before === undefined) added += 1;
    else if (before.source.hash !== document.source.hash) changed += 1;
    else unchanged += 1;
  }

  let removed = 0;
  for (const key of previousByKey.keys()) {
    if (!nextKeys.has(key)) removed += 1;
  }
  return { added, changed, unchanged, removed };
}
