import Console from "@/components/console";
import rawEval from "@/data/eval.json";
import { claudeConfigured, modelName } from "@/lib/answer/claude";
import { connectorRequirement, isConnectorConfigured, loadConnectorConfig } from "@/lib/ingest/config";
import { readStore } from "@/lib/ingest/store";
import { getIndex } from "@/lib/retrieval/store";
import type { ConnectorView, EvalFile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const index = getIndex();
  const store = await readStore();
  const configs = await loadConnectorConfig();
  const statuses = new Map((store?.connectors ?? []).map((status) => [status.id, status]));

  const connectors: ConnectorView[] = configs.map((config) => {
    const status = statuses.get(config.id);
    const indexed = index.docs.filter((document) => document.source?.connectorId === config.id).length;
    const documents = status?.documents ?? (config.type === "local" ? index.stats.documents : indexed);
    return {
      id: config.id,
      type: config.type,
      label: config.label ?? config.id,
      configured: isConnectorConfigured(config),
      documents,
      lastSyncAt: status?.lastSyncAt ?? null,
      error: status?.error ?? null,
      detail: status?.detail ?? null,
      requirement: connectorRequirement(config.type),
    };
  });

  const evaluation = rawEval as unknown as EvalFile;

  return (
    <Console
      corpus={{
        documents: index.docs,
        stats: index.stats,
        builtAt: index.builtAt,
        model: index.model,
      }}
      evaluation={evaluation}
      connectors={connectors}
      mode={claudeConfigured() ? "claude" : "extractive"}
      model={claudeConfigured() ? modelName() : "extractive composer"}
    />
  );
}
