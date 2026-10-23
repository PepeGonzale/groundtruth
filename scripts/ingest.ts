import { connectorRequirement, loadConnectorConfig } from "../lib/ingest/config";
import { createConnector } from "../lib/ingest/registry";
import { computeDelta, mergeStore, readStore, writeStore } from "../lib/ingest/store";
import type { ConnectorStatus, ExternalStore, SourceDocument } from "../lib/ingest/types";

function argValue(name: string): string | undefined {
  const args = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index !== -1) return args[index + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function withStatus(store: ExternalStore | null, status: ConnectorStatus): ExternalStore {
  const connectors = [...(store?.connectors ?? []).filter((entry) => entry.id !== status.id), status].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return {
    generatedAt: new Date().toISOString(),
    connectors,
    documents: store?.documents ?? [],
  };
}

async function main() {
  const source = argValue("source") ?? "all";
  const configPath = argValue("config");
  const pathOverride = argValue("path");
  const dryRun = hasFlag("dry-run");
  const explicit = source !== "all";

  const configs = (await loadConnectorConfig(configPath)).map((config) => {
    if (config.type === "local" && pathOverride !== undefined) {
      return { ...config, options: { ...(config.options ?? {}), path: pathOverride } };
    }
    return config;
  });

  const targets = configs.filter((config) => source === "all" || config.type === source || config.id === source);
  if (targets.length === 0) {
    console.error(`No connector matches --source=${source}. Available: ${configs.map((config) => config.id).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  let store = await readStore();
  let failures = 0;

  for (const config of targets) {
    const connector = createConnector(config);
    const previousDocs = (store?.documents ?? []).filter((document) => document.source.connectorId === connector.id);
    const previousStatus = store?.connectors.find((entry) => entry.id === connector.id);
    const startedAt = new Date();
    const baseStatus = {
      id: connector.id,
      type: connector.type,
      label: connector.label,
      enabled: true,
      documents: previousDocs.length,
      lastSyncAt: previousStatus?.lastSyncAt ?? null,
    };

    if (!connector.configured()) {
      const status: ConnectorStatus = {
        ...baseStatus,
        configured: false,
        error: null,
        detail: `Not configured. ${connectorRequirement(connector.type)}`,
      };
      store = withStatus(store, status);
      console.log(`- ${connector.label}: skipped (${connectorRequirement(connector.type)})`);
      if (explicit) failures += 1;
      continue;
    }

    console.log(`- ${connector.label}: syncing…`);
    try {
      const documents: SourceDocument[] = await connector.sync();
      const delta = computeDelta(previousDocs, documents);
      const status: ConnectorStatus = {
        ...baseStatus,
        configured: true,
        documents: documents.length,
        lastSyncAt: startedAt.toISOString(),
        error: null,
        detail: `${delta.added} added · ${delta.changed} changed · ${delta.unchanged} unchanged · ${delta.removed} removed`,
      };
      store = mergeStore(store, connector.id, documents, status);
      console.log(
        `  ${documents.length} documents — ${delta.added} added, ${delta.changed} changed, ${delta.unchanged} unchanged, ${delta.removed} removed`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status: ConnectorStatus = {
        ...baseStatus,
        configured: true,
        error: message,
        detail: "Sync failed. Previous documents were kept.",
      };
      store = withStatus(store, status);
      console.error(`  failed: ${message}`);
      failures += 1;
    }
  }

  if (store !== null) {
    if (dryRun) {
      console.log(`dry run: ${store.documents.length} documents would be written to data/documents.json`);
    } else {
      await writeStore(store);
      console.log(`wrote data/documents.json — ${store.documents.length} documents, ${store.connectors.length} connectors`);
    }
  }

  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
