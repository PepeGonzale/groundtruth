import path from "node:path";
import { parseDocument } from "../chunk";
import { isConnectorConfigured } from "./config";
import { extractTextFromBytes, extensionOf, isSupported } from "./extract";
import { slugify } from "./html";
import { makeDocument } from "./normalize";
import type { Connector, SourceDocument } from "./types";

type Options = Record<string, string>;

const GRAPH = "https://graph.microsoft.com/v1.0";

type DriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};

type ChildrenResponse = {
  value?: DriveItem[];
  "@odata.nextLink"?: string;
};

function option(options: Options, key: string, env: string, fallback?: string): string | undefined {
  return options[key] ?? process.env[env] ?? fallback;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = `${tenantId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) throw new Error(`SharePoint token ${response.status}: ${await response.text()}`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (payload.access_token === undefined) throw new Error("SharePoint token response did not include access_token");
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}

async function graphJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Graph ${response.status} ${response.statusText} for ${url}`);
  return (await response.json()) as T;
}

function titleFromText(filename: string, text: string): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
  if (firstLine !== undefined && firstLine.length >= 3 && firstLine.length <= 90 && !/[.!?]$/.test(firstLine)) {
    return firstLine.replace(/^#+\s*/, "");
  }
  return path.basename(filename, path.extname(filename));
}

export function createSharePointConnector(config: { id: string; label: string; options?: Options }): Connector {
  const options = config.options ?? {};
  const tenantId = option(options, "tenantId", "SHAREPOINT_TENANT_ID");
  const clientId = option(options, "clientId", "SHAREPOINT_CLIENT_ID");
  const clientSecret = option(options, "clientSecret", "SHAREPOINT_CLIENT_SECRET");
  const siteId = option(options, "siteId", "SHAREPOINT_SITE_ID");
  const hostname = option(options, "hostname", "SHAREPOINT_SITE_HOSTNAME");
  const sitePath = option(options, "sitePath", "SHAREPOINT_SITE_PATH", "");
  const driveIdOption = option(options, "driveId", "SHAREPOINT_DRIVE_ID");
  const maxItems = Number.parseInt(option(options, "maxItems", "SHAREPOINT_MAX_ITEMS", "1000") ?? "1000", 10);
  const ownerFallback = option(options, "owner", "SHAREPOINT_OWNER", config.label) ?? config.label;

  function sitePathSegment(): string | null {
    if (siteId !== undefined && siteId.length > 0) return `/sites/${siteId}`;
    if (hostname === undefined || hostname.length === 0) return null;
    const host = hostname.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const suffix = sitePath !== undefined && sitePath.length > 0 ? `:${sitePath.startsWith("/") ? sitePath : `/${sitePath}`}` : "";
    return `/sites/${host}${suffix}`;
  }

  return {
    id: config.id,
    type: "sharepoint",
    label: config.label,
    configured() {
      return isConnectorConfigured({ id: config.id, type: "sharepoint", options });
    },
    async sync(): Promise<SourceDocument[]> {
      if (tenantId === undefined || clientId === undefined || clientSecret === undefined) {
        throw new Error("SharePoint is not configured: set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID and SHAREPOINT_CLIENT_SECRET");
      }
      const site = sitePathSegment();
      if (site === null) {
        throw new Error("SharePoint is not configured: set SHAREPOINT_SITE_ID or SHAREPOINT_SITE_HOSTNAME");
      }

      const token = await getToken(tenantId, clientId, clientSecret);
      const drive = await graphJson<{ id: string }>(`${GRAPH}${site}/drive`, token);
      const driveId = driveIdOption ?? drive.id;

      const items: DriveItem[] = [];
      async function list(url: string, depth: number): Promise<void> {
        if (items.length >= maxItems || depth > 6) return;
        let next: string | undefined = url;
        while (next !== undefined && items.length < maxItems) {
          const page: ChildrenResponse = await graphJson<ChildrenResponse>(next, token);
          for (const item of page.value ?? []) {
            if (items.length >= maxItems) break;
            if (item.folder !== undefined) {
              await list(`${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(item.id)}/children?$top=200`, depth + 1);
            } else if (item.file !== undefined) {
              items.push(item);
            }
          }
          next = page["@odata.nextLink"];
        }
      }

      await list(
        `${GRAPH}/drives/${encodeURIComponent(driveId)}/root/children?$top=200&$select=id,name,webUrl,lastModifiedDateTime,lastModifiedBy,file,folder`,
        0,
      );

      const documents: SourceDocument[] = [];
      for (const item of items) {
        if (!isSupported(item.name)) continue;
        const response = await fetch(`${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(item.id)}/content`, {
          headers: { authorization: `Bearer ${token}` },
          redirect: "follow",
        });
        if (!response.ok) {
          console.warn(`groundtruth: SharePoint download failed for ${item.name}: ${response.status}`);
          continue;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const extension = extensionOf(item.name);
        let title = path.basename(item.name, path.extname(item.name));
        let body: string;
        let metaOverride: { id?: string; title?: string; owner?: string; version?: string; effective?: string; classification?: string; supersedes?: string } = {};

        if (extension === "md" || extension === "markdown") {
          const parsed = parseDocument(new TextDecoder().decode(bytes), item.name);
          body = parsed.body;
          title = parsed.meta.title;
          metaOverride = {
            id: parsed.meta.id,
            title: parsed.meta.title,
            owner: parsed.meta.owner,
            version: parsed.meta.version,
            effective: parsed.meta.effective,
            classification: parsed.meta.classification,
            supersedes: parsed.meta.supersedes,
          };
        } else {
          body = await extractTextFromBytes(item.name, bytes);
          if (extension === "txt") title = titleFromText(item.name, body);
        }
        if (body.trim().length === 0) continue;

        const updatedAt = item.lastModifiedDateTime;
        documents.push(
          makeDocument({
            connectorId: config.id,
            type: "sharepoint",
            externalId: item.id,
            id: metaOverride.id ?? `SP-${slugify(title)}`,
            title: metaOverride.title ?? title,
            body,
            owner: metaOverride.owner ?? item.lastModifiedBy?.user?.displayName ?? ownerFallback,
            version: metaOverride.version ?? "1.0",
            effective: metaOverride.effective ?? updatedAt?.slice(0, 10),
            classification: metaOverride.classification ?? "internal",
            supersedes: metaOverride.supersedes,
            url: item.webUrl,
            updatedAt,
          }),
        );
      }
      return documents;
    },
  };
}
