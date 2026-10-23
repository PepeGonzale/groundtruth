import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConfluenceConnector } from "../lib/ingest/confluence";
import { createDriveConnector } from "../lib/ingest/gdrive";
import { htmlToText, slugify } from "../lib/ingest/html";
import { createLocalConnector } from "../lib/ingest/local";
import { ensureUniqueIds, makeDocument } from "../lib/ingest/normalize";
import { createSharePointConnector } from "../lib/ingest/sharepoint";
import { computeDelta } from "../lib/ingest/store";

type FetchCall = { url: string; init: RequestInit | undefined };

function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("html conversion keeps structure without tags", () => {
  const text = htmlToText(
    '<h2>Scope &amp; limits</h2><p>Keep <strong>2°C</strong>.</p><ul><li>First</li><li>Second</li></ul>',
  );
  assert.match(text, /## Scope & limits/);
  assert.match(text, /- First/);
  assert.doesNotMatch(text, /<[^>]+>/);
});

test("slugify is stable and readable", () => {
  assert.equal(slugify("Incident Response — 2025"), "incident-response-2025");
  assert.equal(slugify("  ***  "), "document");
});

test("document ids are made unique deterministically", () => {
  const a = makeDocument({
    connectorId: "c1",
    type: "confluence",
    externalId: "1",
    id: "CONF-policy",
    title: "Policy",
    body: "One",
  });
  const b = makeDocument({
    connectorId: "c1",
    type: "confluence",
    externalId: "2",
    id: "CONF-policy",
    title: "Policy",
    body: "Two",
  });
  const unique = ensureUniqueIds([a, b]);
  assert.equal(new Set(unique.map((document) => document.meta.id)).size, 2);
  assert.equal(unique[0]?.meta.id, "CONF-policy");
  assert.notEqual(unique[1]?.meta.id, "CONF-policy");
});

test("delta reports added, changed and removed", () => {
  const base = makeDocument({ connectorId: "c", type: "local", externalId: "a", title: "A", body: "one" });
  const changed = { ...base, body: "two", source: { ...base.source, hash: "different" } };
  const removed = makeDocument({ connectorId: "c", type: "local", externalId: "b", title: "B", body: "b" });
  const added = makeDocument({ connectorId: "c", type: "local", externalId: "c", title: "C", body: "c" });
  const delta = computeDelta([base, removed], [changed, added]);
  assert.deepEqual(delta, { added: 1, changed: 1, unchanged: 0, removed: 1 });
});

test("local connector reads markdown, text and PDF", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "groundtruth-local-"));
  try {
    await writeFile(
      path.join(directory, "policy.md"),
      "---\nid: TST-100\ntitle: Test policy\nowner: QA\nversion: 2.0\neffective: 2025-01-01\nclassification: internal\n---\n\n## Scope\n\nRetention is 12 months.\n",
      "utf8",
    );
    await writeFile(path.join(directory, "notes.txt"), "Cold chain notes\n\nKeep product cold.\n", "utf8");
    await copyFile(path.join(process.cwd(), "tests", "fixtures", "sample.pdf"), path.join(directory, "playbook.pdf"));

    const connector = createLocalConnector({ id: "local", label: "Local", options: { path: directory } });
    const documents = await connector.sync();
    assert.equal(documents.length, 3);
    const markdown = documents.find((document) => document.meta.id === "TST-100");
    assert.equal(markdown?.meta.version, "2.0");
    assert.match(markdown?.body ?? "", /Retention is 12 months/);
    const text = documents.find((document) => document.source.externalId === "notes.txt");
    assert.equal(text?.meta.title, "Cold chain notes");
    const pdf = documents.find((document) => document.source.externalId === "playbook.pdf");
    assert.match(pdf?.body ?? "", /## Page 1/);
    assert.match(pdf?.body ?? "", /2C and 8C/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("confluence connector maps storage HTML and metadata", async () => {
  const mock = installFetch(async (url) => {
    assert.match(url, /spaceKey=OPS/);
    assert.match(url, /expand=body\.storage%2Cversion/);
    return new Response(
      JSON.stringify({
        size: 1,
        results: [
          {
            id: "123",
            title: "Incident response",
            body: { storage: { value: "<h2>Severity</h2><p>A SEV1 is a safety risk.</p>" } },
            version: { number: 3, when: "2025-02-01T10:00:00.000Z", by: { displayName: "Ada" } },
            _links: { webui: "/spaces/OPS/pages/123" },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const connector = createConfluenceConnector({
      id: "confluence",
      label: "Confluence",
      options: {
        baseUrl: "https://example.atlassian.net",
        email: "ops@example.com",
        token: "secret",
        spaceKeys: "OPS",
      },
    });
    assert.equal(connector.configured(), true);
    const documents = await connector.sync();
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.meta.id, "CONF-incident-response");
    assert.equal(documents[0]?.meta.owner, "Ada");
    assert.equal(documents[0]?.meta.version, "3");
    assert.equal(documents[0]?.meta.effective, "2025-02-01");
    assert.match(documents[0]?.body ?? "", /## Severity/);
    assert.match(documents[0]?.source.url ?? "", /example\.atlassian\.net\/wiki\/spaces/);
    const auth = mock.calls[0]?.init?.headers as Record<string, string> | undefined;
    assert.match(auth?.["authorization"] ?? "", /^Basic /);
  } finally {
    mock.restore();
  }
});

test("sharepoint connector walks folders and extracts a PDF", async () => {
  const pdf = new Uint8Array(await (await import("node:fs/promises")).readFile(path.join(process.cwd(), "tests", "fixtures", "sample.pdf")));
  const mock = installFetch(async (url) => {
    if (url.includes("login.microsoftonline.com")) {
      return new Response(JSON.stringify({ access_token: "graph-token", expires_in: 3600 }), { status: 200 });
    }
    if (url.endsWith("/drive")) {
      return new Response(JSON.stringify({ id: "drive-1" }), { status: 200 });
    }
    if (url.includes("/root/children")) {
      return new Response(
        JSON.stringify({
          value: [
            { id: "folder-1", name: "Policies", folder: { childCount: 1 } },
            { id: "item-1", name: "playbook.pdf", file: { mimeType: "application/pdf" }, webUrl: "https://contoso.sharepoint.com/playbook.pdf", lastModifiedDateTime: "2025-03-10T09:00:00Z", lastModifiedBy: { user: { displayName: "Grace" } } },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/items/folder-1/children")) {
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }
    if (url.includes("/items/item-1/content")) {
      return new Response(pdf, { status: 200 });
    }
    throw new Error(`unexpected SharePoint URL ${url}`);
  });
  try {
    const connector = createSharePointConnector({
      id: "sharepoint",
      label: "SharePoint",
      options: {
        tenantId: "tenant-test",
        clientId: "client-test",
        clientSecret: "secret-test",
        siteId: "contoso.sharepoint.com,site,web",
        driveId: "drive-1",
      },
    });
    assert.equal(connector.configured(), true);
    const documents = await connector.sync();
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.meta.id, "SP-playbook");
    assert.equal(documents[0]?.meta.owner, "Grace");
    assert.match(documents[0]?.body ?? "", /Cold chain policy/);
    assert.equal(documents[0]?.source.url, "https://contoso.sharepoint.com/playbook.pdf");
  } finally {
    mock.restore();
  }
});

test("drive connector exports a Google Doc to text", async () => {
  const mock = installFetch(async (url) => {
    if (url.includes("/files?") && url.includes("folder-1")) {
      return new Response(
        JSON.stringify({
          files: [
            {
              id: "doc-1",
              name: "Runbook",
              mimeType: "application/vnd.google-apps.document",
              modifiedTime: "2025-04-01T08:00:00Z",
              webViewLink: "https://docs.google.com/document/d/doc-1",
              lastModifyingUser: { displayName: "Linus" },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/files/doc-1/export")) {
      assert.match(url, /mimeType=text\/plain/);
      return new Response("## Escalation\n\nPage the primary first.", { status: 200 });
    }
    throw new Error(`unexpected Drive URL ${url}`);
  });
  try {
    const connector = createDriveConnector({
      id: "gdrive",
      label: "Google Drive",
      options: { folderId: "folder-1", accessToken: "drive-token" },
    });
    assert.equal(connector.configured(), true);
    const documents = await connector.sync();
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.meta.id, "GD-runbook");
    assert.equal(documents[0]?.meta.owner, "Linus");
    assert.match(documents[0]?.body ?? "", /Page the primary first/);
  } finally {
    mock.restore();
  }
});
