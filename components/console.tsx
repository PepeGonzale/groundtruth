"use client";

import { useState } from "react";
import AskView from "./ask-view";
import ConnectorsView from "./connectors-view";
import EvaluationView from "./evaluation-view";
import LibraryView from "./library-view";
import SystemView from "./system-view";
import type { ConnectorView, CorpusView, EvalFile } from "@/lib/types";

type View = "ask" | "library" | "evaluation" | "connectors" | "system";

const VIEW_META: Record<View, { label: string; title: string; note: string }> = {
  ask: { label: "Ask", title: "Ask", note: "Grounded answers over the operations corpus" },
  library: { label: "Library", title: "Library", note: "Documents, versions and their ingestion source" },
  evaluation: { label: "Evaluation", title: "Evaluation", note: "Regression suite, not a benchmark" },
  connectors: { label: "Connectors", title: "Connectors", note: "Where documents come from and how they are synced" },
  system: { label: "System", title: "System", note: "Pipeline, refusal gate and known limits" },
};

const NAV: View[] = ["ask", "library", "evaluation", "connectors", "system"];

export default function Console({
  corpus,
  evaluation,
  connectors,
  mode,
  model,
}: {
  corpus: CorpusView;
  evaluation: EvalFile;
  connectors: ConnectorView[];
  mode: "extractive" | "claude";
  model: string;
}) {
  const [view, setView] = useState<View>("ask");
  const configured = connectors.filter((connector) => connector.configured).length;
  const meta = VIEW_META[view];

  return (
    <div className="shell">
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => setView("ask")}>
          <span className="brand__mark" aria-hidden="true">
            G
          </span>
          <span>
            <b>Groundtruth</b>
            <small>Document intelligence</small>
          </span>
        </button>

        <nav className="nav" aria-label="Sections">
          {NAV.map((item) => {
            const metaItem = VIEW_META[item];
            const count =
              item === "library"
                ? corpus.stats.documents
                : item === "connectors"
                  ? `${configured}/${connectors.length}`
                  : item === "evaluation"
                    ? evaluation.totals.questions
                    : null;
            return (
              <button
                key={item}
                type="button"
                className={view === item ? "is-active" : ""}
                onClick={() => setView(item)}
                aria-current={view === item ? "page" : undefined}
              >
                <span className={`nav__dot nav__dot--${item}`} aria-hidden="true" />
                {metaItem.label}
                {count !== null && <b>{count}</b>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__status">
          <div className="status-row">
            <span className={`pulse ${mode === "claude" ? "pulse--ok" : ""}`} />
            <span>{mode === "claude" ? model : "local extraction"}</span>
          </div>
          <div className="status-row">
            <span className="mono">index</span>
            <span>{corpus.stats.chunks} chunks</span>
          </div>
          <div className="status-row">
            <span className="mono">docs</span>
            <span>{corpus.stats.documents}</span>
          </div>
          <button type="button" className="sidebar__sync" onClick={() => setView("connectors")}>
            Sync sources →
          </button>
        </div>

        <div className="sidebar__foot">
          <span>JRGV · 2026</span>
          <span>Madrid, ES</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <span className="topbar__title">{meta.title}</span>
            <span className="topbar__note">{meta.note}</span>
          </div>
          <div className="topbar__right">
            <span className="topbar__chip">
              <i className={mode === "claude" ? "dot dot--ok" : "dot"} />
              {mode === "claude" ? "Claude enabled" : "Local extraction"}
            </span>
            <span className="topbar__chip topbar__chip--mono">{corpus.stats.chunks} chunks</span>
          </div>
        </header>

        <div className="view">
          {view === "ask" && (
            <AskView
              mode={mode}
              model={model}
              stats={{ documents: corpus.stats.documents, chunks: corpus.stats.chunks }}
              prompts={[
                "How fast must we notify a customer after a temperature excursion?",
                "What is the on-time delivery target for 2025?",
                "Who do I page for a SEV1 at 02:00?",
                "What is the parental leave policy?",
              ]}
              onOpenConnectors={() => setView("connectors")}
            />
          )}
          {view === "library" && (
            <LibraryView corpus={corpus} connectors={connectors} onOpenConnectors={() => setView("connectors")} />
          )}
          {view === "evaluation" && <EvaluationView evaluation={evaluation} />}
          {view === "connectors" && <ConnectorsView connectors={connectors} />}
          {view === "system" && <SystemView corpus={corpus} evaluation={evaluation} />}
        </div>
      </div>
    </div>
  );
}
