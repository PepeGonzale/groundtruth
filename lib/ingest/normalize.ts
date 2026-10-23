import { createHash } from "node:crypto";
import type { ConnectorType, DocMeta } from "../types";
import { slugify } from "./html";
import type { SourceDocument } from "./types";

const PREFIX: Record<ConnectorType, string> = {
  local: "LOCAL",
  confluence: "CONF",
  sharepoint: "SP",
  gdrive: "GD",
};

export function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export type DocumentInput = {
  connectorId: string;
  type: ConnectorType;
  externalId: string;
  title: string;
  body: string;
  url?: string;
  updatedAt?: string;
  id?: string;
  owner?: string;
  version?: string;
  effective?: string;
  classification?: string;
  supersedes?: string;
};

export function makeDocument(input: DocumentInput): SourceDocument {
  const body = input.body.trim();
  const effective = (input.effective ?? input.updatedAt ?? new Date().toISOString()).slice(0, 10);
  const meta: DocMeta = {
    id: input.id ?? `${PREFIX[input.type]}-${slugify(input.title)}`,
    title: input.title.trim().length > 0 ? input.title.trim() : "Untitled document",
    owner: input.owner ?? "Unassigned",
    version: input.version ?? "1.0",
    effective,
    classification: input.classification ?? "internal",
  };
  if (input.supersedes !== undefined && input.supersedes.length > 0) meta.supersedes = input.supersedes;

  return {
    meta,
    body,
    source: {
      connectorId: input.connectorId,
      type: input.type,
      externalId: input.externalId,
      hash: hashBody(body),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {}),
    },
  };
}

export function ensureUniqueIds(documents: SourceDocument[]): SourceDocument[] {
  const ordered = [...documents].sort(
    (a, b) => a.source.connectorId.localeCompare(b.source.connectorId) || a.source.externalId.localeCompare(b.source.externalId),
  );
  const used = new Set<string>();
  return ordered.map((document) => {
    let id = document.meta.id;
    if (used.has(id)) {
      const suffix = slugify(document.source.externalId).slice(0, 10) || "copy";
      id = `${document.meta.id}-${suffix}`;
      let counter = 2;
      while (used.has(id)) {
        id = `${document.meta.id}-${suffix}-${counter}`;
        counter += 1;
      }
    }
    used.add(id);
    return { ...document, meta: { ...document.meta, id } };
  });
}
