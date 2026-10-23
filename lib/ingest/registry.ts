import { createConfluenceConnector } from "./confluence";
import { createDriveConnector } from "./gdrive";
import { createLocalConnector } from "./local";
import { createSharePointConnector } from "./sharepoint";
import type { Connector, ConnectorConfig } from "./types";

export function createConnector(config: ConnectorConfig): Connector {
  const options = config.options ?? {};
  const label = config.label ?? config.id;
  switch (config.type) {
    case "local":
      return createLocalConnector({ id: config.id, label, options });
    case "confluence":
      return createConfluenceConnector({ id: config.id, label, options });
    case "sharepoint":
      return createSharePointConnector({ id: config.id, label, options });
    case "gdrive":
      return createDriveConnector({ id: config.id, label, options });
  }
}
