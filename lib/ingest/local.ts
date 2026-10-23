import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "../chunk";
import { isConnectorConfigured } from "./config";
import type { DocMeta } from "../types";
import { extractTextFromPath, isSupported } from "./extract";
import { makeDocument } from "./normalize";
import type { Connector, SourceDocument } from "./types";

const IGNORED = new Set(["node_modules", ".git", ".next", ".cache", "dist", "build"]);

type Options = Record<string, string>;

function option(options: Options, key: string, fallback?: string): string | undefined {
  return options[key] ?? fallback;
}

async function readSidecar(file: string): Promise<Partial<DocMeta>> {
  try {
    const raw = await readFile(`${file}.meta.json`, "utf8");
    const parsed = JSON.parse(raw) as Partial<DocMeta>;
    return parsed;
  } catch {
    return {};
  }
}

function titleFromText(filename: string, text: string): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
  if (firstLine !== undefined && firstLine.length >= 3 && firstLine.length <= 90 && !/[.!?]$/.test(firstLine)) {
    return firstLine.replace(/^#+\s*/, "");
  }
  return path.basename(filename, path.extname(filename));
}

async function walk(directory: string, output: string[], limit: number): Promise<void> {
  if (output.length >= limit) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (output.length >= limit) return;
    if (entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full, output, limit);
    } else if (entry.isFile() && isSupported(entry.name)) {
      output.push(full);
    }
  }
}

export function createLocalConnector(config: { id: string; label: string; options?: Options }): Connector {
  const options = config.options ?? {};
  const root = path.resolve(process.cwd(), option(options, "path", "./corpus") ?? "./corpus");
  const owner = option(options, "owner", "Local corpus") ?? "Local corpus";
  const classification = option(options, "classification", "internal") ?? "internal";
  const limit = Number.parseInt(option(options, "maxFiles", "2000") ?? "2000", 10);

  return {
    id: config.id,
    type: "local",
    label: config.label,
    configured() {
      return isConnectorConfigured({ id: config.id, type: "local", options });
    },
    async sync(): Promise<SourceDocument[]> {
      const files: string[] = [];
      await walk(root, files, Number.isFinite(limit) ? limit : 2000);
      files.sort();

      const documents: SourceDocument[] = [];
      for (const file of files) {
        const relative = path.relative(root, file).split(path.sep).join("/");
        const extension = path.extname(file).toLowerCase();
        const sidecar = await readSidecar(file);
        const modifiedAt = (await stat(file)).mtime.toISOString();

        if (extension === ".md" || extension === ".markdown") {
          const raw = await readFile(file, "utf8");
          const parsed = parseDocument(raw, path.basename(file));
          if (parsed.body.trim().length === 0) continue;
          documents.push(
            makeDocument({
              connectorId: config.id,
              type: "local",
              externalId: relative,
              id: sidecar.id ?? parsed.meta.id,
              title: sidecar.title ?? parsed.meta.title,
              body: parsed.body,
              owner: sidecar.owner ?? parsed.meta.owner,
              version: sidecar.version ?? parsed.meta.version,
              effective: sidecar.effective ?? parsed.meta.effective,
              classification: sidecar.classification ?? parsed.meta.classification,
              supersedes: sidecar.supersedes ?? parsed.meta.supersedes,
              updatedAt: modifiedAt,
            }),
          );
          continue;
        }

        const text = await extractTextFromPath(file);
        if (text.trim().length === 0) continue;
        documents.push(
          makeDocument({
            connectorId: config.id,
            type: "local",
            externalId: relative,
            id: sidecar.id,
            title: sidecar.title ?? titleFromText(file, text),
            body: text,
            owner: sidecar.owner ?? owner,
            version: sidecar.version,
            effective: sidecar.effective ?? modifiedAt.slice(0, 10),
            classification: sidecar.classification ?? classification,
            supersedes: sidecar.supersedes,
            updatedAt: modifiedAt,
          }),
        );
      }
      return documents;
    },
  };
}
