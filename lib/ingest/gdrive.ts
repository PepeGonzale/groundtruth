import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "../chunk";
import { isConnectorConfigured } from "./config";
import { extractTextFromBytes, extensionOf, isSupported } from "./extract";
import { slugify } from "./html";
import { makeDocument } from "./normalize";
import type { Connector, SourceDocument } from "./types";

type Options = Record<string, string>;

const DRIVE = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  version?: string;
  lastModifyingUser?: { displayName?: string };
};

type DriveList = { files?: DriveFile[]; nextPageToken?: string };

type ServiceAccount = { client_email: string; private_key: string };

function option(options: Options, key: string, env: string, fallback?: string): string | undefined {
  return options[key] ?? process.env[env] ?? fallback;
}

function base64url(input: string | Buffer): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function loadServiceAccount(value: string): Promise<ServiceAccount> {
  const raw = value.trim().startsWith("{") ? value : await readFile(path.resolve(process.cwd(), value), "utf8");
  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (parsed.client_email === undefined || parsed.private_key === undefined) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON does not contain client_email and private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getServiceAccountToken(serviceAccountJson: string): Promise<string> {
  const account = await loadServiceAccount(serviceAccountJson);
  const cacheKey = account.client_email;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(account.private_key);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google token ${response.status}: ${await response.text()}`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (payload.access_token === undefined) throw new Error("Google token response did not include access_token");
  tokenCache.set(cacheKey, { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 });
  return payload.access_token;
}

async function driveJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Drive ${response.status} ${response.statusText} for ${url}`);
  return (await response.json()) as T;
}

export function createDriveConnector(config: { id: string; label: string; options?: Options }): Connector {
  const options = config.options ?? {};
  const folderId = option(options, "folderId", "GOOGLE_DRIVE_FOLDER_ID");
  const accessToken = option(options, "accessToken", "GOOGLE_DRIVE_ACCESS_TOKEN");
  const serviceAccountJson = option(options, "serviceAccountJson", "GOOGLE_SERVICE_ACCOUNT_JSON");
  const maxItems = Number.parseInt(option(options, "maxItems", "GOOGLE_DRIVE_MAX_ITEMS", "1000") ?? "1000", 10);
  const ownerFallback = option(options, "owner", "GOOGLE_DRIVE_OWNER", config.label) ?? config.label;

  async function token(): Promise<string> {
    if (accessToken !== undefined && accessToken.length > 0) return accessToken;
    if (serviceAccountJson !== undefined && serviceAccountJson.length > 0) return getServiceAccountToken(serviceAccountJson);
    throw new Error("Google Drive is not configured: set GOOGLE_DRIVE_ACCESS_TOKEN or GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  return {
    id: config.id,
    type: "gdrive",
    label: config.label,
    configured() {
      return isConnectorConfigured({ id: config.id, type: "gdrive", options });
    },
    async sync(): Promise<SourceDocument[]> {
      if (folderId === undefined) throw new Error("Google Drive is not configured: set GOOGLE_DRIVE_FOLDER_ID");
      const auth = await token();
      const files: DriveFile[] = [];

      async function list(folder: string, depth: number): Promise<void> {
        if (files.length >= maxItems || depth > 6) return;
        let pageToken: string | undefined;
        while (files.length < maxItems) {
          const params = new URLSearchParams({
            q: `'${folder}' in parents and trashed = false`,
            fields:
              "files(id,name,mimeType,modifiedTime,webViewLink,version,lastModifyingUser(displayName)),nextPageToken",
            pageSize: "100",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
          });
          if (pageToken !== undefined) params.set("pageToken", pageToken);
          const page = await driveJson<DriveList>(`${DRIVE}/files?${params.toString()}`, auth);
          for (const file of page.files ?? []) {
            if (file.mimeType === "application/vnd.google-apps.folder") {
              await list(file.id, depth + 1);
            } else {
              files.push(file);
            }
            if (files.length >= maxItems) break;
          }
          pageToken = page.nextPageToken;
          if (pageToken === undefined) break;
        }
      }

      await list(folderId, 0);

      const documents: SourceDocument[] = [];
      for (const file of files) {
        const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
        const isGoogleSheet = file.mimeType === "application/vnd.google-apps.spreadsheet";
        const extension = extensionOf(file.name);
        if (!isGoogleDoc && !isGoogleSheet && !isSupported(file.name)) continue;

        let body: string;
        let title = path.basename(file.name, path.extname(file.name));
        let metaOverride: { id?: string; title?: string; owner?: string; version?: string; effective?: string; classification?: string; supersedes?: string } = {};

        if (isGoogleDoc) {
          const response = await fetch(`${DRIVE}/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`, {
            headers: { authorization: `Bearer ${auth}` },
          });
          if (!response.ok) {
            console.warn(`groundtruth: Drive export failed for ${file.name}: ${response.status}`);
            continue;
          }
          body = await response.text();
        } else if (isGoogleSheet) {
          const response = await fetch(`${DRIVE}/files/${encodeURIComponent(file.id)}/export?mimeType=text/csv`, {
            headers: { authorization: `Bearer ${auth}` },
          });
          if (!response.ok) {
            console.warn(`groundtruth: Drive export failed for ${file.name}: ${response.status}`);
            continue;
          }
          body = `## Sheet: ${file.name}\n\n${await response.text()}`;
        } else {
          const response = await fetch(
            `${DRIVE}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
            { headers: { authorization: `Bearer ${auth}` } },
          );
          if (!response.ok) {
            console.warn(`groundtruth: Drive download failed for ${file.name}: ${response.status}`);
            continue;
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (extension === "md" || extension === "markdown") {
            const parsed = parseDocument(new TextDecoder().decode(bytes), file.name);
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
            body = await extractTextFromBytes(file.name, bytes);
          }
        }

        if (body.trim().length === 0) continue;
        documents.push(
          makeDocument({
            connectorId: config.id,
            type: "gdrive",
            externalId: file.id,
            id: metaOverride.id ?? `GD-${slugify(title)}`,
            title: metaOverride.title ?? title,
            body,
            owner: metaOverride.owner ?? file.lastModifyingUser?.displayName ?? ownerFallback,
            version: metaOverride.version ?? file.version ?? "1.0",
            effective: metaOverride.effective ?? file.modifiedTime?.slice(0, 10),
            classification: metaOverride.classification ?? "internal",
            supersedes: metaOverride.supersedes,
            url: file.webViewLink,
            updatedAt: file.modifiedTime,
          }),
        );
      }
      return documents;
    },
  };
}
