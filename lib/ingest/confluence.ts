import { isConnectorConfigured } from "./config";
import { htmlToText, slugify } from "./html";
import { makeDocument } from "./normalize";
import type { Connector, SourceDocument } from "./types";

type Options = Record<string, string>;

type ConfluencePage = {
  id: string;
  title: string;
  body?: { storage?: { value?: string } };
  version?: { number?: number; when?: string; by?: { displayName?: string } };
  _links?: { webui?: string; base?: string };
};

type ConfluenceResponse = {
  results?: ConfluencePage[];
  size?: number;
  _links?: { next?: string };
};

function option(options: Options, key: string, env: string, fallback?: string): string | undefined {
  return options[key] ?? process.env[env] ?? fallback;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function basicAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function getJson(url: string, email: string, token: string): Promise<ConfluenceResponse> {
  const response = await fetch(url, {
    headers: { authorization: basicAuth(email, token), accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Confluence ${response.status} ${response.statusText} for ${url}`);
  }
  return (await response.json()) as ConfluenceResponse;
}

export function createConfluenceConnector(config: { id: string; label: string; options?: Options }): Connector {
  const options = config.options ?? {};
  const rawBase = option(options, "baseUrl", "CONFLUENCE_BASE_URL");
  const email = option(options, "email", "CONFLUENCE_EMAIL");
  const token = option(options, "token", "CONFLUENCE_API_TOKEN");
  const spaceKeys = (option(options, "spaceKeys", "CONFLUENCE_SPACE_KEYS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const cql = option(options, "cql", "CONFLUENCE_CQL");
  const maxPages = Number.parseInt(option(options, "maxPages", "CONFLUENCE_MAX_PAGES", "1000") ?? "1000", 10);
  const base = rawBase === undefined ? undefined : `${trimSlash(rawBase).replace(/\/wiki$/, "")}/wiki`;

  function pageUrl(page: ConfluencePage): string | undefined {
    const webui = page._links?.webui;
    if (base === undefined || webui === undefined) return undefined;
    if (/^https?:\/\//.test(webui)) return webui;
    const prefix = trimSlash(page._links?.base ?? base);
    return `${prefix}${webui.startsWith("/") ? "" : "/"}${webui}`;
  }

  return {
    id: config.id,
    type: "confluence",
    label: config.label,
    configured() {
      return isConnectorConfigured({ id: config.id, type: "confluence", options });
    },
    async sync(): Promise<SourceDocument[]> {
      if (base === undefined || email === undefined || token === undefined) {
        throw new Error("Confluence is not configured: set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN");
      }

      const documents: SourceDocument[] = [];
      const seen = new Set<string>();
      const spaces = spaceKeys.length > 0 ? spaceKeys : [undefined];

      for (const space of spaces) {
        let start = 0;
        const limit = 100;
        while (documents.length < maxPages) {
          const params = new URLSearchParams({
            type: "page",
            limit: String(limit),
            start: String(start),
            expand: "body.storage,version",
          });
          if (space !== undefined) params.set("spaceKey", space);
          if (cql !== undefined) params.set("cql", cql);
          const response = await getJson(`${base}/rest/api/content?${params.toString()}`, email, token);
          const results = response.results ?? [];
          for (const page of results) {
            if (seen.has(page.id)) continue;
            seen.add(page.id);
            const body = page.body?.storage?.value;
            if (body === undefined || body.trim().length === 0) continue;
            const updatedAt = page.version?.when;
            documents.push(
              makeDocument({
                connectorId: config.id,
                type: "confluence",
                externalId: page.id,
                id: `CONF-${slugify(page.title)}`,
                title: page.title,
                body: htmlToText(body),
                owner: page.version?.by?.displayName ?? config.label,
                version: page.version?.number === undefined ? "1.0" : String(page.version.number),
                effective: updatedAt?.slice(0, 10),
                url: pageUrl(page),
                updatedAt,
              }),
            );
          }
          const size = response.size ?? results.length;
          if (results.length === 0 || size < limit || response._links?.next === undefined) break;
          start += limit;
        }
      }

      return documents;
    },
  };
}
