"use client";

import { CodeBlock, Tag } from "./ui";
import type { ConnectorType, ConnectorView } from "@/lib/types";

const DESCRIPTION: Record<ConnectorType, string> = {
  local: "Markdown with frontmatter, plain text, PDF and DOCX from a folder. PDFs are split by page; sidecar metadata is optional.",
  confluence: "Pages from Confluence Cloud. Storage XHTML is converted to headings and lists before chunking; the page version becomes the document version.",
  sharepoint: "Files from a SharePoint document library through Microsoft Graph. Folders are walked recursively; PDF, DOCX, TXT and Markdown are extracted.",
  gdrive: "Google Docs, Sheets, PDFs and Office files from a Drive folder. Docs are exported as text; Sheets as CSV.",
};

function formatDate(value: string | null): string {
  if (value === null) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Card({ connector }: { connector: ConnectorView }) {
  const tone = connector.error !== null ? "danger" : connector.configured ? "ok" : "neutral";
  const label = connector.error !== null ? "error" : connector.configured ? "configured" : "not configured";

  return (
    <article className={`connector ${connector.configured ? "connector--on" : ""}`}>
      <div className="connector__head">
        <div>
          <span className="eyebrow">{connector.type}</span>
          <h3>{connector.label}</h3>
        </div>
        <Tag tone={tone}>{label}</Tag>
      </div>

      <p className="connector__description">{DESCRIPTION[connector.type]}</p>

      <dl className="connector__stats">
        <div>
          <dt>Documents</dt>
          <dd>{connector.documents}</dd>
        </div>
        <div>
          <dt>Last sync</dt>
          <dd>{formatDate(connector.lastSyncAt)}</dd>
        </div>
      </dl>

      <div className="connector__requirement">
        <span className="eyebrow">Required</span>
        <code>{connector.requirement}</code>
      </div>

      {connector.error !== null && <p className="connector__error">{connector.error}</p>}
      {connector.detail !== null && connector.error === null && connector.configured && (
        <p className="connector__detail">{connector.detail}</p>
      )}

      <div className="connector__command">
        <code>npm run ingest -- --source={connector.type === "local" ? "local" : connector.id}</code>
      </div>
    </article>
  );
}

export default function ConnectorsView({ connectors }: { connectors: ConnectorView[] }) {
  const configured = connectors.filter((connector) => connector.configured).length;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">Ingestion</p>
          <h1>Connectors</h1>
          <p className="page__lede">
            Documents enter through one contract: fetch, normalize to markdown-like text, hash, then index. A connector
            can be a folder or a live SaaS source; the retrieval layer never knows the difference.
          </p>
        </div>
        <dl className="page__stats">
          <div>
            <dt>Configured</dt>
            <dd>
              {configured}/{connectors.length}
            </dd>
          </div>
          <div>
            <dt>Store</dt>
            <dd>data/documents.json</dd>
          </div>
          <div>
            <dt>Sync</dt>
            <dd>incremental by hash</dd>
          </div>
        </dl>
      </header>

      <div className="connector-grid">
        {connectors.map((connector) => (
          <Card key={connector.id} connector={connector} />
        ))}
      </div>

      <section className="panel">
        <div className="panel__head">
          <p className="eyebrow">How a sync works</p>
          <h2>One pipeline, four entry points.</h2>
        </div>
        <div className="flow">
          <div>
            <span className="flow__step">01</span>
            <b>Fetch</b>
            <p>Connector-specific API or folder walk.</p>
          </div>
          <div>
            <span className="flow__step">02</span>
            <b>Normalize</b>
            <p>Title, owner, version, effective date, body, source URL.</p>
          </div>
          <div>
            <span className="flow__step">03</span>
            <b>Hash</b>
            <p>SHA-256 of the body. Unchanged documents keep their index.</p>
          </div>
          <div>
            <span className="flow__step">04</span>
            <b>Store</b>
            <p>One entry per external id in <code>data/documents.json</code>.</p>
          </div>
          <div>
            <span className="flow__step">05</span>
            <b>Index</b>
            <p>Re-chunk and re-embed. Retrieval sees one corpus.</p>
          </div>
        </div>

        <div className="commands">
          <CodeBlock label="Sync every configured source">{`npm run sync`}</CodeBlock>
          <CodeBlock label="Sync one source and rebuild">{`npm run ingest -- --source=confluence
npm run index`}</CodeBlock>
          <CodeBlock label="Point the local connector at a folder">{`npm run ingest -- --source=local --path=./docs
npm run index`}</CodeBlock>
        </div>
      </section>

      <section className="panel panel--split">
        <div>
          <div className="panel__head">
            <p className="eyebrow">Configuration</p>
            <h2>Secrets stay in the environment.</h2>
          </div>
          <p className="panel__text">
            <code>ingest.config.json</code> lists the sources. Credentials are read from environment variables by each
            connector and never reach the browser. The store keeps document metadata and a source URL, not tokens.
          </p>
          <CodeBlock label="ingest.config.json">{`{
  "sources": [
    { "id": "corpus", "type": "local", "options": { "path": "./corpus" } },
    { "id": "confluence", "type": "confluence" },
    { "id": "sharepoint", "type": "sharepoint" },
    { "id": "gdrive", "type": "gdrive" }
  ]
}`}</CodeBlock>
        </div>
        <div>
          <div className="panel__head">
            <p className="eyebrow">Boundaries</p>
            <h2>What connectors do not solve.</h2>
          </div>
          <ul className="plain-list">
            <li>
              <b>Permissions.</b> Every chunk is visible to every question. Per-tenant ACLs are a separate layer.
            </li>
            <li>
              <b>Deletes.</b> A document missing from a sync is removed from the store, but backups and embeddings
              remain until the index is rebuilt.
            </li>
            <li>
              <b>Rate limits.</b> Connectors fetch sequentially and cap at 1,000 documents. A large tenant needs
              pagination cursors and a job queue.
            </li>
            <li>
              <b>Formats.</b> Scanned PDFs need OCR; complex DOCX layouts lose structure. The pipeline extracts text,
              not visual fidelity.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
