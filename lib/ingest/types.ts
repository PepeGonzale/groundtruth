import type { ConnectorType, DocMeta, SourceInfo } from "../types";

export type ConnectorConfig = {
  id: string;
  type: ConnectorType;
  label?: string;
  enabled?: boolean;
  options?: Record<string, string>;
};

export type ConnectorStatus = {
  id: string;
  type: ConnectorType;
  label: string;
  enabled: boolean;
  configured: boolean;
  documents: number;
  lastSyncAt: string | null;
  error: string | null;
  detail: string | null;
};

export type SourceDocument = {
  meta: DocMeta;
  body: string;
  source: SourceInfo & { hash: string };
};

export type ExternalStore = {
  generatedAt: string;
  connectors: ConnectorStatus[];
  documents: SourceDocument[];
};

export type Connector = {
  id: string;
  type: ConnectorType;
  label: string;
  configured(): boolean;
  sync(): Promise<SourceDocument[]>;
};

export type SyncDelta = {
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
};
