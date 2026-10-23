import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectorConfig } from "./types";

export const DEFAULT_CONFIG: ConnectorConfig[] = [
  { id: "corpus", type: "local", label: "Local documents", options: { path: "./corpus" } },
  { id: "confluence", type: "confluence", label: "Confluence" },
  { id: "sharepoint", type: "sharepoint", label: "SharePoint" },
  { id: "gdrive", type: "gdrive", label: "Google Drive" },
];

export const CONFIG_PATH = path.join(process.cwd(), "ingest.config.json");

export async function loadConnectorConfig(file?: string): Promise<ConnectorConfig[]> {
  try {
    const raw =
      file === undefined
        ? await readFile(CONFIG_PATH, "utf8")
        : await readFile(/* turbopackIgnore: true */ file, "utf8");
    const parsed = JSON.parse(raw) as { sources?: ConnectorConfig[] };
    if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
      return parsed.sources.filter((source) => source.enabled !== false);
    }
  } catch {
    // fall through to the default local-only configuration
  }
  return DEFAULT_CONFIG.filter((source) => source.enabled !== false);
}

export function connectorRequirement(type: ConnectorConfig["type"]): string {
  switch (type) {
    case "local":
      return "No credentials. Reads a local folder.";
    case "confluence":
      return "CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN";
    case "sharepoint":
      return "SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET, SHAREPOINT_SITE_ID";
    case "gdrive":
      return "GOOGLE_DRIVE_FOLDER_ID + GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_ACCESS_TOKEN";
  }
}

export function isConnectorConfigured(config: ConnectorConfig): boolean {
  const options = config.options ?? {};
  switch (config.type) {
    case "local":
      return true;
    case "confluence":
      return Boolean(
        (options["baseUrl"] ?? process.env["CONFLUENCE_BASE_URL"]) &&
          (options["email"] ?? process.env["CONFLUENCE_EMAIL"]) &&
          (options["token"] ?? process.env["CONFLUENCE_API_TOKEN"]),
      );
    case "sharepoint":
      return Boolean(
        (options["tenantId"] ?? process.env["SHAREPOINT_TENANT_ID"]) &&
          (options["clientId"] ?? process.env["SHAREPOINT_CLIENT_ID"]) &&
          (options["clientSecret"] ?? process.env["SHAREPOINT_CLIENT_SECRET"]) &&
          ((options["siteId"] ?? process.env["SHAREPOINT_SITE_ID"]) ||
            (options["hostname"] ?? process.env["SHAREPOINT_SITE_HOSTNAME"])),
      );
    case "gdrive":
      return Boolean(
        (options["folderId"] ?? process.env["GOOGLE_DRIVE_FOLDER_ID"]) &&
          ((options["accessToken"] ?? process.env["GOOGLE_DRIVE_ACCESS_TOKEN"]) ||
            (options["serviceAccountJson"] ?? process.env["GOOGLE_SERVICE_ACCOUNT_JSON"])),
      );
  }
}
