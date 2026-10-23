"use client";

import { useMemo, useState } from "react";
import { SourceBadge, Tag } from "./ui";
import type { ConnectorView, CorpusView, ConnectorType } from "@/lib/types";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

const FILTERS: (ConnectorType | "all")[] = ["all", "local", "confluence", "sharepoint", "gdrive"];

export default function LibraryView({
  corpus,
  connectors,
  onOpenConnectors,
}: {
  corpus: CorpusView;
  connectors: ConnectorView[];
  onOpenConnectors: () => void;
}) {
  const [filter, setFilter] = useState<ConnectorType | "all">("all");
  const documents = useMemo(
    () =>
      corpus.documents.filter((document) => {
        if (filter === "all") return true;
        const type = document.source?.type ?? "local";
        return type === filter;
      }),
    [corpus.documents, filter],
  );
  const missing = connectors.filter((connector) => !connector.configured && connector.type !== "local");

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">Corpus</p>
          <h1>Library</h1>
          <p className="page__lede">
            {corpus.stats.documents} documents, {corpus.stats.chunks} chunks. Version and effective date are part of
            every citation, so the answer can say which policy it used.
          </p>
        </div>
        <dl className="page__stats">
          <div>
            <dt>Average chunk</dt>
            <dd>{corpus.stats.averageChunkChars} chars</dd>
          </div>
          <div>
            <dt>Index built</dt>
            <dd>{formatDate(corpus.builtAt)}</dd>
          </div>
          <div>
            <dt>Embedding</dt>
            <dd>{corpus.model === "none" ? "lexical only" : "MiniLM 384d"}</dd>
          </div>
        </dl>
      </header>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter by source">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "is-active" : ""}
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "All sources" : item}
            </button>
          ))}
        </div>
        <span className="toolbar__count">{documents.length} shown</span>
      </div>

      {missing.length > 0 && (
        <div className="callout">
          <div>
            <b>{missing.length} connectors are not configured.</b>
            <span>
              {missing.map((connector) => connector.label).join(", ")}. The corpus currently comes from the local
              folder only.
            </span>
          </div>
          <button type="button" className="button" onClick={onOpenConnectors}>
            Configure
          </button>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Source</th>
              <th>Owner</th>
              <th>Version</th>
              <th>Effective</th>
              <th>Sections</th>
              <th>Chunks</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>
                  <div className="doc-cell">
                    <span className="doc-cell__id">{document.id}</span>
                    <span className="doc-cell__title">{document.title}</span>
                    {document.supersedes !== undefined && <Tag tone="danger">supersedes</Tag>}
                  </div>
                </td>
                <td>
                  <SourceBadge type={document.source?.type ?? "local"} />
                  {document.source?.url !== undefined ? (
                    <a className="doc-link" href={document.source.url} target="_blank" rel="noreferrer">
                      open ↗
                    </a>
                  ) : null}
                </td>
                <td>{document.owner}</td>
                <td className="mono">v{document.version}</td>
                <td className="mono">{formatDate(document.effective)}</td>
                <td className="mono">{document.sections.length}</td>
                <td className="mono">{document.chunks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="page__foot">
        Sources are synced with <code>npm run sync</code>. The normalizer keeps one document per external id, and a
        content hash decides whether a document changed.
      </p>
    </div>
  );
}
